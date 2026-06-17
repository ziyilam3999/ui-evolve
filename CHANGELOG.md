# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
