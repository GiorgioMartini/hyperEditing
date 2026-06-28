import type {
  FulfilledBeat,
  FaceModeEntry,
  LayoutConfig,
  MotionGraphicLayout,
  SeamWindow,
} from '../types.js';
import { beatStartTime } from '../utils/transcript-anchor.js';

const MODE_LEAD_IN = 0.15;
const MODE_DUR = 0.32;

/** Face transform targets for 1920x1080 source on 1080x1920 canvas. */
export const FACE_BOTTOM = { x: 0, y: 1136, scale: 0.5625 };
export const FACE_FULLSCREEN = { x: -1166.5, y: 0, scale: 1.7778 };

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

    // Extend through beat end if last beat in window is BOTTOM
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
): string {
  if (schedule.length === 0) {
    return `
      mainTl.set("#face-wrapper", { x: ${FACE_BOTTOM.x}, y: ${FACE_BOTTOM.y}, scale: ${FACE_BOTTOM.scale} }, 0);
    `;
  }

  const lines: string[] = [
    `mainTl.set("#face-wrapper", { x: ${FACE_BOTTOM.x}, y: ${FACE_BOTTOM.y}, scale: ${FACE_BOTTOM.scale} }, 0);`,
  ];

  for (const entry of schedule) {
    if (entry.t <= 0 && entry.mode === 'BOTTOM') continue;
    const target = entry.mode === 'FULLSCREEN' ? FACE_FULLSCREEN : FACE_BOTTOM;
    const at = Math.max(entry.t - MODE_LEAD_IN, 0);
    lines.push(
      `mainTl.to("#face-wrapper", { x: ${target.x}, y: ${target.y}, scale: ${target.scale}, duration: ${MODE_DUR}, ease: "expo.inOut" }, ${at.toFixed(3)});`,
    );
  }

  lines.push(`mainTl.to("#face-video", { scale: 1.025, duration: ${duration.toFixed(3)}, ease: "none" }, 0);`);
  lines.push(`mainTl.set({}, {}, ${duration.toFixed(3)});`);

  return lines.join('\n      ');
}

export { MODE_LEAD_IN, MODE_DUR };
