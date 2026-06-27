import type { CompositionLayers, FulfilledBeat, MotionGraphicLayout } from '../types.js';
import { beatStartTime } from '../utils/transcript-anchor.js';

/** Upper-card MG wrapper — speaker stays visible below */
const UPPER_CARD_STYLE = `
      position: absolute;
      top: 8%;
      left: 5%;
      right: 5%;
      height: 42%;
      border-radius: 16px;
      overflow: hidden;
      z-index: 6;
      pointer-events: none;
`;

function mgLayoutStyle(beat: FulfilledBeat): string {
  const layout: MotionGraphicLayout =
    beat.motionGraphic?.layout ?? 'upper-card';
  if (layout === 'fullscreen') {
    return `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 6;
      pointer-events: none;
    `;
  }
  return UPPER_CARD_STYLE;
}

/** Generate root index.html layer stack. */
export function generateIndexHtml(layers: CompositionLayers): string {
  const {
    width,
    height,
    duration,
    faceVideo,
    audioPath,
    backdropVideo,
    dimOverlay,
    brollBeats,
    motionGraphicBeats,
    projectName,
  } = layers;

  const backdropLayer = backdropVideo
    ? `
    <video
      id="backdrop-video"
      muted
      src="${backdropVideo}"
      data-start="0"
      data-duration="${duration}"
      style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0;"
    ></video>
    <div
      id="backdrop-dim"
      style="position: absolute; inset: 0; background: rgba(0,0,0,${dimOverlay}); z-index: 1; pointer-events: none;"
    ></div>`
    : '';

  let trackIndex = 2;
  const brollHtml = brollBeats
    .map((beat) => {
      const idx = trackIndex++;
      const start = beatStartTime(beat);
      return `
    <video
      id="broll-${beat.id}"
      class="clip"
      data-start="${start}"
      data-duration="${beat.duration}"
      data-track-index="${idx}"
      muted
      src="${beat.assetPath}"
      style="position: absolute; width: 35%; aspect-ratio: 9/16; bottom: 10%; right: 5%; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); z-index: 3;"
    ></video>`;
    })
    .join('\n');

  const mgHtml = motionGraphicBeats
    .map((beat) => {
      const idx = trackIndex++;
      const compId = `mg-${beat.id}`;
      const start = beatStartTime(beat);
      const layoutClass =
        (beat.motionGraphic?.layout ?? 'upper-card') === 'upper-card'
          ? 'mg-layer mg-upper-card'
          : 'mg-layer mg-fullscreen';
      return `
    <div
      id="${compId}"
      class="scene-layer ${layoutClass}"
      data-composition-id="${compId}"
      data-composition-src="${beat.assetPath}"
      data-start="${start}"
      data-duration="${beat.duration}"
      data-track-index="${idx}"
      data-width="${width}"
      data-height="${height}"
      style="${mgLayoutStyle(beat).trim()}"
    ></div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${projectName}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #000;
    }
    #face-video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 2;
    }
    .scene-layer {
      pointer-events: none;
    }
    .mg-layer {
      z-index: 6;
    }
    .mg-upper-card {
      /* inline style on element */
    }
    .mg-fullscreen {
      position: absolute;
      inset: 0;
      width: ${width}px;
      height: ${height}px;
    }
  </style>
</head>
<body>
  <div
    id="root"
    data-composition-id="main"
    data-start="0"
    data-width="${width}"
    data-height="${height}"
  >
    ${backdropLayer}

    <video
      id="face-video"
      muted
      src="${faceVideo}"
      data-start="0"
      data-duration="${duration}"
    ></video>

    <audio
      id="main-audio"
      class="clip"
      src="${audioPath}"
      data-start="0"
      data-duration="${duration}"
      data-track-index="1"
      data-volume="1.0"
    ></audio>

    ${brollHtml}
    ${mgHtml}

    <div
      id="captions"
      class="scene-layer"
      data-composition-id="captions"
      data-composition-src="compositions/captions.html"
      data-start="0"
      data-duration="${duration}"
      data-track-index="10"
      data-width="${width}"
      data-height="${height}"
      style="position: absolute; inset: 0; width: ${width}px; height: ${height}px; z-index: 5; pointer-events: none;"
    ></div>
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.set({}, {}, ${duration});
    window.__timelines["main"] = tl;
  </script>
</body>
</html>`;
}
