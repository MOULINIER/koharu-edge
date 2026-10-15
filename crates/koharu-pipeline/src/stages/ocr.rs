use std::sync::{Arc, Mutex};

use super::{StageInput, StageProcessor, finish, generation};
use crate::{ModelCell, OcrModel, scope::geometry_extents};
use anyhow::{Context as _, Result, anyhow, bail};
use async_trait::async_trait;
use image::DynamicImage;
use koharu_ml::{
    baberu_ocr::BaberuOcr, hayai_ocr::HayaiOcr, manga_ocr::MangaOcr,
    paddle_ocr_vl::PaddleOCRVLTask, paddle_ocr_vl_quantized::PaddleOCRVLQuantized,
};
use koharu_scene::{
    At, Authored, EntityId, EntityOrigin, Generation, Geometry, LanguageTag, OcrAnalysis, Origin,
    Presents, RecognizedFrom, Region, RegionSpec, SourceText, TextDirection, TextLayout,
    TextRegion,
};

const PRODUCER: &str = "dev.koharu.pipeline.ocr";

pub(super) struct Processor {
    config: OcrModel,
    device: koharu_ml::Device,
    model: ModelCell<Model>,
}

impl Processor {
    pub(super) fn new(config: OcrModel, device: koharu_ml::Device) -> Self {
        Self {
            config,
            device,
            model: ModelCell::new(),
        }
    }
}

#[async_trait]
impl StageProcessor for Processor {
    fn model(&self) -> &'static str {
        match self.config {
            OcrModel::MangaOcr => "manga-ocr",
            OcrModel::BaberuOcr => "baberu-ocr",
            OcrModel::HayaiOcr => "hayai-ocr",
            OcrModel::PaddleOcrVl1_6 => "paddleocr-vl-1.6",
        }
    }

    fn unload(&self) -> bool {
        self.model.unload()
    }

    async fn load(&self) -> Result<()> {
        self.model
            .ensure(|| Model::load(self.device.clone(), &self.config))
            .await
    }

    async fn process(&self, input: StageInput) -> Result<koharu_scene::Patch> {
        self.model
            .lock()
            .await
            .as_ref()
            .ok_or_else(|| anyhow!("OCR model is not loaded"))?
            .run(input)
            .await
    }
}

enum Model {
    Manga(Arc<Mutex<MangaOcr>>),
    Baberu(Arc<Mutex<BaberuOcr>>),
    Hayai(Arc<Mutex<HayaiOcr>>),
    Paddle(Arc<Mutex<PaddleOCRVLQuantized>>),
}

impl Model {
    async fn load(device: koharu_ml::Device, config: &OcrModel) -> Result<Self> {
        match config {
            OcrModel::MangaOcr => Ok(Self::Manga(Arc::new(Mutex::new(
                MangaOcr::load(device).await?,
            )))),
            OcrModel::BaberuOcr => Ok(Self::Baberu(Arc::new(Mutex::new(
                BaberuOcr::load(device).await?,
            )))),
            OcrModel::HayaiOcr => Ok(Self::Hayai(Arc::new(Mutex::new(
                HayaiOcr::load(device).await?,
            )))),
            OcrModel::PaddleOcrVl1_6 => Ok(Self::Paddle(Arc::new(Mutex::new(
                PaddleOCRVLQuantized::load(device).await?,
            )))),
        }
    }

    async fn run(&self, input: StageInput) -> Result<koharu_scene::Patch> {
        let model_name = match self {
            Self::Manga(_) => "manga-ocr",
            Self::Baberu(_) => "baberu-ocr",
            Self::Hayai(_) => "hayai-ocr",
            Self::Paddle(_) => "paddleocr-vl-1.6",
        };
        let source = input
            .images
            .get(&input.scene, input.page, "source")
            .await?
            .ok_or_else(|| anyhow!("page {} has no source image", input.page))?;
        let generation = generation(PRODUCER, model_name)?;
        let targets = targets(&input, &source, &generation)?;
        let results = match self {
            Self::Manga(model) => {
                infer_text(model.clone(), targets, |model, image| {
                    model.inference(image)
                })
                .await?
            }
            Self::Baberu(model) => {
                infer_text(model.clone(), targets, |model, image| {
                    model.inference(image)
                })
                .await?
            }
            Self::Hayai(model) => {
                infer_text(model.clone(), targets, |model, image| {
                    model.inference(image)
                })
                .await?
            }
            Self::Paddle(model) => {
                infer_text(model.clone(), targets, |model, image| {
                    Ok(model.inference(image, PaddleOCRVLTask::Ocr)?.text)
                })
                .await?
            }
        };

        write(&input, results, &generation)
    }
}

/// Detected regions own the geometry OCR reads. A text frame the user drew owns it
/// instead: its OCR region is created on the first run and then follows the frame.
#[derive(Clone, Copy)]
enum Anchor {
    Region(EntityId),
    Frame {
        layer: EntityId,
        region: Option<EntityId>,
    },
}

struct OcrTarget {
    content: EntityId,
    anchor: Anchor,
    geometry: Geometry,
    previous: Option<SourceText>,
    image: DynamicImage,
}

struct OcrResult {
    content: EntityId,
    anchor: Anchor,
    geometry: Geometry,
    previous: Option<SourceText>,
    text: String,
}

fn targets(
    input: &StageInput,
    source: &DynamicImage,
    generation: &Generation,
) -> Result<Vec<OcrTarget>> {
    let page = input.page;
    let mut targets = Vec::new();
    for entity in input.scene.descendants(page)? {
        let region = entity.id();
        if !input.contains_entity(region)? || is_frame_region(input, region, generation)? {
            continue;
        }
        let is_text_region = input
            .scene
            .component::<Region>(region)?
            .is_some_and(|value| value.kind == TextRegion::kind());
        if !is_text_region {
            continue;
        }
        let geometry = input
            .scene
            .component::<Geometry>(region)?
            .ok_or_else(|| anyhow!("text region {region} has no geometry"))?;
        let crop = crop(source, &geometry)
            .with_context(|| format!("text region {region} is outside its source image"))?;
        for relation in input.scene.relations_to_as::<RecognizedFrom>(region) {
            let content = relation.value().source;
            let previous = input.scene.component::<SourceText>(content)?;
            if is_user_owned(previous.as_ref()) {
                continue;
            }
            targets.push(OcrTarget {
                content,
                anchor: Anchor::Region(region),
                geometry: geometry.clone(),
                previous,
                image: crop.clone(),
            });
        }
    }

    // Frames are read only when explicitly selected: a page-wide run must not OCR a
    // frame the user drew to hold their own text.
    if input.entities.is_none() {
        return Ok(targets);
    }
    for entity in input.scene.descendants(page)? {
        let layer = entity.id();
        if !input.contains_entity(layer)? || input.scene.component::<TextLayout>(layer)?.is_none() {
            continue;
        }
        let Some(geometry) = input.scene.component::<Geometry>(layer)? else {
            continue;
        };
        let Some(content) = input
            .scene
            .relation_from::<Presents>(layer)?
            .map(|relation| relation.value().target)
        else {
            continue;
        };
        let region = input
            .scene
            .relation_from::<RecognizedFrom>(content)?
            .map(|relation| relation.value().target);
        // A detected region was already read above, through its own geometry.
        if let Some(region) = region
            && !is_frame_region(input, region, generation)?
        {
            continue;
        }
        let previous = input.scene.component::<SourceText>(content)?;
        if is_user_owned(previous.as_ref()) {
            continue;
        }
        let image = crop(source, &geometry)
            .with_context(|| format!("text frame {layer} is outside its source image"))?;
        targets.push(OcrTarget {
            content,
            anchor: Anchor::Frame { layer, region },
            geometry,
            previous,
            image,
        });
    }
    Ok(targets)
}

fn write(
    input: &StageInput,
    results: Vec<OcrResult>,
    generation: &Generation,
) -> Result<koharu_scene::Patch> {
    let page = input.page;
    let mut edit = input.scene.edit_as(generation.clone());
    edit.observe_assets(page)?;
    for result in &results {
        let region = match result.anchor {
            Anchor::Region(region) => Some(region),
            Anchor::Frame { layer, region } => {
                edit.observe::<Geometry>(layer)?;
                region
            }
        };
        if let Some(region) = region {
            edit.observe::<Region>(region)?;
            edit.observe::<Geometry>(region)?;
        }
        edit.observe::<SourceText>(result.content)?;
    }
    for result in results {
        let region = match result.anchor {
            Anchor::Region(region) => region,
            Anchor::Frame {
                region: Some(region),
                ..
            } => {
                edit.set(region, &result.geometry)?;
                region
            }
            Anchor::Frame { region: None, .. } => {
                let region = edit.add_entity(page, At::End)?;
                edit.set(region, &result.geometry)?;
                edit.set(
                    region,
                    &Region {
                        origin: Origin::Generated(generation.clone()),
                        kind: TextRegion::kind(),
                        label: Some("text-frame".to_owned()),
                    },
                )?;
                edit.relate::<RecognizedFrom>(result.content, region)?;
                region
            }
        };
        let language = result
            .previous
            .and_then(|value| value.language)
            .or_else(|| LanguageTag::new("ja-JP").ok());
        edit.set(
            result.content,
            &SourceText {
                text: Authored::generated(result.text, generation.clone()),
                language,
            },
        )?;
        let (min_x, min_y, max_x, max_y) = geometry_extents(&result.geometry)
            .ok_or_else(|| anyhow!("text region {region} has empty geometry"))?;
        edit.set(
            region,
            &OcrAnalysis {
                origin: Origin::Generated(generation.clone()),
                direction: if max_y - min_y >= (max_x - min_x) * 1.15 {
                    TextDirection::Vertical
                } else {
                    TextDirection::Horizontal
                },
                confidence: None,
                line_boundaries: Vec::new(),
            },
        )?;
    }
    finish(edit)
}

fn is_user_owned(source: Option<&SourceText>) -> bool {
    source.is_some_and(|value| matches!(value.text.origin, Origin::User))
}

/// Regions this stage created for a text frame, as opposed to detected regions.
fn is_frame_region(input: &StageInput, region: EntityId, generation: &Generation) -> Result<bool> {
    Ok(input
        .scene
        .component::<EntityOrigin>(region)?
        .is_some_and(|origin| {
            matches!(origin.origin, Origin::Generated(ref owner) if owner.producer == generation.producer)
        }))
}

async fn infer_text<M: Send + 'static>(
    model: Arc<Mutex<M>>,
    targets: Vec<OcrTarget>,
    inference: impl Fn(&M, &DynamicImage) -> Result<String> + Send + Sync + 'static,
) -> Result<Vec<OcrResult>> {
    tokio_rayon::spawn(move || {
        let model = model
            .lock()
            .map_err(|_| anyhow!("OCR model lock is poisoned"))?;
        targets
            .into_iter()
            .map(|target| {
                Ok(OcrResult {
                    content: target.content,
                    anchor: target.anchor,
                    geometry: target.geometry,
                    previous: target.previous,
                    text: normalize_ocr_text(inference(&model, &target.image)?),
                })
            })
            .collect()
    })
    .await
}

// Manga OCR can emit replacement-box glyphs for an isolated Japanese ellipsis.
// Normalize only an all-placeholder sequence so ordinary OCR output is preserved.
fn normalize_ocr_text(text: String) -> String {
    let visible = text
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<Vec<_>>();
    if visible.len() >= 2
        && visible
            .iter()
            .all(|character| matches!(character, '☐' | '□' | '▢' | '▣' | '�'))
    {
        "…".to_owned()
    } else {
        text
    }
}

fn crop(source: &DynamicImage, geometry: &Geometry) -> Result<DynamicImage> {
    let (min_x, min_y, max_x, max_y) =
        geometry_extents(geometry).ok_or_else(|| anyhow!("geometry is empty"))?;
    let x = min_x.floor().max(0.0) as u32;
    let y = min_y.floor().max(0.0) as u32;
    let right = max_x.ceil().max(0.0).min(f64::from(source.width())) as u32;
    let bottom = max_y.ceil().max(0.0).min(f64::from(source.height())) as u32;
    if right <= x || bottom <= y {
        bail!("geometry does not overlap the image");
    }
    Ok(source.crop_imm(x, y, right - x, bottom - y))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use image::DynamicImage;
    use koharu_scene::{
        At, EntityId, Geometry, PageDraft, Presents, RecognizedFrom, Session, Snapshot, SourceText,
        TextLayout, TextLayoutKind, TextRegion,
    };

    use super::{
        Anchor, OcrResult, PRODUCER, StageInput, generation, normalize_ocr_text, targets, write,
    };
    use crate::{ImageCache, Stage, scope::NormalizedScope};

    fn input(snapshot: &Snapshot, page: EntityId, selected: Option<EntityId>) -> StageInput {
        let entities = selected.map(|layer| {
            NormalizedScope::new(
                snapshot,
                &crate::Scope::Entities(vec![layer]),
                &[Stage::Ocr],
            )
            .unwrap()
            .entities()
            .unwrap()
        });
        StageInput::new(
            snapshot.clone(),
            page,
            entities,
            None,
            Arc::new(ImageCache::default()),
            None,
        )
    }

    /// Runs target selection and writes `text` for every target, as an OCR run would.
    async fn ocr(session: &mut Session, input: &StageInput, text: &str) -> Vec<Anchor> {
        let generation = generation(PRODUCER, "test").unwrap();
        let source = DynamicImage::new_rgb8(100, 100);
        let results = targets(input, &source, &generation)
            .unwrap()
            .into_iter()
            .map(|target| OcrResult {
                content: target.content,
                anchor: target.anchor,
                geometry: target.geometry,
                previous: target.previous,
                text: text.to_owned(),
            })
            .collect::<Vec<_>>();
        let anchors = results.iter().map(|result| result.anchor).collect();
        let patch = write(input, results, &generation).unwrap();
        session.commit(patch).await.unwrap();
        anchors
    }

    fn layout() -> TextLayout {
        TextLayout {
            origin: koharu_scene::Origin::User,
            kind: TextLayoutKind::Paragraph,
            angle_degrees: Some(0.0),
        }
    }

    fn source_text(snapshot: &Snapshot, layer: EntityId) -> Option<String> {
        let content = snapshot
            .relation_from::<Presents>(layer)
            .unwrap()
            .unwrap()
            .value()
            .target;
        snapshot
            .component::<SourceText>(content)
            .unwrap()
            .map(|source| source.text.value)
    }

    #[tokio::test]
    async fn selected_text_frame_gets_a_region_that_follows_the_frame() {
        let mut session = Session::memory().await.unwrap();
        let (mut page, mut frame) = (None, None);
        let patch = session
            .snapshot()
            .patch(|edit| {
                let id = edit.add_page(PageDraft::new("page", 100.0, 100.0), At::End)?;
                let content = edit.add_text_content(id, At::End)?;
                let layer = edit.add_text_layer(id, At::End, content, &layout())?;
                edit.set(layer, &Geometry::rectangle(10.0, 10.0, 20.0, 20.0))?;
                (page, frame) = (Some(id), Some(layer));
                Ok(())
            })
            .unwrap();
        let snapshot = session.commit(patch).await.unwrap().snapshot;
        let (page, frame) = (page.unwrap(), frame.unwrap());

        // A page-wide run leaves frames the user drew alone.
        assert!(
            ocr(&mut session, &input(&snapshot, page, None), "page")
                .await
                .is_empty()
        );

        let anchors = ocr(&mut session, &input(&snapshot, page, Some(frame)), "first").await;
        assert!(matches!(anchors[..], [Anchor::Frame { region: None, .. }]));
        let snapshot = session.snapshot();
        assert_eq!(source_text(&snapshot, frame).as_deref(), Some("first"));
        let content = snapshot
            .relation_from::<Presents>(frame)
            .unwrap()
            .unwrap()
            .value()
            .target;
        let region = snapshot
            .relation_from::<RecognizedFrom>(content)
            .unwrap()
            .unwrap()
            .value()
            .target;

        let mut moved = snapshot.edit();
        moved
            .set(frame, &Geometry::rectangle(50.0, 50.0, 30.0, 30.0))
            .unwrap();
        session.commit(moved.finish().unwrap()).await.unwrap();
        let snapshot = session.snapshot();

        // The frame region is read once, through the frame, and takes its new geometry.
        let anchors = ocr(&mut session, &input(&snapshot, page, Some(frame)), "second").await;
        assert!(matches!(anchors[..], [Anchor::Frame { region: Some(id), .. }] if id == region));
        let snapshot = session.snapshot();
        assert_eq!(source_text(&snapshot, frame).as_deref(), Some("second"));
        assert_eq!(
            snapshot
                .component::<Geometry>(region)
                .unwrap()
                .unwrap()
                .points,
            Geometry::rectangle(50.0, 50.0, 30.0, 30.0).points
        );
        assert!(
            ocr(&mut session, &input(&snapshot, page, None), "page")
                .await
                .is_empty()
        );
    }

    #[tokio::test]
    async fn selected_detected_text_is_read_once_through_its_region() {
        let mut session = Session::memory().await.unwrap();
        let (mut page, mut layer, mut region) = (None, None, None);
        let patch = session
            .snapshot()
            .patch(|edit| {
                let id = edit.add_page(PageDraft::new("page", 100.0, 100.0), At::End)?;
                let detected = edit.add_analysis_region::<TextRegion>(
                    id,
                    At::End,
                    &Geometry::rectangle(10.0, 10.0, 20.0, 20.0),
                    None,
                )?;
                let content = edit.add_text_content(id, At::End)?;
                edit.relate::<RecognizedFrom>(content, detected)?;
                let text = edit.add_text_layer(id, At::End, content, &layout())?;
                edit.set(text, &Geometry::rectangle(0.0, 0.0, 40.0, 40.0))?;
                (page, layer, region) = (Some(id), Some(text), Some(detected));
                Ok(())
            })
            .unwrap();
        let snapshot = session.commit(patch).await.unwrap().snapshot;

        let anchors = ocr(
            &mut session,
            &input(&snapshot, page.unwrap(), Some(layer.unwrap())),
            "read",
        )
        .await;
        assert!(matches!(anchors[..], [Anchor::Region(id)] if Some(id) == region));
    }

    #[test]
    fn repeated_placeholder_glyphs_are_an_ellipsis() {
        assert_eq!(normalize_ocr_text("☐ ☐ ☐".to_owned()), "…");
        assert_eq!(normalize_ocr_text("□\n□".to_owned()), "…");
    }

    #[test]
    fn ordinary_text_and_single_boxes_are_unchanged() {
        assert_eq!(normalize_ocr_text("待って…".to_owned()), "待って…");
        assert_eq!(normalize_ocr_text("☐".to_owned()), "☐");
    }
}
