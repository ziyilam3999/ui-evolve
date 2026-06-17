# Vision-judge rubric (scoring SSOT)

The vision-judge subagent scores **real rendered screenshots** against these six dimensions, each
**0–10** (anchored below). It is shown every breakpoint for every page, and — from Round 1 on — the
prior **accepted** round's screenshots for an explicit before/after comparison.

The judge MUST justify each score with a concrete, screenshot-grounded observation (what it sees,
where), not a vibe. Vague praise ("looks clean") is not a valid justification.

## Dimensions

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

`overall` = the mean of the six (0–10), reported to one decimal. The judge also returns a one-line
verdict and, when comparing, a **`betterThanPrev: true|false|"equal"`** flag with a reason.

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
