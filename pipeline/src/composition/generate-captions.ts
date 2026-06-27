import { chunkCaptionWords, type CaptionWord } from '../utils/caption-chunks.js';
import {
  computeCaptionSegmentTimings,
  type CaptionTimingOptions,
} from '../utils/caption-timing.js';

export interface CaptionsConfig {
  width: number;
  height: number;
  duration: number;
  maxWordsPerChunk?: number;
  pauseThresholdSec?: number;
  activeColor?: string;
  fontSize?: number;
  maxWidthRatio?: number;
  interSegmentGapSec?: number;
  preRollSec?: number;
  postHoldSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/**
 * Build compositions/captions.html — center-screen karaoke captions,
 * up to maxWordsPerChunk words per line, active word highlighted.
 */
export function generateCaptionsHtml(
  words: CaptionWord[],
  config: CaptionsConfig,
): string {
  const {
    width,
    height,
    duration,
    maxWordsPerChunk = 4,
    pauseThresholdSec = 0.35,
    activeColor = '#ff3333',
    fontSize = 64,
    maxWidthRatio = 0.48,
    interSegmentGapSec,
    preRollSec,
    postHoldSec,
    fadeInSec,
    fadeOutSec,
  } = config;

  const capMaxWidth = Math.round(width * maxWidthRatio);

  const timingOpts: CaptionTimingOptions = {
    interSegmentGapSec,
    preRollSec,
    postHoldSec,
    fadeInSec,
    fadeOutSec,
  };

  const chunks = chunkCaptionWords(words, { maxWords: maxWordsPerChunk, pauseThresholdSec });
  const segmentTimings = computeCaptionSegmentTimings(chunks, timingOpts);

  const segmentsJson = JSON.stringify(
    segmentTimings.map((seg) => ({
      words: seg.words.map((w) => ({
        word: w.text,
        start: w.start,
        end: w.end,
      })),
      fadeInAt: seg.fadeInAt,
      fadeOutAt: seg.fadeOutAt,
      hideAt: seg.hideAt,
    })),
  );

  const resolvedFadeIn = fadeInSec ?? 0.1;
  const resolvedFadeOut = fadeOutSec ?? 0.1;

  return `<template id="captions-template">
  <div
    data-composition-id="captions"
    data-start="0"
    data-width="${width}"
    data-height="${height}"
    data-duration="${duration}"
  >
    <div class="cap-stage" id="cap-stage"></div>

    <style>
      [data-composition-id="captions"] {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      [data-composition-id="captions"] .cap-stage {
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        height: 0;
        pointer-events: none;
      }
      [data-composition-id="captions"] .cap-line-wrap {
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        transform: translateY(-50%);
        display: flex;
        justify-content: center;
        padding: 0 48px;
        opacity: 0;
        visibility: hidden;
      }
      [data-composition-id="captions"] .cap-line {
        display: inline-block;
        max-width: ${capMaxWidth}px;
        text-align: center;
        font-family: sans-serif;
        font-weight: 800;
        font-size: ${fontSize}px;
        line-height: 1.25;
        letter-spacing: -0.01em;
        color: #ffffff;
        text-shadow:
          -3px -3px 0 #000,
          3px -3px 0 #000,
          -3px 3px 0 #000,
          3px 3px 0 #000,
          0 4px 12px rgba(0, 0, 0, 0.6);
        white-space: normal;
      }
      [data-composition-id="captions"] .cap-word {
        display: inline-block;
        transform-origin: center center;
        will-change: transform, color;
      }
    </style>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      (function () {
        const SEGMENTS = ${segmentsJson};
        const COMP_DURATION = ${duration};
        const DIM = "rgba(255,255,255,0.55)";
        const ACTIVE = "${activeColor}";
        const SPOKEN = "#ffffff";
        const ACTIVE_SCALE = 1.08;
        const FADE_IN = ${resolvedFadeIn};
        const FADE_OUT = ${resolvedFadeOut};

        const stage = document.querySelector('[data-composition-id="captions"] #cap-stage');
        if (!stage) return;

        SEGMENTS.forEach(function (seg, segIdx) {
          const wrap = document.createElement("div");
          wrap.className = "cap-line-wrap";
          wrap.id = "cap-seg-" + segIdx;

          const line = document.createElement("div");
          line.className = "cap-line";

          seg.words.forEach(function (w, wIdx) {
            const span = document.createElement("span");
            span.className = "cap-word";
            span.id = "cap-w-" + segIdx + "-" + wIdx;
            span.textContent = w.word;
            line.appendChild(span);
            if (wIdx < seg.words.length - 1) {
              line.appendChild(document.createTextNode(" "));
            }
          });

          wrap.appendChild(line);
          stage.appendChild(wrap);
        });

        const tl = gsap.timeline({ paused: true });

        SEGMENTS.forEach(function (seg, segIdx) {
          const wrapSel = '[data-composition-id="captions"] #cap-seg-' + segIdx;
          const fadeInAt = seg.fadeInAt;
          const fadeOutAt = seg.fadeOutAt;
          const hideAt = seg.hideAt;

          seg.words.forEach(function (w, wIdx) {
            const wordSel = '[data-composition-id="captions"] #cap-w-' + segIdx + "-" + wIdx;
            tl.set(wordSel, { color: DIM, scale: 1.0 }, fadeInAt);
          });

          tl.set(wrapSel, { visibility: "visible" }, fadeInAt);
          tl.fromTo(
            wrapSel,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: FADE_IN, ease: "power2.out" },
            fadeInAt,
          );

          seg.words.forEach(function (w, wIdx) {
            const wordSel = '[data-composition-id="captions"] #cap-w-' + segIdx + "-" + wIdx;
            tl.to(
              wordSel,
              { color: ACTIVE, scale: ACTIVE_SCALE, duration: 0.06, ease: "power2.out" },
              w.start,
            );
            tl.to(
              wordSel,
              { color: SPOKEN, scale: 1.0, duration: 0.1, ease: "power2.out" },
              w.end,
            );
          });

          tl.to(
            wrapSel,
            { opacity: 0, duration: FADE_OUT, ease: "power2.in" },
            fadeOutAt,
          );
          tl.set(wrapSel, { visibility: "hidden" }, hideAt);
        });

        tl.set({}, {}, COMP_DURATION);

        window.__timelines = window.__timelines || {};
        window.__timelines["captions"] = tl;
      })();
    </script>
  </div>
</template>
`;
}
