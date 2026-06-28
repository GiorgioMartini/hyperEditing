import { readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { BrandTokens } from '../brand/presets.js';
import type { LayoutConfig, SeamWindow } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLD_DIR = resolve(__dirname, '../../templates/scaffold');

export interface ScaffoldOptions {
  width: number;
  height: number;
  duration: number;
  layout: LayoutConfig;
  brand: BrandTokens;
  seamWindows: SeamWindow[];
  ambientBgPath: string;
  seamTreatmentPath: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function liftHex(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, parseInt(h.slice(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(h.slice(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(h.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

async function fillTemplate(
  name: string,
  replacements: Record<string, string>,
): Promise<string> {
  let html = await readFile(resolve(SCAFFOLD_DIR, `${name}.html`), 'utf-8');
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

/** Generate ambient-bg and seam-treatment sub-compositions. */
export async function generateScaffoldCompositions(options: ScaffoldOptions): Promise<void> {
  const { width, height, duration, layout, brand, seamWindows } = options;
  const seamY = layout.panelHeight;

  const visibleWindowsJson = JSON.stringify(
    seamWindows.map((w) => [w.start, w.end]),
  );

  const ambientHtml = await fillTemplate('ambient-bg', {
    width: String(width),
    height: String(height),
    duration: String(duration),
    background: brand.background,
    ambientLift: liftHex(brand.background, 20),
    ambientMid: liftHex(brand.background, 10),
    ambientEdge: liftHex(brand.background, -5),
    gridColor: hexToRgba(brand.accent, 0.045),
    accent: brand.accent,
    accentGlow: hexToRgba(brand.accent, 0.6),
    vignetteMid: hexToRgba(brand.background, 0.45),
    vignetteEdge: hexToRgba(brand.background, 0.8),
  });

  const seamHtml = await fillTemplate('seam-treatment', {
    width: String(width),
    height: String(height),
    duration: String(duration),
    seamY: String(seamY),
    seamLineY: String(seamY - 2),
    seamGradientTop: hexToRgba(brand.background, 0.85),
    seamGradientMid: hexToRgba(brand.background, 0.4),
    seamLineDim: hexToRgba(brand.accent, 0.35),
    seamLineBright: hexToRgba(brand.accent, 0.9),
    seamLineGlow: hexToRgba(brand.accent, 0.55),
    visibleWindowsJson,
  });

  await writeFile(options.ambientBgPath, ambientHtml);
  await writeFile(options.seamTreatmentPath, seamHtml);
}
