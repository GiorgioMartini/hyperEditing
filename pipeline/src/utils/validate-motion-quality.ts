import { beatStartTime } from './transcript-anchor.js';
import { getSpeechWindow } from './transcript-anchor.js';
import { resolveMotionPlanning } from '../brand/resolve-motion.js';
import type { MotionQualityIssue, ProjectConfig, TranscriptWord, VisualBeat } from '../types.js';

const MAX_GAP_SEC = 3.5;

export interface ValidateMotionQualityOptions {
  words?: TranscriptWord[];
  speechEnd?: number;
}

/** Validate pacing density, hero coverage, and basic beat health within speech window. */
export function validateMotionQuality(
  beats: VisualBeat[],
  videoDuration: number,
  project: ProjectConfig | null,
  options: ValidateMotionQualityOptions = {},
): MotionQualityIssue[] {
  const issues: MotionQualityIssue[] = [];
  const planning = resolveMotionPlanning(project);
  const sorted = [...beats].sort((a, b) => beatStartTime(a) - beatStartTime(b));

  const speech = options.words ? getSpeechWindow(options.words) : null;
  const speechStart = speech?.speechStart ?? 0;
  const speechEnd = options.speechEnd ?? speech?.speechEndWithHold ?? videoDuration;
  const speechDuration = Math.max(speechEnd - speechStart, 1);

  if (sorted.length === 0) {
    issues.push({
      code: 'no-beats',
      severity: 'error',
      message: 'No visual beats planned',
    });
    return issues;
  }

  // Beats after speech — hard error
  for (const beat of sorted) {
    const start = beatStartTime(beat);
    if (start > speechEnd + 0.15) {
      issues.push({
        code: 'beats-after-speech',
        severity: 'error',
        message: `Beat ${beat.id} starts at ${start.toFixed(1)}s after speech ends (${speechEnd.toFixed(1)}s)`,
        beatId: beat.id,
      });
    }
  }

  // Beat density within speech window only
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = beatStartTime(sorted[i - 1]) + sorted[i - 1].duration;
    const currStart = beatStartTime(sorted[i]);
    const gap = currStart - prevEnd;
    if (gap > MAX_GAP_SEC && currStart <= speechEnd) {
      issues.push({
        code: 'sparse-gap',
        severity: 'warning',
        message: `Gap of ${gap.toFixed(1)}s between ${sorted[i - 1].id} and ${sorted[i].id}`,
        beatId: sorted[i].id,
      });
    }
  }

  const firstStart = beatStartTime(sorted[0]);
  if (firstStart > speechStart + MAX_GAP_SEC) {
    issues.push({
      code: 'late-first-beat',
      severity: 'warning',
      message: `First beat starts at ${firstStart.toFixed(1)}s — long intro with no visuals`,
      beatId: sorted[0].id,
    });
  }

  // Hero coverage within speech window only
  const heroInterval = planning.jawDropperEverySec;
  const heroBeats = sorted.filter(
    (b) => b.type === 'motion-graphic' && b.motionGraphic?.emphasis === 'hero',
  );

  for (let t = speechStart; t < speechEnd; t += heroInterval) {
    const windowEnd = Math.min(t + heroInterval, speechEnd);
    const hasHero = heroBeats.some((b) => {
      const start = beatStartTime(b);
      return start >= t - 0.5 && start < windowEnd;
    });
    if (!hasHero && windowEnd - t >= heroInterval * 0.8) {
      issues.push({
        code: 'missing-hero',
        severity: 'warning',
        message: `No hero beat between ${t.toFixed(0)}s–${windowEnd.toFixed(0)}s (speech window)`,
      });
    }
  }

  // Consecutive same-type check
  let consecutiveSame = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].type === sorted[i - 1].type) {
      consecutiveSame++;
      if (consecutiveSame > 2) {
        issues.push({
          code: 'same-type-streak',
          severity: 'warning',
          message: `More than 2 consecutive ${sorted[i].type} beats at ${sorted[i].id}`,
          beatId: sorted[i].id,
        });
      }
    } else {
      consecutiveSame = 1;
    }
  }

  return issues;
}

/** True when auto-replan should be suggested (density or hero gaps). */
export function shouldAutoReplan(issues: MotionQualityIssue[]): boolean {
  return issues.some(
    (i) =>
      i.severity === 'warning' &&
      (i.code === 'sparse-gap' || i.code === 'missing-hero' || i.code === 'late-first-beat'),
  );
}

/** Build gap list for replan prompt. */
export function formatReplanGaps(
  issues: MotionQualityIssue[],
  speechEnd?: number,
): string {
  const lines = issues
    .filter((i) => i.code === 'sparse-gap' || i.code === 'missing-hero')
    .map((i) => `- ${i.message}`);

  if (speechEnd !== undefined) {
    lines.unshift(`- Do NOT plan any beats after ${speechEnd.toFixed(1)}s (last spoken word)`);
  }

  return lines.join('\n');
}
