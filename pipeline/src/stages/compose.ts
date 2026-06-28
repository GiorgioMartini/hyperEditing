import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { artifacts } from '../artifacts.js';
import { resolveBrandTokens } from '../brand/resolve-brand.js';
import { resolveLayoutConfig } from '../brand/resolve-layout.js';
import { resolveMotionPlanning } from '../brand/resolve-motion.js';
import { generateCaptionsHtml } from '../composition/generate-captions.js';
import { generateBrandTokensCss } from '../composition/generate-brand-tokens.js';
import {
  computeFaceModeSchedule,
  computeSeamWindows,
} from '../composition/face-mode-schedule.js';
import { generateIndexHtml } from '../composition/generate-index.js';
import { generateScaffoldCompositions } from '../composition/generate-scaffold.js';
import { generateSceneTransitions } from '../composition/generate-scene-transitions.js';
import { generateHyperframesJson, generateMetaJson } from '../composition/generate-meta.js';
import { loadProjectConfig } from '../project/load-project.js';
import { log } from '../utils/logger.js';
import { validateBeats, beatsAreValid } from '../utils/validate-beats.js';
import { validateMotionQuality, shouldAutoReplan } from '../utils/validate-motion-quality.js';
import { getVideoDimensions, getVideoDuration, extractAudio } from '../utils/video-helpers.js';
import { beatStartTime, getSpeechWindow } from '../utils/transcript-anchor.js';
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
    const layout = resolveLayoutConfig(project);
    const brand = resolveBrandTokens(project);
    const motionPlanning = resolveMotionPlanning(project);
    const hasBackdrop = existsSync(artifacts.backdropMp4(config));

    await mkdir(resolve(config.projectDir, 'assets'), { recursive: true });
    await writeFile(artifacts.brandTokensCss(config), generateBrandTokensCss(brand));

    const captionOpts = project?.captions ?? {};
    const captionsHtml = generateCaptionsHtml(transcript.words ?? [], {
      width: dimensions.width,
      height: dimensions.height,
      duration,
      maxWordsPerChunk: captionOpts.maxWordsPerChunk ?? 4,
      pauseThresholdSec: captionOpts.pauseThresholdSec ?? 0.35,
      activeColor: captionOpts.activeColor ?? brand.accent,
      fontSize: captionOpts.fontSize,
      maxWidthRatio: captionOpts.maxWidthRatio,
      interSegmentGapSec: captionOpts.interSegmentGapSec,
      preRollSec: captionOpts.preRollSec,
      postHoldSec: captionOpts.postHoldSec,
      fadeInSec: captionOpts.fadeInSec,
      fadeOutSec: captionOpts.fadeOutSec,
      placement: layout.mode === 'short-form-split' ? 'bottom' : 'center',
      bottomOffset: captionOpts.bottomOffset ?? 220,
      fontFamily: brand.fontDisplay,
    });

    await writeFile(artifacts.captionsHtml(config), captionsHtml);

    const brollBeats = beats.filter((b) => b.type === 'broll');
    const motionGraphicBeats = beats.filter((b) => b.type === 'motion-graphic');
    const sceneBeats = [...beats].sort((a, b) => beatStartTime(a) - beatStartTime(b));

    const faceModeSchedule = computeFaceModeSchedule(sceneBeats, duration, layout);
    const seamWindows = computeSeamWindows(faceModeSchedule, duration, sceneBeats);

    if (layout.mode === 'short-form-split') {
      await generateScaffoldCompositions({
        width: dimensions.width,
        height: dimensions.height,
        duration,
        layout,
        brand,
        seamWindows,
        ambientBgPath: artifacts.ambientBgHtml(config),
        seamTreatmentPath: artifacts.seamTreatmentHtml(config),
      });
    }

    let sceneTransitions: Awaited<ReturnType<typeof generateSceneTransitions>> = [];
    if (layout.mode === 'short-form-split' && !motionPlanning.useRegistryTransitions) {
      sceneTransitions = await generateSceneTransitions(
        sceneBeats,
        resolve(config.projectDir, 'compositions'),
        dimensions.width,
        dimensions.height,
      );
    }

    const words = transcript.words ?? [];
    const speechWindow = getSpeechWindow(words);
    const timingOpts = {
      videoDuration: duration,
      speechEnd: speechWindow.speechEndWithHold,
      preRollSec: 0.15,
      postHoldSec: 0.3,
    };

    const issues = validateBeats(beats, words, {
      ...timingOpts,
      strict: true,
    });
    if (!beatsAreValid(issues, true)) {
      log.warn('Beat validation warnings during compose — output may need manual review');
    }

    const qualityIssues = validateMotionQuality(beats, duration, project, {
      words,
      speechEnd: speechWindow.speechEndWithHold,
    });
    if (shouldAutoReplan(qualityIssues)) {
      log.warn('Motion quality gate: density or jaw-dropper gaps detected — review visual-beats.json');
    }

    const indexHtml = generateIndexHtml({
      projectName: config.projectName,
      width: dimensions.width,
      height: dimensions.height,
      duration,
      faceVideo: 'processed/01-transparent.webm',
      audioPath: 'processed/audio.mp3',
      backdropVideo:
        layout.mode === 'backdrop-pip' && hasBackdrop ? 'processed/00-backdrop.mp4' : null,
      dimOverlay: project?.backdrop?.dimOverlay ?? 0.45,
      layout,
      brandBackground: brand.background,
      faceModeSchedule,
      seamWindows,
      brollBeats,
      motionGraphicBeats,
      sceneBeats,
      sceneTransitions,
    });

    await writeFile(artifacts.indexHtml(config), indexHtml);
    await writeFile(artifacts.hyperframesJson(config), generateHyperframesJson());
    await writeFile(
      artifacts.metaJson(config),
      generateMetaJson(config.projectName, dimensions.width, dimensions.height),
    );

    log.success('HyperFrames composition created');
    log.dim(`Layout: ${layout.mode}`);
    if (hasBackdrop && layout.mode === 'backdrop-pip') log.dim('Backdrop layer: enabled');
    log.dim(`Scene beats: ${sceneBeats.length} (B-roll: ${brollBeats.length}, MG: ${motionGraphicBeats.length})`);
    log.dim(`Captions: ${artifacts.captionsHtml(config)}`);
    log.dim(`Duration: ${duration.toFixed(2)}s`);

    return { success: true, output: config.projectDir };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Composition build failed: ${message}`);
    return { success: false, error: message };
  }
}
