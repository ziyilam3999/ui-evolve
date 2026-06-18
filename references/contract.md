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
      "scores": {
        "hierarchy": 0-10, "spacing": 0-10, "alignment": 0-10, "consistency": 0-10, "affordance": 0-10, "readability": 0-10,
        "depth": 0-10, "cohesion": 0-10, "rhythm": 0-10, "hierarchyContrast": 0-10, "distinctiveness": 0-10
      },
      "overall": 0.0,                    // weighted-block formula (see below), one decimal
      "verdict": "one line",
      "betterThanPrev": true,            // true|false|"equal"  (omitted on round 0)
      "betterReason": "grounded in pixels",
      "tasteVsPrev": true,               // true|false|"equal"  taste-only (structural block); omitted on round 0
      "tasteVsPrevReason": "grounded in pixels"
    }
  },
  "candidates": [
    { "title": "...", "lens": "spacing", "rationale": "...", "effort": "S|M|L", "expectedImpact": "S|M|L" }
  ]
}
```

`scores` carries **eleven** dims in two blocks: the legibility six (hierarchy … readability) and the
structural five (depth, cohesion, rhythm, hierarchyContrast, distinctiveness). A judge.json with ONLY
the legibility six (sparse / round-0 / legacy) stays valid — the scorer falls back to the reported
`overall` for those pages (back-compat). `tasteVsPrev` is the taste-only mirror of `betterThanPrev`,
judged on the structural block; a `false`/`"worse"` on ANY page blocks accept (see decision below).

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
  "candidate": { "title": "...", "lens": "..." },
  "diagnosis": {
    "weakestDims": [ { "dim": "distinctiveness", "score": 2.0, "block": "structural" }, { "dim": "rhythm", "score": 2.0, "block": "structural" } ],
    "bottleneckBlock": "structural",   // "structural" | "legibility" | null (no scored dims)
    "structuralBlock": 3.2,            // mean of the structural five (null if absent)
    "legibilityBlock": 6.8             // mean of the legibility six (null if absent)
  }
}
```

`diagnosis` is emitted **every round** (including baseline) so the next round always has a NAMED target.
`weakestDims` is the two lowest-scoring dims across BOTH blocks, each tagged with its block;
`bottleneckBlock` is whichever block is lower. SKILL.md's convergence protocol reads it to refuse to
declare "converged" on a structural plateau (a flat-but-legible page).

### roundScore formula (score.mjs)

`roundScore = round( 0.5*objective + 0.5*visual , 1 )`, both normalized to 0–100:

- **objective (0–100)** = weighted Lighthouse (weights sum to **1.0**, so a perfect site scores 100):
  `0.35*LH.accessibility + 0.30*LH.performance + 0.20*LH.bestPractices + 0.15*LH.seo` **minus
  penalties**: `-15 per axe critical, -8 per serious, -10 per breakpoint with overflowX/clipped`.
  Clamp [0,100]. (Averaged across pages.) NOTE: a11y is weighted highest, matching the loop's intent.
- **visual (0–100)** = per-page `visualOverall * 10`, averaged across pages. `visualOverall` is the
  **weighted-block** formula:
  `structuralWeight * mean(depth,cohesion,rhythm,hierarchyContrast,distinctiveness) +
   (1 - structuralWeight) * mean(hierarchy,spacing,alignment,consistency,affordance,readability)`,
  default `structuralWeight = 0.5`. Pairing the noise/restraint dim (cohesion) AGAINST the substance
  dims makes the score **peak in the sweet spot** — neither a busy nor an empty page maxes the block.
  When a page lacks the structural five, the scorer falls back to the reported `overall` (back-compat).
  Optional `structuralFloor` (default OFF) caps `visualOverall ≤ 6.0` when `structuralBlock < floor`.

### accept / revert decision (score.mjs, `--prev <prev-accepted-round-dir>`)

ACCEPT iff ALL:
- `delta = roundScore - prevRoundScore > 0`
- no Lighthouse category dropped by more than `regressTolerance` (default 2) vs prev
- no NEW axe critical/serious vs prev
- `regression.maxChangedPct` within the change the round intended (heuristic: the judge's
  `betterThanPrev !== false`; a human/agent confirms large diffs are intentional)
- **no taste regression** — `tasteVsPrev` is not `false`/`"worse"` on any page (a taste regression
  blocks accept even when the objective half improved)
- target `build` + test/smoke scripts exit 0

Otherwise REVERT. Round 0 is always `decision:"baseline"` (no accept/revert).

### config schema (taste-validation keys)

The per-target `config.json` (under `<target>/.ui-evolve/`) adds:
- `structuralWeight` (number, default **0.5**) — weight of the structural block in `visualOverall`
  (allow 0.6 if the discrimination margin is thin). The legibility block gets `1 - structuralWeight`.
- `structuralFloor` (number, default **6.0**) — the convergence floor: SKILL.md's plateau protocol
  refuses to declare "converged" while `diagnosis.bottleneckBlock === "structural"` AND
  `diagnosis.structuralBlock < structuralFloor`. When also passed to `visualOverall` it doubles as the
  optional hard cap (legible-but-empty → `overall ≤ 6.0`); ships OFF as a cap (soft weighting first).

### config schema (explore-mode keys — opt-in / back-compat)

Explore mode is OFF by default; an absent/`{}` config resolves to the existing refine path with NO
behavioral change. The defaults are applied by `resolveExploreConfig(config)` in `tools/score.mjs` (the
single source of truth). The per-target `config.json` adds:
- `mode` (`'refine'` | `'explore'`, default **`'refine'`**) — `'explore'` runs the N-way committed-
  directions tournament (generate N redesigns → capture → judge → `rankDirections` picks the winner →
  the loop switches back to refine on the winner). Any other value (or absent) ⇒ refine.
- `exploreDirections` (number, default **3**) — N: how many distinct committed directions to generate
  in the explore fan-out. Non-integer / ≤0 ⇒ falls back to 3.
- `directionBrief` (path, default **`references/direction-brief.md`**) — the bold-POV mandate handed to
  the direction generators AND the refine synthesize step. The orchestrator reads this file and passes
  its TEXT to `round-workflow.mjs` via `args.directionBriefText` (the Workflow script never reads files).

### config schema (taste-exemplar keys — band calibration, opt-in / back-compat)

The four-pole picture book is OPTIONAL: an absent/`{}` config (or absent `tasteExemplars`) resolves
to the conventional default pole dirs, and when those dirs hold no images the judge scores WITHOUT
picture anchors — byte-identical to the pre-picture-book behavior. The defaults are applied by
`resolveTasteConfig(config)` in `tools/score.mjs` (the single source of truth). The per-target
`config.json` adds:
- `tasteExemplars` (object, optional) — the four labeled pole dirs the judge reads as anchors:
  - `tooBusy` (path, default **`references/taste-exemplars/too-busy`**) — clutter / object-soup pole.
  - `tooSubtle` (path, default **`references/taste-exemplars/too-subtle`**) — flat-but-legible pole.
  - `genericBad` (path, default **`references/taste-exemplars/generic-bad`**) — clean-but-default pole.
  - `distinctiveGood` (path, default **`references/taste-exemplars/distinctive-good`**) — the good corner.
  The pole dirs are **user-supplied and gitignored** (a full-page shot can render PII; a text gate is
  blind to pixels), so the public harness ships only the wiring + the abstract `tasteBrief`. Each pole
  may hold 0+ PNGs; an empty/absent pole simply drops that anchor (back-compat).
- `tasteBrief` (path, default **`references/taste-brief.md`**) — the abstract four-pole structural
  rubric handed to the judge. The orchestrator reads this file + the resolved exemplar paths and fills
  the `{{TASTE_BRIEF}}` / `{{TASTE_EXEMPLAR_PATHS}}` slots in `references/judge-prompt.md`.

**Back-compat:** when no exemplar images are present, `references/judge-prompt.md` instructs the judge
to score WITHOUT anchors (no error, no penalty). The judge names **which pole** a candidate is closest
to and scores "which pole," explicitly NOT "distance to the one good image" (distinctiveness rewards
committed NOVELTY, never exemplar-cloning).

## DIRECTION_SCHEMA (explore mode — `references/round-workflow.mjs`)

Each explore-mode agent returns ONE committed full-redesign direction (a complete recipe, not a tweak):

```json
{
  "title": "editorial",                 // committed direction name
  "posture": "warm editorial broadsheet",
  "fonts": "named display + body pairing (never system/Inter default)",
  "palette": "accent + full grey ramp + semantic (never indigo-on-white)",
  "structure": "the depth concept + the section-rhythm plan",
  "motion": "ONE cohesive content-motion technique",
  "rationale": "why this committed direction fixes the structural bottleneck"
}
```

The explore phase returns `{ mode: "explore", directions: DIRECTION_SCHEMA[] }`.

## rankDirections return shape (`tools/score.mjs`, PURE)

`rankDirections(judges, config)` ranks the N candidate directions' `judge.json` objects on the
**structural block** (the leap target) — reusing `visualOverall` / `blockMean` / `STRUCTURAL_DIMS`. PURE
(no I/O, no agent, no Chrome). A structurally-real direction wins even when the legibility six + reported
`overall` are identical across candidates (a structural-blind ranking would tie).

```json
{
  "ranking": [
    { "index": 1, "structuralBlock": 8.6, "visualOverall": 8.5 },
    { "index": 2, "structuralBlock": 5.0, "visualOverall": 6.5 },
    { "index": 0, "structuralBlock": 2.0, "visualOverall": 5.0 }
  ],
  "winnerIndex": 1
}
```

`ranking` is sorted DESC by `structuralBlock` (tie-broken by `visualOverall`, then original `index`);
each entry's `index` is the candidate's position in the input array; `winnerIndex` is the top entry's
`index` (`-1` when there are no candidates).

## CLIs

```
node tools/serve.mjs    --config <config.json> [--down]        # boot+poll (prints PID) | teardown
node tools/measure.mjs  --url <url> --pages "/,/about" --out <round-dir>
node tools/capture.mjs  --url <url> --pages "/" --config <config.json> --out <round-dir>
node tools/regression.mjs --before <round-dir> --after <round-dir> --out <round-dir>
node tools/score.mjs    --round <round-dir> [--prev <prev-accepted-round-dir>] [--config <config.json>]
```
