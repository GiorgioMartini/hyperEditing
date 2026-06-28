import type { MotionPlanningConfig, ProjectConfig } from '../types.js';

export const DEFAULT_MOTION_PLANNING: MotionPlanningConfig = {
  beatIntervalSec: 2.5,
  minBeatDuration: 1.5,
  maxBeatDuration: 4.0,
  jawDropperEverySec: 5,
  useRegistryTransitions: true,
};

export function resolveMotionPlanning(project: ProjectConfig | null): MotionPlanningConfig {
  const motion = project?.motion ?? {};
  return {
    beatIntervalSec: motion.beatIntervalSec ?? DEFAULT_MOTION_PLANNING.beatIntervalSec,
    minBeatDuration: motion.minBeatDuration ?? DEFAULT_MOTION_PLANNING.minBeatDuration,
    maxBeatDuration: motion.maxBeatDuration ?? DEFAULT_MOTION_PLANNING.maxBeatDuration,
    jawDropperEverySec: motion.jawDropperEverySec ?? DEFAULT_MOTION_PLANNING.jawDropperEverySec,
    useRegistryTransitions:
      motion.useRegistryTransitions ?? DEFAULT_MOTION_PLANNING.useRegistryTransitions,
  };
}

/** Compute target beat count for dense planning. */
export function computeBeatBudget(
  videoDuration: number,
  planning: MotionPlanningConfig,
): { min: number; max: number; target: number } {
  const target = Math.ceil(videoDuration / planning.beatIntervalSec);
  return {
    target,
    min: Math.max(4, Math.min(target, 20)),
    max: Math.min(20, Math.max(target, 4)),
  };
}
