import { performance } from 'node:perf_hooks';

export class HttpError extends Error {
  constructor(status, retryAfter) {
    super(`HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// No implicit retries: especially never retry an ambiguous game mutation.
export async function request(base, path, { key, body, fetcher = fetch, timeoutMs = 30000 } = {}) {
  const start = performance.now();
  const response = await fetcher(new URL(path, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'X-HS-Client': 'jev-plays-sc' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new HttpError(response.status, response.headers.get('retry-after'));
  return { data: await response.json(), latencyMs: performance.now() - start };
}

export class GameClient {
  constructor({ base = 'https://api.hallucinatingsplines.com', key, fetcher } = {}) {
    this.base = base; this.key = key; this.fetcher = fetcher;
  }
  async call(path, body) { return (await request(this.base, path, { key: this.key, body, fetcher: this.fetcher })).data; }
  async observe(id) {
    const values = await Promise.all([this.call(`/v1/cities/${id}/stats`), this.call(`/v1/cities/${id}/map/summary`), this.call(`/v1/cities/${id}/map`)]);
    return { stats: values[0], summary: values[1], map: values[2] };
  }
  execute(id, move) {
    if (move.kind === 'advance') return this.call(`/v1/cities/${id}/advance`, { months: move.months });
    if (move.kind === 'budget') return this.call(`/v1/cities/${id}/budget`, move.settings);
    if (move.kind !== 'place' || /^build_(road|rail|wire)_(line|rect)$/.test(move.action)) throw new Error('Unsupported move');
    return this.call(`/v1/cities/${id}/actions`, { action: move.action, x: move.x, y: move.y, auto_bulldoze: false, auto_power: false, auto_road: false });
  }
}

export class JevClient {
  constructor({ key, model = 'jev-1.13.0', base = 'https://api.typesafe.ai', fetcher } = {}) {
    this.key = key; this.model = model; this.base = base; this.fetcher = fetcher;
  }
  async decide(payload) { return request(this.base, '/v1/systemone', { key: this.key, body: { model: this.model, ...payload }, fetcher: this.fetcher }); }
}
