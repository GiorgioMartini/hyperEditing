# Pipeline Brand System

Each video gets its own visual taste via **`project.json` → `brand`** without hand-editing compositions.

## Quick start

```json
{
  "layout": { "mode": "short-form-split" },
  "brand": {
    "preset": "social-navy"
  }
}
```

Run the pipeline — it writes `assets/brand-tokens.css` and injects tokens into MG templates, captions, ambient bg, and seam treatment.

## Presets

| Preset | Canvas | Accent | Secondary | Best for |
|--------|--------|--------|-----------|----------|
| `dark-chrome` | Black `#000` | White | Gray | MOTION_PHILOSOPHY cinematic, chrome type |
| `social-navy` | Navy `#07121c` | Cyan `#37bdf8` | Orange `#f09025` | AIS-style shorts, talking-head social |
| `custom` | You define all | You define all | You define all | Brand-specific videos |

## Custom brand (full override)

```json
{
  "brand": {
    "preset": "custom",
    "background": "#0a0a12",
    "accent": "#7c5cff",
    "accentSecondary": "#ff6b6b",
    "text": "#ffffff",
    "textDim": "#8892a4",
    "surface": "#14141f",
    "fontDisplay": "Montserrat, sans-serif",
    "fontMono": "Roboto Mono, monospace"
  }
}
```

## CSS variables generated

```css
:root {
  --brand-bg;
  --brand-accent;
  --brand-accent-secondary;
  --brand-text;
  --brand-text-dim;
  --brand-surface;
  --brand-font-display;
  --brand-font-mono;
}
```

MG templates also expose `--mg-accent`, `--mg-font`, etc. via `_shared/tokens.css`.

## Captions vs motion accent

- **Captions** use `brand.accent` by default for active word highlight
- Override with `captions.activeColor` if captions should differ from MG accent

## Legacy `motion` block

Still supported for backward compatibility:

```json
{
  "motion": {
    "accentColor": "#ff3333",
    "fontFamily": "Montserrat, sans-serif"
  }
}
```

Prefer `brand.*` for new projects — `motion.accentColor` overrides `brand.accent` in MG templates only.

## When to write a full DESIGN.md

Use structured `project.json` brand for pipeline-generated videos. Write a workspace `DESIGN.md` (see `DESIGN.ais-example.md`) when:

- Manual authoring with `/hyperframes` + `short-form-video` skill
- Complex brand rules (logo placement, motion easing palette, transition table)
- Multiple deliverables sharing one identity

Copy `assets/brand-tokens.css` values from your DESIGN.md into `project.json` for pipeline runs.

## Layout + brand together

```json
{
  "layout": {
    "mode": "short-form-split",
    "panelHeight": 960,
    "faceSourceWidth": 1920,
    "faceSourceHeight": 1080
  },
  "brand": { "preset": "social-navy" },
  "motion": {
    "beatIntervalSec": 2.5,
    "minBeatDuration": 1.5,
    "maxBeatDuration": 4.0,
    "jawDropperEverySec": 5
  }
}
```

## Migration from legacy pipeline output

Existing projects without `layout.mode` default to **`short-form-split`** on the next `--stage 6` run. To keep the old look:

```json
{ "layout": { "mode": "upper-card" } }
```

Or for YouTube backdrop + PiP B-roll:

```json
{ "layout": { "mode": "backdrop-pip" }, "originalUrl": "https://..." }
```

Re-run `--stage 6` (or full pipeline) after updating `project.json`.
