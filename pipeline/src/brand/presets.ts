/** Resolved brand tokens used by all composition generators. */
export interface BrandTokens {
  preset: string;
  background: string;
  accent: string;
  accentSecondary: string;
  text: string;
  textDim: string;
  surface: string;
  fontDisplay: string;
  fontMono: string;
}

export type BrandPresetName = 'dark-chrome' | 'social-navy' | 'custom';

const DARK_CHROME: BrandTokens = {
  preset: 'dark-chrome',
  background: '#000000',
  accent: '#ffffff',
  accentSecondary: '#888888',
  text: '#ffffff',
  textDim: '#aaaaaa',
  surface: '#111111',
  fontDisplay: 'Montserrat, sans-serif',
  fontMono: 'Roboto Mono, monospace',
};

const SOCIAL_NAVY: BrandTokens = {
  preset: 'social-navy',
  background: '#07121c',
  accent: '#37bdf8',
  accentSecondary: '#f09025',
  text: '#ffffff',
  textDim: '#96a2b6',
  surface: '#0d2031',
  fontDisplay: 'Montserrat, sans-serif',
  fontMono: 'Roboto Mono, monospace',
};

export const BRAND_PRESETS: Record<BrandPresetName, BrandTokens> = {
  'dark-chrome': DARK_CHROME,
  'social-navy': SOCIAL_NAVY,
  custom: DARK_CHROME,
};
