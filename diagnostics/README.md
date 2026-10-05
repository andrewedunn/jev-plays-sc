# Local traffic regression

This diagnostic imports an existing Hallucinating Splines checkout. It does not bundle engine code, modify source files, call the API, or deploy anything. Requires Node 22 with `registerHooks` support (22.15 or newer).

```
node diagnostics/traffic-route.mjs /path/to/hallucinatingsplines
node diagnostics/traffic-route.mjs /path/to/hallucinatingsplines --patched
```

Observed October 5, 2026 UTC: the first command returns `routeFound:false` for a deterministic two-tile road with an adjacent industrial destination. The second returns `true` after applying these three corrections only in the module loader:

- Construct the starting Position with its x and y coordinates, rather than a Position object.
- Move from `drivePos` instead of the undefined `pos` variable.
- Store backtracking Positions with their x and y coordinates.

The local Position constructor accepts `(x,y)` and has no copy constructor. This confirms a local engine regression. Whether the deployed API has the same code remains unverified. Fixing this route alone does not prove city-wide employment or population growth.
