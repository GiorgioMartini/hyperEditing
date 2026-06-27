import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { log } from '../utils/logger.js';
import type { ProjectConfig } from '../types.js';

const PROJECT_FILENAME = 'project.json';

/**
 * Clean YouTube URLs for stable yt-dlp downloads.
 * Keeps the video id (?v=) but strips timestamp/tracking params.
 */
export function normalizeVideoUrl(url: string): string {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      const videoId =
        parsed.searchParams.get('v') ??
        (parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : null);

      if (!videoId) {
        throw new Error(`Could not extract YouTube video id from URL: ${url}`);
      }

      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Could not extract')) {
      throw error;
    }
    return url.split('?')[0] ?? url;
  }
}

export function projectConfigPath(projectDir: string): string {
  return resolve(projectDir, PROJECT_FILENAME);
}

export async function loadProjectConfig(projectDir: string): Promise<ProjectConfig | null> {
  const path = projectConfigPath(projectDir);
  if (!existsSync(path)) return null;

  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as ProjectConfig;
}

/** Load project.json and persist cleaned originalUrl when query params were present. */
export async function loadAndNormalizeProjectConfig(
  projectDir: string,
): Promise<ProjectConfig | null> {
  const config = await loadProjectConfig(projectDir);
  if (!config?.originalUrl) return config;

  const normalized = normalizeVideoUrl(config.originalUrl);
  if (normalized === config.originalUrl) return config;

  log.dim(`Normalized URL (removed query params): ${normalized}`);
  const updated: ProjectConfig = { ...config, originalUrl: normalized };
  await writeFile(projectConfigPath(projectDir), JSON.stringify(updated, null, 2) + '\n');
  return updated;
}
