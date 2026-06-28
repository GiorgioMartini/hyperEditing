# Repository Context — Hyperframes Student Kit

> **Purpose of this file:** Agent-readable context for how this repository is organized, what tools it uses, and how to work in it. Read this (plus `CLAUDE.md` for render-contract detail) when you need orientation without re-exploring the tree.

---

## What this repository is

**Hyperframes Editor — Student Edition** (`package.json` name: `hyperframes-editor`) is a learning workbench for building **motion-graphics and promo videos in plain HTML + GSAP**, rendered by [HyperFrames](https://hyperframes.heygen.com) (HeyGen).

It is **not**:
- A Remotion / React / Next.js video monorepo
- A Python `video-use` installation (see [Related tools](#related-tools-video-use-vs-hyperframes) below)
- A single video project — it is a **multi-project workspace**

It **is**:
- 14 finished (or near-finished) example video projects under `video-projects/`
- Shared workspace tooling, brand examples, motion philosophy, and AI agent skills
- A place to reverse-engineer real shipped work: storyboards, compositions, `final.mp4` outputs

Built by Nate Herk (AI Automation Society). MIT for code/compositions; AIS brand assets are example-only.

---

## Core technology stack

| Layer | Technology | How it's used here |
|-------|------------|-------------------|
| **Composition authoring** | HTML + CSS + GSAP 3.14 | Each scene is `.html`; animation via paused `gsap.timeline()` on `window.__timelines` |
| **Video framework** | **HyperFrames** (`npx hyperframes`, currently ~0.7.x) | Lint, Studio preview, headless Chrome render, transcribe, TTS, registry blocks |
| **Media processing** | FFmpeg (system) | Re-encode source footage, extract frames for verification, audio prep |
| **Browser automation** | Playwright 1.59 (`devDependency`) | Project-specific capture scripts (e.g. ClickUp demo stills), optional Studio screenshots |
| **Fonts** | Google Fonts CDN | Loaded per composition |
| **Counter-example** | React 18 + Babel standalone | Only `first-agent-promo` — not the standard HyperFrames pattern |

### npm dependencies (workspace root)

```json
"devDependencies": { "playwright": "^1.59.1" }
```

**HyperFrames is not pinned in `package.json`.** It is invoked via `npx hyperframes`, which downloads the CLI on demand. Run all HyperFrames commands **from inside a project folder** (`video-projects/<name>/`), not the repo root.

### HyperFrames ecosystem packages (external, via CLI)

The CLI bundles or pulls from the HeyGen monorepo. Relevant packages (not vendored in this repo):

- `@hyperframes/cli` — init, lint, preview, render, transcribe, tts, doctor
- `@hyperframes/core` / `engine` / `player` / `producer` / `studio` — runtime and render pipeline
- `@hyperframes/shader-transitions` — WebGL transition blocks in the registry
- Registry blocks/components installed with `npx hyperframes add <name>`

Docs: https://hyperframes.heygen.com · Agent sitemap: https://hyperframes.heygen.com/llms.txt

---

## Repository layout

```
hyperframes-student-kit/          ← repo root (workspace)
├── REPOSITORY_CONTEXT.md         ← this file
├── README.md                     ← human onboarding
├── CLAUDE.md                     ← full workspace guide + render contract (11 rules)
├── AGENTS.md                     ← short agent delegation notes
├── MOTION_PHILOSOPHY.md          ← motion aesthetic bible (read before creative work)
├── DESIGN.ais-example.md         ← AIS brand spec template (do not edit; copy to projects)
├── package.json / package-lock.json
├── skills-lock.json              ← pins skills from heygen-com/hyperframes
├── scripts/
│   └── preflight.mjs             ← preview-blocking checks (complements lint)
├── assets/                       ← shared brand examples (copy into projects)
│   ├── brand-tokens.css
│   ├── AIS Logo PNG.png
│   └── ...
├── docs/                         ← sparse design/plan artifacts
├── pipeline/                     ← AI avatar → HyperFrames pipeline (see PIPELINE.md)
│   ├── src/                      ← stages, composition generators, brand/, utils/
│   ├── templates/mg/             ← 12 motion-graphic recipe templates
│   ├── templates/scaffold/       ← ambient-bg, seam-treatment, scene-transition
│   ├── MOTION_DEFAULTS.md        ← layout defaults, MG catalog, verification checklist
│   └── BRAND.md                  ← brand presets (dark-chrome, social-navy, custom)
├── PIPELINE.md                   ← pipeline quick start + project.json reference
├── .claude/
│   ├── launch.json               ← VS Code debug: hyperframes preview
│   └── skills/                   ← slash-command skills (hyperframes, gsap, etc.)
└── video-projects/               ← one self-contained HyperFrames project per folder
    └── <project>/
        ├── index.html            ← root composition
        ├── compositions/         ← sub-compositions (data-composition-src)
        │   └── components/       ← registry components (grain-overlay, etc.)
        ├── assets/               ← media, transcripts, brand tokens (per-project copy)
        ├── final.mp4             ← shipped reference output (in git)
        ├── renders/              ← local scratch renders (gitignored)
        ├── hyperframes.json      ← CLI paths + registry URL
        ├── meta.json             ← id, name, width, height, fps
        ├── project.json          ← pipeline-only: YouTube URL, caption/backdrop options
        ├── processed/            ← pipeline cache (gitignored): webm, transcript, beats
        ├── DESIGN.md             ← some projects (brand spec)
        ├── STORYBOARD.md / HANDOFF.md / NOTES.md
        └── scripts/              ← optional project automation (Playwright, capture)
```

**Rule:** Never put `index.html`, `compositions/`, or `renders/` at the workspace root. Always work inside `video-projects/<slug>/`.

---

## How HyperFrames compositions work (mental model)

1. **Root `<div>`** has `data-composition-id`, `data-start="0"`, `data-width`, `data-height`, and usually `data-duration`.
2. **Timed elements** use `class="clip"` + `data-start`, `data-duration`, `data-track-index`. Same track = no overlap.
3. **Relative timing:** `data-start="intro + 2"` references another clip's id.
4. **Sub-compositions:** `<template>` + `data-composition-src="compositions/foo.html"`. Child timelines auto-link — never `masterTL.add(child)`.
5. **GSAP:** Exactly one paused timeline per composition id: `window.__timelines["<id>"] = gsap.timeline({ paused: true })`.
6. **Video:** `<video muted>` for picture; sibling `<audio>` for sound. Never animate `width`/`height`/`top`/`left` on `<video>` — wrap in a `<div>`.
7. **Duration:** Composition length = `tl.duration()`. Pad with `tl.set({}, {}, seconds)` if needed.
8. **Determinism:** No `Date.now()`, unseeded `Math.random()`, or render-time network fetches.

Full contract: `CLAUDE.md` § Render Contract.

### Typical project config

`hyperframes.json` (all projects follow this shape):

```json
{
  "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  "paths": {
    "blocks": "compositions",
    "components": "compositions/components",
    "assets": "assets"
  }
}
```

`meta.json` example (`may-shorts-19`): 1080×1920, 30fps, vertical short.

---

## Video projects catalog (14)

| Project | Format | Category | Notes |
|---------|--------|----------|-------|
| `may-shorts-19` | 9:16 vertical | Short-form | **Gold standard** for talking-head + MG + karaoke captions; `/short-form-video` skill is based on it |
| `may-shorts-18` | 9:16 | Short-form | Earlier iteration; compare with -19 |
| `may-shorts-6` | 16:9 | Short-form | Landscape talking-head pattern |
| `clickup-demo` | 16:9 | Product promo | 60s SaaS demo; heavy registry blocks; Playwright capture scripts |
| `linear-promo-30s` | 16:9 | Product promo | Infinite Payments aesthetic; draft — see `NOTES.md` |
| `hyperframes-sizzle` | 16:9 | Product promo | Feature sizzle; `website-to-hyperframes` capture artifacts |
| `first-agent-promo` | 16:9 | Product promo | **React+Babel** counter-example, not standard HTML pattern |
| `aisoc-lesson-5-1` | 16:9 | Educational | Full lesson: face-cam + sections + transcript sync |
| `golden-ratio-demo` | 16:9 | Educational | Layout/proportion lesson; polished draft |
| `claude-edit-intro` | 16:9 | Template | Minimal brand coupling; good starter |
| `aisoc-hype` | 16:9 | Brand launch | 30s AIS hype; scaffold for other AIS work |
| `aisoc-app-release` | 16:9 | Brand launch | Read `HANDOFF.md` for documented footguns |
| `dr-ronda-patrick-multivitamins-v2` | 9:16 vertical | Pipeline-generated | Avatar + backdrop + captions + B-roll + MG via `npm run pipeline` |

**AIS-heavy projects** (`aisoc-*`, `golden-ratio-demo`): hardcoded AIS colors/handles — reference only unless rebranding.

**Low coupling templates:** `claude-edit-intro`, `clickup-demo`, `may-shorts-*`, `linear-promo-30s`, `hyperframes-sizzle`.

---

## Authoring workflow (standard loop)

```
edit HTML → lint → preview (Studio) → draft render → frame verification → final render
```

| Step | Command (from `video-projects/<name>/`) |
|------|-------------------------------------------|
| Lint | `npx hyperframes lint` |
| Preflight (optional) | `node ../../scripts/preflight.mjs .` |
| Live preview | `npx hyperframes preview` → http://localhost:3002 |
| Draft MP4 | `npx hyperframes render --quality draft --output renders/draft.mp4` |
| Frame check | `ffmpeg -ss <t> -i renders/draft.mp4 -frames:v 1 renders/frames/t.png` |
| Final MP4 | `npx hyperframes render --quality standard --output renders/final.mp4` |

**Gates (from `CLAUDE.md`):** Live Studio preview before any render; MP4 scrub preview before `--quality standard`.

### Registry blocks (install into project)

```bash
npx hyperframes catalog --type block
npx hyperframes add grain-overlay    # component → compositions/components/
npx hyperframes add whip-pan         # block → compositions/
```

38 blocks + 3 components. Scope catalog CSS to `[data-composition-id="..."]` — blocks often ship global `html, body` rules that bleed into parent documents.

### Media pipeline (CLI-built-in)

```bash
npx hyperframes transcribe assets/voice.mp4 --model small.en --json
npx hyperframes tts "Hello world" --voice am_adam --output assets/narration.wav
```

### AI video pipeline (`pipeline/`)

Automated path from HeyGen avatar footage → full HyperFrames project (backdrop, karaoke captions, B-roll, motion graphics). **Separate from** manual HTML authoring and HyperFrames skills.

```bash
# From repo root — see PIPELINE.md for full options
npm run pipeline -- --project my-video-001
cd video-projects/my-video-001 && npx hyperframes preview
```

Default avatar input: `video-projects/<project>/avatar/avatar.mov` (legacy `source/avatar.mov` still works).

| Stage | Output | Skip when |
|-------|--------|-----------|
| 1 Avatar prep | `processed/01-transparent.webm` | WebM already exists |
| 2 Backdrop | `processed/00-backdrop.mp4` from `project.json` `originalUrl` | Backdrop file already exists |
| 3 Transcribe | `processed/transcripts/avatar.json` | Transcript exists and avatar fingerprint unchanged |
| 4 Plan beats | `processed/visual-beats.json` | — (always runs) |
| 5 Fulfill | B-roll MP4s + `compositions/mg-*.html` | — (always runs) |
| 6 Compose | `index.html`, scaffold, `assets/brand-tokens.css`, captions | — (always runs) |

**Layout default:** `short-form-split` — top-half MG/B-roll scenes, face in bottom half, ambient background, seam treatment, face-mode choreography (BOTTOM ↔ FULLSCREEN). Legacy modes: `upper-card`, `backdrop-pip`.

**Motion graphics sync (speech-bounded):** Stage 4 plans beats only within the spoken-word window (first word → last word). Beat budget uses speech duration, not full video length. Gemini supplies verbatim `anchorPhrase` values; `transcript-anchor.ts` resolves exact timestamps (exact → numeric → prefix match). Beats with no anchor are dropped; overlaps trim the previous beat instead of shifting forward into silence. Composition duration ends shortly after the last spoken word.

**Brand system:** `project.json` → `brand.preset` (`dark-chrome`, `social-navy`, `custom`) generates `assets/brand-tokens.css`. See `pipeline/BRAND.md`.

**12 MG recipes** in `pipeline/templates/mg/` — Gemini picks template + props semantically. CSS scene transitions between beats in split layout.

**Caption defaults** (override in `project.json` → `captions`): 64px font, max width 48% of frame (`maxWidthRatio: 0.48`), 4 words per chunk, red active word. Generator: `pipeline/src/composition/generate-captions.ts`.

**Re-run after pipeline code changes** (without re-transcribing):

```bash
npm run pipeline -- --project my-video-001 --stage 4
npm run pipeline -- --project my-video-001 --stage 5
npm run pipeline -- --project my-video-001 --stage 6
```

Pipeline does **not** invoke `.claude/skills/` — skills remain for manual/agent authoring only.

---

## Agent skills (`.claude/skills/`)

Installed from `heygen-com/hyperframes` (see `skills-lock.json`). **Invoke the matching skill before editing compositions.**

| Skill | Use when |
|-------|----------|
| `hyperframes` | Authoring compositions, captions, TTS, transitions, audio-reactive |
| `hyperframes-cli` | init, lint, preview, render, transcribe, tts, doctor |
| `gsap` | Timeline animation, easing, stagger |
| `hyperframes-registry` | `npx hyperframes add` wiring |
| `website-to-hyperframes` | URL → captured site → video (7-step pipeline) |
| `make-a-video` | End-to-end beginner flow with preview gates |
| `short-form-video` | 9:16 talking-head + karaoke + face-mode choreography |

Install missing skills: `npx skills add heygen-com/hyperframes --yes`

---

## Environment variables (`.env`)

`.env` is gitignored. Template lives at repo root (copy from comments in existing `.env` or create from README guidance).

| Variable | Used for |
|----------|----------|
| `CLICKUP_API_KEY` | `clickup-demo` integrations only |
| `OPENAI_API_KEY` | Projects using OpenAI for generation |
| `ELEVENLABS_API_KEY` | TTS / voice (also used by video-use ecosystem) |
| `HYPERFRAMES_API_KEY` | HyperFrames cloud/producer features if needed |
| `GEMINI_API_KEY` | Pipeline stage 4 — visual beat planning |
| `PEXELS_API_KEY` | Pipeline stage 5 — B-roll download |

Most projects need **no API keys** for local lint/preview/render.

---

## Workspace scripts

| Script | Purpose |
|--------|---------|
| `npm run pipeline -- --project <name> [--input <video>]` | Run AI avatar → HyperFrames pipeline (see `PIPELINE.md`) |
| `npm run preflight -- video-projects/<name>` | Fast fail on Studio-breaking issues (timeline key mismatch, empty timelines, shader overload) |
| `npm run preflight:all` | Run preflight on every project |

`scripts/preflight.mjs` complements `hyperframes lint` — catches preview blockers lint may only warn about.

---

## Key reference documents

| File | When to read |
|------|----------------|
| `MOTION_PHILOSOPHY.md` | Before any creative/motion work (10 Laws, recipes, pre-flight checklist) |
| `DESIGN.ais-example.md` | Template for per-project `DESIGN.md` |
| `CLAUDE.md` | Render contract, workspace rules, registry list, visual verification |
| `README.md` | Human quickstart, project table, brand swap guide |
| `PIPELINE.md` | AI avatar pipeline: stages, skip caching, speech-bounded sync, `project.json` |
| `pipeline/MOTION_DEFAULTS.md` | Pipeline layout defaults, 12 MG recipes, verification checklist |
| `pipeline/BRAND.md` | Brand presets and per-video taste via `project.json` |
| Per-project `HANDOFF.md` / `STORYBOARD.md` | Project-specific decisions and footguns |

---

## Related tools: video-use vs HyperFrames

These are **complementary but separate** tools in the broader "edit video with code/agents" ecosystem:

| | **HyperFrames** (this repo) | **video-use** ([browser-use/video-use](https://github.com/browser-use/video-use)) |
|--|---------------------------|-------------------------------------------------------------------------------------|
| **What it does** | **Create** motion graphics, kinetic type, overlays, promos from HTML | **Edit** raw footage — cuts, filler removal, grading, subtitles via transcript |
| **Input** | HTML compositions + assets | Folder of raw takes |
| **Stack** | HTML, GSAP, headless Chrome render | Python, FFmpeg, transcript + filmstrip analysis |
| **In this repo?** | **Yes — primary stack** | **No — not installed here** |
| **Overlap** | video-use docs mention HyperFrames for animation overlays | Can call out to HyperFrames for MG segments |

If the user mentions "video-use and hyperframes" as packages for code-based video editing, clarify: **this repository is HyperFrames-only**; video-use would be a sibling install (e.g. `npx skills add browser-use/video-use`) for a different pipeline stage.

**Also not in this repo:** Remotion, Editly, Revideo — HyperFrames is explicitly the non-Remotion pipeline.

---

## Common patterns by project type

### Short-form vertical (`may-shorts-19` pattern)

- 1080×1920, audio edit is source of truth for `data-duration`
- Four always-on layers: `ambient-bg`, face wrapper + `<video>`, `seam-treatment`, `captions`
- Face modes: `BOTTOM` (landscape in lower half) vs `FULLSCREEN` (cropped cover) — animate wrapper, not video
- Scene overlays as separate sub-compositions on track 1

### Product promo (`clickup-demo`, `linear-promo-30s`)

- 1920×1080, scene-based `index.html` or sub-comp per beat
- Registry blocks: social cards, shader transitions, `app-showcase`, etc.
- `MOTION_PHILOSOPHY.md` aesthetic: black canvas, chrome type, whip transitions, ≤5 symbolic colors

### Educational lesson (`aisoc-lesson-5-1`)

- Long-form; sections as sub-compositions under `compositions/sections/`
- Transcript-driven word sync; face-cam + full-screen MG modes

### Website capture (`hyperframes-sizzle`)

- `npx hyperframes capture <URL>` → assets in `assets/<site>-capture/`
- Compositions animate captured DOM/screenshots

### React exception (`first-agent-promo`)

- `animations.jsx` + `scenes.jsx` via Babel in browser
- Uses custom `Stage`/`Sprite` components, not `window.__timelines`
- Useful reference only — do not copy pattern into standard HyperFrames projects

---

## Git ignore conventions

- `node_modules/`, `renders/`, `.env`, `raw-media/`, `**/renders/frames/`
- `final.mp4` at project root **is committed** (reference output)
- Per-project `assets/` media **is committed** (repo is meant to be clone-and-run)

---

## Troubleshooting quick reference

| Symptom | Fix |
|---------|-----|
| CLI scans wrong files | `cd video-projects/<name>` first |
| Studio stuck at 0:00 | Run preflight; check timeline registration; try `?comp=<sub-id>` URL |
| Black flash between scenes | Child timeline shorter than `data-duration` — pad with `tl.to({}, {duration: SLOT}, 0)` |
| Frozen video mid-render | Animating `<video>` directly — wrap and animate wrapper |
| Shader preview stall | Open individual sub-composition in Studio |
| Missing GSAP in sub-comp | Each sub-composition needs its own GSAP `<script>` tag |

`npx hyperframes doctor` — Node, FFmpeg, Chrome check.

---

## Investigation notes (for agents)

- **Repo path:** `hyperframes-student-kit` under `HHHyperEditing/`; this is the sole package in that parent folder.
- **No `video-use` Python package, helpers, or skills** exist in this tree (verified via search).
- **HyperFrames version** at time of doc: `0.7.5` via `npx hyperframes --version`.
- **Playwright** is the only declared npm dependency; project scripts import it directly.
- **Skills** partially duplicated: `skills-lock.json` tracks upstream hashes; `.claude/skills/` also contains `make-a-video` and `short-form-video` (local/student additions).

---

*Last updated: 2026-06-28 — speech-bounded MG sync, short-form-split default, stage skip caching, brand system.*
