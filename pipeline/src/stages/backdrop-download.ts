import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { artifacts } from '../artifacts.js';
import { loadAndNormalizeProjectConfig } from '../project/load-project.js';
import { log } from '../utils/logger.js';
import { getVideoDuration, getVideoDimensions, prepareBackdropVideo } from '../utils/video-helpers.js';
import type { PipelineConfig, StageResult } from '../types.js';

const execAsync = promisify(exec);

/** Stage 2: Download YouTube reference video from project.json → backdrop MP4. */
export async function downloadBackdrop(config: PipelineConfig): Promise<StageResult> {
  const outputPath = artifacts.backdropMp4(config);

  try {
    const project = await loadAndNormalizeProjectConfig(config.projectDir);

    if (!project?.originalUrl) {
      log.dim('No project.json originalUrl — skipping backdrop download');
      return { success: true, output: outputPath };
    }

    const avatarPath = artifacts.transparentWebm(config);
    if (!existsSync(avatarPath)) {
      throw new Error('Avatar WebM not found. Run stage 1 first.');
    }

    const targetDuration = await getVideoDuration(avatarPath);
    const dimensions = await getVideoDimensions(avatarPath);
    const maxHeight = project.backdrop?.maxHeight ?? 720;
    const rawPath = artifacts.backdropRawMp4(config);

    log.info(`Downloading reference video (max ${maxHeight}p)...`);
    log.dim(`URL: ${project.originalUrl}`);

    const formatSelector = `bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]/best`;
    const ytdlpCmd = [
      'yt-dlp',
      '-f', `"${formatSelector}"`,
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '-o', `"${rawPath}"`,
      `"${project.originalUrl}"`,
    ].join(' ');

    await execAsync(ytdlpCmd);

    if (!existsSync(rawPath)) {
      throw new Error(`yt-dlp did not produce expected file: ${rawPath}`);
    }

    log.success('Reference video downloaded');

    const { width, height } = dimensions;
    log.info(`Preparing backdrop (${width}x${height}, ${targetDuration.toFixed(1)}s)...`);

    await prepareBackdropVideo(rawPath, outputPath, {
      width,
      height,
      duration: targetDuration,
    });

    if (existsSync(rawPath)) {
      await unlink(rawPath).catch(() => undefined);
    }

    log.success(`Backdrop ready: ${outputPath}`);
    return { success: true, output: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Backdrop download failed: ${message}`);
    return { success: false, error: message };
  }
}
