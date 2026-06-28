import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { artifacts } from '../artifacts.js';
import { computeBeatBudget, resolveMotionPlanning } from '../brand/resolve-motion.js';
import { loadProjectConfig } from '../project/load-project.js';
import { log } from '../utils/logger.js';
import { ENV } from '../config.js';
import {
  filterBeatsToSpeechWindow,
  formatTimedTranscript,
  getSpeechWindow,
  resolveBeatTimings,
} from '../utils/transcript-anchor.js';
import { validateBeats, beatsAreValid } from '../utils/validate-beats.js';
import {
  formatReplanGaps,
  shouldAutoReplan,
  validateMotionQuality,
} from '../utils/validate-motion-quality.js';
import { getVideoDuration } from '../utils/video-helpers.js';
import type { PipelineConfig, StageResult, Transcript, TranscriptWord, VisualBeat, VisualBeatsFile } from '../types.js';

const TEMPLATE_CATALOG = `
Motion graphic templates (pick semantically — not just "has number"):
- "stat-slam": hero number/stat with motion streak. props: headline, subtext. emphasis: hero for jaw-droppers
- "stat-callout": big number + label. props: headline, subtext
- "kinetic-type": phrase with word stagger. props: headline
- "list-reveal": title + bullets. props: headline, items (comma-separated, max 3)
- "card-grid-3": three benefit cards. props: headline, items (exactly 3 comma-separated)
- "chromatic-slam": word swap with glitch/chromatic ghost. props: setupWord, payoffWord, headline (setup phrase)
- "stamp-reject": X stamp over grid of chips. props: stampText, chips (comma-separated, max 9)
- "contrast-flip": word A morphs to word B. props: wordA, wordB
- "badge-list": numbered pills. props: headline, items (comma-separated, max 4)
- "hero-quote": large quote + attribution. props: quote, attribution
- "path-draw-icon": SVG X draw + label. props: label
- "counter-up": animated count. props: from, to, label
`;

function buildPlanningPrompt(
  fullText: string,
  timedTranscript: string,
  beatTarget: number,
  minDur: number,
  maxDur: number,
  speechStart: number,
  speechEnd: number,
  replanGaps?: string,
): string {
  const replanSection = replanGaps
    ? `\nQUALITY REPLAN — fix these issues:\n${replanGaps}\n`
    : '';

  return `Analyze this video transcript and plan ${beatTarget} visual beats (${minDur}-${maxDur} seconds each).

CRITICAL TIMING RULES:
- Plan beats ONLY while the speaker is talking (${speechStart.toFixed(1)}s – ${speechEnd.toFixed(1)}s)
- Do NOT place beats after the last spoken word at ${speechEnd.toFixed(1)}s
- anchorPhrase MUST be copied verbatim from the timed transcript JSON — consecutive "w" values, do not paraphrase
- timestamp is a rough hint only — code resolves exact timing from anchorPhrase

Each beat is either:
- "broll": literal physical scene where stock footage exists. Provide searchTerm (1-3 keywords for Pexels).
- "motion-graphic": stats, lists, comparisons, word slams, rejections, quotes. Provide motionGraphic.

${TEMPLATE_CATALOG}

Layout rules:
- "top-half" (default): scene in top panel, speaker visible below
- "fullscreen": hero moments only — use with emphasis: "hero"
- B-roll always uses top-half panel in split layout

Planning rules:
- Target ${beatTarget} beats within the speech window — no gap longer than 3 seconds during speech
- Alternate broll and motion-graphic where possible; never more than 2 consecutive same type
- At least one beat every 5 seconds (within speech) must have emphasis: "hero" with layout: "fullscreen"
- For EVERY beat: anchorPhrase — exact consecutive phrase from timed transcript (3-8 words)
- id: beat-1, beat-2, etc.
- No overlapping beats
- duration between ${minDur} and ${maxDur} seconds
${replanSection}
Plain transcript:
${fullText}

Timed transcript (copy anchorPhrase words from here):
${timedTranscript}

Return JSON only:
{
  "beats": [
    {
      "id": "beat-1",
      "type": "motion-graphic",
      "timestamp": 3.2,
      "duration": 2.5,
      "anchorPhrase": "exact phrase from transcript",
      "context": "brief description",
      "motionGraphic": {
        "template": "stat-slam",
        "layout": "top-half",
        "emphasis": "normal",
        "props": { "headline": "5 years", "subtext": "slower brain aging" }
      }
    }
  ]
}`;
}

function resolveBeatsFromTranscript(
  beats: VisualBeat[],
  words: TranscriptWord[],
  planning: ReturnType<typeof resolveMotionPlanning>,
  speechEnd: number,
  videoDuration?: number,
): VisualBeat[] {
  const resolved = resolveBeatTimings(beats, words, {
    videoDuration,
    speechEnd,
    preRollSec: 0.15,
    postHoldSec: 0.3,
    minDuration: planning.minBeatDuration,
    maxDuration: planning.maxBeatDuration,
  });
  return filterBeatsToSpeechWindow(resolved, speechEnd);
}

/** Stage 4: Plan visual beats (B-roll + motion graphics) from transcript. */
export async function planVisualBeats(config: PipelineConfig): Promise<StageResult> {
  const outputPath = artifacts.visualBeats(config);

  try {
    log.info('Analyzing transcript for visual beats...');

    const transcriptData = await readFile(artifacts.transcript(config), 'utf-8');
    const transcript = JSON.parse(transcriptData) as Transcript;
    const words = transcript.words ?? [];

    if (words.length === 0) {
      throw new Error('Transcript has no word-level timestamps');
    }

    const speechWindow = getSpeechWindow(words);
    const { speechStart, speechEnd, speechEndWithHold, spokenWordCount } = speechWindow;

    log.dim(
      `Speech window: ${speechStart.toFixed(2)}s – ${speechEnd.toFixed(2)}s (${spokenWordCount} words)`,
    );

    const timedTranscript = formatTimedTranscript(words);
    const fullText = extractTranscriptText(transcript);
    const project = await loadProjectConfig(config.projectDir);
    const planning = resolveMotionPlanning(project);

    let videoDuration: number | undefined;
    const transparentPath = artifacts.transparentWebm(config);
    if (existsSync(transparentPath)) {
      videoDuration = await getVideoDuration(transparentPath);
    } else if (words.length > 0) {
      videoDuration = speechEnd + 1;
    }

    const speechDuration = Math.max(speechEnd - speechStart, 1);
    const budget = computeBeatBudget(speechDuration, planning);
    const beatTarget = budget.target;

    const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const timingOpts = {
      videoDuration,
      speechEnd: speechEndWithHold,
      preRollSec: 0.15,
      postHoldSec: 0.3,
    };

    let prompt = buildPlanningPrompt(
      fullText,
      timedTranscript,
      beatTarget,
      planning.minBeatDuration,
      planning.maxBeatDuration,
      speechStart,
      speechEnd,
    );

    let result = await model.generateContent(prompt);
    let parsed = JSON.parse(result.response.text()) as VisualBeatsFile;

    parsed.beats = resolveBeatsFromTranscript(
      parsed.beats,
      words,
      planning,
      speechEndWithHold,
      videoDuration,
    );

    let qualityIssues = validateMotionQuality(parsed.beats, videoDuration ?? speechEnd, project, {
      words,
      speechEnd: speechEndWithHold,
    });

    if (shouldAutoReplan(qualityIssues)) {
      log.warn('Motion quality gaps detected — replanning once...');
      const gaps = formatReplanGaps(qualityIssues, speechEnd);
      prompt = buildPlanningPrompt(
        fullText,
        timedTranscript,
        beatTarget + 2,
        planning.minBeatDuration,
        planning.maxBeatDuration,
        speechStart,
        speechEnd,
        gaps,
      );
      result = await model.generateContent(prompt);
      parsed = JSON.parse(result.response.text()) as VisualBeatsFile;
      parsed.beats = resolveBeatsFromTranscript(
        parsed.beats,
        words,
        planning,
        speechEndWithHold,
        videoDuration,
      );
      qualityIssues = validateMotionQuality(parsed.beats, videoDuration ?? speechEnd, project, {
        words,
        speechEnd: speechEndWithHold,
      });
    }

    const issues = validateBeats(parsed.beats, words, timingOpts);
    if (!beatsAreValid(issues)) {
      log.warn('Some beat validation issues remain — review visual-beats.json');
    }

    if (qualityIssues.length > 0) {
      log.warn(`${qualityIssues.length} motion quality note(s) — see visual-beats.json review`);
    }

    await writeFile(outputPath, JSON.stringify(parsed, null, 2));

    log.success(
      `Planned ${parsed.beats.length} visual beats (speech-bounded, target ${beatTarget}, speech ${speechDuration.toFixed(1)}s)`,
    );
    log.dim(`Saved: ${outputPath}`);

    return { success: true, output: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Visual beat planning failed: ${message}`);
    return { success: false, error: message };
  }
}

function extractTranscriptText(transcript: Transcript): string {
  if (transcript.text) return transcript.text;

  if (transcript.words) {
    return transcript.words
      .filter((w) => w.type === 'word' || !w.type)
      .map((w) => w.text ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return JSON.stringify(transcript).slice(0, 4000);
}
