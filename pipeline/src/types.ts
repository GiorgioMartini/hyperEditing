export interface PipelineConfig {
  inputVideo: string;
  projectName: string;
  projectDir: string;
  processedDir: string;
  /** Use processed/transcripts/avatar.json instead of stem-based name */
  useStableTranscript?: boolean;
}

export type LayoutMode = 'short-form-split' | 'upper-card' | 'backdrop-pip';

/** GSAP transform target for #face-wrapper (transform-origin: top left). */
export interface FaceTransform {
  x: number;
  y: number;
  scale: number;
}

export type FaceFitMode = 'cover' | 'letterbox';

export interface LayoutConfig {
  mode: LayoutMode;
  panelHeight: number;
  faceSourceWidth: number;
  faceSourceHeight: number;
  /** How the face fills the bottom panel — cover (default) or letterbox (may-shorts-19 style) */
  faceFitMode?: FaceFitMode;
  /** Override computed BOTTOM transform (partial merge) */
  faceBottom?: Partial<FaceTransform>;
  /** Override computed FULLSCREEN transform (partial merge) */
  faceFullscreen?: Partial<FaceTransform>;
  /** CSS object-position on #face-video — tune head room (default 50% 42%) */
  faceVideoObjectPosition?: string;
  /** Subtle Ken Burns scale on #face-video over full duration (default 1.012) */
  faceKenBurnsScale?: number;
}

export type BrandPresetName = 'dark-chrome' | 'social-navy' | 'custom';

export interface BrandConfig {
  preset?: BrandPresetName;
  background?: string;
  accent?: string;
  accentSecondary?: string;
  text?: string;
  textDim?: string;
  surface?: string;
  fontDisplay?: string;
  fontMono?: string;
}

export interface MotionPlanningConfig {
  beatIntervalSec: number;
  minBeatDuration: number;
  maxBeatDuration: number;
  jawDropperEverySec: number;
  useRegistryTransitions: boolean;
}

export interface ProjectConfig {
  originalUrl?: string;
  layout?: Partial<LayoutConfig>;
  brand?: BrandConfig;
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
    /** bottom placement offset px for short-form-split (default 220) */
    bottomOffset?: number;
  };
  backdrop?: {
    maxHeight?: number;
    /** Black overlay on backdrop, 0–1 (default 0 = full-opacity video) */
    dimOverlay?: number;
    /** Cover-fit backdrop to top panel only in split layout (default true) */
    upperPanelOnly?: boolean;
    /** CSS object-position on backdrop video (default center) */
    objectPosition?: string;
  };
  motion?: Partial<MotionPlanningConfig> & {
    /** Legacy — prefer brand.accent */
    accentColor?: string;
    /** Legacy — prefer brand.fontDisplay */
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

export type MotionGraphicTemplate =
  | 'stat-callout'
  | 'kinetic-type'
  | 'list-reveal'
  | 'stat-slam'
  | 'card-grid-3'
  | 'chromatic-slam'
  | 'stamp-reject'
  | 'contrast-flip'
  | 'badge-list'
  | 'hero-quote'
  | 'path-draw-icon'
  | 'counter-up';

/** top-half = May-shorts panel; upper-card = legacy small card; fullscreen = cover canvas */
export type MotionGraphicLayout = 'top-half' | 'upper-card' | 'fullscreen';

export type BeatEmphasis = 'normal' | 'hero';

export interface MotionGraphicSpec {
  template: MotionGraphicTemplate;
  props: Record<string, string>;
  layout?: MotionGraphicLayout;
  emphasis?: BeatEmphasis;
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

export interface FaceModeEntry {
  t: number;
  mode: 'BOTTOM' | 'FULLSCREEN';
}

export interface SeamWindow {
  start: number;
  end: number;
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

export interface MotionQualityIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  beatId?: string;
}

export interface SceneTransitionSpec {
  id: string;
  start: number;
  duration: number;
  relPath: string;
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
  /** Cover-fit backdrop to top panel in split layout (default true) */
  backdropUpperPanelOnly?: boolean;
  /** CSS object-position for backdrop video */
  backdropObjectPosition?: string;
  layout: LayoutConfig;
  brandBackground: string;
  faceModeSchedule: FaceModeEntry[];
  seamWindows: SeamWindow[];
  brollBeats: FulfilledBeat[];
  motionGraphicBeats: FulfilledBeat[];
  /** All visual beats sorted by time (MG + broll) for split-layout track 1 */
  sceneBeats: FulfilledBeat[];
  sceneTransitions?: SceneTransitionSpec[];
}
