import { exec } from 'child_process';
import { promisify } from 'util';
import { copyFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { artifacts } from '../artifacts.js';
import { log } from '../utils/logger.js';
import { PATHS } from '../config.js';
import {
  avatarHasChanged,
  bootstrapPipelineStateIfNeeded,
} from '../project/resolve-avatar.js';
import type { PipelineConfig, StageResult } from '../types.js';

const execAsync = promisify(exec);

/** Stage 3: Transcribe avatar video via video-use / ElevenLabs. */
export async function transcribeVideo(config: PipelineConfig): Promise<StageResult> {
  const transcriptPath = artifacts.transcript(config);

  try {
    // Bootstrap state from existing webm + transcript (supports --stage 3 only runs)
    await bootstrapPipelineStateIfNeeded(config);

    if (existsSync(transcriptPath)) {
      const changed = await avatarHasChanged(config.inputVideo, config.processedDir);
      if (!changed) {
        log.dim('Transcript up to date — skipping transcription');
        return { success: true, output: transcriptPath };
      }
      log.info('Avatar changed — re-transcribing...');
    }

    log.info('Transcribing video with ElevenLabs...');

    const transcribeScript = `${PATHS.VIDEO_USE_HELPERS}/transcribe.py`;
    const cmd = `python3 "${transcribeScript}" "${config.inputVideo}" --edit-dir "${config.processedDir}"`;

    log.dim(`Running: ${cmd}`);
    await execAsync(cmd);

    // video-use writes stem-based name; copy/rename to stable avatar.json when needed
    if (config.useStableTranscript && !existsSync(transcriptPath)) {
      const stemPath = artifacts.transcript({
        ...config,
        useStableTranscript: false,
      });
      if (existsSync(stemPath) && stemPath !== transcriptPath) {
        await mkdir(dirname(transcriptPath), { recursive: true });
        await copyFile(stemPath, transcriptPath);
        log.dim('Normalized transcript → avatar.json');
      }
    }

    await readFile(transcriptPath, 'utf-8');

    log.success(`Transcript saved: ${transcriptPath}`);
    return { success: true, output: transcriptPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Transcription failed: ${message}`);
    return { success: false, error: message };
  }
}
