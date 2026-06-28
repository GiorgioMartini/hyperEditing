import { log } from './logger.js';
import type { TranscriptWord, VisualBeat } from '../types.js';

const DEFAULT_PRE_ROLL_SEC = 0.15;
const DEFAULT_MIN_BEAT_DURATION = 1.5;
const DEFAULT_MAX_BEAT_DURATION = 4.0;
const DEFAULT_POST_HOLD_SEC = 0.3;
const BEAT_GAP_SEC = 0.1;
const SPEECH_POST_ROLL_SEC = 0.25;

/** Spoken-word time bounds derived from transcript */
export interface SpeechWindow {
  speechStart: number;
  speechEnd: number;
  /** speechEnd including small post-roll for final hold */
  speechEndWithHold: number;
  spokenWordCount: number;
}

/** Digit → word for fuzzy anchor matching */
const DIGIT_WORDS: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
};

/** Normalize text for phrase matching — lowercase, strip punctuation */
function normalizeToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, '')
    .trim();
}

/** Expand numeric tokens to word form for matching ("5" → "five") */
function expandNumericToken(token: string): string[] {
  const norm = normalizeToken(token);
  if (!norm) return [];
  const variants = [norm];
  if (/^\d+$/.test(norm) && DIGIT_WORDS[norm]) {
    variants.push(DIGIT_WORDS[norm]);
  }
  for (const [digit, word] of Object.entries(DIGIT_WORDS)) {
    if (norm === word) variants.push(digit);
  }
  return [...new Set(variants)];
}

/** Spoken words only */
function spokenWords(words: TranscriptWord[]): TranscriptWord[] {
  return words.filter((w) => w.type === 'word' || !w.type);
}

/** Bounds of all spoken words in the transcript */
export function getSpeechWindow(words: TranscriptWord[]): SpeechWindow {
  const spoken = spokenWords(words);
  if (spoken.length === 0) {
    return {
      speechStart: 0,
      speechEnd: 0,
      speechEndWithHold: 0,
      spokenWordCount: 0,
    };
  }

  const speechStart = spoken[0].start;
  const speechEnd = spoken[spoken.length - 1].end;

  return {
    speechStart,
    speechEnd,
    speechEndWithHold: speechEnd + SPEECH_POST_ROLL_SEC,
    spokenWordCount: spoken.length,
  };
}

export interface PhraseMatch {
  start: number;
  end: number;
  /** How the phrase was matched */
  method: 'exact' | 'numeric' | 'prefix';
}

function tokensMatch(spokenToken: string, phraseToken: string): boolean {
  const spokenNorm = normalizeToken(spokenToken);
  const phraseVariants = expandNumericToken(phraseToken);
  if (phraseVariants.includes(spokenNorm)) return true;
  return spokenNorm === normalizeToken(phraseToken);
}

function matchPhraseAt(
  spoken: TranscriptWord[],
  normalized: string[],
  phraseTokens: string[],
  startIndex: number,
): boolean {
  if (startIndex + phraseTokens.length > spoken.length) return false;

  for (let j = 0; j < phraseTokens.length; j++) {
    if (!tokensMatch(spoken[startIndex + j].text, phraseTokens[j])) {
      return false;
    }
  }
  return true;
}

/**
 * Find anchor phrase in transcript with exact → numeric → prefix fallback.
 */
export function findPhraseMatch(words: TranscriptWord[], phrase: string): PhraseMatch | null {
  const spoken = spokenWords(words);
  const phraseTokens = normalizeToken(phrase)
    .split(/\s+/)
    .filter(Boolean);

  if (phraseTokens.length === 0 || spoken.length === 0) return null;

  const normalized = spoken.map((w) => normalizeToken(w.text));

  // 1. Exact match (with numeric normalization per token)
  for (let i = 0; i <= spoken.length - phraseTokens.length; i++) {
    if (matchPhraseAt(spoken, normalized, phraseTokens, i)) {
      return {
        start: spoken[i].start,
        end: spoken[i + phraseTokens.length - 1].end,
        method: normalized.slice(i, i + phraseTokens.length).some((t, j) => t !== phraseTokens[j])
          ? 'numeric'
          : 'exact',
      };
    }
  }

  // 2. Prefix match — first 3 tokens (min 2)
  const prefixLen = Math.min(3, phraseTokens.length, spoken.length);
  if (prefixLen >= 2) {
    const prefix = phraseTokens.slice(0, prefixLen);
    for (let i = 0; i <= spoken.length - prefixLen; i++) {
      if (matchPhraseAt(spoken, normalized, prefix, i)) {
        log.dim(`Anchor prefix match (${prefixLen} words) for "${phrase}"`);
        const endIdx = Math.min(i + phraseTokens.length - 1, spoken.length - 1);
        return {
          start: spoken[i].start,
          end: spoken[endIdx].end,
          method: 'prefix',
        };
      }
    }
  }

  return null;
}

/** Find the start time of an anchor phrase in the transcript */
export function findPhraseTimestamp(words: TranscriptWord[], phrase: string): number | null {
  return findPhraseMatch(words, phrase)?.start ?? null;
}

/** End time of the last word in an anchor phrase */
export function findPhraseEndTimestamp(words: TranscriptWord[], phrase: string): number | null {
  return findPhraseMatch(words, phrase)?.end ?? null;
}

export interface ResolveBeatTimingsOptions {
  videoDuration?: number;
  speechEnd?: number;
  preRollSec?: number;
  postHoldSec?: number;
  minDuration?: number;
  maxDuration?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve beat timestamps from anchor phrases — phrase-locked duration,
 * speech-bounded, trim-on-overlap (no forward shift into silence).
 */
export function resolveBeatTimings(
  beats: VisualBeat[],
  words: TranscriptWord[],
  options: ResolveBeatTimingsOptions = {},
): VisualBeat[] {
  const preRoll = options.preRollSec ?? DEFAULT_PRE_ROLL_SEC;
  const postHold = options.postHoldSec ?? DEFAULT_POST_HOLD_SEC;
  const minDur = options.minDuration ?? DEFAULT_MIN_BEAT_DURATION;
  const maxDur = options.maxDuration ?? DEFAULT_MAX_BEAT_DURATION;
  const speech = getSpeechWindow(words);
  const speechEnd = options.speechEnd ?? speech.speechEndWithHold;

  const sorted = [...beats].sort((a, b) => a.timestamp - b.timestamp);
  const resolved: VisualBeat[] = [];

  // First pass: resolve starts and phrase-locked durations
  for (let i = 0; i < sorted.length; i++) {
    const beat = { ...sorted[i] };
    let anchorStart: number | null = null;
    let phraseEnd: number | null = null;

    if (beat.anchorPhrase) {
      const match = findPhraseMatch(words, beat.anchorPhrase);
      if (match) {
        anchorStart = match.start;
        phraseEnd = match.end;
        log.dim(
          `Beat ${beat.id}: anchored "${beat.anchorPhrase}" at ${anchorStart.toFixed(2)}s (${match.method})`,
        );
      } else {
        log.warn(`Beat ${beat.id}: dropping — anchor phrase not found: "${beat.anchorPhrase}"`);
        continue;
      }
    } else {
      log.warn(`Beat ${beat.id}: dropping — no anchorPhrase`);
      continue;
    }

    const resolvedStart = Math.max(0, anchorStart - preRoll);

    // Drop beats that start at or after speech ends
    if (resolvedStart >= speechEnd - 0.2) {
      log.warn(
        `Beat ${beat.id}: dropping — starts at ${resolvedStart.toFixed(2)}s after speech ends (${speechEnd.toFixed(2)}s)`,
      );
      continue;
    }

    // Next beat's anchor start (for duration cap)
    let nextAnchorStart: number | null = null;
    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      if (!next.anchorPhrase) continue;
      const nextMatch = findPhraseMatch(words, next.anchorPhrase);
      if (nextMatch) {
        nextAnchorStart = Math.max(0, nextMatch.start - preRoll);
        break;
      }
    }

    const naturalEnd = (phraseEnd ?? anchorStart) + postHold;
    let duration = clamp(naturalEnd - resolvedStart, minDur, maxDur);

    if (nextAnchorStart !== null) {
      duration = Math.min(duration, nextAnchorStart - resolvedStart - BEAT_GAP_SEC);
    }

    duration = Math.min(duration, speechEnd + postHold - resolvedStart);
    duration = clamp(duration, minDur, maxDur);

    if (resolvedStart + minDur > speechEnd + postHold) {
      log.warn(`Beat ${beat.id}: dropping — cannot fit min duration before speech ends`);
      continue;
    }

    beat.resolvedTimestamp = resolvedStart;
    beat.timestamp = resolvedStart;
    beat.duration = duration;
    resolved.push(beat);
  }

  // Second pass: trim previous beat on overlap instead of shifting forward
  for (let i = 1; i < resolved.length; i++) {
    const prev = resolved[i - 1];
    const curr = resolved[i];
    const prevStart = beatStartTime(prev);
    const currStart = beatStartTime(curr);
    const prevEnd = prevStart + prev.duration;

    if (currStart < prevEnd + BEAT_GAP_SEC) {
      const trimmedDur = currStart - prevStart - BEAT_GAP_SEC;
      if (trimmedDur >= minDur) {
        log.dim(`Beat ${prev.id}: trimmed to ${trimmedDur.toFixed(2)}s to avoid overlap`);
        prev.duration = trimmedDur;
      } else {
        // Can't trim enough — drop the later beat to avoid pushing into silence
        log.warn(`Beat ${curr.id}: dropping — overlap with ${prev.id} cannot be resolved`);
        resolved.splice(i, 1);
        i--;
      }
    }
  }

  return resolved;
}

/** Remove beats that start after speech ends (safety net after resolve) */
export function filterBeatsToSpeechWindow(
  beats: VisualBeat[],
  speechEnd: number,
): VisualBeat[] {
  return beats.filter((beat) => {
    const start = beatStartTime(beat);
    if (start >= speechEnd - 0.2) {
      log.warn(`Beat ${beat.id}: filtered — start ${start.toFixed(2)}s >= speech end ${speechEnd.toFixed(2)}s`);
      return false;
    }
    return true;
  });
}

/** Effective start time for a beat (resolved or fallback) */
export function beatStartTime(
  beat: VisualBeat | { timestamp: number; resolvedTimestamp?: number },
): number {
  return beat.resolvedTimestamp ?? beat.timestamp;
}

/** Format transcript words as compact timed JSON for LLM prompts */
export function formatTimedTranscript(words: TranscriptWord[]): string {
  const spoken = spokenWords(words);
  const compact = spoken.map((w) => ({ t: Math.round(w.start * 100) / 100, w: w.text }));
  return JSON.stringify(compact);
}
