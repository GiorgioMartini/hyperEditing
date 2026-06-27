# AI Video Pipeline

TypeScript pipeline that turns a transparent avatar video into a HyperFrames project.

## Module layout

```
pipeline/src/
  index.ts              CLI entry + stage registry
  artifacts.ts          All processed/ and output paths
  types.ts              Shared types (VisualBeat, FulfilledBeat, etc.)
  clean.ts              --clean handler
  config.ts             Env vars + workspace paths
  project/
    load-project.ts     project.json loader + URL normalization
    resolve-avatar.ts   Avatar discovery, fingerprint, invalidation
    avatar-pipeline.ts  Legacy transcript migration + re-exports
  stages/
    avatar-prep.ts      Stage 1
    backdrop-download.ts Stage 2
    transcribe.ts       Stage 3
    plan-visual-beats.ts Stage 4 (Gemini + anchor resolution)
    fulfill-assets.ts   Stage 5
    compose.ts          Stage 6 orchestrator
  fulfill/
    download-broll.ts   Pexels download + cache
  composition/
    generate-index.ts   Root index.html (upper-card MG layout)
    generate-captions.ts
    generate-meta.ts
    generate-motion-graphic.ts
  utils/
    video-helpers.ts
    caption-chunks.ts
    caption-timing.ts   Non-overlapping caption windows
    transcript-anchor.ts  Phrase → timestamp resolution
    validate-beats.ts   Beat overlap / anchor validation
    logger.ts
templates/mg/
  _shared/              tokens, grid, chrome type, glass panel CSS
  stat-callout.html
  stat-slam.html
  kinetic-type.html
  list-reveal.html
```

## Artifacts

| File | Producer | Consumer |
|------|----------|----------|
| `visual-beats.json` | Stage 4 | Stage 5 |
| `fulfilled-beats.json` | Stage 5 | Stage 6 |
| `processed/broll-<id>.mp4` | Stage 5 | Stage 6 |
| `compositions/mg-<id>.html` | Stage 5 | Stage 6 |

## Visual beat types

- **broll** — Pexels stock footage (PiP, bottom-right)
- **motion-graphic** — GSAP template from `templates/mg/` (upper-card by default)

## Beat sync (pipeline-wide)

1. Gemini returns `anchorPhrase` per beat (exact script words)
2. `transcript-anchor.ts` resolves phrase → `resolvedTimestamp` from word JSON
3. `validate-beats.ts` checks overlaps and missing anchors
4. `generate-index.ts` uses resolved times for `data-start`

## Avatar input

Default location: `video-projects/<project>/avatar/avatar.mov`

Resolution order (no `--input`):

1. `avatar/avatar.{mov,mp4,webm}`
2. Single video file in `avatar/` (if only one)
3. Legacy `source/avatar.mov` (deprecated)

Relative `--input` paths resolve from the **project folder**, not the repo root.

Change detection: `processed/.pipeline-state.json` stores avatar fingerprint; changed files trigger invalidation of WebM, transcript, beats, and generated HTML (backdrop preserved).

Transcript path: `processed/transcripts/avatar.json` when input is under project `avatar/`.

## Development

```bash
cd pipeline
npm install
npm run pipeline -- --project test --input ../path/to/avatar.mov --stage 1
npx tsc --noEmit   # typecheck
```

## Customization

- Beat planning prompt: `stages/plan-visual-beats.ts`
- Anchor resolution: `utils/transcript-anchor.ts`
- Pexels logic: `fulfill/download-broll.ts`
- Layer stack: `composition/generate-index.ts`
- MG templates: `templates/mg/*.html` + `_shared/`
- Motion design refs: [`MOTION_DEFAULTS.md`](MOTION_DEFAULTS.md)
- **Captions styling:** `composition/generate-captions.ts` + `utils/caption-timing.ts`

### Caption defaults

| Setting | Default | Notes |
|---------|---------|-------|
| `fontSize` | 64px | Larger type for vertical short-form |
| `maxWidthRatio` | 0.48 | Narrower box → 2+ lines when chunks are long |
| `maxWordsPerChunk` | 4 | Word grouping per segment |
| `activeColor` | `#ff3333` | Spoken-word highlight |
| `pauseThresholdSec` | 0.35 | New chunk after this pause |
| `interSegmentGapSec` | 0.15 | Gap between consecutive lines |

### Motion defaults

| Setting | Default | Notes |
|---------|---------|-------|
| `accentColor` | `#ff3333` | MG accent / glow |
| `fontFamily` | `Montserrat, sans-serif` | MG typography |
| `layout` | `upper-card` | Speaker visible during MG |

Per-project overrides: `project.json` → `captions` / `motion` (see [`PIPELINE.md`](../PIPELINE.md)).

## Verification

After any pipeline run:

1. `npx hyperframes lint` in the project folder
2. Preview `?comp=captions` and each `?comp=mg-beat-N`
3. Draft render + frame check at anchor phrase timestamps

Full checklist: [`MOTION_DEFAULTS.md`](MOTION_DEFAULTS.md).
