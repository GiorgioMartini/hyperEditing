# AI Video Pipeline — Quick Start

Automated pipeline for creating short-form videos from HeyGen avatars with backdrop, captions, B-roll, and motion graphics.

## Prerequisites

- HyperFrames (`npx hyperframes`)
- video-use at `~/Developer/video-use/helpers/transcribe.py`
- Pipeline deps: `cd pipeline && npm install`
- API keys in `.env`: `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `GEMINI_API_KEY`
- `yt-dlp` for YouTube backdrop downloads

## Project layout

```
video-projects/<name>/
  avatar/
    avatar.mov          ← default input (also accepts .mp4 / .webm)
  project.json          ← pipeline config (YouTube URL, caption/motion options)
  processed/            ← gitignored pipeline cache
  compositions/         ← generated captions + MG scenes
  index.html            ← generated root composition
```

## Usage

From repo root:

```bash
npm run pipeline -- --project my-video-001
```

Place your avatar video at `video-projects/my-video-001/avatar/avatar.mov` (or pass `--input`).

Optional explicit input (paths relative to **project folder**):

```bash
npm run pipeline -- --project my-video-001 --input avatar/avatar.mov
```

Clean cache before full run:

```bash
npm run pipeline -- --project my-video-001 --clean
```

## Avatar change detection

The pipeline tracks avatar file size + modification time in `processed/.pipeline-state.json`.

When the avatar in `avatar/` changes (or you replace the file), it automatically:

- Clears derived artifacts (WebM, transcript, beats, generated compositions)
- Re-runs transcription and downstream stages on the next full pipeline run

Backdrop (`processed/00-backdrop.mp4`) and Pexels cache are kept.

Legacy `source/avatar.mov` still works but is deprecated — move to `avatar/avatar.mov`.

## Stages (1–6)

| Stage | Name | Output |
|-------|------|--------|
| 1 | Avatar prep | `processed/01-transparent.webm` (skips re-encode if file already exists) |
| 2 | Backdrop download | `processed/00-backdrop.mp4` (from `project.json` `originalUrl`) |
| 3 | Transcription | `processed/transcripts/avatar.json` (when using project `avatar/`) |
| 4 | Plan visual beats | `processed/visual-beats.json` (anchor-resolved timestamps) |
| 5 | Fulfill assets | `processed/fulfilled-beats.json` + b-roll/MG files |
| 6 | Compose | `index.html`, `compositions/captions.html`, `compositions/mg-*.html` |

Run a single stage:

```bash
npm run pipeline -- --project my-video-001 --stage 4
```

When using the default `avatar/` folder, the transcript is always `processed/transcripts/avatar.json` — no need to pass `--input` for stage-only reruns.

## Captions

Stage 6 generates `compositions/captions.html` — center-screen karaoke captions with per-word highlight. Words are chunked (default 4 per segment); a **narrow max-width** lets longer phrases wrap onto two or more lines instead of one long row.

Segments use **non-overlapping visibility windows** so consecutive lines never stack on screen.

**Pipeline defaults** (override per project in `project.json` → `captions`):

| Option | Default | Effect |
|--------|---------|--------|
| `fontSize` | `64` | Caption text size in px |
| `maxWidthRatio` | `0.48` | Max caption block width as a fraction of frame width (~518px at 1080) |
| `maxWordsPerChunk` | `4` | Words grouped per caption segment |
| `activeColor` | `#ff3333` | Highlight color for the word being spoken |
| `pauseThresholdSec` | `0.35` | Pause length that starts a new chunk |
| `interSegmentGapSec` | `0.15` | Minimum gap between consecutive caption lines |
| `preRollSec` | `0.06` | Fade in before first word |
| `postHoldSec` | `0.04` | Hold after last word before fade-out |
| `fadeInSec` / `fadeOutSec` | `0.10` | Fade animation duration |

To change defaults for **all** future videos, edit `pipeline/src/utils/caption-timing.ts`. Per-project overrides go in `project.json` only.

## Motion graphics sync

Stage 4 plans beats with an **anchorPhrase** (exact words from the script). TypeScript resolves `data-start` from word-level transcript timestamps — not LLM guesses.

MG beats default to **upper-card** layout (speaker stays visible). Templates use a shared design system (grid, chrome type, glass panel). See [`pipeline/MOTION_DEFAULTS.md`](pipeline/MOTION_DEFAULTS.md).

## project.json

```json
{
  "originalUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "captions": {
    "maxWordsPerChunk": 4,
    "activeColor": "#ff3333",
    "pauseThresholdSec": 0.35,
    "fontSize": 64,
    "maxWidthRatio": 0.48,
    "interSegmentGapSec": 0.15
  },
  "motion": {
    "accentColor": "#ff3333",
    "fontFamily": "Montserrat, sans-serif"
  },
  "backdrop": {
    "maxHeight": 720,
    "dimOverlay": 0.45
  }
}
```

Query params like `&t=69s` are stripped automatically; the video id is kept.

## After pipeline

```bash
cd video-projects/my-video-001
npx hyperframes preview
npx hyperframes lint
npx hyperframes render --quality draft --output renders/draft.mp4
```

## Architecture notes

- **Pipeline** generates HTML and downloads assets automatically.
- **HyperFrames skills** (`.claude/skills/`) are for manual/agent authoring — not invoked by the pipeline.
- Motion graphics use templates in `pipeline/templates/mg/` — Gemini picks template + props + anchorPhrase, not raw HTML.
- Beat timing: WHAT (LLM) / WHEN (transcript-anchor.ts) / HOW (templates).

See [`pipeline/README.md`](pipeline/README.md) for module layout.
