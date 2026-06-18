# Layer-2 live judge re-run — Rule-18 honesty finding

**Date:** 2026-06-18 · **Phase 4** of the ui-evolve taste-bake · numbers only (no pixels, no PII).

## What this proves

Phases 1–3 shipped a banded structural rubric whose CI gate proves the **scoring math** — given a set of
structural-dim numbers, the band inverts correctly and a structurally-real design beats both extremes. But a
pure-math gate cannot prove the **judge** actually assigns those numbers to real pixels (brief §7.3 / §C:
"Phase 1's gate proves the MATH, not the judge"). This is the live Rule-18 check that closes that gap.

## Method

The UPDATED 11-dimension vision-judge was run on REAL rendered screenshots (desktop 1440 + mobile 390,
full-page, scroll-settled) of six designs, each judged by an INDEPENDENT agent that was **blind** to the
design's origin (anonymized A–F; no "good"/"bad"/"round-N" hint). Six designs:
- round-1 (the original clean/generic site) → intended pole: generic-bad
- round-3 (the "richer" object-heavy variant) → intended pole: too-busy
- round-4 (the faint-aurora variant) → intended pole: too-subtle
- round-6 editorial / terminal / swiss (the three frontend-design redesigns) → intended pole: distinctive-good

## Result 1 — the band HOLDS on real pixels (the bake works)

| design | legibilityBlock | **structuralBlock** | overall (0.5/0.5) | blind judge's pole call |
|---|---|---|---|---|
| round-1 (generic) | 6.2 | **3.4** | 4.8 | generic-bad ✓ |
| round-3 (busy)    | 5.8 | **4.2** | 5.0 | too-busy ✓ |
| round-4 (subtle)  | 7.2 | **4.4** | 5.8 | too-subtle ✓ |
| round-6 editorial | 7.8 | **7.6** | 7.7 | distinctive-good ✓ |
| round-6 terminal  | 7.5 | **7.8** | 7.7 | distinctive-good ✓ |
| round-6 swiss     | 8.0 | **7.4** | 7.7 | distinctive-good ✓ |

- **Blind classification: 6/6 correct.** With zero hints, the judge named every design's band exactly.
- **Structural separation is real:** bad poles 3.4–4.4, round-6 7.4–7.8 — a ~3.0–4.4-point gap.
- **The old band-inversion is fixed:** too-subtle overall 5.8 now sits BELOW round-6's 7.7. Under the old
  6-dim legibility-only judge the same round-4 scored 87.1, ABOVE round-1's 83.1 — the loop literally
  rewarded emptiness. The new judge orders them correctly.
- **All 3 round-6 designs tie at overall 7.7** — consistent with the operator's "all three are good taste";
  the rubric does not bias toward one aesthetic.

## Result 2 — real vs. the synthetic Layer-1 fixtures (the honesty check)

The Layer-1 CI test (`evals/discriminates.test.mjs`) uses hand-coded synthetic structural numbers. Comparing
them to the REAL judge output:

| design | synthetic structuralBlock | **real structuralBlock** | divergence |
|---|---|---|---|
| generic (r1) | 3.2 | 3.4 | +0.2 (spot on) |
| busy (r3)    | 2.4 | 4.2 | **+1.8** |
| subtle (r4)  | 3.4 | 4.4 | +1.0 |
| editorial    | 8.4 | 7.6 | −0.8 |
| terminal     | 8.4 | 7.8 | −0.6 |
| swiss        | 8.6 | 7.4 | **−1.2** |

**Honest divergences (surfaced, not papered over per Rule 18):**

1. **The synthetic fixtures were optimistic at BOTH ends.** They overstated the band separation by ~30%:
   real bad poles scored ~1 point HIGHER (less extreme) and real good poles ~0.6–1.2 LOWER than assumed.
   The separation is still decisive (~3 structural points), just tighter than the synthetic ~5–6.
2. **round-3 "object-soup" was not as bad as assumed** (synthetic depth/cohesion 2/2 → real 3/5). The actual
   round-3 was an information-dense multi-card layout anchored by a monotone Experience wall, not a literal
   orb/dot-grid grab-bag — so its real cohesion is mid, not floor.
3. **Biggest single divergence: swiss depth (synthetic 9 → real 4).** This is the judge being CORRECT, not
   wrong: Swiss minimalism is intentionally flat (hairline rules, no elevation), and the rubric rightly
   scores flatness LOW on depth even when the design is tasteful. Implication: "distinctive-good" is NOT
   uniformly high on every structural dim — swiss earns its band on cohesion (9) + distinctiveness (9), and
   trades away depth (4). The band is reached by different routes per aesthetic, exactly as a non-overfit
   rubric should behave.

## Conclusion

The bake is validated on real pixels: the 11-dim judge, blind, separates the structurally-real round-6
redesigns from all three failure poles and classifies every design correctly. The synthetic Layer-1 fixtures
are directionally right but optimistic; the band assertion survives with real numbers (real round-6 structural
7.4–7.8 ≫ real bad poles 3.4–4.4).

## Reproduce

Real judge fixtures are committed (numbers only) at `evals/fixtures/round6-{editorial,terminal,swiss}.judge.json`
and `evals/fixtures/badpoles.judge.json`. To run the Layer-1 discrimination test against the REAL round-6
values instead of the synthetic, point the late-binding env vars at the committed fixtures:
`UI_EVOLVE_ROUND6_FIXTURE`, `UI_EVOLVE_ROUND6_FIXTURE_TERMINAL`, `UI_EVOLVE_ROUND6_FIXTURE_SWISS`. CI stays on
the deterministic synthetic by default (env unset).

## Follow-ups (tracked, NOT silently applied here)

- Swapping the synthetic Layer-1 fixtures for these real values is a SEPARATE reviewed change, not a silent
  same-PR edit (the band holds with both; the synthetic just runs hotter). Optional.
- `structuralWeight` stays 0.5 — the real margin (~3 structural points, ~2 overall) is healthy, not thin, so
  the brief §1.3 0.6 bump is not needed.
- The round-6 captures used for this run are LOCAL only (gitignored); per operator decision no résumé pixels
  are committed — only these numeric scores.
