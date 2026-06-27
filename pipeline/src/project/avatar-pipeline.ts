import { copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { readdir, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { artifacts } from '../artifacts.js';
import { log } from '../utils/logger.js';
import {
  avatarHasChanged,
  AVATAR_DIR_NAME,
  bootstrapPipelineStateIfNeeded,
  invalidateAvatarDerivedArtifacts,
  resolveAvatarInput,
  saveAvatarPipelineState,
} from '../project/resolve-avatar.js';
import type { PipelineConfig } from '../types.js';

/** If only one legacy transcript exists, copy it to avatar.json */
export async function migrateLegacyTranscript(config: PipelineConfig): Promise<void> {
  if (!config.useStableTranscript) return;

  const target = artifacts.transcript(config);
  if (existsSync(target)) return;

  const dir = resolve(config.processedDir, 'transcripts');
  if (!existsSync(dir)) return;

  const jsons = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  if (jsons.length !== 1) return;

  await mkdir(dir, { recursive: true });
  const legacy = resolve(dir, jsons[0]);
  await copyFile(legacy, target);
  log.info(`Migrated transcript ${jsons[0]} → avatar.json`);
}

export {
  resolveAvatarInput,
  avatarHasChanged,
  bootstrapPipelineStateIfNeeded,
  invalidateAvatarDerivedArtifacts,
  saveAvatarPipelineState,
  AVATAR_DIR_NAME,
};
