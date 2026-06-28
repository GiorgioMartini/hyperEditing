import type { CompositionLayers, FulfilledBeat, LayoutConfig, MotionGraphicLayout } from '../types.js';
import { beatStartTime } from '../utils/transcript-anchor.js';
import {
  computeFaceTransforms,
  generateFaceModeTimelineJs,
} from './face-mode-schedule.js';

/** Legacy upper-card MG wrapper */
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

/** YouTube backdrop — cover-fit inside a clip rect (no stretch; crop overflow). */
function renderBackdropLayer(options: {
  backdropVideo: string;
  duration: number;
  dimOverlay: number;
  trackIndex: number;
  panelHeight?: number;
  upperPanelOnly: boolean;
  objectPosition: string;
}): string {
  const {
    backdropVideo,
    duration,
    dimOverlay,
    trackIndex,
    panelHeight,
    upperPanelOnly,
    objectPosition,
  } = options;

  const clipToPanel = upperPanelOnly && panelHeight != null;
  const panelStyle = clipToPanel
    ? `position: absolute; top: 0; left: 0; width: 100%; height: ${panelHeight}px; overflow: hidden; z-index: 0;`
    : 'position: absolute; inset: 0; overflow: hidden; z-index: 0;';

  const dimLayer =
    dimOverlay > 0
      ? `
    <div
      id="backdrop-dim"
      style="position: absolute; ${
        clipToPanel
          ? `top: 0; left: 0; width: 100%; height: ${panelHeight}px;`
          : 'inset: 0;'
      } background: rgba(0,0,0,${dimOverlay}); z-index: 1; pointer-events: none;"
    ></div>`
      : '';

  return `
    <div id="backdrop-panel" style="${panelStyle}">
      <video
        id="backdrop-video"
        muted
        src="${backdropVideo}"
        data-start="0"
        data-duration="${duration}"
        data-track-index="${trackIndex}"
        style="display: block; width: 100%; height: 100%; object-fit: cover; object-position: ${objectPosition};"
      ></video>
    </div>${dimLayer}`;
}

function normalizeLayout(beat: FulfilledBeat): MotionGraphicLayout {
  const layout = beat.motionGraphic?.layout ?? 'top-half';
  if (layout === 'upper-card') return 'upper-card';
  return layout;
}

function mgLayoutStyle(beat: FulfilledBeat, layoutConfig: LayoutConfig): string {
  const layout = normalizeLayout(beat);
  if (layoutConfig.mode === 'short-form-split') {
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
    return `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: ${layoutConfig.panelHeight}px;
      z-index: 6;
      pointer-events: none;
      overflow: hidden;
    `;
  }

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

function renderBrollLegacy(brollBeats: FulfilledBeat[], trackStart: number): { html: string; nextTrack: number } {
  let trackIndex = trackStart;
  const html = brollBeats
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
  return { html, nextTrack: trackIndex };
}

function renderSceneBeatsSplit(
  sceneBeats: FulfilledBeat[],
  width: number,
  height: number,
  layoutConfig: LayoutConfig,
  sceneTransitions: CompositionLayers['sceneTransitions'] = [],
): string {
  const beatsHtml = sceneBeats
    .map((beat) => {
      const start = beatStartTime(beat);
      const isMg = beat.type === 'motion-graphic';
      const compId = isMg ? `mg-${beat.id}` : `broll-${beat.id}`;
      const src = beat.assetPath ?? '';

      if (!isMg) {
        return `
    <video
      id="${compId}"
      class="clip scene-layer"
      data-start="${start}"
      data-duration="${beat.duration}"
      data-track-index="1"
      muted
      src="${src}"
      style="position: absolute; top: 0; left: 0; width: ${width}px; height: ${layoutConfig.panelHeight}px; object-fit: cover; z-index: 6;"
    ></video>`;
      }

      return `
    <div
      id="${compId}"
      class="scene-layer mg-layer"
      data-composition-id="${compId}"
      data-composition-src="${src}"
      data-start="${start}"
      data-duration="${beat.duration}"
      data-track-index="1"
      data-width="${width}"
      data-height="${height}"
      style="${mgLayoutStyle(beat, layoutConfig).trim()}"
    ></div>`;
    })
    .join('\n');

  const transHtml = (sceneTransitions ?? [])
    .map((tr) => `
    <div
      id="${tr.id}"
      class="scene-layer trans-layer"
      data-composition-id="${tr.id}"
      data-composition-src="${tr.relPath}"
      data-start="${tr.start}"
      data-duration="${tr.duration}"
      data-track-index="1"
      data-width="${width}"
      data-height="${height}"
      style="position: absolute; inset: 0; z-index: 7; pointer-events: none;"
    ></div>`)
    .join('\n');

  return beatsHtml + transHtml;
}

function renderSplitLayout(layers: CompositionLayers): string {
  const {
    width,
    height,
    duration,
    faceVideo,
    audioPath,
    backdropVideo,
    dimOverlay,
    backdropUpperPanelOnly = true,
    backdropObjectPosition = 'center',
    projectName,
    layout,
    brandBackground,
    faceModeSchedule,
    sceneBeats,
    sceneTransitions = [],
  } = layers;

  const faceTransforms = computeFaceTransforms(layout, width, height);
  const { bottom: faceBottom } = faceTransforms;
  const faceObjectPosition = layout.faceVideoObjectPosition ?? '50% 42%';
  const kenBurns = layout.faceKenBurnsScale ?? 1.012;
  const faceTimelineJs = generateFaceModeTimelineJs(faceModeSchedule, duration, faceTransforms, kenBurns);
  const sceneHtml = renderSceneBeatsSplit(sceneBeats, width, height, layout, sceneTransitions);
  const hasBackdrop = Boolean(backdropVideo);

  // Positive z-index stack — negative values paint behind body background and hide the video.
  const backdropLayer = hasBackdrop
    ? renderBackdropLayer({
        backdropVideo: backdropVideo!,
        duration,
        dimOverlay,
        trackIndex: 6,
        panelHeight: layout.panelHeight,
        upperPanelOnly: backdropUpperPanelOnly,
        objectPosition: backdropObjectPosition,
      })
    : '';

  const ambientClipStyle = hasBackdrop && backdropUpperPanelOnly
    ? `z-index: 2; height: ${layout.panelHeight}px; overflow: hidden;`
    : 'z-index: 2;';

  const bodyBackground = hasBackdrop ? 'transparent' : brandBackground;
  const faceWrapperZ = hasBackdrop ? 3 : 0;
  const faceVignetteCss = hasBackdrop
    ? `radial-gradient(
        ellipse at center,
        transparent 60%,
        rgba(0, 0, 0, 0.2) 88%,
        rgba(0, 0, 0, 0.45) 100%
      )`
    : `radial-gradient(
        ellipse at center,
        transparent 55%,
        rgba(0, 0, 0, 0.35) 85%,
        rgba(0, 0, 0, 0.7) 100%
      )`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${projectName}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;500;700;900&family=Roboto+Mono:wght@400;500;700&display=block" rel="stylesheet">
  <link rel="stylesheet" href="assets/brand-tokens.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: ${bodyBackground};
      font-family: var(--brand-font-display, Montserrat, sans-serif);
      color: var(--brand-text, #fff);
    }
    #face-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      width: ${layout.faceSourceWidth}px;
      height: ${layout.faceSourceHeight}px;
      transform-origin: 0 0;
      z-index: ${faceWrapperZ};
    }
    #face-video {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: ${faceObjectPosition};
      transform-origin: center center;
      filter: contrast(1.08) saturate(1.08) brightness(0.97);
    }
    #face-wrapper::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: ${faceVignetteCss};
    }
    .scene-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: ${width}px;
      height: ${height}px;
      pointer-events: none;
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
    <div
      id="ambient-bg"
      class="scene-layer"
      data-composition-id="ambient-bg"
      data-composition-src="compositions/ambient-bg.html"
      data-start="0"
      data-duration="${duration}"
      data-track-index="3"
      data-width="${width}"
      data-height="${height}"
      style="${ambientClipStyle}"
    ></div>

    <div id="face-wrapper">
      <video
        id="face-video"
        data-start="0"
        data-duration="${duration}"
        data-track-index="0"
        src="${faceVideo}"
        muted
      ></video>
    </div>

    <div
      id="seam-treatment"
      class="scene-layer"
      data-composition-id="seam-treatment"
      data-composition-src="compositions/seam-treatment.html"
      data-start="0"
      data-duration="${duration}"
      data-track-index="5"
      data-width="${width}"
      data-height="${height}"
      style="z-index: 4;"
    ></div>

    <audio
      id="main-audio"
      class="clip"
      src="${audioPath}"
      data-start="0"
      data-duration="${duration}"
      data-track-index="4"
      data-volume="1.0"
    ></audio>

    ${sceneHtml}

    <div
      id="captions"
      class="scene-layer"
      data-composition-id="captions"
      data-composition-src="compositions/captions.html"
      data-start="0"
      data-duration="${duration}"
      data-track-index="2"
      data-width="${width}"
      data-height="${height}"
      style="z-index: 8;"
    ></div>
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    const mainTl = gsap.timeline({ paused: true });
    ${faceTimelineJs}
    window.__timelines["main"] = mainTl;
  </script>
</body>
</html>`;
}

function renderLegacyLayout(layers: CompositionLayers): string {
  const {
    width,
    height,
    duration,
    faceVideo,
    audioPath,
    backdropVideo,
    dimOverlay,
    backdropUpperPanelOnly = false,
    backdropObjectPosition = 'center',
    brollBeats,
    motionGraphicBeats,
    projectName,
    layout,
  } = layers;

  const backdropLayer = backdropVideo
    ? renderBackdropLayer({
        backdropVideo,
        duration,
        dimOverlay,
        trackIndex: 0,
        upperPanelOnly: backdropUpperPanelOnly,
        objectPosition: backdropObjectPosition,
      })
    : '';

  let trackIndex = 2;
  const { html: brollHtml, nextTrack } = renderBrollLegacy(brollBeats, trackIndex);
  trackIndex = nextTrack;

  const mgHtml = motionGraphicBeats
    .map((beat) => {
      const idx = trackIndex++;
      const compId = `mg-${beat.id}`;
      const start = beatStartTime(beat);
      return `
    <div
      id="${compId}"
      class="scene-layer mg-layer"
      data-composition-id="${compId}"
      data-composition-src="${beat.assetPath}"
      data-start="${start}"
      data-duration="${beat.duration}"
      data-track-index="${idx}"
      data-width="${width}"
      data-height="${height}"
      style="${mgLayoutStyle(beat, layout).trim()}"
    ></div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${projectName}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <link rel="stylesheet" href="assets/brand-tokens.css">
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
    .scene-layer { pointer-events: none; }
    .mg-layer { z-index: 6; }
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

/** Generate root index.html layer stack. */
export function generateIndexHtml(layers: CompositionLayers): string {
  if (layers.layout.mode === 'short-form-split') {
    return renderSplitLayout(layers);
  }
  return renderLegacyLayout(layers);
}
