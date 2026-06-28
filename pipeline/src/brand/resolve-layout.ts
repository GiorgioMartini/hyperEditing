import type { LayoutConfig, ProjectConfig } from '../types.js';

export const DEFAULT_LAYOUT: LayoutConfig = {
  mode: 'short-form-split',
  panelHeight: 960,
  faceSourceWidth: 1920,
  faceSourceHeight: 1080,
};

/** Resolve layout settings from project.json with defaults. */
export function resolveLayoutConfig(project: ProjectConfig | null): LayoutConfig {
  const layout = project?.layout ?? {};
  return {
    mode: layout.mode ?? DEFAULT_LAYOUT.mode,
    panelHeight: layout.panelHeight ?? DEFAULT_LAYOUT.panelHeight,
    faceSourceWidth: layout.faceSourceWidth ?? DEFAULT_LAYOUT.faceSourceWidth,
    faceSourceHeight: layout.faceSourceHeight ?? DEFAULT_LAYOUT.faceSourceHeight,
  };
}
