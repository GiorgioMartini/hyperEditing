import { copyFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { extname } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { artifacts } from '../artifacts.js';
import { log } from '../utils/logger.js';
import { getVideoPixelFormat, pixelFormatHasAlpha } from '../utils/video-helpers.js';
import type { PipelineConfig, StageResult } from '../types.js';

const execAsync = promisify(exec);

async function encodeMovToTransparentWebm(inputPath: string, outputPath: string): Promise<void> {
  log.info('Converting MOV to web-compatible WebM format...');
  log.dim('Processing time: ~2 minutes for 45-second video');

  const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libvpx-vp9 -pix_fmt yuva420p -c:a libopus -b:v 2M -auto-alt-ref 0 "${outputPath}" -y`;
  await execAsync(ffmpegCmd);
}

/** Stage 1: Convert transparent MOV to WebM VP9 with alpha (or copy existing WebM). */
export async function avatarPrep(config: PipelineConfig): Promise<StageResult> {
  const outputPath = artifacts.transparentWebm(config);
  const inputExt = extname(config.inputVideo).toLowerCase();

  try {
    // Skip re-encoding only when cached WebM actually has an alpha channel.
    if (existsSync(outputPath)) {
      const pixFmt = await getVideoPixelFormat(outputPath);
      if (pixFmt && pixelFormatHasAlpha(pixFmt)) {
        log.dim(`WebM already exists with alpha (${pixFmt}) — skipping conversion: ${outputPath}`);
        return { success: true, output: outputPath };
      }
      log.warn(
        `WebM exists but lacks alpha (${pixFmt ?? 'unknown'}) — re-encoding to preserve transparency`,
      );
      await unlink(outputPath).catch(() => undefined);
    }

    if (inputExt === '.webm') {
      const pixFmt = await getVideoPixelFormat(config.inputVideo);
      if (pixFmt && pixelFormatHasAlpha(pixFmt)) {
        log.info('Input is alpha WebM, copying...');
        await copyFile(config.inputVideo, outputPath);
        log.success(`Transparent video ready: ${outputPath}`);
        return { success: true, output: outputPath };
      }
      log.warn(`Input WebM lacks alpha (${pixFmt ?? 'unknown'}) — re-encoding...`);
      await encodeMovToTransparentWebm(config.inputVideo, outputPath);
      log.success(`Converted to WebM: ${outputPath}`);
      return { success: true, output: outputPath };
    }

    if (inputExt === '.mov') {
      await encodeMovToTransparentWebm(config.inputVideo, outputPath);
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
