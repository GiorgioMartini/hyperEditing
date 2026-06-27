import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { artifacts } from '../artifacts.js';
import { generateCaptionsHtml } from '../composition/generate-captions.js';
import { generateIndexHtml } from '../composition/generate-index.js';
import { generateHyperframesJson, generateMetaJson } from '../composition/generate-meta.js';
import { loadProjectConfig } from '../project/load-project.js';
import { log } from '../utils/logger.js';
import { validateBeats, beatsAreValid } from '../utils/validate-beats.js';
import { getVideoDimensions, getVideoDuration, extractAudio } from '../utils/video-helpers.js';
import type { FulfilledBeatsFile, PipelineConfig, StageResult, Transcript } from '../types.js';

/** Stage 6: Assemble HyperFrames project from fulfilled artifacts. */
export async function buildComposition(config: PipelineConfig): Promise<StageResult> {
  try {
    log.info('Building HyperFrames composition...');

    const transparentPath = artifacts.transparentWebm(config);
    const dimensions = await getVideoDimensions(transparentPath);
    const duration = await getVideoDuration(transparentPath);

    log.dim(`Detected: ${dimensions.width}x${dimensions.height}`);

    log.dim('Extracting audio to MP3...');
    await extractAudio(transparentPath, artifacts.audioMp3(config));
    log.success('Audio extracted');

    const { beats } = JSON.parse(
      await readFile(artifacts.fulfilledBeats(config), 'utf-8'),
    ) as FulfilledBeatsFile;

    const transcript = JSON.parse(
      await readFile(artifacts.transcript(config), 'utf-8'),
    ) as Transcript;

    const project = await loadProjectConfig(config.projectDir);
    const hasBackdrop = existsSync(artifacts.backdropMp4(config));

    const captionOpts = project?.captions ?? {};
    const captionsHtml = generateCaptionsHtml(transcript.words ?? [], {
      width: dimensions.width,
      height: dimensions.height,
      duration,
      maxWordsPerChunk: captionOpts.maxWordsPerChunk ?? 4,
      pauseThresholdSec: captionOpts.pauseThresholdSec ?? 0.35,
      activeColor: captionOpts.activeColor ?? '#ff3333',
      fontSize: captionOpts.fontSize,
      maxWidthRatio: captionOpts.maxWidthRatio,
      interSegmentGapSec: captionOpts.interSegmentGapSec,
      preRollSec: captionOpts.preRollSec,
      postHoldSec: captionOpts.postHoldSec,
      fadeInSec: captionOpts.fadeInSec,
      fadeOutSec: captionOpts.fadeOutSec,
    });

    await writeFile(artifacts.captionsHtml(config), captionsHtml);

    const brollBeats = beats.filter((b) => b.type === 'broll');
    const motionGraphicBeats = beats.filter((b) => b.type === 'motion-graphic');

    const issues = validateBeats(beats, transcript.words ?? [], {
      videoDuration: duration,
      strict: true,
    });
    if (!beatsAreValid(issues, true)) {
      log.warn('Beat validation warnings during compose — output may need manual review');
    }

    const indexHtml = generateIndexHtml({
      projectName: config.projectName,
      width: dimensions.width,
      height: dimensions.height,
      duration,
      faceVideo: 'processed/01-transparent.webm',
      audioPath: 'processed/audio.mp3',
      backdropVideo: hasBackdrop ? 'processed/00-backdrop.mp4' : null,
      dimOverlay: project?.backdrop?.dimOverlay ?? 0.45,
      brollBeats,
      motionGraphicBeats,
    });

    await writeFile(artifacts.indexHtml(config), indexHtml);
    await writeFile(artifacts.hyperframesJson(config), generateHyperframesJson());
    await writeFile(
      artifacts.metaJson(config),
      generateMetaJson(config.projectName, dimensions.width, dimensions.height),
    );

    log.success('HyperFrames composition created');
    if (hasBackdrop) log.dim('Backdrop layer: enabled');
    log.dim(`B-roll beats: ${brollBeats.length}, MG beats: ${motionGraphicBeats.length}`);
    log.dim(`Captions: ${artifacts.captionsHtml(config)}`);
    log.dim(`Duration: ${duration.toFixed(2)}s`);

    return { success: true, output: config.projectDir };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Composition build failed: ${message}`);
    return { success: false, error: message };
  }
}
