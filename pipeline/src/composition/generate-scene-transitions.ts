import { readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { beatStartTime } from '../utils/transcript-anchor.js';
import type { FulfilledBeat } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLD_DIR = resolve(__dirname, '../../templates/scaffold');

const TRANSITION_DUR = 0.35;

export interface SceneTransitionSpec {
  id: string;
  start: number;
  duration: number;
  relPath: string;
}

/** Generate push transition sub-compositions between consecutive scene beats. */
export async function generateSceneTransitions(
  beats: FulfilledBeat[],
  compositionsDir: string,
  width: number,
  height: number,
): Promise<SceneTransitionSpec[]> {
  const sorted = [...beats].sort((a, b) => beatStartTime(a) - beatStartTime(b));
  const specs: SceneTransitionSpec[] = [];

  let template = await readFile(resolve(SCAFFOLD_DIR, 'scene-transition.html'), 'utf-8');

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = beatStartTime(prev) + prev.duration;
    const currStart = beatStartTime(curr);
    const gap = currStart - prevEnd;

    // Transition sits in the overlap window before next beat lands
    const start = Math.max(currStart - TRANSITION_DUR, prevEnd - TRANSITION_DUR);
    if (start < 0) continue;

    const id = `trans-${prev.id}-to-${curr.id}`;
    const compId = id;
    const html = template
      .replaceAll('{{compositionId}}', compId)
      .replaceAll('{{width}}', String(width))
      .replaceAll('{{height}}', String(height))
      .replaceAll('{{duration}}', String(TRANSITION_DUR));

    const filename = `${id}.html`;
    await writeFile(resolve(compositionsDir, filename), html);

    specs.push({
      id,
      start,
      duration: TRANSITION_DUR,
      relPath: `compositions/${filename}`,
    });
  }

  return specs;
}

export { TRANSITION_DUR };
