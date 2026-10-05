// Import token counters only, never the underlying chat, environment or tool outputs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { report } from './report.js';
const [sessionPath, outputPath, startMessage = "Let's roll."] = process.argv.slice(2);
if (!sessionPath || !outputPath) throw new Error('Usage: node src/development.js SESSION_JSONL OUTPUT_JSON [START_MESSAGE]');
let previous = null, baseline = null, latest = null, found = false, timestamp;
for (const line of readFileSync(sessionPath, 'utf8').split('\n').filter(Boolean)) {
  const event = JSON.parse(line), p = event.payload;
  if (event.type === 'event_msg' && p?.type === 'user_message' && p.message?.trim() === startMessage) { baseline = previous; found = true; }
  if (event.type === 'event_msg' && p?.type === 'token_count' && p.info?.total_token_usage) {
    previous = p.info.total_token_usage;
    if (found) { latest = previous; timestamp = event.timestamp; }
  }
}
if (!found || !baseline || !latest) throw new Error('Exact start marker or usage counters unavailable');
const delta = {};
for (const key of ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens']) delta[key] = latest[key] - baseline[key];
const development = { ...delta, asOf: timestamp, complete: false, costUsd: null, source: 'Codex cumulative token_count delta since exact start message. Includes repeated context and cached input; snapshot excludes subsequent work. Subscription dollar attribution unavailable.' };
const output = resolve(outputPath);
writeFileSync(output, JSON.stringify(development, null, 2) + '\n');
console.log(output);
// Optionally attach the snapshot to a finished run, preserving separate cost fields.
const metricsPath = join(resolve(outputPath, '..'), 'metrics.json');
if (existsSync(metricsPath)) {
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  if (metrics.status === 'running') throw new Error('Wait until the run finishes before attaching development usage');
  metrics.development = development;
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n');
  report(resolve(outputPath, '..'));
}
