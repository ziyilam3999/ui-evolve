# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
