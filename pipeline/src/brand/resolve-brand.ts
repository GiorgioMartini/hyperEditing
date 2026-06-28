import type { ProjectConfig } from '../types.js';
import { BRAND_PRESETS, type BrandPresetName, type BrandTokens } from './presets.js';

/** Merge project.json brand block with preset defaults. */
export function resolveBrandTokens(project: ProjectConfig | null): BrandTokens {
  const presetName = (project?.brand?.preset ?? 'dark-chrome') as BrandPresetName;
  const base = BRAND_PRESETS[presetName] ?? BRAND_PRESETS['dark-chrome'];
  const overrides = project?.brand ?? {};

  return {
    preset: presetName,
    background: overrides.background ?? base.background,
    accent: overrides.accent ?? base.accent,
    accentSecondary: overrides.accentSecondary ?? base.accentSecondary,
    text: overrides.text ?? base.text,
    textDim: overrides.textDim ?? base.textDim,
    surface: overrides.surface ?? base.surface,
    fontDisplay: overrides.fontDisplay ?? base.fontDisplay,
    fontMono: overrides.fontMono ?? base.fontMono,
  };
}

/** Legacy motion.accentColor / fontFamily overrides for MG templates. */
export function motionConfigFromBrand(
  project: ProjectConfig | null,
  brand: BrandTokens,
): { accentColor: string; fontFamily: string } {
  return {
    accentColor: project?.motion?.accentColor ?? brand.accent,
    fontFamily: project?.motion?.fontFamily ?? brand.fontDisplay,
  };
}
