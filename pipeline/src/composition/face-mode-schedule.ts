import type {
  FaceTransform,
  FulfilledBeat,
  FaceModeEntry,
  LayoutConfig,
  MotionGraphicLayout,
  SeamWindow,
} from '../types.js';
import { beatStartTime } from '../utils/transcript-anchor.js';

const MODE_LEAD_IN = 0.15;
const MODE_DUR = 0.32;

/** @deprecated Use computeFaceTransforms() — kept for tests referencing letterbox values */
export const FACE_BOTTOM = { x: 0, y: 1136, scale: 0.5625 };
/** @deprecated Use computeFaceTransforms() */
export const FACE_FULLSCREEN = { x: -1166.5, y: 0, scale: 1.7778 };

export interface FaceTransformPair {
  bottom: FaceTransform;
  fullscreen: FaceTransform;
}

/**
 * BOTTOM: cover-fill the lower panel (default) or letterbox full landscape frame.
 * FULLSCREEN: cover-fill the full 9:16 canvas (cropped sides).
 */
export function computeFaceTransforms(
  layout: LayoutConfig,
  canvasWidth: number,
  canvasHeight: number,
): FaceTransformPair {
  const { panelHeight, faceSourceWidth, faceSourceHeight, faceFitMode = 'cover' } = layout;

  let bottom: FaceTransform;
  if (faceFitMode === 'letterbox') {
    const scale = canvasWidth / faceSourceWidth;
    const scaledH = faceSourceHeight * scale;
    bottom = {
      x: 0,
      y: panelHeight + (canvasHeight - panelHeight - scaledH) / 2,
      scale,
    };
  } else {
    // Cover: scale to fill panel height, center-crop horizontally
    const scale = panelHeight / faceSourceHeight;
    const scaledW = faceSourceWidth * scale;
    bottom = {
      x: (canvasWidth - scaledW) / 2,
      y: panelHeight,
      scale,
    };
  }

  const fsScale = canvasHeight / faceSourceHeight;
  const fsScaledW = faceSourceWidth * fsScale;
  const fullscreen: FaceTransform = {
    x: (canvasWidth - fsScaledW) / 2,
    y: 0,
    scale: fsScale,
  };

  return {
    bottom: mergeTransform(bottom, layout.faceBottom),
    fullscreen: mergeTransform(fullscreen, layout.faceFullscreen),
  };
}

function mergeTransform(base: FaceTransform, override?: Partial<FaceTransform>): FaceTransform {
  if (!override) return base;
  return {
    x: override.x ?? base.x,
    y: override.y ?? base.y,
    scale: override.scale ?? base.scale,
  };
}

function beatLayout(beat: FulfilledBeat): MotionGraphicLayout {
  if (beat.type === 'broll') return 'top-half';
  return beat.motionGraphic?.layout ?? 'top-half';
}

function isFullscreenLayout(layout: MotionGraphicLayout): boolean {
  return layout === 'fullscreen';
}

/**
 * Derive face BOTTOM/FULLSCREEN schedule from beat layouts.
 * B-roll and top-half MG → BOTTOM; fullscreen MG → FULLSCREEN.
 */
export function computeFaceModeSchedule(
  beats: FulfilledBeat[],
  duration: number,
  layout: LayoutConfig,
): FaceModeEntry[] {
  if (layout.mode !== 'short-form-split') return [];

  const sorted = [...beats].sort((a, b) => beatStartTime(a) - beatStartTime(b));
  if (sorted.length === 0) {
    return [{ t: 0, mode: 'BOTTOM' }];
  }

  const schedule: FaceModeEntry[] = [];
  let currentMode: 'BOTTOM' | 'FULLSCREEN' = 'BOTTOM';

  for (const beat of sorted) {
    const start = beatStartTime(beat);
    const beatLayoutVal =
      beat.type === 'motion-graphic'
        ? (beat.motionGraphic?.layout ?? 'top-half')
        : 'top-half';
    const wantFullscreen = isFullscreenLayout(beatLayoutVal);

    const targetMode: 'BOTTOM' | 'FULLSCREEN' = wantFullscreen ? 'FULLSCREEN' : 'BOTTOM';
    if (targetMode !== currentMode) {
      schedule.push({ t: start, mode: targetMode });
      currentMode = targetMode;
    }
  }

  if (schedule.length === 0 || schedule[0].t > 0) {
    schedule.unshift({ t: 0, mode: 'BOTTOM' });
  }

  return schedule;
}

/** Seam visible when face is in BOTTOM mode during split layout. */
export function computeSeamWindows(
  faceSchedule: FaceModeEntry[],
  duration: number,
  beats: FulfilledBeat[],
): SeamWindow[] {
  if (faceSchedule.length === 0) return [];

  const windows: SeamWindow[] = [];
  const sorted = [...faceSchedule].sort((a, b) => a.t - b.t);

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (entry.mode !== 'BOTTOM') continue;

    const start = entry.t;
    let end = duration;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].mode === 'FULLSCREEN') {
        end = sorted[j].t;
        break;
      }
    }

    const beatsInWindow = beats.filter((b) => {
      const s = beatStartTime(b);
      return s >= start - 0.05 && s < end;
    });
    if (beatsInWindow.length > 0) {
      const lastBeat = beatsInWindow[beatsInWindow.length - 1];
      end = Math.max(end, beatStartTime(lastBeat) + lastBeat.duration);
    }

    windows.push({ start, end: Math.min(end, duration) });
  }

  return windows;
}

/** Generate GSAP face-mode timeline JS for index.html main timeline. */
export function generateFaceModeTimelineJs(
  schedule: FaceModeEntry[],
  duration: number,
  transforms: FaceTransformPair,
  kenBurnsScale = 1.012,
): string {
  const { bottom, fullscreen } = transforms;

  const lines: string[] = [
    `mainTl.set("#face-wrapper", { x: ${bottom.x}, y: ${bottom.y}, scale: ${bottom.scale} }, 0);`,
  ];

  for (const entry of schedule) {
    if (entry.t <= 0 && entry.mode === 'BOTTOM') continue;
    const target = entry.mode === 'FULLSCREEN' ? fullscreen : bottom;
    const at = Math.max(entry.t - MODE_LEAD_IN, 0);
    lines.push(
      `mainTl.to("#face-wrapper", { x: ${target.x}, y: ${target.y}, scale: ${target.scale}, duration: ${MODE_DUR}, ease: "expo.inOut" }, ${at.toFixed(3)});`,
    );
  }

  if (kenBurnsScale !== 1) {
    lines.push(
      `mainTl.to("#face-video", { scale: ${kenBurnsScale}, duration: ${duration.toFixed(3)}, ease: "none" }, 0);`,
    );
  }
  lines.push(`mainTl.set({}, {}, ${duration.toFixed(3)});`);

  return lines.join('\n      ');
}

export { MODE_LEAD_IN, MODE_DUR };
