#!/usr/bin/env node
import { parseArgs } from 'util';
import { resolve, basename } from 'path';
import { mkdir } from 'fs/promises';
import { validateEnv, PATHS } from './config.js';
import { cleanProjectArtifacts } from './clean.js';
import { log } from './utils/logger.js';
import { avatarPrep } from './stages/avatar-prep.js';
import { downloadBackdrop } from './stages/backdrop-download.js';
import { transcribeVideo } from './stages/transcribe.js';
import { planVisualBeats } from './stages/plan-visual-beats.js';
import { fulfillAssets } from './stages/fulfill-assets.js';
import { buildComposition } from './stages/compose.js';
import {
  AVATAR_DIR_NAME,
  avatarHasChanged,
  bootstrapPipelineStateIfNeeded,
  invalidateAvatarDerivedArtifacts,
  migrateLegacyTranscript,
  resolveAvatarInput,
  saveAvatarPipelineState,
} from './project/avatar-pipeline.js';
import type { PipelineConfig } from './types.js';

const USAGE = `
AI Video Pipeline

Usage:
  npm run pipeline -- --project <name> [--input <video>] [options]

Options:
  --input <path>     Avatar video path (relative paths resolve from project folder)
  --project <name>   Project folder under video-projects/
  --stage <n>        Run only stage n (1-6)
  --clean            Delete processed/ and generated compositions before run
  --help             Show this help

Default avatar location:
  video-projects/<project>/${AVATAR_DIR_NAME}/avatar.mov

Stages:
  1  Avatar prep (MOV → WebM)
  2  Download YouTube backdrop (reads project.json originalUrl)
  3  Transcription
  4  Plan visual beats (B-roll + motion graphics)
  5  Fulfill assets (Pexels + MG templates)
  6  HyperFrames composition

Example:
  npm run pipeline -- --project my-video-001
  npm run pipeline -- --project my-video-001 --input ${AVATAR_DIR_NAME}/avatar.mov
`;

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        input: { type: 'string' },
        project: { type: 'string' },
        stage: { type: 'string' },
        clean: { type: 'boolean', default: false },
        help: { type: 'boolean' },
      },
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    if (!values.project) {
      log.error('Missing required --project argument');
      console.log(USAGE);
      process.exit(1);
    }

    log.info('Checking environment...');
    validateEnv();
    log.success('Environment OK');

    const projectDir = resolve(PATHS.VIDEO_PROJECTS, values.project);
    const processedDir = resolve(projectDir, 'processed');

    await mkdir(projectDir, { recursive: true });
    await mkdir(processedDir, { recursive: true });
    await mkdir(resolve(projectDir, 'compositions'), { recursive: true });
    await mkdir(resolve(projectDir, 'assets'), { recursive: true });
    await mkdir(resolve(projectDir, 'renders'), { recursive: true });
    await mkdir(resolve(projectDir, AVATAR_DIR_NAME), { recursive: true });

    const resolved = await resolveAvatarInput(projectDir, values.input);

    const config: PipelineConfig = {
      inputVideo: resolved.path,
      projectName: values.project,
      projectDir,
      processedDir,
      useStableTranscript: resolved.useStableTranscript,
    };

    if (values.clean) {
      await cleanProjectArtifacts(config);
      await mkdir(processedDir, { recursive: true });
    } else {
      await migrateLegacyTranscript(config);
      await bootstrapPipelineStateIfNeeded(config);

      if (await avatarHasChanged(config.inputVideo, processedDir)) {
        await invalidateAvatarDerivedArtifacts(config);
      }
    }

    log.info(`Project: ${values.project}`);
    log.info(`Input: ${basename(config.inputVideo)}`);
    if (config.useStableTranscript) {
      log.dim('Transcript: processed/transcripts/avatar.json');
    }
    console.log('');

    const stages = [
      { num: 1, name: 'Avatar Prep', fn: () => avatarPrep(config) },
      { num: 2, name: 'Download Backdrop', fn: () => downloadBackdrop(config) },
      { num: 3, name: 'Transcription', fn: () => transcribeVideo(config) },
      { num: 4, name: 'Plan Visual Beats', fn: () => planVisualBeats(config) },
      { num: 5, name: 'Fulfill Assets', fn: () => fulfillAssets(config) },
      { num: 6, name: 'HyperFrames Composition', fn: () => buildComposition(config) },
    ];

    const runStage = values.stage ? parseInt(values.stage) : null;
    const stagesToRun = runStage ? stages.filter((s) => s.num === runStage) : stages;

    if (stagesToRun.length === 0) {
      log.error(`Invalid stage number: ${values.stage}`);
      process.exit(1);
    }

    let failed = false;
    for (const stage of stagesToRun) {
      log.stage(stage.num, stage.name);
      const result = await stage.fn();

      if (!result.success) {
        failed = true;
        log.error(`Stage ${stage.num} failed: ${result.error}`);
        break;
      }
    }

    if (!failed) {
      await saveAvatarPipelineState(config);
      console.log('');
      log.success('Pipeline complete!');
      log.info('Next steps:');
      log.dim(`  cd ${projectDir}`);
      log.dim('  npx hyperframes preview');
      log.dim('  npx hyperframes render --quality draft');
    } else {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Pipeline failed: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
