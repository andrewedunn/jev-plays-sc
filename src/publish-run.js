// Explicitly export public game evidence only, never credentials or private chat.
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
const [sourcePath, destinationPath] = process.argv.slice(2);
if (!sourcePath || !destinationPath) throw new Error('Usage: node --env-file=.env src/publish-run.js runs/RUN_ID results/RUN_ID');
const source = resolve(sourcePath), destination = resolve(destinationPath);
const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
const metrics = JSON.parse(readFileSync(join(source, 'metrics.json'), 'utf8'));
if (manifest.mode !== 'live' || metrics.status === 'running') throw new Error('Only finished live runs can be published');
if (existsSync(destination)) throw new Error('Refusing to overwrite existing published evidence');
const allowed = new Set(['manifest.json', 'metrics.json', 'decisions.jsonl', 'actions.jsonl', 'requests.jsonl', 'reconciliation.jsonl', 'observations.jsonl', 'report.html']);
const files = readdirSync(source).filter(file => allowed.has(file));
const secrets = [process.env.HS_API_KEY, process.env.TYPESAFE_API_KEY].filter(Boolean);
if (secrets.length !== 2) throw new Error('Load both credentials locally to scan exports for exact secret values');
const data = files.map(file => [file, readFileSync(join(source, file), 'utf8')]);
for (const [file, text] of data) {
  if (secrets.some(secret => text.includes(secret)) || /\bhs_[a-zA-Z0-9]{20,}/.test(text)) throw new Error(`Credential scan failed for ${basename(file)}`);
}
mkdirSync(destination, { recursive: true });
for (const [file, text] of data) writeFileSync(join(destination, file), text);
console.log(`Exported ${files.length} scanned public evidence files to ${destination}`);
