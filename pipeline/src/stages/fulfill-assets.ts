import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { artifacts } from '../artifacts.js';
import { downloadBrollForBeat } from '../fulfill/download-broll.js';
import { loadProjectConfig } from '../project/load-project.js';
import {
  generateMotionGraphicComposition,
  motionConfigFromProject,
} from '../composition/generate-motion-graphic.js';
import { beatStartTime } from '../utils/transcript-anchor.js';
import { getVideoDimensions } from '../utils/video-helpers.js';
import { log } from '../utils/logger.js';
import type {
  FulfilledBeat,
  FulfilledBeatsFile,
  PipelineConfig,
  StageResult,
  VisualBeat,
  VisualBeatsFile,
} from '../types.js';

/** Stage 5: Fulfill visual beats — download B-roll or generate MG compositions. */
export async function fulfillAssets(config: PipelineConfig): Promise<StageResult> {
  const outputPath = artifacts.fulfilledBeats(config);

  try {
    log.info('Fulfilling visual beats...');

    const { beats } = JSON.parse(
      await readFile(artifacts.visualBeats(config), 'utf-8'),
    ) as VisualBeatsFile;

    const fulfilled: FulfilledBeat[] = [];

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      log.info(`[${i + 1}/${beats.length}] ${beat.type}: ${beat.id}`);

      if (beat.type === 'broll') {
        const entry = await fulfillBroll(config, beat);
        if (entry) fulfilled.push(entry);
      } else if (beat.type === 'motion-graphic') {
        const entry = await fulfillMotionGraphic(config, beat);
        if (entry) fulfilled.push(entry);
      }
    }

    if (fulfilled.length === 0) {
      throw new Error('No visual beats were fulfilled');
    }

    const file: FulfilledBeatsFile = { beats: fulfilled };
    await writeFile(outputPath, JSON.stringify(file, null, 2));

    log.success(`Fulfilled ${fulfilled.length} beats → ${outputPath}`);
    return { success: true, output: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Asset fulfillment failed: ${message}`);
    return { success: false, error: message };
  }
}

async function fulfillBroll(
  config: PipelineConfig,
  beat: VisualBeat,
): Promise<FulfilledBeat | null> {
  if (!beat.searchTerm) {
    log.warn(`B-roll beat ${beat.id} missing searchTerm — skipping`);
    return null;
  }

  const cachePath = artifacts.pexelsCache(config);
  const outputPath = artifacts.brollAbsPath(config, beat.id);

  const downloaded = await downloadBrollForBeat(beat.searchTerm, outputPath, cachePath);
  if (!downloaded) {
    log.warn(`No Pexels video for "${beat.searchTerm}" — skipping`);
    return null;
  }

  return {
    id: beat.id,
    type: 'broll',
    timestamp: beatStartTime(beat),
    duration: beat.duration,
    context: beat.context,
    anchorPhrase: beat.anchorPhrase,
    resolvedTimestamp: beat.resolvedTimestamp,
    assetPath: artifacts.brollRelPath(beat.id),
    searchTerm: beat.searchTerm,
  };
}

async function fulfillMotionGraphic(
  config: PipelineConfig,
  beat: VisualBeat,
): Promise<FulfilledBeat | null> {
  if (!beat.motionGraphic) {
    log.warn(`MG beat ${beat.id} missing motionGraphic spec — skipping`);
    return null;
  }

  const outPath = artifacts.motionGraphicHtml(config, beat.id);
  const dimensions = await getVideoDimensions(artifacts.transparentWebm(config));
  const project = await loadProjectConfig(config.projectDir);
  const motion = motionConfigFromProject(project);

  await generateMotionGraphicComposition({
    beatId: beat.id,
    duration: beat.duration,
    width: dimensions.width,
    height: dimensions.height,
    spec: beat.motionGraphic,
    outputPath: outPath,
    motion,
  });

  if (!existsSync(outPath)) {
    log.warn(`MG composition not created for ${beat.id}`);
    return null;
  }

  return {
    id: beat.id,
    type: 'motion-graphic',
    timestamp: beatStartTime(beat),
    duration: beat.duration,
    context: beat.context,
    anchorPhrase: beat.anchorPhrase,
    resolvedTimestamp: beat.resolvedTimestamp,
    assetPath: artifacts.motionGraphicRelPath(beat.id),
    motionGraphic: beat.motionGraphic,
  };
}
