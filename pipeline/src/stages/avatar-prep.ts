import { copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { extname } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { artifacts } from '../artifacts.js';
import { log } from '../utils/logger.js';
import type { PipelineConfig, StageResult } from '../types.js';

const execAsync = promisify(exec);

/** Stage 1: Convert transparent MOV to WebM VP9 with alpha (or copy existing WebM). */
export async function avatarPrep(config: PipelineConfig): Promise<StageResult> {
  const outputPath = artifacts.transparentWebm(config);
  const inputExt = extname(config.inputVideo).toLowerCase();

  try {
    // Skip re-encoding when a previous run already produced the WebM (~2 min saved).
    if (existsSync(outputPath)) {
      log.dim(`WebM already exists — skipping conversion: ${outputPath}`);
      return { success: true, output: outputPath };
    }

    if (inputExt === '.webm') {
      log.info('Input is already WebM, copying...');
      await copyFile(config.inputVideo, outputPath);
      log.success(`Transparent video ready: ${outputPath}`);
      return { success: true, output: outputPath };
    }

    if (inputExt === '.mov') {
      log.info('Converting MOV to web-compatible WebM format...');
      log.dim('Processing time: ~2 minutes for 45-second video');

      const ffmpegCmd = `ffmpeg -i "${config.inputVideo}" -c:v libvpx-vp9 -pix_fmt yuva420p -c:a libopus -b:v 2M -auto-alt-ref 0 "${outputPath}" -y`;
      await execAsync(ffmpegCmd);

      log.success(`Converted to WebM: ${outputPath}`);
      return { success: true, output: outputPath };
    }

    throw new Error(`Unsupported format: ${inputExt}. Use .mov or .webm`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Avatar prep failed: ${message}`);
    return { success: false, error: message };
  }
}
