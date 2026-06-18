# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] — 2026-06-18

### Added

* **Explore mode — the loop can now LEAP, not only hill-climb** (`tools/score.mjs`,
  `references/round-workflow.mjs`, `references/contract.md`, `SKILL.md`). Today's loop is
  refine-only: one candidate, sharpened by 3 lenses. That can polish a structurally-weak base
  forever. Explore mode is a new opt-in gear: it asks N agents to each generate a DISTINCT,
  boldly-committed full redesign direction (editorial / terminal / swiss …), then holds a
  tournament — ranking all N on the **structural block** — and the winner becomes the new
  baseline before the loop switches back to refine. New PURE export `rankDirections(judges,
  config)` (tournament ranking on the structural block; returns `winnerIndex`) + a
  `mode==='explore'`-gated `generate-directions` fan-out with a new `DIRECTION_SCHEMA`.
* **`references/direction-brief.md` — a reusable bold-POV mandate** handed to every generator
  (explore directions AND the refine synthesize step): FORBIDS generic defaults (system/Inter
  font, indigo-on-white, generic card-on-white) and DEMANDS a committed direction (named font
  pairing, a real palette = accent + grey ramp + semantic, a depth concept, a section-rhythm
  plan, ONE cohesive content-motion technique). The frontend-design "intentionality, not
  intensity" catalyst, baked into the harness as a durable asset instead of a one-time prompt.
* **Auto-suggest the leap on a structural plateau** (`SKILL.md`): when round-0's
  `diagnosis.structuralBlock < structuralFloor`, the loop recommends explore mode — it detects
  "the base is the problem, stop tuning the backdrop" and proposes leaping instead of grinding
  refine rounds. Closes the diagnose→explore loop.

### Config

* New keys (`resolveExploreConfig`, defaults applied centrally): `mode` (`'refine'`\|`'explore'`,
  default `'refine'`), `exploreDirections` (default `3`), `directionBrief` (default
  `references/direction-brief.md`). Back-compat: `mode` defaults to `'refine'`, so a config with
  no explore keys behaves exactly as before — explore is fully opt-in.

## [0.4.0] — 2026-06-18

### Added

* **Banded structural rubric — the loop can now see *structure & taste*, not just legibility**
  (`references/rubric.md`, `tools/score.mjs`, `references/judge-prompt.md`, `references/contract.md`).
  Five new visual-judge dimensions (depth / cohesion / section-rhythm / hierarchy-contrast /
  distinctiveness) join the six legibility dims. The overall is now a **weighted block**
  `visualOverall = structuralWeight·structuralBlock + (1−structuralWeight)·legibilityBlock`
  (`structuralWeight` default 0.5). The dims are *opposing* on purpose — a noise/cohesion dim paired
  against depth/variety/distinctiveness — so the score **peaks in the sweet spot**: neither an empty
  (too-subtle) page nor a cluttered (object-soup) page can max the block, only a cohesive, varied,
  committed design. This fixes the live band-inversion bug where the old legibility-only scorer rated
  a flat too-subtle page (87.1) *above* a clean one (83.1) and scored object-soup identically to clean.
* **Two-sided decorative + structure inventory** (`references/judge-prompt.md`): before scoring, the
  judge inventories the decorative layer (catch clutter) AND the structural layer (catch emptiness),
  stating absences explicitly — so the structural dims produce honest numbers.
* **Plateau → re-diagnose** (`tools/score.mjs`, `SKILL.md`): every round emits a `diagnosis`
  (`weakestDims`, `bottleneckBlock`, `structuralBlock`, `legibilityBlock`). The convergence protocol no
  longer declares "done" on a structural plateau below `structuralFloor` (default 6.0) — it names the
  weak structural dim and requires the next round to target the base structure, not the backdrop.
* **Taste-regression revert** (`tools/score.mjs`): `tasteVsPrev` blocks accept when any page reports a
  taste regression, even if objective metrics improved.
* **Discrimination self-test** (`evals/discriminates.test.mjs`): six fixtures (3 bad poles
  generic/object-soup/too-subtle + 3 good poles editorial/terminal/swiss) assert the band — each good
  design beats both extremes by >5, object-soup falls below the clean original, and the too-subtle
  diagnosis flags the structural bottleneck. Both-ends proven (RED on the legibility-only scorer, GREEN
  with the structural block). Late-binds to real round-6 judge data via `UI_EVOLVE_ROUND6_FIXTURE`.

### Config

* New keys: `structuralWeight` (default 0.5) and `structuralFloor` (default 6.0, soft-cap OFF unless set).
  Back-compat: a judge.json with no structural dims still scores via the legibility path; pages with no
  motion block are unaffected (v0.3.0 motion gate intact).

## [0.3.0] — 2026-06-18

### Added

* **Motion-aware capture + scoring** (`tools/capture.mjs`, `tools/score.mjs`). The loop was blind to
  scroll-driven / parallax motion — a still screenshot at scroll-top can't see it. `capture.mjs` now,
  when the config carries a `motion` block (`selector` + `scrollStops`), drives the page through the
  scroll stops and records per-page `motion` data, and dual-captures under `prefers-reduced-motion` to
  verify the effect goes static. `score.mjs` adds a `MOTION_REDUCED_PENALTY` (−12 objective) that fires
  only when capture observed motion AND proved the reduced-motion fallback failed (pages with no motion
  block are unaffected — back-compat).

### Changed

* **Fail-closed motion gate** (`tools/score.mjs`): if a config declares a `motion` block but the captured
  metrics carry no motion data for a page, scoring now refuses (rather than silently dropping the
  reduced-motion penalty) — the capture was almost certainly run with a motion-blind tool from a stale
  clone. Forces a re-run from the motion-aware harness.

## [0.2.1] — 2026-06-17

### Fixed

* `tools/measure.mjs`: the axe-core accessibility pass now creates its page from an explicit
  `browser.newContext()` → `context.newPage()`. The previous `browser.newPage()` made
  `@axe-core/playwright`'s `analyze()` throw `Please use browser.newContext()`, so the axe path was
  broken on any real run. The pure-JSON CI self-test (which exercises only `score.mjs`) could not catch
  it; the first live end-to-end discriminator run did. No public API change.

## [0.2.0] — 2026-06-17

### Added

* The rest of the validation harness:
  * `tools/serve.mjs` — boots the target server, polls its URL until ready, records the
    PID, and tears down (`--down`); dependency-free, idempotent teardown.
  * `tools/capture.mjs` — Playwright full-page screenshots at each breakpoint +
    responsive overflow/clip detection, merged into `metrics.json`.
  * `tools/regression.mjs` — pixel-diff (pixelmatch) of a round's screenshots vs the
    last accepted round → `regression.json` (per-shot `changedPct`/`changedPx`).
  * `tools/score.mjs` — the scorer: combines metrics + judge (+ regression) into
    `round.json` with `roundScore` and the accept/revert decision. Exposes a pure
    `computeRound()` plus a CLI.
* `evals/discriminates.test.mjs` — the **CI discriminator self-test**: a pure,
  deterministic check (no network/Chrome/agent) asserting the scorer orders a worse UI
  below a better one, reverts an accessibility regression, accepts a genuine
  improvement, and scores a perfect site ~100 (proving the weights sum to 1.0).
* CI now runs the self-test on every PR (`selftest` job); `npm run selftest` runs it
  locally. `tools/package-lock.json` pins the harness dependency tree for reproducible
  installs.

> The full end-to-end loop (real Lighthouse + a real vision-judge against a served page)
> is an operator-run acceptance check — CI can't host a browser+agent. See `SKILL.md`.

## [0.1.0] — 2026-06-17

### Added

* Initial public scaffold: README, MIT license, this changelog, `.gitignore`,
  `.nvmrc`, PR template, and a GitHub Actions CI workflow (lint + JSON-validity +
  `node --check` over the harness scripts + a tools-dependency install smoke).
* The `/ui-evolve` skill specification (`SKILL.md`) and its references — the
  vision-judge rubric, the tool/agent data contract, the judge prompt template,
  and the per-round research workflow.
* `tools/measure.mjs` — the objective-metrics tool (Lighthouse + axe-core +
  lab web-vitals) and its pinned dependency manifest.

> The remaining harness tools (`capture`, `regression`, `score`, `serve`) and
> the CI discriminator self-test land in `0.2.0`+ — see the README roadmap.
