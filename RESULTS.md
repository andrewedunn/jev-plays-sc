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

## Road-policy correction after user review

The user rejected the first city as poor. That assessment is justified: the original placements were 66 wire tiles, 11 roads, 18 residential zones, one industrial zone, and one coal plant. Population and placement totals overstated the practical outcome.

Six additional segments tested connected streets, serviced zoning, demand facts, wire suppression, expansion access, and a minimum mix of zone types. Earlier policies stalled or enclosed the street; they are included rather than discarded. Policies changed between segments. The final segment's source hash matches controller commit `6c0264f`; earlier intermediate policies were not frozen as separate commits and have limited reproducibility. No existing buildings were demolished.

| Segment | City | Turns | Placements | Seconds | Estimated Jev USD | Final population | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| [streets-001](results/streets-001/metrics.json) | Rezoned Anthill | 20 | 19 | 61.1 | $0.004451 | 0 | interrupted |
| [streets-002](results/streets-002/metrics.json) | Orbital Yards | 34 | 16 | 174.3 | $0.007148 | 160 | interrupted |
| [streets-003](results/streets-003/metrics.json) | Orbital Yards | 14 | 1 | 91.9 | $0.002744 | 560 | interrupted |
| [streets-004](results/streets-004/metrics.json) | Coral Precinct | 12 | 11 | 38.2 | $0.002483 | 0 | interrupted |
| [streets-005](results/streets-005/metrics.json) | Coral Precinct | 1 | 0 | 4.1 | $0.000149 | 0 | model_stopped |
| [streets-006](results/streets-006/metrics.json) | Coral Precinct | 49 | 21 | 242.0 | $0.011067 | 1220 | limit_reached |

The final Coral Precinct state has **1,220 population, 21 connected road tiles, 10/10 zones on the main street, and zero wire tiles**. Counts: {'residential': 3, 'commercial': 1, 'industrial': 6}. Geometry predicts power connectivity for every zone. Native census shows developed residential and industrial activity; commercial activity remains zero. An empty shop zone is not evidence of a successful commercial district. The engine population indicator combines residential and employment activity: `(resPop + 8 * (comPop + indPop)) * 20`. The final census is 5 residential, 0 commercial, and 7 industrial units, so 1,220 comprises a 100-point residential contribution and a 1,120-point industrial contribution. It must not be described as 1,220 housed residents. The native map still shows mostly empty zones and two developed factories.

The final continuation took 242.0 seconds and $0.011067 estimated Jev inference. Coral Precinct's full construction also includes streets-004 and streets-005; the final continuation's time alone is not a from-scratch city-build time. All six correction segments cost $0.028043 and took 10.19 minutes of measured run time, excluding coding and gaps. streets-001 was manually reconciled after interruption; its elapsed time ends at the last saved observation.

This improves transport and removes the wire-spam failure, but it **does not meet the 5,000-person challenge or establish an awesome city**. The script now contributes substantial strategy: it constrains street growth, zoning access, minimum shops, and repeated waiting. Jev selects every executed placement, but this is a combined scripted policy and Jev experiment, not an unaided planning benchmark.

Reports open on their final frame, show street coverage and native census activity, and use the site's tile sprites with an offline color fallback. The latest development-token snapshot includes this correction work as of its timestamp; its subscription dollar cost remains unavailable. The local traffic regression and in-memory repair demonstration are documented in [diagnostics](diagnostics/README.md); their applicability to the deployed API remains unverified.
