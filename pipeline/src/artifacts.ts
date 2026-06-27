import { basename, resolve } from 'path';
import type { PipelineConfig } from './types.js';
import { AVATAR_DIR_NAME } from './project/resolve-avatar.js';

/** Input video filename without extension */
export function inputStem(config: PipelineConfig): string {
  return basename(config.inputVideo).replace(/\.[^.]+$/, '');
}

export const artifacts = {
  transparentWebm: (config: PipelineConfig) =>
    resolve(config.processedDir, '01-transparent.webm'),

  backdropMp4: (config: PipelineConfig) =>
    resolve(config.processedDir, '00-backdrop.mp4'),

  backdropRawMp4: (config: PipelineConfig) =>
    resolve(config.processedDir, '00-backdrop-raw.mp4'),

  audioMp3: (config: PipelineConfig) =>
    resolve(config.processedDir, 'audio.mp3'),

  transcript: (config: PipelineConfig) => {
    if (config.useStableTranscript) {
      return resolve(config.processedDir, 'transcripts', 'avatar.json');
    }
    return resolve(config.processedDir, 'transcripts', `${inputStem(config)}.json`);
  },

  visualBeats: (config: PipelineConfig) =>
    resolve(config.processedDir, 'visual-beats.json'),

  fulfilledBeats: (config: PipelineConfig) =>
    resolve(config.processedDir, 'fulfilled-beats.json'),

  pexelsCache: (config: PipelineConfig) =>
    resolve(config.processedDir, '.pexels-cache.json'),

  /** Relative path for HyperFrames src attribute */
  brollRelPath: (beatId: string) => `processed/broll-${beatId}.mp4`,

  brollAbsPath: (config: PipelineConfig, beatId: string) =>
    resolve(config.processedDir, `broll-${beatId}.mp4`),

  captionsHtml: (config: PipelineConfig) =>
    resolve(config.projectDir, 'compositions', 'captions.html'),

  motionGraphicHtml: (config: PipelineConfig, beatId: string) =>
    resolve(config.projectDir, 'compositions', `mg-${beatId}.html`),

  /** Relative path for data-composition-src */
  motionGraphicRelPath: (beatId: string) => `compositions/mg-${beatId}.html`,

  indexHtml: (config: PipelineConfig) =>
    resolve(config.projectDir, 'index.html'),

  hyperframesJson: (config: PipelineConfig) =>
    resolve(config.projectDir, 'hyperframes.json'),

  metaJson: (config: PipelineConfig) =>
    resolve(config.projectDir, 'meta.json'),

  /** Canonical avatar location: video-projects/<project>/avatar/avatar.mov */
  sourceAvatar: (config: PipelineConfig) =>
    resolve(config.projectDir, AVATAR_DIR_NAME, 'avatar.mov'),
};
