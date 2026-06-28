# AI Video Pipeline

TypeScript pipeline that turns a transparent avatar video into a HyperFrames short-form project.

## Module layout

```
pipeline/src/
  index.ts              CLI entry + stage registry
  artifacts.ts          All processed/ and output paths
  types.ts              Shared types (VisualBeat, LayoutConfig, BrandConfig, etc.)
  brand/
    presets.ts          dark-chrome, social-navy brand tokens
    resolve-brand.ts    Merge preset + project.json overrides
    resolve-layout.ts   Layout mode defaults (short-form-split)
    resolve-motion.ts   Beat density + planning config
  stages/
    avatar-prep.ts      Stage 1
    backdrop-download.ts Stage 2
    transcribe.ts       Stage 3
    plan-visual-beats.ts Stage 4 (dense Gemini planning + auto-replan)
    fulfill-assets.ts   Stage 5
    compose.ts          Stage 6 orchestrator + quality gate
  composition/
    generate-index.ts   Root index.html (split layout + legacy modes)
    generate-captions.ts
    generate-meta.ts
    generate-brand-tokens.ts
    generate-scaffold.ts       ambient-bg + seam-treatment
    generate-scene-transitions.ts  CSS push between beats
    generate-motion-graphic.ts  12 recipe templates
    face-mode-schedule.ts  BOTTOM/FULLSCREEN + seam windows
  utils/
    caption-timing.ts
    transcript-anchor.ts
    beat-internal-timing.ts  Word-sync inside MG beats
    validate-beats.ts
    validate-motion-quality.ts  Density + hero coverage gate
templates/
  mg/                   12 motion graphic recipes + _shared CSS
  scaffold/             ambient-bg, seam-treatment, scene-transition
```

## Artifacts

| File | Producer | Consumer |
|------|----------|----------|
| `visual-beats.json` | Stage 4 | Stage 5 |
| `fulfilled-beats.json` | Stage 5 | Stage 6 |
| `assets/brand-tokens.css` | Stage 6 | All compositions |
| `compositions/ambient-bg.html` | Stage 6 | index.html |
| `compositions/seam-treatment.html` | Stage 6 | index.html |
| `compositions/mg-<id>.html` | Stage 5 | Stage 6 |
| `compositions/trans-*.html` | Stage 6 | index.html (split layout) |

## Visual beat types

- **broll** — Pexels stock footage (top panel in split layout; PiP in backdrop-pip mode)
- **motion-graphic** — GSAP recipe from `templates/mg/` (top-half or fullscreen)

## Beat sync (pipeline-wide)

Timing split: **WHAT** (Gemini) / **WHEN** (`transcript-anchor.ts`) / **HOW** (MG templates).

1. Gemini returns `anchorPhrase` (verbatim from transcript) + template + props per beat
2. `getSpeechWindow()` bounds planning to first spoken word → last spoken word
3. `transcript-anchor.ts` resolves phrase → `resolvedTimestamp` (exact → numeric → prefix match)
4. Beat **duration** is phrase-locked: starts ~0.15s before anchor, ends after phrase is spoken
5. Overlaps **trim** the previous beat; unresolvable overlaps **drop** the later beat
6. Beats with no matching anchor are **dropped** (no LLM timestamp fallback)
7. `beat-internal-timing.ts` resolves payoff/setup words → local GSAP times inside MG beats
8. `validate-beats.ts` + `validate-motion-quality.ts` check overlaps, density, hero coverage, post-speech bounds
9. Stage 4 auto-replans once if quality gate fails on sparse gaps during speech

## Stage skip caching

| Stage | Skip when |
|-------|-----------|
| 1 Avatar prep | `processed/01-transparent.webm` exists |
| 2 Backdrop | `processed/00-backdrop.mp4` exists |
| 3 Transcribe | Transcript exists and avatar fingerprint unchanged |

Stages 4–6 always run. Re-run 4→5→6 after pipeline code changes without re-transcribing.

## Layout: short-form-split (default)

```
Track 0: face-wrapper + face video (Ken Burns, color grade)
Track 1: MG + B-roll scenes (hard cuts by default; optional CSS push via `motion.useRegistryTransitions: false`)
Track 2: captions (bottom placement)
Track 3: ambient-bg
Track 4: audio
Track 5: seam-treatment
```

Face modes switch 0.15s before beat boundaries. Seam visible during BOTTOM mode.

## Avatar input

Default: `video-projects/<project>/avatar/avatar.mov`

See [`../PIPELINE.md`](../PIPELINE.md) for full usage.

## Development

```bash
cd pipeline
npm install
npx tsc --noEmit
```

## Customization

- Beat planning: `stages/plan-visual-beats.ts`
- Brand presets: `brand/presets.ts` + [`BRAND.md`](BRAND.md)
- MG recipes: `templates/mg/*.html`
- Scaffold: `templates/scaffold/*.html`
- Motion design refs: [`MOTION_DEFAULTS.md`](MOTION_DEFAULTS.md)

## project.json example

```json
{
  "layout": { "mode": "short-form-split" },
  "brand": { "preset": "social-navy" },
  "motion": {
    "beatIntervalSec": 2.5,
    "jawDropperEverySec": 5
  }
}
```
