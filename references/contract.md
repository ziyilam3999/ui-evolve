# Tool & agent contract (data shapes + CLIs)

Every tool and the vision-judge read/write these exact shapes so the pieces compose. All tools are
single-file ESM Node scripts run from `tools/` (deps in `tools/package.json`). All write JSON with
2-space indent. All exit non-zero and write nothing partial-but-valid on hard failure (fail closed).

## Evidence layout

```
<target>/.ui-evolve/
  config.json                      # run config (repoPath, serve, pages, breakpoints, thresholds, epsilon, plateauRounds, maxRounds)
  run-<ISO>/
    changelog.md                   # human log: per-round candidate + decision + deltas
    SIGNOFF.md                     # assembled at convergence (baseline-vs-final + side-by-side)
    round-0/
      metrics.json
      shots/<page-slug>-<breakpoint>.png
      judge.json
      round.json
    round-1/
      metrics.json  shots/  judge.json  regression.json  round.json
    ...
```

`<page-slug>` = the route with each `/` replaced by `_`, then any leading `_` stripped, with the
root route `/` mapped to `home` (so `/` → `home`, `/about` → `about`, `/a/b` → `a_b`).
`<breakpoint>` = config breakpoint `name`.

## metrics.json  (written by measure.mjs; responsive block by capture.mjs, merged)

```json
{
  "url": "http://localhost:3000",
  "pages": {
    "/": {
      "lighthouse": { "performance": 0-100, "accessibility": 0-100, "bestPractices": 0-100, "seo": 0-100 },
      "axe": { "critical": 0, "serious": 0, "moderate": 0, "minor": 0,
               "violations": [ { "id": "...", "impact": "critical|serious|moderate|minor", "nodes": 1, "help": "..." } ] },
      "vitals": { "lcp": 0.0, "cls": 0.0, "inp": 0.0 },
      "responsive": { "mobile": { "overflowX": false, "clipped": false, "scrollW": 390, "clientW": 390 },
                      "tablet": { ... }, "desktop": { ... } }
    }
  },
  "errors": []
}
```

## judge.json  (written by the vision-judge subagent)

```json
{
  "pages": {
    "/": {
      "perBreakpoint": { "mobile": { "scores": {...}, "overall": 0.0, "notes": "..." }, "tablet": {...}, "desktop": {...} },
      "scores": { "hierarchy": 0-10, "spacing": 0-10, "alignment": 0-10, "consistency": 0-10, "affordance": 0-10, "readability": 0-10 },
      "overall": 0.0,
      "verdict": "one line",
      "betterThanPrev": true,            // true|false|"equal"  (omitted on round 0)
      "betterReason": "grounded in pixels"
    }
  },
  "candidates": [
    { "title": "...", "lens": "spacing", "rationale": "...", "effort": "S|M|L", "expectedImpact": "S|M|L" }
  ]
}
```

## regression.json  (written by regression.mjs)

```json
{
  "before": "round-0", "after": "round-1",
  "perShot": { "home-mobile.png": { "changedPct": 0.0, "changedPx": 0 }, ... },
  "maxChangedPct": 0.0,
  "note": "diff vs last ACCEPTED round; high change on an area the round did not intend to touch = unintended regression"
}
```

## round.json  (written by score.mjs)

```json
{
  "round": 1,
  "roundScore": 0-100,
  "components": { "objective": 0-100, "visual": 0-100 },
  "prevRoundScore": 0-100,
  "delta": 0.0,
  "thresholdsMet": false,
  "accepted": true,
  "decision": "accept|revert|baseline",
  "rationale": "why accepted/reverted",
  "candidate": { "title": "...", "lens": "..." }
}
```

### roundScore formula (score.mjs)

`roundScore = round( 0.5*objective + 0.5*visual , 1 )`, both normalized to 0–100:

- **objective (0–100)** = weighted Lighthouse (weights sum to **1.0**, so a perfect site scores 100):
  `0.35*LH.accessibility + 0.30*LH.performance + 0.20*LH.bestPractices + 0.15*LH.seo` **minus
  penalties**: `-15 per axe critical, -8 per serious, -10 per breakpoint with overflowX/clipped`.
  Clamp [0,100]. (Averaged across pages.) NOTE: a11y is weighted highest, matching the loop's intent.
- **visual (0–100)** = `judge.overall * 10` averaged across pages.

### accept / revert decision (score.mjs, `--prev <prev-accepted-round-dir>`)

ACCEPT iff ALL:
- `delta = roundScore - prevRoundScore > 0`
- no Lighthouse category dropped by more than `regressTolerance` (default 2) vs prev
- no NEW axe critical/serious vs prev
- `regression.maxChangedPct` within the change the round intended (heuristic: the judge's
  `betterThanPrev !== false`; a human/agent confirms large diffs are intentional)
- target `build` + test/smoke scripts exit 0

Otherwise REVERT. Round 0 is always `decision:"baseline"` (no accept/revert).

## CLIs

```
node tools/serve.mjs    --config <config.json> [--down]        # boot+poll (prints PID) | teardown
node tools/measure.mjs  --url <url> --pages "/,/about" --out <round-dir>
node tools/capture.mjs  --url <url> --pages "/" --config <config.json> --out <round-dir>
node tools/regression.mjs --before <round-dir> --after <round-dir> --out <round-dir>
node tools/score.mjs    --round <round-dir> [--prev <prev-accepted-round-dir>] [--config <config.json>]
```
