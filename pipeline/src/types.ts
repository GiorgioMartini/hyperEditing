export interface PipelineConfig {
  inputVideo: string;
  projectName: string;
  projectDir: string;
  processedDir: string;
  /** Use processed/transcripts/avatar.json instead of stem-based name */
  useStableTranscript?: boolean;
}

export interface ProjectConfig {
  originalUrl?: string;
  captions?: {
    maxWordsPerChunk?: number;
    activeColor?: string;
    pauseThresholdSec?: number;
    /** Caption text size in px (default 64) */
    fontSize?: number;
    /** Max caption block width as a fraction of composition width (default 0.48) */
    maxWidthRatio?: number;
    /** Minimum gap between consecutive caption lines in seconds (default 0.15) */
    interSegmentGapSec?: number;
    preRollSec?: number;
    postHoldSec?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
  };
  backdrop?: {
    maxHeight?: number;
    dimOverlay?: number;
  };
  motion?: {
    accentColor?: string;
    fontFamily?: string;
  };
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  type?: string;
  speaker_id?: string;
}

export interface Transcript {
  text?: string;
  words?: TranscriptWord[];
  language_code?: string;
}

export type BeatType = 'broll' | 'motion-graphic';

export type MotionGraphicTemplate = 'stat-callout' | 'kinetic-type' | 'list-reveal' | 'stat-slam';

export type MotionGraphicLayout = 'upper-card' | 'fullscreen';

export interface MotionGraphicSpec {
  template: MotionGraphicTemplate;
  props: Record<string, string>;
  layout?: MotionGraphicLayout;
}

export interface VisualBeat {
  id: string;
  type: BeatType;
  timestamp: number;
  duration: number;
  context: string;
  /** Exact phrase from script — resolved to timestamp by code */
  anchorPhrase?: string;
  /** Set by resolveBeatTimings(); never by LLM */
  resolvedTimestamp?: number;
  searchTerm?: string;
  motionGraphic?: MotionGraphicSpec;
}

export interface VisualBeatsFile {
  beats: VisualBeat[];
}

export interface FulfilledBeat {
  id: string;
  type: BeatType;
  timestamp: number;
  duration: number;
  context: string;
  anchorPhrase?: string;
  resolvedTimestamp?: number;
  /** Relative path from project root (video src or composition-src) */
  assetPath?: string;
  searchTerm?: string;
  motionGraphic?: MotionGraphicSpec;
}

export interface FulfilledBeatsFile {
  beats: FulfilledBeat[];
}

export interface PexelsVideoFile {
  id: number;
  quality: string;
  width: number;
  height: number;
  link: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: PexelsVideoFile[];
}

export interface PexelsCacheEntry {
  searchTerm: string;
  videos: PexelsVideo[];
  timestamp: number;
}

export interface StageResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface CompositionLayers {
  projectName: string;
  width: number;
  height: number;
  duration: number;
  faceVideo: string;
  audioPath: string;
  backdropVideo: string | null;
  dimOverlay: number;
  brollBeats: FulfilledBeat[];
  motionGraphicBeats: FulfilledBeat[];
}
