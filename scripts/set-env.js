/**
 * Vercel build hook — patches only the Gemini API key in environment.prod.ts.
 * Set GEMINI_API_KEY in Vercel → Settings → Environment Variables.
 * If the variable is absent (local build) the file is left unchanged.
 */
const fs = require('fs');
const path = require('path');

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.log('GEMINI_API_KEY not set — skipping environment patch');
  process.exit(0);
}

const envFile = path.join(__dirname, '../src/environments/environment.prod.ts');
const original = fs.readFileSync(envFile, 'utf8');
const patched = original.replace(
  /gemini:\s*\{[^}]*apiKey:\s*'[^']*'/,
  `gemini: {\n    apiKey: '${key}'`,
);
fs.writeFileSync(envFile, patched, 'utf8');
console.log('✓ Gemini API key injected from GEMINI_API_KEY env var');
