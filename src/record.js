import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { quality } from './topology.js';

export class Recorder {
  constructor(dir, manifest) {
    if (existsSync(join(dir, 'manifest.json'))) throw new Error('Refusing to overwrite an existing run');
    mkdirSync(join(dir, 'snapshots'), { recursive: true });
    this.dir = dir; this.start = performance.now(); this.sequence = 0;
    this.manifest = { ...manifest, startedAt: new Date().toISOString() };
    this.write('manifest.json', this.manifest);
    this.metrics = { status: 'running', decisions: 0, mutations: 0, placements: 0, failures: 0, gameFundsSpent: 0, monthsAdvanced: 0, inputTokens: 0, outputTokens: 0, usageUnknownRequests: 0, estimatedInferenceUsd: 0, modelLatencyMs: [], waitMs: 0, milestones: [], development: { inputTokens: null, outputTokens: null, costUsd: null, source: 'Unavailable: import coding-agent usage separately; not included in inference cost.' } };
  }
  write(file, value) { writeFileSync(join(this.dir, file), JSON.stringify(value, null, 2) + '\n'); }
  event(stream, value) {
    const event = { sequence: ++this.sequence, timestamp: new Date().toISOString(), elapsedMs: performance.now() - this.start, ...value };
    appendFileSync(join(this.dir, `${stream}.jsonl`), JSON.stringify(event) + '\n');
    return event;
  }
  snapshot(observation, decisionId = null) {
    observation.quality = quality(observation);
    this.metrics.cityQuality = observation.quality;
    const event = this.event('observations', { observation, decisionId, estimatedInferenceUsd: this.metrics.estimatedInferenceUsd, inputTokens: this.metrics.inputTokens });
    this.write(`snapshots/${String(event.sequence).padStart(6, '0')}.json`, observation.map);
    this.metrics.finalStats = observation.stats;
    this.metrics.finalAnalysis = observation.summary.analysis;
    this.save();
  }
  save() { this.metrics.elapsedMs = performance.now() - this.start; this.write('metrics.json', this.metrics); }
}
