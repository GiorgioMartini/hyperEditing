import { log } from './logger.js';
import type { TranscriptWord, VisualBeat } from '../types.js';

const BEAT_PRE_ROLL_SEC = 0.15;
const MIN_BEAT_DURATION = 2;
const MAX_BEAT_DURATION = 5;

/** Normalize text for phrase matching — lowercase, strip punctuation */
function normalizeToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, '')
    .trim();
}

/** Spoken words only, normalized for matching */
function spokenWords(words: TranscriptWord[]): TranscriptWord[] {
  return words.filter((w) => w.type === 'word' || !w.type);
}

/**
 * Find the start time of an anchor phrase in the transcript.
 * Uses a sliding window over consecutive words.
 */
export function findPhraseTimestamp(
  words: TranscriptWord[],
  phrase: string,
): number | null {
  const spoken = spokenWords(words);
  const phraseTokens = normalizeToken(phrase)
    .split(/\s+/)
    .filter(Boolean);

  if (phraseTokens.length === 0) return null;

  const normalized = spoken.map((w) => normalizeToken(w.text));

  for (let i = 0; i <= normalized.length - phraseTokens.length; i++) {
    let match = true;
    for (let j = 0; j < phraseTokens.length; j++) {
      if (normalized[i + j] !== phraseTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return spoken[i].start;
    }
  }

  return null;
}

/** End time of the last word in an anchor phrase */
export function findPhraseEndTimestamp(
  words: TranscriptWord[],
  phrase: string,
): number | null {
  const spoken = spokenWords(words);
  const phraseTokens = normalizeToken(phrase)
    .split(/\s+/)
    .filter(Boolean);

  if (phraseTokens.length === 0) return null;

  const normalized = spoken.map((w) => normalizeToken(w.text));

  for (let i = 0; i <= normalized.length - phraseTokens.length; i++) {
    let match = true;
    for (let j = 0; j < phraseTokens.length; j++) {
      if (normalized[i + j] !== phraseTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return spoken[i + phraseTokens.length - 1].end;
    }
  }

  return null;
}

export interface ResolveBeatTimingsOptions {
  videoDuration?: number;
  preRollSec?: number;
  minDuration?: number;
  maxDuration?: number;
}

/**
 * Resolve beat timestamps from anchor phrases in the transcript.
 * Falls back to LLM-provided timestamp with a warning when phrase not found.
 */
export function resolveBeatTimings(
  beats: VisualBeat[],
  words: TranscriptWord[],
  options: ResolveBeatTimingsOptions = {},
): VisualBeat[] {
  const preRoll = options.preRollSec ?? BEAT_PRE_ROLL_SEC;
  const minDur = options.minDuration ?? MIN_BEAT_DURATION;
  const maxDur = options.maxDuration ?? MAX_BEAT_DURATION;

  const sorted = [...beats].sort((a, b) => a.timestamp - b.timestamp);
  const resolved: VisualBeat[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const beat = { ...sorted[i] };
    let anchorStart: number | null = null;

    if (beat.anchorPhrase) {
      anchorStart = findPhraseTimestamp(words, beat.anchorPhrase);
      if (anchorStart === null) {
        log.warn(
          `Beat ${beat.id}: anchor phrase "${beat.anchorPhrase}" not found — using LLM timestamp ${beat.timestamp}s`,
        );
        anchorStart = beat.timestamp;
      } else {
        log.dim(`Beat ${beat.id}: anchored "${beat.anchorPhrase}" at ${anchorStart.toFixed(2)}s`);
      }
    } else {
      log.warn(`Beat ${beat.id}: no anchorPhrase — using LLM timestamp ${beat.timestamp}s`);
      anchorStart = beat.timestamp;
    }

    const resolvedStart = Math.max(0, anchorStart - preRoll);
    beat.resolvedTimestamp = resolvedStart;

    // Duration: from phrase end to next beat, clamped
    let duration = beat.duration;
    if (beat.anchorPhrase) {
      const phraseEnd = findPhraseEndTimestamp(words, beat.anchorPhrase);
      if (phraseEnd !== null) {
        const nextStart =
          i + 1 < sorted.length
            ? (sorted[i + 1].anchorPhrase
                ? findPhraseTimestamp(words, sorted[i + 1].anchorPhrase!)
                : sorted[i + 1].timestamp) ?? sorted[i + 1].timestamp
            : (options.videoDuration ?? phraseEnd + maxDur);

        const naturalDur = (nextStart ?? phraseEnd + maxDur) - resolvedStart;
        duration = Math.min(maxDur, Math.max(minDur, naturalDur));
      }
    }

    duration = Math.min(maxDur, Math.max(minDur, duration));
    beat.duration = duration;
    beat.timestamp = resolvedStart;

    resolved.push(beat);
  }

  // Enforce no overlaps — shift later beats forward if needed
  for (let i = 1; i < resolved.length; i++) {
    const prev = resolved[i - 1];
    const curr = resolved[i];
    const prevEnd = (prev.resolvedTimestamp ?? prev.timestamp) + prev.duration;

    if ((curr.resolvedTimestamp ?? curr.timestamp) < prevEnd + 0.1) {
      const shifted = prevEnd + 0.1;
      log.dim(`Beat ${curr.id}: shifted to ${shifted.toFixed(2)}s to avoid overlap`);
      curr.resolvedTimestamp = shifted;
      curr.timestamp = shifted;
    }
  }

  return resolved;
}

/** Effective start time for a beat (resolved or fallback) */
export function beatStartTime(beat: VisualBeat | { timestamp: number; resolvedTimestamp?: number }): number {
  return beat.resolvedTimestamp ?? beat.timestamp;
}

/** Format transcript words as compact timed JSON for LLM prompts */
export function formatTimedTranscript(words: TranscriptWord[]): string {
  const spoken = spokenWords(words);
  const compact = spoken.map((w) => ({ t: Math.round(w.start * 100) / 100, w: w.text }));
  return JSON.stringify(compact);
}
