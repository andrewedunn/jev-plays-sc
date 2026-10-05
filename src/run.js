import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { candidates, decisionPayload, categoryPayload, validPlacement, TOOLS } from './candidates.js';
import { HttpError } from './http.js';
import { Recorder } from './record.js';
import { report } from './report.js';

export const defaults = { seed: 42, targetPopulation: 5000, reserve: 5000, maxDecisions: 300, maxMonths: 120, maxMinutes: 20, maxInferenceUsd: 1, pricePerMillion: 0.042, perTool: 10 };

export function validateAnswer(response, menu) {
  const a = response?.answers?.move;
  if (a?.type !== 'choice' || !Object.hasOwn(menu, a.choice) || !Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1) throw new Error('Invalid Jev choice; no gameplay mutation executed');
  return menu[a.choice];
}

export async function run({ game, jev, dir, cityId, config = {}, signal, wait = sleep, minActionMs = 2050, minAdvanceMs = 6100, mode = 'live' }) {
  const settings = { ...defaults, ...config };
  const sourceHash = createHash('sha256');
  for (const file of ['run.js', 'candidates.js', 'http.js']) sourceHash.update(readFileSync(new URL(file, import.meta.url)));
  const recorder = new Recorder(dir, { ...settings, mode, model: jev.model, policyVersion: '0.2.0', sourceSha256: sourceHash.digest('hex'), rules: { autoInfrastructure: false, linesAndRectangles: false, batching: false }, pricing: { usdPerMillionInput: settings.pricePerMillion, source: 'https://docs.typesafe.ai/models', checkedOn: '2026-10-04', billing: 'Estimate from returned usage; unknown attempts excluded and counted.' } });
  const metrics = recorder.metrics;
  let city, observed, recent = [], survivalMonths = null, lastAction = -Infinity, lastAdvance = -Infinity, mutationsSinceAdvance = 0;
  const blocked = new Set();
  const interrupted = () => signal?.aborted || performance.now() - recorder.start >= settings.maxMinutes * 60000;
  const delay = async ms => {
    if (ms <= 0) return;
    const before = performance.now();
    await wait(ms, undefined, { signal });
    metrics.waitMs += performance.now() - before;
  };
  try {
    // Verify Jev credentials before creating a public city or spending game funds.
    let probe;
    try { probe = await jev.decide({ state: 'Credential connection check before this run.', questions: { connected: { type: 'noul', instructions: 'Is this a connection check?' } } }); }
    catch (error) { metrics.usageUnknownRequests++; throw error; }
    recorder.event('requests', { kind: 'jev_preflight', response: probe.data, latencyMs: probe.latencyMs });
    account(probe, metrics, settings);
    if (interrupted() || metrics.estimatedInferenceUsd >= settings.maxInferenceUsd) { metrics.status = 'limit_reached'; return { metrics, manifest: recorder.manifest, dir }; }
    if (cityId) city = await game.call(`/v1/cities/${cityId}`);
    else {
      recorder.event('actions', { kind: 'city_creation_intent', seed: settings.seed });
      city = await game.call('/v1/cities', { seed: settings.seed });
    }
    city.id = city.id ?? cityId;
    if (!/^city_[a-zA-Z0-9]+$/.test(city.id ?? '')) throw new Error('Invalid city identifier');
    recorder.manifest.city = { id: city.id, name: city.name, slug: city.slug, url: city.slug ? `https://hallucinatingsplines.com/cities/${city.slug}` : null };
    recorder.write('manifest.json', recorder.manifest);
    console.log(`City: ${city.name ?? city.id} ${recorder.manifest.city.url ?? ''}`);
    observed = await game.observe(city.id);
    recorder.snapshot(observed);
    while (metrics.decisions < settings.maxDecisions && metrics.monthsAdvanced < settings.maxMonths && !interrupted() && metrics.estimatedInferenceUsd < settings.maxInferenceUsd) {
      if (survivalMonths === null && qualifies(observed, settings)) {
        survivalMonths = 0;
        metrics.milestones.push({ name: 'target_reached', elapsedMs: performance.now() - recorder.start, months: metrics.monthsAdvanced });
      }
      const allMoves = candidates(observed, { ...settings, monthsRemaining: settings.maxMonths - metrics.monthsAdvanced, blocked, survival: survivalMonths !== null });
      const decisionId = `d${metrics.decisions + 1}`;
      const context = { ...settings, recent, survival: survivalMonths !== null, mutationsSinceAdvance };
      const category = categoryPayload(observed, allMoves, context);
      recorder.event('decisions', { decisionId: `${decisionId}:category`, kind: 'request', payload: category });
      let categoryResponse;
      try { categoryResponse = await jev.decide(category); }
      catch (error) { metrics.usageUnknownRequests++; throw error; }
      account(categoryResponse, metrics, settings);
      recorder.event('decisions', { decisionId: `${decisionId}:category`, kind: 'response', response: categoryResponse.data, latencyMs: categoryResponse.latencyMs });
      const selectedCategory = categoryResponse.data?.answers?.move?.choice;
      if (!Object.hasOwn(category.questions.move.criteria, selectedCategory)) throw new Error('Invalid Jev action category');
      const menu = Object.fromEntries(Object.entries(allMoves).filter(([, move]) => (move.action ?? move.kind) === selectedCategory));
      if (interrupted() || metrics.estimatedInferenceUsd >= settings.maxInferenceUsd) break;
      const payload = decisionPayload(observed, menu, context);
      recorder.event('decisions', { decisionId, kind: 'request', payload });
      let response;
      try { response = await jev.decide(payload); }
      catch (error) {
        // A 429 rejects the request; one bounded retry. Ambiguous failures stop.
        if (error instanceof HttpError && error.status === 429) {
          recorder.event('requests', { kind: 'jev_rate_limit', decisionId, status: 429 });
          const seconds = retrySeconds(error.retryAfter);
          await delay(seconds * 1000);
          if (interrupted()) break;
          response = await jev.decide(payload);
        } else { metrics.usageUnknownRequests++; throw error; }
      }
      account(response, metrics, settings);
      metrics.decisions++;
      recorder.event('decisions', { decisionId, kind: 'response', response: response.data, latencyMs: response.latencyMs });
      const move = validateAnswer(response.data, menu);
      if (move.kind === 'stop') { metrics.status = 'model_stopped'; break; }
      if (interrupted()) break;
      // Model was already charged. Do not perform further mutations after cost cap.
      if (metrics.estimatedInferenceUsd >= settings.maxInferenceUsd) break;
      if (move.kind === 'place' && (observed.stats.funds - TOOLS[move.action].cost < settings.reserve || !validPlacement(observed.map, move.action, move.x, move.y))) throw new Error('Placement failed local revalidation');
      const isAdvance = move.kind === 'advance';
      const gap = isAdvance ? minAdvanceMs : minActionMs;
      await delay(gap - (performance.now() - (isAdvance ? lastAdvance : lastAction)));
      if (interrupted()) break;
      recorder.event('actions', { decisionId, kind: 'intent', move });
      let result;
      const started = performance.now();
      try { result = await game.execute(city.id, move); }
      catch (error) {
        recorder.event('actions', { decisionId, kind: 'unconfirmed', move, error: safeError(error) });
        // Reconcile by reading state and server action history. Never retry here.
        try {
          recorder.event('reconciliation', { decisionId, serverActions: await game.call(`/v1/cities/${city.id}/actions?limit=50`) });
          observed = await game.observe(city.id); recorder.snapshot(observed, decisionId);
        } catch { recorder.event('reconciliation', { decisionId, failed: true }); }
        metrics.status = 'mutation_unconfirmed';
        throw error;
      }
      const latencyMs = performance.now() - started;
      if (isAdvance) lastAdvance = performance.now(); else lastAction = performance.now();
      metrics.mutations++;
      mutationsSinceAdvance = isAdvance ? 0 : mutationsSinceAdvance + 1;
      const success = result.success !== false && !result.error;
      recorder.event('actions', { decisionId, kind: 'result', move, result, success, latencyMs });
      if (!success) {
        metrics.failures++;
        if (move.kind === 'place') blocked.add(`${move.action}:${move.x}:${move.y}`);
      } else {
        if (move.kind === 'place') metrics.placements++;
        if (isAdvance) { metrics.monthsAdvanced += move.months; if (survivalMonths !== null) survivalMonths += move.months; }
      }
      metrics.gameFundsSpent += Number.isFinite(result.cost) ? result.cost : 0;
      recent = [...recent.slice(-7), { move, success }];
      observed = await game.observe(city.id);
      recorder.snapshot(observed, decisionId);
      console.log(`${decisionId} ${move.kind === 'place' ? `${move.action} (${move.x},${move.y})` : move.kind} | pop ${observed.stats.population} | funds ${observed.stats.funds} | Jev $${metrics.estimatedInferenceUsd.toFixed(5)}`);
      if (observed.stats.funds < settings.reserve) { metrics.status = 'reserve_breached'; break; }
      if (survivalMonths !== null && !qualifies(observed, settings)) { metrics.status = 'survival_failed'; break; }
      if (survivalMonths >= 12) { metrics.status = 'challenge_passed'; break; }
      if (metrics.failures >= 10) { metrics.status = 'failure_limit'; break; }
    }
    if (metrics.status === 'running') metrics.status = signal?.aborted ? 'interrupted' : 'limit_reached';
  } catch (error) {
    if (metrics.status === 'running') metrics.status = signal?.aborted ? 'interrupted' : 'error';
    metrics.error = safeError(error);
  } finally {
    metrics.survivalMonths = survivalMonths;
    metrics.finishedAt = new Date().toISOString();
    recorder.save();
    report(dir);
  }
  return { metrics, manifest: recorder.manifest, dir };
}

function safeError(error) {
  // Do not write arbitrary upstream response bodies, headers, URLs or credentials.
  if (error instanceof HttpError) return `HTTP ${error.status}`;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return error.name;
  return error.message?.startsWith('Invalid') || error.message?.startsWith('Placement') ? error.message : 'Request or runner failed; see status and reconciliation logs.';
}
export function retrySeconds(value) {
  const number = Number(value);
  const ms = Date.parse(value);
  return Math.max(1, Math.min(60, value && Number.isFinite(number) ? number : Number.isFinite(ms) ? (ms - Date.now()) / 1000 : 5));
}
function account(response, metrics, settings) {
  const usage = response.data?.usage;
  if (!Number.isInteger(usage?.input_tokens) || usage.input_tokens < 0 || !Number.isInteger(usage?.output_tokens) || usage.output_tokens < 0) {
    metrics.usageUnknownRequests++;
    throw new Error('Invalid token usage; cost accounting cannot continue');
  }
  metrics.inputTokens += usage.input_tokens;
  metrics.modelRequests = (metrics.modelRequests ?? 0) + 1;
  metrics.outputTokens += usage.output_tokens;
  metrics.estimatedInferenceUsd = metrics.inputTokens / 1e6 * settings.pricePerMillion;
  metrics.modelLatencyMs.push(response.latencyMs);
}
export function qualifies({ stats, summary }, { targetPopulation, reserve }) {
  return stats.population >= targetPopulation && stats.funds >= reserve && summary.analysis?.unpowered_buildings === 0 && summary.analysis?.unroaded_zones === 0;
}
