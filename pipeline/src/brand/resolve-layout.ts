import type { LayoutConfig, ProjectConfig } from '../types.js';

export const DEFAULT_LAYOUT: LayoutConfig = {
  mode: 'short-form-split',
  panelHeight: 960,
  faceSourceWidth: 1920,
  faceSourceHeight: 1080,
  faceFitMode: 'cover',
  faceVideoObjectPosition: '50% 42%',
  faceKenBurnsScale: 1.012,
};

/** Resolve layout settings from project.json with defaults. */
export function resolveLayoutConfig(project: ProjectConfig | null): LayoutConfig {
  const layout = project?.layout ?? {};
  return {
    mode: layout.mode ?? DEFAULT_LAYOUT.mode,
    panelHeight: layout.panelHeight ?? DEFAULT_LAYOUT.panelHeight,
    faceSourceWidth: layout.faceSourceWidth ?? DEFAULT_LAYOUT.faceSourceWidth,
    faceSourceHeight: layout.faceSourceHeight ?? DEFAULT_LAYOUT.faceSourceHeight,
    faceFitMode: layout.faceFitMode ?? DEFAULT_LAYOUT.faceFitMode,
    faceBottom: layout.faceBottom,
    faceFullscreen: layout.faceFullscreen,
    faceVideoObjectPosition: layout.faceVideoObjectPosition ?? DEFAULT_LAYOUT.faceVideoObjectPosition,
    faceKenBurnsScale: layout.faceKenBurnsScale ?? DEFAULT_LAYOUT.faceKenBurnsScale,
  };
}

/** Target MP4 size for YouTube backdrop — top panel in split layout, full canvas otherwise. */
export function resolveBackdropTargetSize(
  layout: LayoutConfig,
  canvasWidth: number,
  canvasHeight: number,
  upperPanelOnly = true,
): { width: number; height: number } {
  if (layout.mode === 'short-form-split' && upperPanelOnly) {
    return { width: canvasWidth, height: layout.panelHeight };
  }
  return { width: canvasWidth, height: canvasHeight };
}
