import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { MotionGraphicSpec, ProjectConfig } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '../../templates/mg');
const SHARED_DIR = resolve(TEMPLATES_DIR, '_shared');

export interface MotionConfig {
  accentColor: string;
  fontFamily: string;
}

export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  accentColor: '#ff3333',
  fontFamily: 'Montserrat, sans-serif',
};

export function motionConfigFromProject(project: ProjectConfig | null): MotionConfig {
  return {
    accentColor: project?.motion?.accentColor ?? DEFAULT_MOTION_CONFIG.accentColor,
    fontFamily: project?.motion?.fontFamily ?? DEFAULT_MOTION_CONFIG.fontFamily,
  };
}

export interface GenerateMotionGraphicOptions {
  beatId: string;
  duration: number;
  width: number;
  height: number;
  spec: MotionGraphicSpec;
  outputPath: string;
  motion?: MotionConfig;
}

/** Load all _shared/*.css partials and concatenate */
async function loadSharedStyles(motion: MotionConfig, compositionId: string): Promise<string> {
  let combined = '';
  try {
    const files = (await readdir(SHARED_DIR)).filter((f) => f.endsWith('.css')).sort();
    for (const file of files) {
      let css = await readFile(resolve(SHARED_DIR, file), 'utf-8');
      css = css.replaceAll('{{accentColor}}', motion.accentColor);
      css = css.replaceAll('{{fontFamily}}', motion.fontFamily);
      css = css.replaceAll('{{compositionId}}', compositionId);
      combined += css + '\n';
    }
  } catch {
    // _shared optional during migration
  }
  return combined;
}

/** Fill an MG HTML template and write to compositions/mg-<beatId>.html */
export async function generateMotionGraphicComposition(
  options: GenerateMotionGraphicOptions,
): Promise<void> {
  const { beatId, duration, width, height, spec, outputPath, motion = DEFAULT_MOTION_CONFIG } =
    options;
  const compositionId = `mg-${beatId}`;

  const templatePath = resolve(TEMPLATES_DIR, `${spec.template}.html`);
  let html = await readFile(templatePath, 'utf-8');

  const sharedStyles = await loadSharedStyles(motion, compositionId);

  const replacements: Record<string, string> = {
    compositionId,
    width: String(width),
    height: String(height),
    duration: String(duration),
    accentColor: motion.accentColor,
    fontFamily: motion.fontFamily,
    sharedStyles,
    ...spec.props,
  };

  if (spec.template === 'list-reveal' && spec.props.items) {
    const items = spec.props.items.split(',').map((s) => s.trim()).filter(Boolean);
    replacements.listItemsHtml = items
      .map(
        (item, i) =>
          `<div class="list-item" id="list-item-${i}">${escapeHtml(item)}</div>`,
      )
      .join('\n    ');
  } else {
    replacements.listItemsHtml = '';
  }

  if (spec.template === 'kinetic-type' && spec.props.headline) {
    const words = spec.props.headline.split(/\s+/).filter(Boolean);
    replacements.kineticWordsHtml = words
      .map(
        (word, i) =>
          `<span class="kinetic-word chrome-text" id="kw-${i}">${escapeHtml(word)}</span>`,
      )
      .join('\n      ');
  } else {
    replacements.kineticWordsHtml = '';
  }

  const rawHtmlKeys = new Set(['listItemsHtml', 'kineticWordsHtml', 'sharedStyles']);

  for (const [key, value] of Object.entries(replacements)) {
    const out = rawHtmlKeys.has(key) ? value : escapeHtml(value);
    html = html.replaceAll(`{{${key}}}`, out);
  }

  await writeFile(outputPath, html);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
