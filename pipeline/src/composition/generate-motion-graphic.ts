import { readFile, writeFile } from 'fs/promises';
import { readdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { motionConfigFromBrand } from '../brand/resolve-brand.js';
import type { BrandTokens } from '../brand/presets.js';
import { resolveBeatInternalTimings } from '../utils/beat-internal-timing.js';
import type { LayoutConfig, MotionGraphicSpec, MotionGraphicTemplate, ProjectConfig, TranscriptWord } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '../../templates/mg');
const SHARED_DIR = resolve(TEMPLATES_DIR, '_shared');

export interface MotionConfig {
  accentColor: string;
  accentSecondary: string;
  fontFamily: string;
  fontMono: string;
  background: string;
  surface: string;
  text: string;
  textDim: string;
}

export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  accentColor: '#ffffff',
  accentSecondary: '#888888',
  fontFamily: 'Montserrat, sans-serif',
  fontMono: 'Roboto Mono, monospace',
  background: '#000000',
  surface: '#111111',
  text: '#ffffff',
  textDim: '#aaaaaa',
};

export function motionConfigFromBrandTokens(brand: BrandTokens, project: ProjectConfig | null): MotionConfig {
  const legacy = motionConfigFromBrand(project, brand);
  return {
    accentColor: legacy.accentColor,
    accentSecondary: brand.accentSecondary,
    fontFamily: legacy.fontFamily,
    fontMono: brand.fontMono,
    background: brand.background,
    surface: brand.surface,
    text: brand.text,
    textDim: brand.textDim,
  };
}

/** @deprecated Use motionConfigFromBrandTokens */
export function motionConfigFromProject(project: ProjectConfig | null): MotionConfig {
  return {
    accentColor: project?.motion?.accentColor ?? '#ff3333',
    accentSecondary: '#888888',
    fontFamily: project?.motion?.fontFamily ?? 'Montserrat, sans-serif',
    fontMono: 'Roboto Mono, monospace',
    background: '#000000',
    surface: '#111111',
    text: '#ffffff',
    textDim: '#aaaaaa',
  };
}

export interface GenerateMotionGraphicOptions {
  beatId: string;
  duration: number;
  width: number;
  height: number;
  panelHeight: number;
  spec: MotionGraphicSpec;
  outputPath: string;
  motion?: MotionConfig;
  transcriptWords?: TranscriptWord[];
  beatStart?: number;
  /** When true, MG stage/grid are transparent so YouTube backdrop shows through */
  transparentStage?: boolean;
}

const CHROME_TEXT_STROKE = `color: #ffffff;
  -webkit-text-stroke: 3px #000000;
  paint-order: stroke fill;
  text-shadow: 0 2px 10px rgba(0,0,0,0.45);
  background: none;
  -webkit-background-clip: unset;
  background-clip: unset;
  filter: none;`;

const PANEL_GLASS = {
  background:
    'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(0,0,0,0.15) 100%)',
  border: '1px solid rgba(255,255,255,0.12)',
  shadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 32px rgba(0,0,0,0.4)',
  backdrop: 'blur(12px) saturate(1.1)',
};

const PANEL_BACKDROP = {
  background: 'transparent',
  border: 'none',
  shadow: 'none',
  backdrop: 'none',
};

async function loadSharedStyles(
  motion: MotionConfig,
  compositionId: string,
  transparentStage = false,
): Promise<string> {
  let combined = '';
  try {
    const files = (await readdir(SHARED_DIR)).filter((f) => f.endsWith('.css')).sort();
    for (const file of files) {
      let css = await readFile(resolve(SHARED_DIR, file), 'utf-8');
      css = css
        .replaceAll('{{accentColor}}', motion.accentColor)
        .replaceAll('{{accentSecondary}}', motion.accentSecondary)
        .replaceAll('{{fontFamily}}', motion.fontFamily)
        .replaceAll('{{fontMono}}', motion.fontMono)
        .replaceAll('{{background}}', motion.background)
        .replaceAll('{{surface}}', motion.surface)
        .replaceAll('{{text}}', motion.text)
        .replaceAll('{{textDim}}', motion.textDim)
        .replaceAll('{{compositionId}}', compositionId)
        .replaceAll('{{stageBackground}}', transparentStage ? 'transparent' : '#000')
        .replaceAll('{{gridFloorBackground}}', transparentStage ? 'transparent' : '#050505')
        .replaceAll('{{gridFloorOpacity}}', transparentStage ? '0.45' : '0.7')
        .replaceAll('{{vignetteMidOpacity}}', transparentStage ? '0' : '0.85')
        .replaceAll('{{chromeTextFill}}', CHROME_TEXT_STROKE)
        .replaceAll('{{panelBackground}}', (transparentStage ? PANEL_BACKDROP : PANEL_GLASS).background)
        .replaceAll('{{panelBorder}}', (transparentStage ? PANEL_BACKDROP : PANEL_GLASS).border)
        .replaceAll('{{panelShadow}}', (transparentStage ? PANEL_BACKDROP : PANEL_GLASS).shadow)
        .replaceAll('{{panelBackdropFilter}}', (transparentStage ? PANEL_BACKDROP : PANEL_GLASS).backdrop);
      combined += css + '\n';
    }
  } catch {
    // _shared optional
  }
  return combined;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitItems(items?: string, max = 3): string[] {
  if (!items) return [];
  return items.split(',').map((s) => s.trim()).filter(Boolean).slice(0, max);
}

function preprocessTemplate(
  template: MotionGraphicTemplate,
  props: Record<string, string>,
): Record<string, string> {
  const extra: Record<string, string> = {};

  if (template === 'list-reveal' || template === 'badge-list') {
    const items = splitItems(props.items, 5);
    extra.listItemsHtml = items
      .map((item, i) => `<div class="list-item" id="list-item-${i}">${escapeHtml(item)}</div>`)
      .join('\n    ');
  }

  if (template === 'card-grid-3') {
    const items = splitItems(props.items, 3);
    extra.cardItemsHtml = items
      .map(
        (item, i) => `
        <div class="benefit-card" id="card-${i}">
          <div class="card-num">${i + 1}</div>
          <div class="card-text">${escapeHtml(item)}</div>
          <div class="card-check" id="check-${i}">✓</div>
          <div class="card-underline" id="underline-${i}"></div>
        </div>`,
      )
      .join('\n');
  }

  if (template === 'kinetic-type' || template === 'chromatic-slam' || template === 'contrast-flip') {
    const headline = props.headline ?? props.setupWord ?? props.wordA ?? '';
    const words = headline.split(/\s+/).filter(Boolean);
    extra.kineticWordsHtml = words
      .map((word, i) => `<span class="kinetic-word chrome-text" id="kw-${i}">${escapeHtml(word)}</span>`)
      .join('\n      ');
  }

  if (template === 'stamp-reject') {
    const chips = splitItems(props.chips, 9);
    extra.chipsHtml = chips
      .map((chip, i) => `<div class="stamp-chip" id="chip-${i}">${escapeHtml(chip)}</div>`)
      .join('\n        ');
  }

  if (template === 'badge-list') {
    const items = splitItems(props.items, 4);
    extra.badgesHtml = items
      .map(
        (item, i) =>
          `<div class="badge-pill" id="badge-${i}"><span class="badge-num">${i + 1}</span>${escapeHtml(item)}</div>`,
      )
      .join('\n        ');
  }

  return extra;
}

/** Fill an MG HTML template and write to compositions/mg-<beatId>.html */
export async function generateMotionGraphicComposition(
  options: GenerateMotionGraphicOptions,
): Promise<void> {
  const {
    beatId,
    duration,
    width,
    height,
    panelHeight,
    spec,
    outputPath,
    motion = DEFAULT_MOTION_CONFIG,
    transcriptWords = [],
    beatStart = 0,
    transparentStage = false,
  } = options;

  const compositionId = `mg-${beatId}`;
  const isTopHalf = spec.layout === 'top-half' || spec.layout === 'upper-card' || !spec.layout;
  const compHeight = isTopHalf && spec.layout !== 'fullscreen' ? panelHeight : height;

  const templatePath = resolve(TEMPLATES_DIR, `${spec.template}.html`);
  let html = await readFile(templatePath, 'utf-8');

  const sharedStyles = await loadSharedStyles(motion, compositionId, transparentStage);
  const preprocessed = preprocessTemplate(spec.template, spec.props);

  const internalTiming =
    transcriptWords.length > 0
      ? resolveBeatInternalTimings(beatStart, duration, transcriptWords, spec.props)
      : {
          setupLocalSec: '0.2',
          payoffLocalSec: '0.78',
          strikeLocalSec: '0.88',
          fadeOutLocalSec: String(Math.max(duration - 0.35, 1.0)),
        };

  const replacements: Record<string, string> = {
    compositionId,
    width: String(width),
    height: String(compHeight),
    panelHeight: String(panelHeight),
    duration: String(duration),
    accentColor: motion.accentColor,
    accentSecondary: motion.accentSecondary,
    fontFamily: motion.fontFamily,
    fontMono: motion.fontMono,
    background: motion.background,
    surface: motion.surface,
    text: motion.text,
    textDim: motion.textDim,
    sharedStyles,
    ...internalTiming,
    ...spec.props,
    ...preprocessed,
  };

  // Defaults for optional preprocess keys
  for (const key of [
    'listItemsHtml',
    'cardItemsHtml',
    'kineticWordsHtml',
    'chipsHtml',
    'badgesHtml',
  ]) {
    if (!replacements[key]) replacements[key] = '';
  }

  const rawHtmlKeys = new Set([
    'listItemsHtml',
    'cardItemsHtml',
    'kineticWordsHtml',
    'chipsHtml',
    'badgesHtml',
    'sharedStyles',
  ]);

  for (const [key, value] of Object.entries(replacements)) {
    const out = rawHtmlKeys.has(key) ? value : escapeHtml(value);
    html = html.replaceAll(`{{${key}}}`, out);
  }

  await writeFile(outputPath, html);
}
