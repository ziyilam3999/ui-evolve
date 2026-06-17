# ui-evolve

**Improve a web UI to a satisfaction bar — and prove it actually got better.**

`ui-evolve` is a reusable closed-loop that stops "redesign by vibes". Every change it
keeps has to move **objective metrics** *and* a **rubric-scored visual judgment** in the
right direction, with **no regression** anywhere else. The loop runs itself to a
defensible plateau, then hands you before/after evidence for a final sign-off.

> It is a [Claude Code](https://docs.claude.com/en/docs/claude-code) **skill**, not a
> standalone CLI. The measurement tools are plain Node scripts you can run by hand, but
> the *loop* (research, visual judging, accept/revert decisions) is driven by the Claude
> Code agent runtime. See **Requirements** below.

---

## Why two kinds of validation (the whole point)

A change is only an improvement if the evidence says so — from **two orthogonal tracks,
both required**. A green metric with worse-looking pixels is still a regression, and a
prettier screenshot that tanks accessibility is too.

1. **Objective / automated**
   - **Lighthouse** — performance, accessibility, best-practices, SEO (0–100 each).
   - **axe-core** — WCAG violations by impact (target: zero critical, zero serious).
   - **Web vitals** — LCP, CLS, INP (lab proxy).
   - **Responsive** — render at mobile / tablet / desktop; assert no horizontal
     overflow or content clipping at any breakpoint.
2. **Visual judgment, systematized** — a vision-capable agent scores real Playwright
   screenshots against a fixed six-dimension rubric (hierarchy, spacing, alignment,
   consistency, affordance, readability) and must say whether the new screenshot is
   genuinely **better than the last accepted one**, grounded in the pixels.

Plus a **pixel-diff regression guard** (did an untouched area change unintentionally?)
and the target project's own `build` + tests staying green.

## The loop

```
boot target → measure (objective) + capture (screenshots) → vision-judge scores rubric
   → pick highest-ROI candidate → implement the minimal change → re-measure + re-judge
   → ACCEPT (score up, no regression, build/tests green) or REVERT (logged)
   → converge check (thresholds met + gains plateaued + round cap) → sign-off pack
```

It stops proposing when objective **thresholds** are met, gains **plateau** (diminishing
returns over consecutive rounds), and you **sign off** — then it assembles a
baseline-vs-final evidence pack. A hard round cap guarantees termination.

## Requirements

- **[Claude Code](https://docs.claude.com/en/docs/claude-code)** — the loop's research
  and vision-judge steps run as Claude Code agents/subagents.
- **Node.js ≥ 20** (see `.nvmrc`).
- The measurement harness deps (Lighthouse, Playwright, axe-core, pixelmatch) — installed
  on demand under `tools/`. Lighthouse needs Chrome; the harness falls back to Playwright's
  bundled Chromium when system Chrome is absent.

## Install (as a Claude Code skill)

Clone this repo, then symlink it into your Claude Code skills directory:

```bash
git clone https://github.com/ziyilam3999/ui-evolve.git
ln -s "$(pwd)/ui-evolve" ~/.claude/skills/ui-evolve
```

Then invoke it from Claude Code: `/ui-evolve <path-to-your-web-project>`.

## Layout

| Path | What |
|---|---|
| `SKILL.md` | The procedure: the loop, the satisfaction bar, the guardrails. |
| `references/rubric.md` | The vision-judge scoring rubric (the SSOT for "looks better"). |
| `references/contract.md` | The exact JSON shapes + CLIs every tool and agent reads/writes. |
| `references/judge-prompt.md` | The vision-judge subagent prompt template. |
| `references/round-workflow.mjs` | The per-round research fan-out (a Claude Code Workflow). |
| `tools/measure.mjs` | Objective metrics: Lighthouse + axe-core + lab vitals. |
| `tools/serve.mjs` | Boot / poll / teardown the target server. |
| `tools/capture.mjs` | Playwright screenshots per breakpoint + responsive overflow detection. |
| `tools/regression.mjs` | Pixel-diff vs the last accepted round. |
| `tools/score.mjs` | Combine metrics + judge into `roundScore` + the accept/revert decision. |
| `evals/discriminates.test.mjs` | The CI discriminator self-test. |

## Roadmap

This repo is built in the open, one release per slice:

- **0.1.0** — public scaffold + the skill spec + the objective-metrics tool.
- **0.2.0** — the rest of the harness (`capture`, `regression`, `score`, `serve`) + a
  CI **discriminator self-test** (the scorer must order a worse UI below a better one). *(this release)*
- **0.3.0+** — dogfooded on a real site; the run's evidence becomes a documented case study.

See `CHANGELOG.md` for what shipped in each release.

## Contributing

Branch → PR → CI (lint + the discriminator self-test + dependency resolution) → review
→ squash merge. Conventional Commits; add a `CHANGELOG.md` bullet for user-facing
changes. See the PR template.

## License

[MIT](./LICENSE)
