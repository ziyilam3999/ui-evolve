# Vision-judge rubric (scoring SSOT)

The vision-judge subagent scores **real rendered screenshots** against these **eleven** dimensions,
each **0–10** (anchored below), in two blocks: a **legibility block** (dims 1–6, can you read/use it)
and a **structural block** (dims 7–11, is it deep / cohesive / varied / committed). It is shown every
breakpoint for every page, and — from Round 1 on — the prior **accepted** round's screenshots for an
explicit before/after comparison.

The judge MUST justify each score with a concrete, screenshot-grounded observation (what it sees,
where), not a vibe. Vague praise ("looks clean") is not a valid justification.

## Legibility block (dims 1–6)

1. **Hierarchy** — Does the eye land on the most important thing first? Is there a clear primary →
   secondary → tertiary order via size, weight, color, position? (0 = flat, nothing leads; 10 =
   unmistakable focal path.)
2. **Spacing** — Consistent, rhythmic whitespace; related things grouped, unrelated things
   separated; no cramped or accidentally-huge gaps; no dead empty bands. (0 = arbitrary/cramped;
   10 = deliberate, consistent rhythm.)
3. **Alignment** — Elements share edges/baselines on a coherent grid; nothing visually "off". (0 =
   ragged; 10 = crisp grid.)
4. **Consistency** — Repeated elements (buttons, cards, headings, links) look and behave the same;
   one type scale, one color system, one corner-radius/shadow language. (0 = every element its own
   style; 10 = a coherent system.)
5. **Affordance** — Interactive things look interactive (buttons look pressable, links look
   clickable, inputs look editable); clear states; obvious primary action. (0 = can't tell what's
   clickable; 10 = every affordance reads correctly.)
6. **Readability** — Comfortable line length, font size, contrast, and content density; nothing
   clipped or overflowing; legible at the actual breakpoint. (0 = strained/clipped; 10 = effortless.)

## Structural block (dims 7–11)

These are the **taste** dimensions. The block is a **band**: a noise/restraint dim (cohesion) is paired
*against* substance dims (depth, rhythm, hierarchy-contrast, distinctiveness), so **neither extreme maxes
the block** — a cluttered page fails cohesion, an empty/flat page fails depth/variety/distinctiveness.
Only a cohesive, varied, committed page passes both families. Each dim's anchors are written as a band
(both the too-much and the too-little ends score LOW); the opposition is load-bearing, do not collapse it.

7. **Structural depth / layering** *(substance — penalizes too-flat; bounded by cohesion so piling on
   objects does NOT max it)* — Is there a real depth ladder (elevated planes, layered/tinted surfaces,
   a non-flat canvas) for the eye and any motion to read against?
   - 0–2: one flat plane, all-white, hairline borders, no elevation.
   - 3–5: token depth (one soft shadow) but the page is essentially flat.
   - 6–7: a deliberate depth treatment present on most of the page.
   - 8–10: a committed, cohesive depth/layering concept — ONE idea, executed across the page. NOT "many objects".
   - GUARD: piling on decorative layers does **not** raise this — incoherent depth cross-checks low on dim 8.
8. **Cohesion / one concept** *(penalizes the piled-on grab-bag)* — Do all visible elements serve ONE
   design concept, or is it bolted-on from several?
   - 0–2: a grab-bag — dot grid AND orbs AND outline shapes AND a gradient, none relating.
   - 3–5: a couple of competing concepts.
   - 6–7: a dominant concept with minor stragglers.
   - 8–10: a single concept executed consistently.
9. **Section rhythm & variety** *(itself a BAND — penalizes monotony AND chaos)* — Down the full-page
   scroll, do sections differ in surface / density / layout with deliberate rhythm?
   - 0–2 (monotone): every section the same box, same width, same heading scale, separated only by a hairline.
   - 0–2 (chaos): every section a different unrelated style; no system.
   - 3–5: slight variation, still mostly uniform.
   - 6–7: clear variety within a system.
   - 8–10: deliberate rhythm — alternating tone, ≥1 full-bleed/break moment, varied heading scale — all within ONE vocabulary.
10. **Intra-section hierarchy contrast** *(substance — penalizes flat walls)* — Inside the biggest
    sections, are there ≥3 distinguishable text roles differing by >1 step (size + weight + color)?
    - 0–2: a uniform wall (e.g. employer 18 / role 16 / bullets 14, all grey).
    - 3–5: two roles, weak separation.
    - 6–7: three roles, clear steps.
    - 8–10: wide steps + scan anchors (timeline rail, pulled metric, role summary).
11. **Distinctiveness / committed POV** *(anti-generic / anti-AI-slop; bounded by cohesion)* — Does it
    commit to a non-generic aesthetic, or is it default system-font / indigo-on-white / Inter / templated?
    - 0–2: generic AI-slop defaults — system/Inter font, indigo-on-white, no identity.
    - 3–5: minor personality, mostly default.
    - 6–7: a clear direction, somewhat committed.
    - 8–10: a committed, distinctive direction (named font pairing, real palette, identity) executed coherently.
    - GUARD: boldness only counts if cohesive — incoherent boldness (object-soup) does **not** score high (cross-check dim 8).

> **a11y is NOT a structural judge dim (deliberately, to avoid double-counting).** Contrast / motion /
> focus / CLS are already scored on the OBJECTIVE half — Lighthouse accessibility, axe-core, the
> fail-closed reduced-motion gate, and dim 6 (readability). It is intentionally absent here, not missing.

## Overall (weighted-block formula)

`overall` is **no longer a flat mean of all dims** (that re-dilutes taste). Compute it in two blocks:
- `legibilityBlock = mean(hierarchy, spacing, alignment, consistency, affordance, readability)`
- `structuralBlock = mean(depth, cohesion, rhythm, hierarchyContrast, distinctiveness)`
- `overall = structuralWeight * structuralBlock + (1 - structuralWeight) * legibilityBlock`
  — default `structuralWeight = 0.5` (so 0.5 / 0.5); bump to 0.6 if the discrimination margin is thin.

Reported to one decimal. The canonical computation lives in `tools/score.mjs` (`visualOverall`) so the
discrimination test can prove the math without an agent. An optional config-gated `structuralFloor`
(default OFF) caps `overall ≤ 6.0` when `structuralBlock` is below the floor. The judge also returns a
one-line verdict, when comparing a **`betterThanPrev: true|false|"equal"`** flag with a reason, and a
taste-only **`tasteVsPrev: true|false|"equal"`** flag (pixel-grounded; a `false`/`"worse"` blocks accept).

> **Both-ends anti-band rule (apply to the structural block, verbatim):** *A backdrop being
> legible-through is NOT good; do not award legibility credit to a busy backdrop. An empty/flat page is
> NOT restraint-credit; score it LOW on depth/variety/distinctiveness.*

## Improvement backlog (`candidates[]`)

Alongside scores, the judge returns a ranked list of the **highest-ROI concrete improvements** it
sees. Each candidate:
- `title` — short imperative ("Tighten hero vertical rhythm", "Raise body-text contrast to 4.5:1").
- `lens` — one of `hierarchy | spacing | alignment | consistency | affordance | readability | a11y | performance | content`.
- `rationale` — what's wrong now and what the change buys, grounded in the screenshot.
- `effort` — `S | M | L` rough implementation size.
- `expectedImpact` — `S | M | L` expected score/metric movement.

Rank by impact-over-effort. The loop takes the top unrejected candidate each round. Candidates that
were tried and reverted are marked `rejected` (with the reason) and not re-proposed blindly.

## Scoring discipline (anti-rubber-stamp)

- A score of 8+ on a dimension requires the screenshot to genuinely warrant it; reserve 9–10 for
  near-exemplary.
- When comparing to the prior accepted round, `betterThanPrev` must be decided from the pixels —
  if the change is cosmetic-neutral, say `"equal"`, do not inflate.
- If a candidate change made any dimension WORSE, say so plainly even if `overall` rose — the loop
  needs that signal to revert or refine.
