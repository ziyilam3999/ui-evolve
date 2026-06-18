---
name: ui-evolve
description: >
  The reusable closed-loop for improving a web UI to a satisfaction bar with REAL validation —
  research candidate improvements → implement the highest-ROI one → VALIDATE with objective
  methods (Lighthouse, axe-core, web-vitals, responsive-overflow) AND a vision-judge on real
  rendered screenshots → accept-if-improved-and-no-regression else revert → repeat until
  objective thresholds are met, gains plateau, and the operator signs off. Invoke when the
  operator says any of: "/ui-evolve", "improve the UI", "improve the UI until satisfied",
  "make the UI better and validate it", "iterate on the design until it's good", "research +
  validate + iterate the UI", or points this loop at a website/app. Each accepted change is a
  REAL product change (never a demo-only reflow) and ships through your normal PR/review
  pipeline. NOT for one-off single tweaks (just edit + eyeball) and NOT for non-visual refactors.
---

# /ui-evolve — closed-loop UI improvement with real validation

Improve a web UI to a **satisfaction bar**, not by taste-asserting "looks nicer", but by a
measured loop: every accepted change must move objective metrics and a rubric-scored visual
judgment in the right direction with **no regression** anywhere else. The loop runs itself to a
defensible plateau, then surfaces before/after evidence for the operator's final sign-off.

This skill is the **reusable container** (the procedure + the rubric SSOT + the convergence rule +
the guardrails). The heavy per-round fan-out (multi-lens research, multi-breakpoint judging) is
delegated to a **Workflow** (`references/round-workflow.mjs`). The deterministic measurements are
Node tools under `tools/`. The visual judgment is a **vision-capable subagent** that reads the real
screenshot PNGs.

---

## What "real validation" means here (the whole point)

A change is only an improvement if the evidence says so. Two orthogonal validation tracks, BOTH
required (a green metric with worse-looking pixels is still a regression, and vice-versa):

1. **Objective / automated** (`tools/measure.mjs`, `tools/capture.mjs`):
   - **Lighthouse** — accessibility, performance, best-practices, SEO (0–100 each).
   - **axe-core** — WCAG violation counts by impact (target: 0 critical, 0 serious).
   - **Web vitals** — LCP, CLS, INP.
   - **Responsive** — render at mobile / tablet / desktop widths; assert NO horizontal overflow
     or content clipping at any breakpoint.
2. **Visual judgment, systematized** (the eyeball gate made repeatable — a vision subagent):
   - Real Playwright screenshots at each breakpoint for each page.
   - Scored against the fixed rubric in `references/rubric.md` — **eleven** dims in two blocks: a
     **legibility** block (hierarchy, spacing, alignment, consistency, affordance, readability) and a
     **structural** block (depth, cohesion, rhythm, hierarchyContrast, distinctiveness), 0–10 each. The
     `overall` is a weighted blend (`structuralWeight`, default 0.5) whose opposing dims make the score
     **peak in the sweet spot** — neither a cluttered nor an empty page can max it.
   - **Before-vs-after must show IMPROVEMENT, not just change.** The judge is shown the prior
     accepted screenshot alongside the candidate and must say which is better and why.
3. **Regression guard** (`tools/regression.mjs` + the project's own tests):
   - Pixel-diff vs the last accepted round to catch unintended changes to untouched areas.
   - The target's `build` + `test`/smoke scripts must stay green.

**The harness must be discriminating, not a rubber stamp.** Two layers, scoped honestly:
- **CI self-test** (`evals/discriminates.test.mjs`) — runs `score.mjs` over **canned fixture JSON**
  representing a worse UI and a better UI, asserting the scorer **orders them correctly**. Pure,
  deterministic, no network/Chrome/agent — so it can actually gate every PR. This proves the
  *formula* discriminates, NOT the full pipeline.
- **End-to-end discriminator AC** (human/operator-run, NOT CI) — run the FULL loop (real Lighthouse +
  real vision-judge) against a deliberately-degraded vs. a polished page and confirm real ordering.
  This is a release acceptance check, because it needs the agent runtime + a served page CI doesn't have.
Do not let the green CI fixture-test be mistaken for proof the real pipeline discriminates — that's the
"green easy-smoke hides the load-bearing path" trap; the end-to-end AC is the real proof.

---

## Satisfaction bar (when the loop stops) — thresholds + plateau + sign-off

The loop stops proposing when ALL of:
- **Objective thresholds met** (defaults, tunable per target in the run config):
  - Lighthouse accessibility ≥ 95, best-practices ≥ 95, performance ≥ 90, SEO ≥ 95.
  - axe-core: 0 critical, 0 serious violations.
  - 0 horizontal-overflow / clip findings at all 3 breakpoints.
  - Vision rubric overall ≥ 8.0 / 10 across all pages.
- **Diminishing returns:** round-score gain < `epsilon` (default 2.0 pts / 100) for `N` (default 2)
  consecutive accepted rounds — further effort isn't buying improvement.

### Plateau → re-diagnose (do NOT converge on a structural plateau)

`score.mjs` emits a `diagnosis` block in **every** `round.json`:
`{ weakestDims, bottleneckBlock, structuralBlock, legibilityBlock }`. On plateau (gain < `epsilon` for
`plateauRounds`), **do NOT declare converged if `diagnosis.bottleneckBlock === "structural"` AND
`diagnosis.structuralBlock < structuralFloor`** (config, default 6.0). A structural plateau means the
loop has been hill-climbing the WRONG layer (the decorative backdrop, not the base structure) — the
recipe's META: *when rounds tie / "still not it", the cause is the WRONG target; re-validate the
diagnosis before iterating harder.* Instead: emit the diagnosis (e.g. "weakest = distinctiveness, rhythm
→ the BASE structure is the bottleneck, not the backdrop") and require the next round's candidate to
**target a named structural dim** from `weakestDims`. Converge ONLY when plateaued AND `structuralBlock`
clears the floor (genuinely good structure, not merely legible-but-empty).

Then it **HOLDS** and surfaces a before/after evidence pack (baseline vs final: metrics table +
side-by-side screenshots + per-round changelog) for the **operator's final sign-off**. "Satisfied"
is ultimately the operator's call; the loop's job is to reach a defensible plateau and prove it.

---

## Explore mode — leap to a better base, then refine (two-phase)

The refine loop above HILL-CLIMBS one design: it sharpens a single candidate a tweak at a time. If the
base STRUCTURE is the problem, no amount of tweaking the backdrop fixes it — you polish a bad base
forever. **Explore mode** is the LEAP gear. It is opt-in (`mode: 'explore'`) and runs in two phases:

1. **Explore — N committed directions.** `round-workflow.mjs`'s `generate-directions` phase (gated on
   `mode === 'explore'`) spawns `exploreDirections` (default 3) agents, each generating ONE *distinct,
   boldly committed* full-redesign direction (editorial / terminal / swiss seeds), each handed the
   `references/direction-brief.md` bold-POV mandate (named font pairing, real palette, depth concept,
   section rhythm, ONE content-motion technique). Each returns a `DIRECTION_SCHEMA` brief. These are then
   implemented + captured + judged by the normal per-round tools.
2. **Tournament — rank on the structural block.** `rankDirections(judges, config)` in `tools/score.mjs`
   (PURE) scores all N judged directions on the **structural block** (the leap target) and ranks them
   DESC; `winnerIndex` is the winner. The winner becomes the **new baseline**, and the loop switches back
   to **refine** mode on it — refining the leap to the satisfaction bar. Any direction beating the prior
   baseline proves it was the APPROACH (structure + committed POV), not luck on one aesthetic.

### Auto-suggest trigger (the diagnose → explore loop)

When round-0's `diagnosis.structuralBlock < structuralFloor` (config, default 6.0), the loop itself
RECOMMENDS explore mode — the harness has detected "the BASE structure is the problem, stop tuning the
backdrop." This closes the diagnose → explore loop: instead of grinding refine rounds on a structural
plateau, the loop raises its hand and says "leap." Explore is also triggered when the operator passes it
explicitly. Explore is opt-in / auto-suggested only; the default stays refine (N full redesigns per leap
is expensive, so it does not fire on its own).

## Inputs / run config

Invoke `/ui-evolve <target>`. Resolve a run config (a small JSON the skill builds and stores at
`<target>/.ui-evolve/config.json`):
- `repoPath` — the target repo (e.g. `~/projects/your-site`).
- `serve` — how to boot it: `{ build: "npm run build", start: "npm start", url: "http://localhost:3000", port: 3000 }` (the loop boots, waits for the URL, tears down each round).
- `pages` — routes to evaluate (e.g. `["/"]`; add more as the site grows).
- `breakpoints` — `[{name:"mobile",width:390,height:844},{name:"tablet",width:834,height:1112},{name:"desktop",width:1440,height:900}]`.
- `thresholds` / `epsilon` / `plateauRounds` — the satisfaction bar above (override per target).
- `structuralWeight` (default 0.5) / `structuralFloor` (default 6.0) — the taste-block weighting and the
  structural-plateau convergence floor (see "Plateau → re-diagnose" above; full schema in
  `references/contract.md`).
- `mode` (`'refine'` | `'explore'`, default `'refine'`) / `exploreDirections` (default 3) /
  `directionBrief` (default `references/direction-brief.md`) — the explore-mode keys (see "Explore mode"
  below). Explore is opt-in; absent/`'refine'` runs today's loop unchanged. Defaults are applied by
  `resolveExploreConfig` in `tools/score.mjs` (single source of truth).
- `maxRounds` — hard cap (default 12) so a non-converging loop still terminates and reports.

Evidence is written under `<target>/.ui-evolve/run-<ISO>/round-<N>/` (add `.ui-evolve/` to the
target's `.gitignore` — it is scratch, not product).

---

## The loop (per-round protocol)

### Round 0 — baseline
1. Boot the target (`serve.build` then `serve.start`; poll `serve.url` until 200; see
   `tools/serve.mjs`). Fail closed if it never comes up.
2. `node tools/measure.mjs --url <url> --pages … --out <round-dir>` → `metrics.json`.
3. `node tools/capture.mjs --url <url> --pages … --breakpoints … --out <round-dir>` → `shots/*.png`
   + the overflow report inside `metrics.json`'s `responsive` block.
4. Spawn the **vision-judge** (Agent, write-capable, model inherits session) — prompt in
   `references/judge-prompt.md`. It Reads each `shots/*.png`, scores the rubric, writes
   `judge.json` with `{scores, overall, critique, candidates[]}`. `candidates[]` is the ranked
   improvement backlog (each `{title, lens, rationale, effort, expectedImpact}`).
5. `node tools/score.mjs --round <round-dir>` → `round.json` with the baseline `roundScore`.
6. Tear down the server.

### Round N — improve
1. **Research / select** — take the top backlog candidate. For non-trivial ones, run the
   `round-workflow.mjs` research fan-out (parallel lenses: a11y, hierarchy, responsive, content,
   performance) to sharpen it into a concrete, minimal change spec. Don't blind-edit.
2. **Implement** — make the change in the target repo (on the target's own feature branch /
   worktree). One coherent change per round; keep it minimal.
3. **Re-validate** — re-boot, re-`measure`, re-`capture`, re-`judge` (the judge is shown the prior
   accepted round's shots for the before/after comparison), `node tools/regression.mjs --before
   <prev-accepted> --after <this-round> --out <round-dir>`.
4. **Decide** (`tools/score.mjs` emits `accepted` + rationale):
   - **ACCEPT** iff `roundScore` improved by > 0 AND no metric crossed below its prior value beyond
     `regressTolerance` AND `regression.json` shows no unintended change to untouched regions AND
     build+tests green. Commit the change on the target branch.
   - **REVERT** otherwise — discard the change (git restore / drop the worktree edit), record WHY
     in `round.json`, and mark that candidate `rejected` in the backlog so it isn't retried blindly.
5. **Log** — every round writes its evidence; the run keeps a `changelog.md` (round, candidate,
   decision, deltas). Never silently drop a tried-and-rejected idea — it's logged.
6. **Converge check** — if the satisfaction bar is met → stop and assemble the sign-off pack, BUT honor
   the structural-plateau exception (above): do not converge on a structural plateau — read
   `round.json.diagnosis` and target a named structural dim next round instead.
   Else if `maxRounds` hit → stop and report honestly (what's still below threshold + why).
   Else → next round.

### Sign-off
Assemble `<run>/SIGNOFF.md`: baseline-vs-final metrics table, side-by-side breakpoint screenshots,
the per-round changelog, and the list of accepted PRs. Present to the operator. Ship accepted
changes through your normal PR/review pipeline (each round its own PR, or a batched release —
operator's preference). HOLD at sign-off — do not declare the UI "done" without the operator's yes.

---

## Guardrails (non-negotiable)

- **Eyeball the rendered pixels.** The vision-judge reads real PNGs; metrics alone never decide.
  A round can't be ACCEPTED on metrics if the judge says the pixels got worse.
- **No demo-only / dishonest reflow.** Every accepted change is a REAL product change that ships;
  never a capture-only CSS tweak that doesn't exist in the shipped UI.
- **Isolate target edits** on a feature branch / worktree; ship each accepted change through your
  normal review. The target project's own checks (privacy, lint, tests) still apply.
- **Fail closed.** If the server won't boot, a tool errors, or the judge can't score → BLOCK the
  round, don't wave a green through.
- **Honest reporting.** If the loop can't reach a threshold, say so with the evidence — don't
  report "satisfied" on a partial result.

---

## Files
- `SKILL.md` — this procedure.
- `references/rubric.md` — the fixed vision-judge rubric (scoring SSOT).
- `references/contract.md` — the JSON shapes + CLI contracts every tool/agent reads & writes.
- `references/judge-prompt.md` — the vision-judge subagent prompt.
- `references/direction-brief.md` — the bold-POV mandate (forbid generic defaults; demand a committed
  direction). Handed to the explore-mode direction generators AND the refine synthesize step.
- `references/round-workflow.mjs` — the per-round research+validation Workflow the skill spawns
  (refine Lenses→Synthesize, plus the explore `generate-directions` fan-out).
- `tools/serve.mjs` — boot/poll/teardown the target server.
- `tools/measure.mjs` — Lighthouse + axe-core + web-vitals + responsive-overflow → `metrics.json`.
- `tools/capture.mjs` — Playwright screenshots at each breakpoint → `shots/*.png`.
- `tools/regression.mjs` — pixel-diff vs the last accepted round → `regression.json`.
- `tools/score.mjs` — combine metrics + judge into `roundScore` + accept/revert decision.
- `tools/package.json` — pinned harness devDeps (lighthouse, @axe-core/playwright, playwright, pixelmatch, pngjs).
- `evals/discriminates.test.mjs` — the CI self-test: scorer orders a worse UI below a better one.
