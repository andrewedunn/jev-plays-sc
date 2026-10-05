# First live experiment

Four sequential pilot segments continued the same city, [Helix Foundry](https://hallucinatingsplines.com/cities/helix-foundry-5b2295), on October 4, 2026 (America/Chicago). These are development experiments with policy changes between segments, not independent benchmark trials. No generative model chose gameplay moves.

| Segment | Gameplay turns | Successful placements | Elapsed seconds | Estimated Jev USD | Final population | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| [pilot-001](results/pilot-001/manifest.json) | 2 | 1 | 7.8 | $0.001000 | 0 | mutation_unconfirmed |
| [pilot-002](results/pilot-002/manifest.json) | 20 | 6 | 95.4 | $0.010173 | 0 | limit_reached |
| [pilot-003](results/pilot-003/manifest.json) | 80 | 80 | 210.5 | $0.018562 | 0 | limit_reached |
| [pilot-004](results/pilot-004/manifest.json) | 53 | 10 | 302.4 | $0.013701 | 480 | limit_reached |

Total: **155 gameplay turns, 97 successful placements, 10.27 minutes of run wall time, and $0.043436 estimated Jev inference**. Run wall time excludes development, tuning, and time between segments. Each gameplay turn in the later policy uses two Jev calls; preflight usage is also included. The initial standalone doctor probe was not recorded and is excluded from this total.

Final population: **480**, peak population: **540**, funds: **$14691**. Final API analysis: 0 unpowered buildings and 8 unroaded zones. The 5,000-person challenge and 12-month survival requirement were **not achieved**. Visual appeal has not been independently scored.

## What happened

- Pilot 001 established coal power but a runner guard incorrectly rejected the single-tile power-line action before HTTP dispatch. Conservative reconciliation ran and the session stopped. This guard is fixed and regression-tested.
- Pilot 002 used a large combined menu. Jev built roads/wires and repeatedly advanced without zoning. Population remained zero.
- Pilot 003 separated action-category and placement choices. Jev zoned homes and industry, but repeatedly added wires while powered flags remained stale because no months were advanced.
- Pilot 004 supplied explicit simulation freshness and a computed cardinal power-connection graph. Jev advanced the city and population grew. It still needs better job balance and road connections; this is evidence of a working runner, not an awesome completed city.

## Evidence

Each results folder contains the complete candidate menus and model responses, action intents and results, observations, metrics, and a self-contained report.html. Download/open report.html locally, or serve results with python3 -m http.server. No model requests or mutations occur during replay. Credentials were scanned and excluded. Exact policy source hashes are recorded for pilots 003 and 004.

Development token accounting is a snapshot in the latest metrics, obtained from local Codex token_count deltas since “Let's roll.” It includes repeated/cached context and excludes later work after its timestamp. It is a single project-development snapshot, not a per-segment charge, so do not add it across segments. Development dollar cost cannot be derived from those counters and remains null. The private session transcript is not published.

## Next experiment

Freeze the policy, improve transport and job-balance evidence, then test fixed seeds from empty cities. Compare against a disclosed scripted baseline before claiming speed or quality gains. Safe independent-placement batching remains unimplemented.
