import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/** Returns video stream pixel format (e.g. yuv420p, yuva420p) via ffprobe. */
export async function getVideoPixelFormat(videoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of default=nw=1:nk=1 "${videoPath}"`,
    );
    const fmt = stdout.trim();
    return fmt || null;
  } catch {
    return null;
  }
}

/** True when ffprobe reports an alpha-capable pixel format. */
export function pixelFormatHasAlpha(pixFmt: string): boolean {
  return /yuva|rgba|bgra|argb|gbra|ya/i.test(pixFmt);
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
}

export async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream || !videoStream.width || !videoStream.height) {
        reject(new Error('Could not determine video dimensions'));
        return;
      }
      
      resolve({
        width: videoStream.width,
        height: videoStream.height,
      });
    });
  });
}

export async function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

export async function extractFrameAt(
  videoPath: string,
  timestamp: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

export async function prepareBackdropVideo(
  inputPath: string,
  outputPath: string,
  options: { width: number; height: number; duration: number },
): Promise<void> {
  const { width, height, duration } = options;
  // Uniform scale + center crop — cover-fit with no non-uniform stretch.
  const vf = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
  ].join(',');

  // Loop source if shorter than target; -t trims to exact avatar duration. No audio.
  const cmd = [
    'ffmpeg',
    '-stream_loop', '-1',
    '-i', `"${inputPath}"`,
    '-t', String(duration),
    '-vf', `"${vf}"`,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '28',
    '-movflags', '+faststart',
    `"${outputPath}"`,
    '-y',
  ].join(' ');

  await execAsync(cmd);
}

export async function downloadFile(url: string, outputPath: string): Promise<void> {
  const { default: fetch } = await import('node-fetch');
  const { createWriteStream } = await import('fs');
  const { pipeline } = await import('stream/promises');
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
  
  await pipeline(response.body!, createWriteStream(outputPath));
}
