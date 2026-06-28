import { beatStartTime, findPhraseMatch, getSpeechWindow } from './transcript-anchor.js';
import { log } from './logger.js';
import type { TranscriptWord, VisualBeat } from '../types.js';

export interface BeatValidationIssue {
  beatId: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidateBeatsOptions {
  videoDuration?: number;
  speechEnd?: number;
  preRollSec?: number;
  postHoldSec?: number;
  /** Fail on warnings when true (stage 6 compose) */
  strict?: boolean;
}

/**
 * Validate visual beats after anchor resolution.
 * Returns issues; logs warnings/errors via logger.
 */
export function validateBeats(
  beats: VisualBeat[],
  words: TranscriptWord[],
  options: ValidateBeatsOptions = {},
): BeatValidationIssue[] {
  const issues: BeatValidationIssue[] = [];
  const sorted = [...beats].sort((a, b) => beatStartTime(a) - beatStartTime(b));
  const speech = getSpeechWindow(words);
  const speechEnd = options.speechEnd ?? speech.speechEndWithHold;
  const preRoll = options.preRollSec ?? 0.15;
  const postHold = options.postHoldSec ?? 0.3;

  for (const beat of sorted) {
    if (beat.anchorPhrase) {
      const match = findPhraseMatch(words, beat.anchorPhrase);
      if (match === null) {
        issues.push({
          beatId: beat.id,
          severity: 'error',
          message: `Anchor phrase not found in transcript: "${beat.anchorPhrase}"`,
        });
      } else {
        const start = beatStartTime(beat);
        const expectedStart = Math.max(0, match.start - preRoll);
        const drift = Math.abs(start - expectedStart);
        if (drift > 0.35) {
          issues.push({
            beatId: beat.id,
            severity: 'error',
            message: `Anchor sync drift ${drift.toFixed(2)}s (resolved ${start.toFixed(2)}s vs phrase ${match.start.toFixed(2)}s)`,
          });
        }
      }
    } else {
      issues.push({
        beatId: beat.id,
        severity: 'error',
        message: 'Missing anchorPhrase — beat should have been dropped',
      });
    }

    const start = beatStartTime(beat);
    const beatEnd = start + beat.duration;

    if (start > speechEnd + 0.15) {
      issues.push({
        beatId: beat.id,
        severity: 'error',
        message: `Beat starts after speech ends (${start.toFixed(2)}s > ${speechEnd.toFixed(2)}s)`,
      });
    }

    if (beatEnd > speechEnd + postHold + 0.5) {
      issues.push({
        beatId: beat.id,
        severity: 'error',
        message: `Beat extends past speech end (${beatEnd.toFixed(2)}s > ${(speechEnd + postHold).toFixed(2)}s)`,
      });
    }

    if (options.videoDuration !== undefined && beatEnd > options.videoDuration + 0.5) {
      issues.push({
        beatId: beat.id,
        severity: 'error',
        message: `Beat extends past video duration (${beatEnd.toFixed(2)}s > ${options.videoDuration.toFixed(2)}s)`,
      });
    }

    if (start < 0) {
      issues.push({
        beatId: beat.id,
        severity: 'error',
        message: `Negative start time: ${start}`,
      });
    }
  }

  // Overlap check
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = beatStartTime(prev) + prev.duration;
    const currStart = beatStartTime(curr);

    if (currStart < prevEnd - 0.05) {
      issues.push({
        beatId: curr.id,
        severity: 'error',
        message: `Overlaps with ${prev.id} (starts ${currStart.toFixed(2)}s, prev ends ${prevEnd.toFixed(2)}s)`,
      });
    }
  }

  for (const issue of issues) {
    if (issue.severity === 'error') {
      log.error(`Beat ${issue.beatId}: ${issue.message}`);
    } else {
      log.warn(`Beat ${issue.beatId}: ${issue.message}`);
    }
  }

  return issues;
}

/** True when no errors (warnings allowed unless strict) */
export function beatsAreValid(
  issues: BeatValidationIssue[],
  strict = false,
): boolean {
  return !issues.some((i) =>
    i.severity === 'error' || (strict && i.severity === 'warning'),
  );
}
