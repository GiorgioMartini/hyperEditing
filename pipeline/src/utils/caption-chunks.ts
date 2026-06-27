/** Word entry from ElevenLabs / video-use transcript JSON */
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
  type?: string;
}

export interface CaptionChunkOptions {
  /** Hard cap on words per on-screen line (default 4) */
  maxWords?: number;
  /** Start a new chunk when the gap between words exceeds this (seconds) */
  pauseThresholdSec?: number;
}

/**
 * Group transcript words into caption lines of up to maxWords.
 * Breaks early on natural pauses or sentence-ending punctuation.
 */
export function chunkCaptionWords(
  words: CaptionWord[],
  options: CaptionChunkOptions = {},
): CaptionWord[][] {
  const maxWords = options.maxWords ?? 4;
  const pauseThresholdSec = options.pauseThresholdSec ?? 0.35;

  const spoken = words.filter((w) => w.type === 'word' || !w.type);
  const chunks: CaptionWord[][] = [];
  let current: CaptionWord[] = [];

  for (const raw of spoken) {
    const text = raw.text.trim();
    if (!text) continue;

    const word: CaptionWord = { ...raw, text };

    if (current.length > 0) {
      const prev = current[current.length - 1];
      const gap = word.start - prev.end;
      const prevEndsSentence = /[.!?]$/.test(prev.text);

      if (
        current.length >= maxWords ||
        gap > pauseThresholdSec ||
        prevEndsSentence
      ) {
        chunks.push(current);
        current = [];
      }
    }

    current.push(word);
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}
