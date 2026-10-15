use anyhow::Result;
use async_trait::async_trait;
use koharu_scene::{Authored, LanguageTag, Origin, SourceText, Translation};
use koharu_translator::{Language, TranslationContext, TranslationRequest, Translator};

use crate::TranslationConfig;

use super::{StageInput, StageProcessor, finish, generation};

const PRODUCER: &str = "dev.koharu.pipeline.translation";
/// Bounds the prompt growth from cross-page context.
const MAX_CONTEXT_PAGES: u8 = 5;

pub(super) struct Processor {
    config: TranslationConfig,
    translator: Translator,
}

impl Processor {
    pub(super) fn new(config: TranslationConfig, translator: Translator) -> Self {
        Self { config, translator }
    }
}

#[async_trait]
impl StageProcessor for Processor {
    fn model(&self) -> &'static str {
        Translator::model(&self.config.model)
    }

    fn unload(&self) -> bool {
        self.translator.unload()
    }

    async fn load(&self) -> Result<()> {
        self.translator.load_model(&self.config.model).await
    }

    async fn process(&self, input: StageInput) -> Result<koharu_scene::Patch> {
        let mut targets = Vec::new();
        if let Some(group) = input.scene.page(input.page)?.text_group()? {
            for layer in group.text_layers()? {
                if !input.contains_entity(layer.id())? {
                    continue;
                }
                let content = layer.content()?;
                let Some(source) = content.source()? else {
                    continue;
                };
                if !source.text.value.trim().is_empty() {
                    targets.push((content.id(), source.text.value));
                }
            }
        }
        let mut request = TranslationRequest::new(
            targets.iter().map(|(_, source)| source.clone()),
            self.config.target_language,
        );
        if let Some(instructions) = self.config.instructions.as_deref() {
            request = request.with_instructions(instructions);
        }
        let context = previous_translations(
            &input,
            self.config.context_pages,
            self.config.target_language,
        )?;
        tracing::debug!(
            page = %input.page,
            segments = targets.len(),
            context = context.len(),
            "translation request"
        );
        for entry in &context {
            tracing::debug!(source = %entry.source, translation = %entry.translation, "translation context");
        }
        if !context.is_empty() {
            request = request.with_context(context);
        }
        if Translator::supports_vision(&self.config.model, &self.config.generation)
            && let Some(image) = input.images.get(&input.scene, input.page, "source").await?
        {
            request = request.with_image(image);
        }
        let (provider, translated) = self
            .translator
            .translate(&self.config.model, self.config.generation, request)
            .await?;
        let language = LanguageTag::new(self.config.target_language.tag())?;
        let generated = generation(PRODUCER, provider)?;
        let mut edit = input.scene.edit_as(generated.clone());
        for (entity, _) in &targets {
            edit.observe::<SourceText>(*entity)?;
            edit.observe::<Translation>(*entity)?;
        }
        for ((entity, source), text) in targets.into_iter().zip(translated) {
            if input
                .scene
                .component::<Translation>(entity)?
                .is_some_and(|value| matches!(value.text.origin, Origin::User))
            {
                continue;
            }
            let text = if source.trim() == "\u{2026}" {
                "\u{2026}".to_owned()
            } else {
                text
            };
            edit.set(
                entity,
                &Translation {
                    text: Authored::generated(text, generated.clone()),
                    language: Some(language.clone()),
                },
            )?;
        }
        finish(edit)
    }
}

/// Translated text of the pages before this one, oldest first, so this page keeps the
/// names, terms and voice they settled on. Only translations into the current target
/// language qualify.
fn previous_translations(
    input: &StageInput,
    pages: u8,
    target: Language,
) -> Result<Vec<TranslationContext>> {
    let pages = usize::from(pages.min(MAX_CONTEXT_PAGES));
    let order = input
        .scene
        .pages()
        .map(|page| page.id())
        .collect::<Vec<_>>();
    let Some(index) = order.iter().position(|page| *page == input.page) else {
        return Ok(Vec::new());
    };
    let mut context = Vec::new();
    for page in &order[index.saturating_sub(pages)..index] {
        let Some(group) = input.scene.page(*page)?.text_group()? else {
            continue;
        };
        for layer in group.text_layers()? {
            let content = layer.content()?;
            let (Some(source), Some(translation)) = (content.source()?, content.translation()?)
            else {
                continue;
            };
            if translation
                .language
                .as_ref()
                .is_none_or(|language| language.as_str() != target.tag())
                || source.text.value.trim().is_empty()
                || translation.text.value.trim().is_empty()
            {
                continue;
            }
            context.push(TranslationContext {
                source: source.text.value,
                translation: translation.text.value,
            });
        }
    }
    Ok(context)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use koharu_scene::{
        At, Authored, EntityId, LanguageTag, PageDraft, Session, SourceText, TextLayout,
        TextLayoutKind, Translation,
    };
    use koharu_translator::Language;

    use super::{StageInput, previous_translations};
    use crate::ImageCache;

    #[tokio::test]
    async fn context_comes_from_the_preceding_pages_in_the_target_language() {
        let mut session = Session::memory().await.unwrap();
        let mut pages = Vec::<EntityId>::new();
        let patch = session
            .snapshot()
            .patch(|edit| {
                for (index, texts) in [
                    vec![("一", "one", "en-US")],
                    vec![("二", "two", "en-US"), ("三", "trois", "fr-FR")],
                    vec![("四", "four", "en-US")],
                ]
                .into_iter()
                .enumerate()
                {
                    let page =
                        edit.add_page(PageDraft::new(format!("page {index}"), 1.0, 1.0), At::End)?;
                    for (source, translation, language) in texts {
                        let content = edit.add_text_content(page, At::End)?;
                        edit.set(
                            content,
                            &SourceText {
                                text: Authored::user(source.to_owned()),
                                language: None,
                            },
                        )?;
                        edit.set(
                            content,
                            &Translation {
                                text: Authored::user(translation.to_owned()),
                                language: Some(LanguageTag::new(language)?),
                            },
                        )?;
                        edit.add_text_layer(
                            page,
                            At::End,
                            content,
                            &TextLayout {
                                origin: koharu_scene::Origin::User,
                                kind: TextLayoutKind::Paragraph,
                                angle_degrees: None,
                            },
                        )?;
                    }
                    pages.push(page);
                }
                Ok(())
            })
            .unwrap();
        let snapshot = session.commit(patch).await.unwrap().snapshot;
        let input = |page| {
            StageInput::new(
                snapshot.clone(),
                page,
                None,
                None,
                Arc::new(ImageCache::default()),
                None,
            )
        };
        let pairs = |page, count| {
            previous_translations(&input(page), count, Language::English)
                .unwrap()
                .into_iter()
                .map(|entry| (entry.source, entry.translation))
                .collect::<Vec<_>>()
        };

        assert!(pairs(pages[2], 0).is_empty());
        assert!(pairs(pages[0], 5).is_empty());
        assert_eq!(pairs(pages[2], 1), [("二".to_owned(), "two".to_owned())]);
        assert_eq!(
            pairs(pages[2], u8::MAX),
            [
                ("一".to_owned(), "one".to_owned()),
                ("二".to_owned(), "two".to_owned()),
            ]
        );
    }
}
