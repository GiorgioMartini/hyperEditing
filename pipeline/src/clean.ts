import { readdir, rm, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { log } from './utils/logger.js';
import type { PipelineConfig } from './types.js';

/**
 * Remove pipeline-generated cache and compositions before a fresh run.
 * Does not delete renders/ or hand-edited composition files other than
 * captions.html and mg-*.html.
 */
export async function cleanProjectArtifacts(config: PipelineConfig): Promise<void> {
  log.info('Cleaning pipeline artifacts...');

  if (existsSync(config.processedDir)) {
    await rm(config.processedDir, { recursive: true, force: true });
    log.dim(`Removed ${config.processedDir}`);
  }

  const compositionsDir = resolve(config.projectDir, 'compositions');
  if (existsSync(compositionsDir)) {
    const entries = await readdir(compositionsDir);
    for (const entry of entries) {
      if (entry === 'captions.html' || entry.startsWith('mg-')) {
        await unlink(resolve(compositionsDir, entry));
        log.dim(`Removed compositions/${entry}`);
      }
    }
  }

  log.success('Clean complete');
}
