import type { TranscriptWord } from '../types.js';

export interface InternalTimingProps {
  setupLocalSec: string;
  payoffLocalSec: string;
  strikeLocalSec: string;
  fadeOutLocalSec: string;
}

/**
 * Resolve word-synced local GSAP times inside a beat window.
 * Maps payoffWord/setupWord/strikeWord props to seconds from beat start.
 */
export function resolveBeatInternalTimings(
  beatStart: number,
  beatDuration: number,
  words: TranscriptWord[],
  props: Record<string, string>,
): InternalTimingProps {
  const beatEnd = beatStart + beatDuration;
  const beatWords = words.filter(
    (w) => (w.type === 'word' || !w.type) && w.start >= beatStart - 0.05 && w.start < beatEnd,
  );

  const findWordLocal = (phrase?: string): number | null => {
    if (!phrase) return null;
    const parts = phrase.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    for (let i = 0; i <= beatWords.length - parts.length; i++) {
      let match = true;
      for (let j = 0; j < parts.length; j++) {
        const wText = (beatWords[i + j]?.text ?? '').toLowerCase().replace(/[^\w]/g, '');
        if (wText !== parts[j].replace(/[^\w]/g, '')) {
          match = false;
          break;
        }
      }
      if (match) {
        const t = beatWords[i].start - beatStart;
        return Math.max(0.1, Math.min(t, beatDuration - 0.5));
      }
    }
    return null;
  };

  const setupLocal = findWordLocal(props.setupWord) ?? 0.2;
  const payoffLocal = findWordLocal(props.payoffWord) ?? Math.min(beatDuration * 0.35, 1.2);
  const strikeLocal =
    findWordLocal(props.strikeWord) ?? payoffLocal + 0.1;
  const fadeOutLocal = Math.max(beatDuration - 0.35, payoffLocal + 1.0);

  return {
    setupLocalSec: setupLocal.toFixed(3),
    payoffLocalSec: payoffLocal.toFixed(3),
    strikeLocalSec: strikeLocal.toFixed(3),
    fadeOutLocalSec: fadeOutLocal.toFixed(3),
  };
}
