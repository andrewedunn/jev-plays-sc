# Jev Plays SimCity

Jev chooses every placement in a headless Micropolis city through [Hallucinating Splines](https://hallucinatingsplines.com). Scripts handle observation, legal move generation, computed connection evidence, HTTP execution, and accounting. No auto roads, auto power, auto bulldozing, line tools, or rectangle tools. No generative model plays the city.

## Run

Requires Node.js 22 or newer. No dependencies to install.

1. Copy .env.example to .env and fill TYPESAFE_API_KEY and HS_API_KEY.
2. Run npm run doctor to check both credentials (makes a tiny billable Jev request).
3. Run npm start -- --seed 42 --max-decisions 300 --max-minutes 20 --max-cost 1.
4. Open the report.html path printed at completion.

To continue the same city, use npm start -- --city city_YOUR_ID. Each invocation without --city or HS_CITY_ID creates exactly one new city after Jev preflight succeeds. Never rerun a failed city creation blindly: inspect your city list first. An ambiguous gameplay mutation stops the run and attempts reconciliation; it is never automatically retried.

Ctrl-C saves the partial report after the current in-flight request completes. Gameplay logs are append-only and existing run folders cannot be reused: choose a new --output path for every run. Reports and separate accounting snapshots can be rebuilt afterward.

## Rules and challenge

The default challenge is 5,000 population, at least 5,000 game dollars, no reported unpowered buildings or unroaded zones, then another 12 simulated months meeting those conditions. These connectivity indicators are the game API summaries, not an independent path-routing proof. Visual quality is a separate human assessment. Defaults stop at 300 gameplay decisions, 120 simulated months, 20 real minutes, 10 failed actions, or a one-dollar Jev inference threshold.

A cost threshold is a stop threshold, not a hard billing limit: the final in-flight request can exceed it. Failed requests with unknown usage are counted and excluded from the cost estimate. Game fund reserve filters known placement costs; simulation expenses can still breach the reserve and stop the run.

## How much intelligence is in the harness?

Every gameplay mutation has recorded Jev Choice decisions: first an action category, then a complete move within that category. Each option combines a complete action and location. Code validates footprints, calculates distances and costs, filters affordability, and samples up to ten candidates per tool. Established cities search within 12 Manhattan tiles of a building center. The menu includes nearby and spatially spread alternatives, four tax rates, one-month advance, and stop. State includes mutations since simulation and a predicted cardinal power-connection graph so Jev can distinguish stale power flags from missing connections. This candidate policy shapes the outcome and is published for scrutiny. There is no city blueprint or automatic path construction.

Version 0.2 is sequential and uses conservative land placements. Trees and rubble require explicit bulldoze decisions. Roads and wires can use compatible straight crossings; bridges, rail, airports, seaports, stadiums, nuclear power, and service-funding choices are outside the first policy. Buildings use native multi-tile footprints and grow through simulation. No per-pixel control of zone development is claimed. Safe batching and matched-seed baselines are future work.

## Evidence and cost

Each run contains manifest.json, decisions.jsonl, actions.jsonl, observations.jsonl, metrics.json, snapshots, and a standalone report.html. Logs include complete candidate menus, probabilities, confidence, model usage, mutation intents/results, game-fund costs, and map observations. Reports replay recorded state without model calls.

The pinned model is jev-1.13.0. The published direct TypeSafe price checked October 4, 2026 is 0.042 USD per million input tokens, output free. Inference estimates use returned API usage and the dated manifest price, not a provider invoice. See https://docs.typesafe.ai/models and https://docs.typesafe.ai/api.

Coding-agent development tokens and cost are separate. Import a local Codex session snapshot with node src/development.js SESSION_JSONL runs/RUN_ID/development.json. Only token-counter deltas since the exact start message are retained; the private chat and tool outputs are never copied. Input totals include repeated and cached context. Development dollar cost remains null when billing attribution is unavailable. Infrastructure costs are not included.

The .env and all runs are ignored by Git. Keys are only sent in authorization headers and never intentionally logged. Audit logs before explicitly publishing a run; they may contain city names and public game data.

## Verify and preview

npm test runs integration and safety checks with controlled fixtures; it does not prove Jev can build a successful city. npm run demo creates a clearly labeled synthetic replay, with no API calls. npm run report -- runs/RUN_ID rebuilds a report from existing evidence.

## Project files

- src/candidates.js: disclosed candidate policy and placement checks
- src/http.js: game and Jev clients without implicit mutation retries
- src/run.js: gameplay loop, challenge, limits, and reconciliation
- src/record.js: append-only logs and metrics
- src/report.js: self-contained interactive replay
- test/runner.test.js: meaningful failure-path and accounting checks

Built as an API client; no Micropolis engine code is bundled.

## Publish run evidence

After a run finishes, node --env-file=.env src/publish-run.js runs/RUN_ID results/RUN_ID exports an allowlist of game evidence and scans it for both exact API keys. The private session transcript, .env, and redundant snapshot files are excluded. Review the export, then commit it.
