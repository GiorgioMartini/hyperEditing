import type { CaptionWord } from './caption-chunks.js';

/** Timing knobs for non-overlapping caption segment visibility */
export interface CaptionTimingOptions {
  /** Minimum dead air between consecutive caption lines (seconds) */
  interSegmentGapSec?: number;
  /** Fade in this many seconds before first word */
  preRollSec?: number;
  /** Hold after last word before fade-out begins */
  postHoldSec?: number;
  /** Fade-in animation duration */
  fadeInSec?: number;
  /** Fade-out animation duration */
  fadeOutSec?: number;
}

export interface CaptionSegmentTiming {
  words: CaptionWord[];
  segStart: number;
  segEnd: number;
  fadeInAt: number;
  fadeOutAt: number;
  hideAt: number;
}

const DEFAULTS: Required<CaptionTimingOptions> = {
  interSegmentGapSec: 0.15,
  preRollSec: 0.06,
  postHoldSec: 0.04,
  fadeInSec: 0.1,
  fadeOutSec: 0.1,
};

/**
 * Compute non-overlapping visibility windows for caption chunks.
 * Ensures segment N is fully hidden before segment N+1 fades in.
 */
export function computeCaptionSegmentTimings(
  chunks: CaptionWord[][],
  options: CaptionTimingOptions = {},
): CaptionSegmentTiming[] {
  const opts = { ...DEFAULTS, ...options };
  const { interSegmentGapSec, preRollSec, postHoldSec, fadeInSec, fadeOutSec } = opts;

  const timings: CaptionSegmentTiming[] = [];
  let previousHideAt = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.length === 0) continue;

    const segStart = chunk[0].start;
    const segEnd = chunk[chunk.length - 1].end;

    // Earliest fade-in: after previous segment + gap, or pre-roll before first word
    const fadeInAt = Math.max(segStart - preRollSec, previousHideAt + interSegmentGapSec, 0);

    // Default fade-out after last word + post-hold
    let fadeOutAt = segEnd + postHoldSec;

    // If next segment exists, cap fade-out so we leave interSegmentGap before it appears
    if (i + 1 < chunks.length && chunks[i + 1].length > 0) {
      const nextSegStart = chunks[i + 1][0].start;
      const nextFadeInAt = Math.max(nextSegStart - preRollSec, 0);
      const maxFadeOutAt = nextFadeInAt - interSegmentGapSec - fadeOutSec;
      if (maxFadeOutAt < fadeOutAt) {
        fadeOutAt = Math.max(maxFadeOutAt, segEnd);
      }
    }

    const hideAt = fadeOutAt + fadeOutSec + 0.02;
    previousHideAt = hideAt;

    timings.push({ words: chunk, segStart, segEnd, fadeInAt, fadeOutAt, hideAt });
  }

  return timings;
}
