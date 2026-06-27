import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { readdir, readFile, stat, unlink, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, extname, isAbsolute, relative, resolve } from 'path';
import { log } from '../utils/logger.js';
import type { PipelineConfig } from '../types.js';

/** Project folder for the avatar source video */
export const AVATAR_DIR_NAME = 'avatar';

const CANONICAL_NAMES = ['avatar.mov', 'avatar.mp4', 'avatar.webm'] as const;
const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.webm', '.mkv', '.m4v']);

export interface ResolvedAvatarInput {
  /** Absolute path to the avatar video file */
  path: string;
  /** True when resolved from project avatar/ (stable transcript path) */
  useStableTranscript: boolean;
}

export interface AvatarFingerprint {
  size: number;
  mtimeMs: number;
}

export interface PipelineState {
  avatarPath: string;
  avatarFingerprint: AvatarFingerprint;
  transcriptPath: string;
  updatedAt: string;
}

export function avatarDir(projectDir: string): string {
  return resolve(projectDir, AVATAR_DIR_NAME);
}

export function pipelineStatePath(processedDir: string): string {
  return resolve(processedDir, '.pipeline-state.json');
}

/** Resolve --input or discover video under project avatar/ */
export async function resolveAvatarInput(
  projectDir: string,
  cliInput?: string,
): Promise<ResolvedAvatarInput> {
  if (cliInput) {
    const path = resolveCliInputPath(cliInput, projectDir);
    if (!existsSync(path)) {
      throw new Error(`Input video not found: ${path}`);
    }
    const useStableTranscript = isUnderAvatarDir(path, projectDir);
    return { path, useStableTranscript };
  }

  const dir = avatarDir(projectDir);

  for (const name of CANONICAL_NAMES) {
    const candidate = resolve(dir, name);
    if (existsSync(candidate)) {
      return { path: candidate, useStableTranscript: true };
    }
  }

  if (existsSync(dir)) {
    const entries = await readdir(dir);
    const videos = entries.filter((e) => VIDEO_EXTENSIONS.has(extname(e).toLowerCase()));
    if (videos.length === 1) {
      return {
        path: resolve(dir, videos[0]),
        useStableTranscript: true,
      };
    }
    if (videos.length > 1) {
      throw new Error(
        `Multiple videos in ${AVATAR_DIR_NAME}/ — use avatar.mov or pass --input. Found: ${videos.join(', ')}`,
      );
    }
  }

  // Legacy fallback: source/avatar.mov (deprecated)
  const legacy = resolve(projectDir, 'source', 'avatar.mov');
  if (existsSync(legacy)) {
    log.warn('Using deprecated source/avatar.mov — move to avatar/avatar.mov');
    return { path: legacy, useStableTranscript: true };
  }

  throw new Error(
    `No avatar video found. Place avatar.mov in ${AVATAR_DIR_NAME}/ or pass --input.`,
  );
}

/** Relative paths resolve from project dir; absolute and ~/ unchanged */
function resolveCliInputPath(input: string, projectDir: string): string {
  if (input.startsWith('~/')) {
    return resolve(process.env.HOME!, input.slice(2));
  }
  if (isAbsolute(input)) {
    return resolve(input);
  }
  return resolve(projectDir, input);
}

function isUnderAvatarDir(filePath: string, projectDir: string): boolean {
  const rel = relative(avatarDir(projectDir), resolve(filePath));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Fingerprint from file size + mtime (fast; good for local dev) */
export async function fingerprintAvatar(filePath: string): Promise<AvatarFingerprint> {
  const info = await stat(filePath);
  return { size: info.size, mtimeMs: info.mtimeMs };
}

export function fingerprintsMatch(
  a: AvatarFingerprint,
  b: AvatarFingerprint,
): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

export async function readPipelineState(
  processedDir: string,
): Promise<PipelineState | null> {
  const path = pipelineStatePath(processedDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as PipelineState;
  } catch {
    return null;
  }
}

export async function writePipelineState(
  processedDir: string,
  state: PipelineState,
): Promise<void> {
  await mkdir(processedDir, { recursive: true });
  await writeFile(pipelineStatePath(processedDir), JSON.stringify(state, null, 2) + '\n');
}

/**
 * True when avatar file changed since last pipeline run (state must exist).
 */
export async function avatarHasChanged(
  avatarPath: string,
  processedDir: string,
): Promise<boolean> {
  const current = await fingerprintAvatar(avatarPath);
  const state = await readPipelineState(processedDir);

  if (!state) {
    return false;
  }

  if (state.avatarPath !== avatarPath) {
    return true;
  }

  return !fingerprintsMatch(current, state.avatarFingerprint);
}

/**
 * First run after upgrade: record fingerprint from existing artifacts
 * so we don't re-transcribe or invalidate on the next invocation.
 */
export async function bootstrapPipelineStateIfNeeded(
  config: PipelineConfig,
): Promise<void> {
  const state = await readPipelineState(config.processedDir);
  if (state) return;

  const webm = resolve(config.processedDir, '01-transparent.webm');
  const transcriptPath = config.useStableTranscript
    ? resolve(config.processedDir, 'transcripts', 'avatar.json')
    : resolve(
        config.processedDir,
        'transcripts',
        `${basename(config.inputVideo).replace(/\.[^.]+$/, '')}.json`,
      );

  if (existsSync(webm) && existsSync(transcriptPath)) {
    await saveAvatarPipelineState(config);
    log.dim('Bootstrapped pipeline state from existing processed artifacts');
  }
}

/**
 * Remove artifacts derived from the avatar (keeps backdrop + Pexels cache).
 * Called when avatar fingerprint changes.
 */
export async function invalidateAvatarDerivedArtifacts(
  config: PipelineConfig,
): Promise<void> {
  log.info('Avatar changed — invalidating derived processed artifacts...');

  const toDelete = [
    resolve(config.processedDir, '01-transparent.webm'),
    resolve(config.processedDir, 'audio.mp3'),
    resolve(config.processedDir, 'visual-beats.json'),
    resolve(config.processedDir, 'fulfilled-beats.json'),
    pipelineStatePath(config.processedDir),
  ];

  // Transcript(s)
  const transcriptsDir = resolve(config.processedDir, 'transcripts');
  if (existsSync(transcriptsDir)) {
    const entries = await readdir(transcriptsDir);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        toDelete.push(resolve(transcriptsDir, entry));
      }
    }
  }

  // B-roll downloads (beat plan depends on transcript)
  if (existsSync(config.processedDir)) {
    const processed = await readdir(config.processedDir);
    for (const entry of processed) {
      if (entry.startsWith('broll-') && entry.endsWith('.mp4')) {
        toDelete.push(resolve(config.processedDir, entry));
      }
    }
  }

  for (const file of toDelete) {
    if (existsSync(file)) {
      await unlink(file);
      log.dim(`Removed ${relative(config.projectDir, file)}`);
    }
  }

  const compositionsDir = resolve(config.projectDir, 'compositions');
  if (existsSync(compositionsDir)) {
    const entries = await readdir(compositionsDir);
    for (const entry of entries) {
      if (entry === 'captions.html' || entry.startsWith('mg-')) {
        await unlink(resolve(compositionsDir, entry));
        log.dim(`Removed compositions/${entry}`);
      }
    }
  }

  const indexHtml = resolve(config.projectDir, 'index.html');
  if (existsSync(indexHtml)) {
    await unlink(indexHtml);
    log.dim('Removed index.html');
  }

  log.success('Avatar-derived artifacts cleared');
}

/** Persist state after a successful full pipeline run */
export async function saveAvatarPipelineState(config: PipelineConfig): Promise<void> {
  const fingerprint = await fingerprintAvatar(config.inputVideo);
  const relAvatar = relative(config.projectDir, config.inputVideo);
  const relTranscript = relative(
    config.projectDir,
    config.useStableTranscript
      ? resolve(config.processedDir, 'transcripts', 'avatar.json')
      : resolve(config.processedDir, 'transcripts', `${basename(config.inputVideo).replace(/\.[^.]+$/, '')}.json`),
  );

  await writePipelineState(config.processedDir, {
    avatarPath: config.inputVideo,
    avatarFingerprint: fingerprint,
    transcriptPath: relTranscript,
    updatedAt: new Date().toISOString(),
  });
}

/** Optional: hash first 4MB for stronger detection (not used by default) */
export async function hashAvatarPrefix(filePath: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath, { start: 0, end: 4 * 1024 * 1024 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
    stream.on('error', reject);
  });
}
