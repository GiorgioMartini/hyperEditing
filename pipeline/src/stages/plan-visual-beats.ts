import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { artifacts } from '../artifacts.js';
import { log } from '../utils/logger.js';
import { ENV } from '../config.js';
import {
  formatTimedTranscript,
  resolveBeatTimings,
} from '../utils/transcript-anchor.js';
import { validateBeats, beatsAreValid } from '../utils/validate-beats.js';
import { getVideoDuration } from '../utils/video-helpers.js';
import type { PipelineConfig, StageResult, Transcript, VisualBeatsFile } from '../types.js';

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

    const timedTranscript = formatTimedTranscript(words);
    const fullText = extractTranscriptText(transcript);

    let videoDuration: number | undefined;
    const transparentPath = artifacts.transparentWebm(config);
    if (existsSync(transparentPath)) {
      videoDuration = await getVideoDuration(transparentPath);
    } else if (words.length > 0) {
      videoDuration = Math.max(...words.map((w) => w.end)) + 1;
    }

    const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `Analyze this video transcript and plan 2-4 visual beats (3-5 seconds each).

Each beat is either:
- "broll": literal physical scene where stock footage exists (pills, food, gym, ocean). Provide searchTerm (1-3 keywords for Pexels).
- "motion-graphic": stats, numbers, lists, comparisons, or abstract concepts. Provide motionGraphic with template, props, and layout.

Motion graphic templates:
- "stat-callout": props: headline (big number/phrase), subtext (short label). layout: "upper-card" (default)
- "stat-slam": props: headline (hero number/stat), subtext (short label). layout: "upper-card"
- "kinetic-type": props: headline (main phrase to animate). layout: "upper-card" or "fullscreen" for hero moments
- "list-reveal": props: headline (section title), items (comma-separated list, max 3 items). layout: "upper-card"

Rules:
- Mix broll and motion-graphic when both fit (aim for at least 1 of each if transcript allows)
- For EVERY beat provide anchorPhrase: an exact consecutive phrase copied verbatim from the transcript (3-8 words) marking when the topic is spoken
- timestamp is a rough hint only — code resolves exact timing from anchorPhrase
- id: beat-1, beat-2, etc.
- No overlapping beats
- Default motionGraphic.layout to "upper-card" (speaker stays visible)

Plain transcript:
${fullText}

Timed transcript (use for anchorPhrase alignment):
${timedTranscript}

Return JSON only:
{
  "beats": [
    {
      "id": "beat-1",
      "type": "motion-graphic",
      "timestamp": 3.2,
      "duration": 3.5,
      "anchorPhrase": "five years slower brain aging",
      "context": "five years slower brain aging",
      "motionGraphic": {
        "template": "stat-callout",
        "layout": "upper-card",
        "props": { "headline": "5 years", "subtext": "slower brain aging" }
      }
    },
    {
      "id": "beat-2",
      "type": "broll",
      "timestamp": 6.0,
      "duration": 4.0,
      "anchorPhrase": "multivitamin every day",
      "context": "multivitamin discussion",
      "searchTerm": "vitamins supplements"
    }
  ]
}`;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text()) as VisualBeatsFile;

    // Resolve anchor phrases to exact timestamps (pipeline-wide sync)
    parsed.beats = resolveBeatTimings(parsed.beats, words, { videoDuration });

    const issues = validateBeats(parsed.beats, words, { videoDuration });
    if (!beatsAreValid(issues)) {
      log.warn('Some beat validation issues remain — review visual-beats.json');
    }

    await writeFile(outputPath, JSON.stringify(parsed, null, 2));

    log.success(`Planned ${parsed.beats.length} visual beats (anchor-resolved)`);
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
