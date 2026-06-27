import { beatStartTime, findPhraseTimestamp } from './transcript-anchor.js';
import { log } from './logger.js';
import type { TranscriptWord, VisualBeat } from '../types.js';

export interface BeatValidationIssue {
  beatId: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidateBeatsOptions {
  videoDuration?: number;
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

  for (const beat of sorted) {
    if (beat.anchorPhrase) {
      const found = findPhraseTimestamp(words, beat.anchorPhrase);
      if (found === null) {
        issues.push({
          beatId: beat.id,
          severity: 'warning',
          message: `Anchor phrase not found in transcript: "${beat.anchorPhrase}"`,
        });
      }
    } else {
      issues.push({
        beatId: beat.id,
        severity: 'warning',
        message: 'Missing anchorPhrase — timing may be inaccurate',
      });
    }

    const start = beatStartTime(beat);
    if (options.videoDuration !== undefined && start + beat.duration > options.videoDuration + 0.5) {
      issues.push({
        beatId: beat.id,
        severity: 'error',
        message: `Beat extends past video duration (${(start + beat.duration).toFixed(2)}s > ${options.videoDuration.toFixed(2)}s)`,
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
