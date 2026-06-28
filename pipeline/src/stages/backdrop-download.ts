import { existsSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { artifacts } from '../artifacts.js';
import { resolveBackdropTargetSize, resolveLayoutConfig } from '../brand/resolve-layout.js';
import { loadAndNormalizeProjectConfig } from '../project/load-project.js';
import { log } from '../utils/logger.js';
import { getVideoDuration, getVideoDimensions, prepareBackdropVideo } from '../utils/video-helpers.js';
import type { PipelineConfig, ProjectConfig, StageResult } from '../types.js';

const execAsync = promisify(exec);

function backdropUpperPanelOnly(project: ProjectConfig | null): boolean {
  if (project?.backdrop?.upperPanelOnly === false) return false;
  const layout = resolveLayoutConfig(project);
  return layout.mode === 'short-form-split';
}

async function resolveTargetSize(config: PipelineConfig, project: ProjectConfig | null) {
  const avatarPath = artifacts.transparentWebm(config);
  if (!existsSync(avatarPath)) {
    throw new Error('Avatar WebM not found. Run stage 1 first.');
  }
  const canvas = await getVideoDimensions(avatarPath);
  const layout = resolveLayoutConfig(project);
  return resolveBackdropTargetSize(
    layout,
    canvas.width,
    canvas.height,
    backdropUpperPanelOnly(project),
  );
}

async function backdropMatchesTarget(outputPath: string, target: { width: number; height: number }): Promise<boolean> {
  const dims = await getVideoDimensions(outputPath);
  return dims.width === target.width && dims.height === target.height;
}

/** Prepare cached raw download into final backdrop MP4 (cover-fit, no stretch). */
async function prepareBackdropFromRaw(
  config: PipelineConfig,
  project: ProjectConfig | null,
  rawPath: string,
  outputPath: string,
): Promise<void> {
  const avatarPath = artifacts.transparentWebm(config);
  const targetDuration = await getVideoDuration(avatarPath);
  const targetSize = await resolveTargetSize(config, project);

  log.info(
    `Preparing backdrop (${targetSize.width}x${targetSize.height}, cover-fit, ${targetDuration.toFixed(1)}s)...`,
  );
  await prepareBackdropVideo(rawPath, outputPath, {
    width: targetSize.width,
    height: targetSize.height,
    duration: targetDuration,
  });
}

/** Stage 2: Download YouTube reference video from project.json → backdrop MP4. */
export async function downloadBackdrop(config: PipelineConfig): Promise<StageResult> {
  const outputPath = artifacts.backdropMp4(config);
  const rawPath = artifacts.backdropRawMp4(config);

  try {
    const project = await loadAndNormalizeProjectConfig(config.projectDir);

    if (project?.originalUrl && existsSync(outputPath)) {
      const targetSize = await resolveTargetSize(config, project);
      if (await backdropMatchesTarget(outputPath, targetSize)) {
        log.dim(`Backdrop already exists (${targetSize.width}x${targetSize.height}) — skipping`);
        return { success: true, output: outputPath };
      }
      log.info('Backdrop dimensions outdated — re-preparing...');
    } else if (existsSync(outputPath)) {
      log.dim(`Backdrop already exists — skipping download: ${outputPath}`);
      return { success: true, output: outputPath };
    }

    if (!project?.originalUrl) {
      log.dim('No project.json originalUrl — skipping backdrop download');
      return { success: true, output: outputPath };
    }

    if (existsSync(rawPath)) {
      log.dim(`Raw backdrop cache found — preparing without download: ${rawPath}`);
      await prepareBackdropFromRaw(config, project, rawPath, outputPath);
      log.success(`Backdrop ready: ${outputPath}`);
      return { success: true, output: outputPath };
    }

    const avatarPath = artifacts.transparentWebm(config);
    if (!existsSync(avatarPath)) {
      throw new Error('Avatar WebM not found. Run stage 1 first.');
    }

    const maxHeight = project.backdrop?.maxHeight ?? 720;

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

    await prepareBackdropFromRaw(config, project, rawPath, outputPath);

    log.success(`Backdrop ready: ${outputPath}`);
    return { success: true, output: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Backdrop download failed: ${message}`);
    return { success: false, error: message };
  }
}
