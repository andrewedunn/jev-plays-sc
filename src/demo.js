import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Recorder } from './record.js';
import { report } from './report.js';

// Visual fixture only. Never presented as a model run or a successful challenge.
const dir = resolve('runs/demo-' + new Date().toISOString().replaceAll(':', '-'));
mkdirSync(dir, { recursive: true });
const recorder = new Recorder(dir, { mode: 'synthetic-demo', model: 'synthetic fixture — not Jev', city: { name: 'Replay preview' }, rules: { autoInfrastructure: false } });
const map = { width: 40, height: 30, tiles: Array(1200).fill(0) };
for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) if (x < 5) map.tiles[y * 40 + x] = 2; else if ((x * 7 + y * 3) % 17 === 0) map.tiles[y * 40 + x] = 21;
const obs = { map, stats: { population: 0, funds: 20000, year: 1900, month: 1 }, summary: { analysis: { unpowered_buildings: 0, unroaded_zones: 0 } } };
recorder.snapshot(structuredClone(obs));
for (let i = 0; i < 24; i++) {
  const x = 8 + i, y = 14, decisionId = 'demo' + i;
  map.tiles[y * 40 + x] = 66;
  if (i % 4 === 0) for (let dy = 1; dy <= 3; dy++) for (let dx = 0; dx < 3; dx++) map.tiles[(y + dy) * 40 + x + dx] = 240;
  obs.stats.population += 80; obs.stats.funds -= 110;
  recorder.metrics.decisions++; recorder.metrics.placements++;
  recorder.event('actions', { decisionId, kind: 'result', move: { action: 'build_road', x, y }, success: true, synthetic: true });
  recorder.snapshot(structuredClone(obs), decisionId);
}
recorder.metrics.status = 'synthetic_demo'; recorder.save();
console.log(report(dir));
