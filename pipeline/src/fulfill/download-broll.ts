import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { log } from '../utils/logger.js';
import { downloadFile } from '../utils/video-helpers.js';
import { ENV } from '../config.js';
import type { PexelsCacheEntry, PexelsVideo } from '../types.js';

const PEXELS_API_BASE = 'https://api.pexels.com/videos';
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function downloadBrollForBeat(
  searchTerm: string,
  outputPath: string,
  cacheFilePath: string,
): Promise<boolean> {
  const cache = await loadCache(cacheFilePath);
  let video = getCachedVideo(cache, searchTerm);

  if (!video) {
    video = await searchPexels(searchTerm);
    if (video) {
      updateCache(cache, searchTerm, video);
      await saveCache(cacheFilePath, cache);
    }
  } else {
    log.dim('Using cached Pexels result');
  }

  if (!video) return false;

  const downloadUrl = selectBestVideoFile(video);
  await downloadFile(downloadUrl, outputPath);
  log.success(`B-roll downloaded: ${outputPath}`);
  return true;
}

async function searchPexels(searchTerm: string): Promise<PexelsVideo | null> {
  try {
    const response = await fetch(
      `${PEXELS_API_BASE}/search?query=${encodeURIComponent(searchTerm)}&per_page=15&orientation=portrait`,
      { headers: { Authorization: ENV.PEXELS_API_KEY } },
    );

    if (!response.ok) {
      const fallback = await fetch(
        `${PEXELS_API_BASE}/search?query=${encodeURIComponent(searchTerm)}&per_page=15`,
        { headers: { Authorization: ENV.PEXELS_API_KEY } },
      );
      if (!fallback.ok) return null;
      const data = (await fallback.json()) as { videos: PexelsVideo[] };
      return selectBestOrientation(data.videos);
    }

    const data = (await response.json()) as { videos: PexelsVideo[] };
    return selectBestOrientation(data.videos);
  } catch {
    return null;
  }
}

function selectBestOrientation(videos: PexelsVideo[]): PexelsVideo | null {
  if (videos.length === 0) return null;
  const vertical = videos.filter((v) => v.height > v.width);
  if (vertical.length > 0) {
    log.dim('Found vertical video (9:16)');
    return vertical[0];
  }
  log.dim('Using horizontal video');
  return videos[0];
}

function selectBestVideoFile(video: PexelsVideo): string {
  const hdFile = video.video_files.find((f) => f.quality === 'hd' && f.height >= 720);
  if (hdFile) return hdFile.link;

  const sorted = [...video.video_files].sort(
    (a, b) => b.width * b.height - a.width * a.height,
  );
  return sorted[0]?.link || video.video_files[0].link;
}

async function loadCache(cacheFile: string): Promise<PexelsCacheEntry[]> {
  if (!existsSync(cacheFile)) return [];
  try {
    return JSON.parse(await readFile(cacheFile, 'utf-8')) as PexelsCacheEntry[];
  } catch {
    return [];
  }
}

async function saveCache(cacheFile: string, cache: PexelsCacheEntry[]): Promise<void> {
  await writeFile(cacheFile, JSON.stringify(cache, null, 2));
}

function getCachedVideo(cache: PexelsCacheEntry[], searchTerm: string): PexelsVideo | null {
  const now = Date.now();
  const entry = cache.find(
    (e) => e.searchTerm === searchTerm && now - e.timestamp < CACHE_DURATION_MS,
  );
  return entry?.videos[0] || null;
}

function updateCache(cache: PexelsCacheEntry[], searchTerm: string, video: PexelsVideo): void {
  const index = cache.findIndex((e) => e.searchTerm === searchTerm);
  if (index >= 0) cache.splice(index, 1);
  cache.push({ searchTerm, videos: [video], timestamp: Date.now() });
}
