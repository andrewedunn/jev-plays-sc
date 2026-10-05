import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameClient } from '../src/http.js';
import { candidates, validPlacement } from '../src/candidates.js';
import { run, qualifies, validateAnswer } from '../src/run.js';

export function fixture() {
  return { stats: { population: 0, funds: 20000, year: 1900, month: 1, budget: { taxRate: 7 }, demand: { residential: 1000, commercial: 0, industrial: 500 } }, summary: { buildings: [], infrastructure: { road_tiles: 0 }, analysis: { unpowered_buildings: 0, unroaded_zones: 0 } }, map: { width: 16, height: 12, tiles: Array(192).fill(0) } };
}
const directory = () => mkdtempSync(join(tmpdir(), 'jev-sc-test-'));
const answer = (choice, usage = { input_tokens: 100, output_tokens: 10 }) => ({ data: { model: 'jev-1.13.0', answers: { move: { type: 'choice', choice, confidence: 0.8, probabilities: { [choice]: 1 } } }, usage }, latencyMs: 10 });

test('explicit placements forbid trees, occupied footprints, edge overflow, and curved wire overlays', () => {
  const obs = fixture();
  obs.map.tiles[0] = 21; obs.map.tiles[1] = 68; obs.map.tiles[2] = 66;
  assert.equal(validPlacement(obs.map, 'build_coal_power', 0, 0), false);
  assert.equal(validPlacement(obs.map, 'build_road', 0, 0), false);
  assert.equal(validPlacement(obs.map, 'bulldoze', 0, 0), true);
  assert.equal(validPlacement(obs.map, 'build_power_line', 1, 0), false);
  assert.equal(validPlacement(obs.map, 'build_power_line', 2, 0), true);
  const menu = candidates(obs);
  assert.ok(Object.keys(menu).length <= 255);
  for (const move of Object.values(menu).filter(m => m.kind === 'place')) assert.equal(validPlacement(obs.map, move.action, move.x, move.y), true);
});
test('reserve filtering and blocked placements cannot sneak back into the menu', () => {
  const obs = fixture(); obs.stats.funds = 5004;
  const menu = candidates(obs, { blocked: new Set(['bulldoze:0:0']) });
  assert.equal(Object.values(menu).some(m => m.kind === 'place'), false);
});
test('invalid choice never becomes a gameplay mutation', () => {
  assert.throws(() => validateAnswer(answer('invented').data, { m0: { kind: 'stop' } }));
});
test('game client forces all auto flags false and forbids line helpers', async () => {
  let body;
  const game = new GameClient({ key: 'never-record-this', fetcher: async (_, options) => { body = JSON.parse(options.body); return new Response(JSON.stringify({ success: true })); } });
  await game.execute('city_test', { kind: 'place', action: 'build_road', x: 3, y: 2, auto_road: true });
  assert.deepEqual(body, { action: 'build_road', x: 3, y: 2, auto_bulldoze: false, auto_power: false, auto_road: false });
  await game.execute('city_test', { kind: 'place', action: 'build_power_line', x: 3, y: 2 });
  assert.equal(body.action, 'build_power_line');
  assert.throws(() => game.execute('city_test', { kind: 'place', action: 'build_road_line' }));
});
test('end-to-end accounting, trace linkage, failure recovery, and escaped report', async () => {
  let obs = fixture(), calls = 0, mutations = 0;
  const game = {
    call: async () => ({ id: 'city_test', name: '</script><script>alert(1)</script>', slug: 'test' }),
    observe: async () => structuredClone(obs),
    execute: async (_, move) => { mutations++; if (mutations === 1) return { success: false, cost: 1 }; obs.map.tiles[move.y * 16 + move.x] = 66; obs.stats.funds -= 10; return { success: true, cost: 10 }; },
  };
  const jev = { model: 'jev-1.13.0', decide: async payload => { calls++; if (!payload.questions.move) return answer('unused'); if ('build_road' in payload.questions.move.criteria) return answer('build_road'); return answer(Object.entries(payload.questions.move.criteria).find(([, m]) => m.action === 'build_road')[0]); } };
  const dir = directory();
  const { metrics } = await run({ game, jev, dir, config: { maxDecisions: 2 }, minActionMs: 0 });
  assert.equal(metrics.placements, 1); assert.equal(metrics.failures, 1); assert.equal(metrics.gameFundsSpent, 11);
  assert.equal(metrics.inputTokens, calls * 100); assert.equal(metrics.estimatedInferenceUsd, calls * 100 / 1e6 * 0.042);
  const actions = readFileSync(join(dir, 'actions.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(actions.filter(a => a.kind === 'intent').every(a => a.decisionId));
  const html = readFileSync(join(dir, 'report.html'), 'utf8');
  assert.ok(!html.includes('</script><script>alert(1)</script>'));
  const script = html.split('<script>').at(-1).split('</script>')[0];
  assert.doesNotThrow(() => new Function(script));
});
test('ambiguous mutation is reconciled and never retried', async () => {
  let mutations = 0, history = 0;
  const game = { call: async path => { if (path.includes('actions')) { history++; return []; } return { id: 'city_test' }; }, observe: async () => fixture(), execute: async () => { mutations++; throw new Error('timeout'); } };
  const jev = { model: 'test', decide: async p => answer(!p.questions.move ? 'probe' : 'build_road' in p.questions.move.criteria ? 'build_road' : Object.entries(p.questions.move.criteria).find(([, m]) => m.action === 'build_road')[0]) };
  const { metrics } = await run({ game, jev, dir: directory(), config: { maxDecisions: 5 }, minActionMs: 0 });
  assert.equal(mutations, 1); assert.equal(history, 1); assert.equal(metrics.status, 'mutation_unconfirmed');
});
test('no city is created when Jev preflight fails', async () => {
  let creates = 0;
  const game = { call: async () => { creates++; } };
  const jev = { model: 'test', decide: async () => { throw new Error('no auth'); } };
  const { metrics } = await run({ game, jev, dir: directory() });
  assert.equal(creates, 0); assert.equal(metrics.status, 'error');
});
test('challenge requires both measured connections and reserve', () => {
  const obs = fixture(); obs.stats.population = 5000;
  assert.equal(qualifies(obs, { targetPopulation: 5000, reserve: 5000 }), true);
  obs.summary.analysis.unpowered_buildings = 1;
  assert.equal(qualifies(obs, { targetPopulation: 5000, reserve: 5000 }), false);
});

test('challenge only passes after twelve observed survival months', async () => {
  const obs = fixture(); obs.stats.population = 5000;
  const game = { call: async () => ({ id: 'city_test' }), observe: async () => structuredClone(obs), execute: async () => { obs.stats.month++; return { success: true }; } };
  const jev = { model: 'test', decide: async p => answer(!p.questions.move ? 'probe' : 'advance' in p.questions.move.criteria ? 'advance' : Object.entries(p.questions.move.criteria).find(([, m]) => m.kind === 'advance')[0]) };
  const { metrics } = await run({ game, jev, dir: directory(), config: { maxMonths: 12 }, minAdvanceMs: 0 });
  assert.equal(metrics.status, 'challenge_passed'); assert.equal(metrics.survivalMonths, 12); assert.equal(metrics.monthsAdvanced, 12);
});

test('preflight hitting inference cap does not create a city', async () => {
  let calls = 0;
  const game = { call: async () => { calls++; } };
  const jev = { model: 'test', decide: async () => answer('probe') };
  const { metrics } = await run({ game, jev, dir: directory(), config: { maxInferenceUsd: 0.000001 } });
  assert.equal(calls, 0); assert.equal(metrics.status, 'limit_reached');
});
