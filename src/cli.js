import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { GameClient, JevClient } from './http.js';
import { run, defaults } from './run.js';
import { report } from './report.js';
import { Recorder } from './record.js';

const { values, positionals } = parseArgs({ options: {
  seed: { type: 'string' }, city: { type: 'string' }, output: { type: 'string' },
  new: { type: 'boolean' },
  'max-decisions': { type: 'string' }, 'max-months': { type: 'string' }, 'max-minutes': { type: 'string' },
  'max-cost': { type: 'string' }, target: { type: 'string' }, reserve: { type: 'string' },
}, allowPositionals: true });
const command = positionals[0] ?? 'run';
if (command === 'report') {
  if (!positionals[1]) throw new Error('Usage: npm run report -- runs/<run-id>');
  console.log(report(resolve(positionals[1])));
} else {
  const key = process.env.TYPESAFE_API_KEY, hsKey = process.env.HS_API_KEY;
  if (!key || !hsKey) { console.error('Fill TYPESAFE_API_KEY and HS_API_KEY in private .env. No city was created.'); process.exitCode = 1; }
  else {
    const game = new GameClient({ key: hsKey }), jev = new JevClient({ key });
    if (command === 'doctor') {
      const results = await Promise.allSettled([game.call('/health'), game.call('/v1/cities?mine=true'), jev.decide({ state: 'Connection check', questions: { connected: { type: 'noul', instructions: 'Is this a connection check?' } } })]);
      for (const [i, result] of results.entries()) console.log(['Game health', 'Game authentication', 'Jev authentication (billable tiny probe)'][i], result.status === 'fulfilled' ? 'OK' : `FAILED ${result.reason?.status ?? result.reason?.name ?? 'request'}`);
      const recorder = new Recorder(resolve(`runs/doctor-${new Date().toISOString().replaceAll(':', '-')}`), { mode: 'diagnostic', model: jev.model });
      const result = results[2];
      if (result.status === 'fulfilled') {
        recorder.event('requests', { kind: 'jev_diagnostic', response: result.value.data, latencyMs: result.value.latencyMs });
        recorder.metrics.inputTokens = result.value.data.usage?.input_tokens ?? 0;
        recorder.metrics.outputTokens = result.value.data.usage?.output_tokens ?? 0;
        recorder.metrics.estimatedInferenceUsd = recorder.metrics.inputTokens / 1e6 * defaults.pricePerMillion;
      } else recorder.metrics.usageUnknownRequests++;
      recorder.metrics.status = results.every(r => r.status === 'fulfilled') ? 'diagnostic_passed' : 'diagnostic_failed';
      recorder.save();
      if (results.some(r => r.status === 'rejected')) process.exitCode = 1;
    } else if (command === 'run') {
      const config = {};
      for (const [flag, name] of Object.entries({ seed: 'seed', 'max-decisions': 'maxDecisions', 'max-months': 'maxMonths', 'max-minutes': 'maxMinutes', 'max-cost': 'maxInferenceUsd', target: 'targetPopulation', reserve: 'reserve' })) {
        if (values[flag] === undefined) continue;
        const n = Number(values[flag]);
        if (!Number.isFinite(n) || n < 0 || (['seed', 'maxDecisions', 'maxMonths', 'targetPopulation'].includes(name) && !Number.isInteger(n))) throw new Error(`Invalid --${flag}`);
        config[name] = n;
      }
      if ((config.maxInferenceUsd ?? defaults.maxInferenceUsd) <= 0) throw new Error('max-cost must be positive');
      const signal = new AbortController();
      process.once('SIGINT', () => signal.abort());
      const dir = resolve(values.output ?? `runs/${new Date().toISOString().replaceAll(':', '-')}`);
      if (values.new && values.city) throw new Error('Use --new or --city, not both');
      const result = await run({ game, jev, dir, cityId: values.new ? undefined : (values.city ?? process.env.HS_CITY_ID) || undefined, config, signal: signal.signal });
      console.log(`Status: ${result.metrics.status}\nReplay: ${dir}/report.html`);
      if (['error', 'mutation_unconfirmed'].includes(result.metrics.status)) process.exitCode = 1;
    } else throw new Error('Commands: run, doctor, report');
  }
}
