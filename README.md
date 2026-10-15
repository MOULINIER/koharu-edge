<h1 align="center">Koharu Edge</h1>

<p align="center">ML-powered manga translator, written in <b>Rust</b>.</p>

<p align="center">
A fork of <a href="https://github.com/koharu-rs/koharu"><b>Koharu</b></a> with extra fixes and features, released separately.<br>
See <a href="#how-this-fork-differs">how this fork differs</a>.
</p>

<p align="center">
<a href="https://github.com/MOULINIER/koharu-edge/releases/latest" target="_blank">Download</a> · <a href="https://github.com/koharu-rs/koharu" target="_blank">Upstream Koharu</a> · <a href="https://koharu.rs/" target="_blank">Docs</a> · <a href="https://discord.gg/mHvHkxGnUY" target="_blank">Discord</a>
</p>

<p align="center">
<a href="https://koharu.rs/ja" target="_blank">日本語</a> | <a href="https://koharu.rs/zh" target="_blank">简体中文</a>
</p>

Koharu introduces a local-first workflow for manga translation, utilizing the power of ML to automate the process. It combines the capabilities of object detection, OCR, inpainting, and LLMs to create a seamless translation experience.

> [!NOTE]
> Koharu runs its vision models and LLMs **locally** on your machine to keep your data private and secure.

---

![screenshot](packages/docs/screenshot.png)

## How this fork differs

Koharu Edge tracks upstream Koharu's `main` branch and adds the changes below. Most of them come from upstream pull requests that are still waiting for review or were closed. Each one was reviewed, and fixed where needed, before it was merged here. When upstream ships its own version of a change, Koharu Edge switches to it.

- **Cleaner text detection:** a paragraph detected both as one large box and as smaller boxes inside it now becomes a single text block, instead of overlapping duplicates. ([#1070](https://github.com/koharu-rs/koharu/pull/1070))
- **Recent colors:** color pickers remember the last 8 colors you used. ([#989](https://github.com/koharu-rs/koharu/pull/989))
- **Drag-and-drop layers:** reorder layers, or move them into groups, by dragging them in the layers panel. ([#959](https://github.com/koharu-rs/koharu/pull/959))
- **OCR a single text frame:** each text layer has an OCR button, which also works on frames you drew yourself. Clearing a frame's source text lets OCR fill it again. ([#1065](https://github.com/koharu-rs/koharu/pull/1065))
- **Consistent translations across pages:** **Settings → Translation → Context from previous pages** sends the translations of earlier pages along with each request, so names, terms and tone stay consistent. Off by default. (Part of [#1014](https://github.com/koharu-rs/koharu/pull/1014))

Koharu Edge installs as a separate app, so it can sit next to upstream Koharu. Both share the same settings, downloaded models, API keys and projects. It updates itself from [this repository's releases](https://github.com/MOULINIER/koharu-edge/releases). Version `vX.Y.Z-edge.N` is the N-th Edge build on top of upstream Koharu `vX.Y.Z`.

Before reporting a bug upstream, check that it also happens in upstream Koharu, since the changes above don't exist there.

## Features

- [Multi-format project management](https://koharu.rs/guides/projects) for raster images, archives, and PDFs with page sequencing
- [Selective pipeline](https://koharu.rs/guides/processing) for detection, OCR, translation, and inpainting at page or project scope
- [Detection and segmentation](https://koharu.rs/guides/processing) for text regions, speech bubbles, and cleanup regions
- [Multimodal OCR](https://koharu.rs/models/vision) for dialogue, captions, and general page text
- [Local GGUF inference and hosted providers](https://koharu.rs/models/providers) for LLM and machine-translation workflows
- [Generative inpainting](https://koharu.rs/guides/cleanup) for source-text removal and artwork reconstruction
- [Proofreading](https://koharu.rs/guides/review) for correcting OCR and translation output
- [WebGPU-based canvas](https://koharu.rs/guides/canvas) for manual cleanup, text placement, and page composition
- [Multilingual text shaping and layout](https://koharu.rs/guides/typesetting) with automatic fitting, font fallback, vertical CJK, and right-to-left text
- [Layered PSD export](https://koharu.rs/guides/export) for flattened delivery and layered editing
- [Agent-based workflow](https://koharu.rs/agent/projects) for project inspection, editing, and pipeline control

## Hardware Acceleration

Koharu supports CUDA and ROCm / HIP on Windows and Linux, Metal on Apple silicon, and Vulkan on Windows and Linux. Keep your graphics driver current; a full CUDA or ROCm SDK installation is not required. See [Runtime and hardware requirements](https://koharu.rs/hardware) for model-specific guidance.

### CUDA

CUDA 13.3 requires an NVIDIA Turing-class or newer GPU and an R610 or newer driver. Check NVIDIA's official [CUDA toolkit, driver, and architecture matrix](https://docs.nvidia.com/datacenter/tesla/drivers/cuda-toolkit-driver-and-architecture-matrix.html) and install the [latest NVIDIA driver](https://www.nvidia.com/en-us/drivers/).

### ROCm / HIP

ROCm 10.0 support depends on the exact AMD GPU, operating system, and driver combination. Check AMD's official [ROCm 10.0.0 compatibility matrix](https://rocm.docs.amd.com/en/docs-10.0.0/compatibility/compatibility-matrix.html) and install a compatible [AMD driver](https://www.amd.com/en/support).

### Metal

Metal is available on Apple silicon Macs.

### Vulkan

Vulkan is available on Windows and Linux as an alternative to CUDA and ROCm / HIP.

### WebGPU

The editor canvas uses WebGPU and requires a current graphics driver even when inference runs on the CPU.

### CPU

CPU inference is available for supported workloads but is substantially slower.

## Machine Learning Models

Koharu uses separate models for detection, OCR, inpainting, and translation. [Vision and inpainting](https://koharu.rs/models/vision) and [translation and generation](https://koharu.rs/models/translation) have separate model settings.

### Computer Vision Models

Detection, OCR, and inpainting models are selected separately.

#### Detection and Layout

The detection model finds text regions, speech bubbles, and segmentation masks.

- [Koharu Layout RF-DETR Seg 2XL](https://huggingface.co/mayocream/koharu-layout-rfdetr-seg-2xl-1152)

#### OCR

OCR reads source text from detected regions.

- [PaddleOCR VL 1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6)
- [Manga OCR](https://huggingface.co/mayocream/manga-ocr)
- [Baberu OCR](https://huggingface.co/genshiai-daichi/baberu-ocr)
- [Hayai OCR](https://huggingface.co/JustANormalTinkerer/hayai-ocr-v2)

#### Inpainting

Inpainting reconstructs the image behind source text before the translation is rendered.

- [FLUX.2 Klein](https://huggingface.co/unsloth/FLUX.2-klein-4B-GGUF)
- [RORem mixed](https://huggingface.co/mayocream/RORem-mixed-GGUF)
- [LaMa](https://huggingface.co/mayocream/lama-manga)
- [AOT GAN](https://huggingface.co/mayocream/aot-inpainting)

### Large Language Models

Translation can use a local language model or a remote API.

#### General-Purpose Local Models

- LFM 2.5: [lfm2.5-1.2b-instruct](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF)
- Ministral 3: [ministral-3-8b-instruct](https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512-GGUF)
- Gemma 4: [gemma4-e2b-it](https://huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF), [gemma4-e4b-it](https://huggingface.co/unsloth/gemma-4-E4B-it-qat-GGUF), [gemma4-12b-it](https://huggingface.co/unsloth/gemma-4-12B-it-qat-GGUF), [gemma4-26b-a4b-it](https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF), [gemma4-31b-it](https://huggingface.co/unsloth/gemma-4-31B-it-qat-GGUF)
- Qwen 3.5: [qwen3.5-0.8b](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF), [qwen3.5-2b](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF), [qwen3.5-4b](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), [qwen3.5-9b](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF), [qwen3.5-27b](https://huggingface.co/unsloth/Qwen3.5-27B-GGUF), [qwen3.5-35b-a3b](https://huggingface.co/unsloth/Qwen3.5-35B-A3B-GGUF)
- Qwen 3.6: [qwen3.6-27b](https://huggingface.co/unsloth/Qwen3.6-27B-GGUF), [qwen3.6-35b-a3b](https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF)
- Qwen 3.8: [qwen3.8-27b](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF)

#### Uncensored Local Models

- Gemma 4 uncensored: [gemma4-e2b-uncensored](https://huggingface.co/HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive), [gemma4-e4b-uncensored](https://huggingface.co/HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive), [gemma4-12b-uncensored](https://huggingface.co/HauhauCS/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced), [gemma4-26b-a4b-uncensored](https://huggingface.co/HauhauCS/Gemma4-26B-A4B-QAT-Uncensored-HauhauCS-Balanced-MTP), [gemma4-31b-uncensored](https://huggingface.co/HauhauCS/Gemma4-31B-QAT-Uncensored-HauhauCS-Balanced-MTP)
- Qwen 3.5 uncensored: [qwen3.5-2b-uncensored](https://huggingface.co/HauhauCS/Qwen3.5-2B-Uncensored-HauhauCS-Aggressive), [qwen3.5-4b-uncensored](https://huggingface.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive), [qwen3.5-9b-uncensored](https://huggingface.co/HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive)
- Qwen 3.6 uncensored: [qwen3.6-27b-uncensored](https://huggingface.co/HauhauCS/Qwen3.6-27B-Uncensored-HauhauCS-Balanced), [qwen3.6-35b-a3b-uncensored](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive)
- Qwen 3.8 uncensored: [qwen3.8-27b-uncensored](https://huggingface.co/HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF)

#### Cloud Providers

Hosted LLM providers: [OpenAI](https://platform.openai.com/), [Gemini](https://ai.google.dev/), [Claude](https://www.anthropic.com/api), [Grok](https://docs.x.ai/developers), [MiniMax](https://platform.minimax.io/), [DeepSeek](https://platform.deepseek.com/), and [OpenRouter](https://openrouter.ai/).

#### Machine Translation Providers

Machine-translation providers: [DeepL](https://www.deepl.com/), [Google Cloud Translation](https://cloud.google.com/translate), and [Caiyun](https://fanyi.caiyunapp.com/).

#### OpenAI-Compatible Providers

OpenAI-compatible endpoints are also supported.

## Installation

> [!IMPORTANT]
> Download Koharu Edge from [its releases page](https://github.com/MOULINIER/koharu-edge/releases/latest). The links, WinGet and Homebrew below install **upstream** Koharu, without Edge's changes.
>
> Edge builds aren't code-signed: Windows SmartScreen and macOS Gatekeeper warn on first launch. On Windows, choose *More info → Run anyway*. On macOS, try to open the app once, then allow it under *System Settings → Privacy & Security → Open Anyway*.

Download release builds from the [releases page](https://github.com/koharu-rs/koharu/releases/latest). [Installation requirements and first launch](https://koharu.rs/installation) vary by operating system.

Builds are available for Windows, macOS, and Linux.

### WinGet

Install on Windows with [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/):

```bash
winget install koharu
```

### Homebrew

Install on macOS with [Homebrew](https://brew.sh/):

```bash
brew install --cask koharu
```

## Troubleshooting

Startup, runtime, model, and provider errors are covered in [Troubleshooting](https://koharu.rs/reference/troubleshooting). Set `RUST_LOG` to `debug` or `trace` for verbose logs:

```bash
# macOS / Linux
RUST_LOG=debug koharu
# Windows (PowerShell)
$env:RUST_LOG="debug"; koharu.exe
```

## Development

Platform dependencies and validation commands for local builds are listed in [Development Setup](https://koharu.rs/development/setup).

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.97.1 or later (Rust 2024 edition)
- [Bun](https://bun.sh/) 1.3.14 or later
- [LLVM](https://llvm.org/) 22.1.8 or later

### Install dependencies

```bash
bun install
```

### Development

```bash
bun dev
```

### Build

```bash
bun run build
```

The executable is written to `target/release`.

## Sponsorship

If Koharu is useful in your workflow, consider sponsoring the project.

- [GitHub Sponsors](https://github.com/sponsors/mayocream)
- [Patreon](https://www.patreon.com/mayocream)

![sponsors](./.github/sponsorkit/sponsors.svg)

## Contributors ❤️

Thanks to all the contributors who have helped make Koharu better!

<a href="https://github.com/koharu-rs/koharu/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=koharu-rs/koharu" />
</a>

## License

Copyright 2025-2026 Mayo Takanashi and Koharu contributors.

Koharu is dual-licensed under the [MIT License](LICENSE-MIT) or the
[Apache License, Version 2.0](LICENSE-APACHE), at your option.
