import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from workspace root
const envPath = resolve(__dirname, '../../.env');
config({ path: envPath });

export const ENV = {
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  PEXELS_API_KEY: process.env.PEXELS_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
};

export const PATHS = {
  WORKSPACE_ROOT: resolve(__dirname, '../..'),
  VIDEO_PROJECTS: resolve(__dirname, '../../video-projects'),
  VIDEO_USE_HELPERS: resolve(process.env.HOME!, 'Developer/video-use/helpers'),
};

export function validateEnv(): void {
  const missing: string[] = [];
  
  if (!ENV.ELEVENLABS_API_KEY) missing.push('ELEVENLABS_API_KEY');
  if (!ENV.PEXELS_API_KEY) missing.push('PEXELS_API_KEY');
  if (!ENV.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nCheck ${envPath}`);
  }
}
