#!/usr/bin/env node
// discriminates.test.mjs — CI self-test (the both-ends oracle) for the scorer.
//
// Pure + deterministic: no network, no Chrome, no agent. Runs in plain CI via
//   node evals/discriminates.test.mjs
//
// It proves the scorer DISCRIMINATES: a worse UI scores below a better one, an accessibility
// regression reverts, a genuine improvement accepts, and a perfect site scores ~100 (weights sum to 1).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { computeRound, visualOverall, rankDirections, resolveExploreConfig, resolveTasteConfig } from '../tools/score.mjs'

// Clear PASS/FAIL summary line. node:test sets process.exitCode=1 if any test failed; 0 means all
// passed. This prints AFTER the runner finishes, so it reflects the real outcome.
process.on('exit', (code) => {
  const failed = code !== 0 || process.exitCode === 1
  console.log(failed ? 'DISCRIMINATES SELF-TEST: FAIL' : 'DISCRIMINATES SELF-TEST: PASS')
})

// ── fixtures in the EXACT metrics.json / judge.json shapes from the contract ─────

// A WORSE UI: low Lighthouse, axe criticals, overflow at a breakpoint, low judge.overall.
const worseMetrics = {
  url: 'http://localhost:3000',
  pages: {
    '/': {
      lighthouse: { performance: 40, accessibility: 55, bestPractices: 60, seo: 70 },
      axe: {
        critical: 2,
        serious: 3,
        moderate: 1,
        minor: 0,
        violations: [{ id: 'color-contrast', impact: 'critical', nodes: 4, help: 'low contrast' }],
      },
      vitals: { lcp: 5.2, cls: 0.4, inp: 600 },
      responsive: {
        mobile: { overflowX: true, clipped: false, scrollW: 520, clientW: 390 },
        tablet: { overflowX: false, clipped: false, scrollW: 768, clientW: 768 },
        desktop: { overflowX: false, clipped: false, scrollW: 1280, clientW: 1280 },
      },
    },
  },
  errors: [],
}
const worseJudge = {
  pages: {
    '/': {
      perBreakpoint: {},
      scores: { hierarchy: 3, spacing: 3, alignment: 4, consistency: 3, affordance: 3, readability: 4 },
      overall: 3.3,
      verdict: 'flat, cramped, low contrast',
    },
  },
  candidates: [{ title: 'Raise body-text contrast', lens: 'readability', rationale: 'low contrast', effort: 'S', expectedImpact: 'M' }],
}

// A BETTER UI: high Lighthouse, zero axe, no overflow, high judge.overall.
const betterMetrics = {
  url: 'http://localhost:3000',
  pages: {
    '/': {
      lighthouse: { performance: 92, accessibility: 97, bestPractices: 96, seo: 98 },
      axe: { critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] },
      vitals: { lcp: 1.6, cls: 0.02, inp: 80 },
      responsive: {
        mobile: { overflowX: false, clipped: false, scrollW: 390, clientW: 390 },
        tablet: { overflowX: false, clipped: false, scrollW: 768, clientW: 768 },
        desktop: { overflowX: false, clipped: false, scrollW: 1280, clientW: 1280 },
      },
    },
  },
  errors: [],
}
const betterJudge = {
  pages: {
    '/': {
      perBreakpoint: {},
      scores: { hierarchy: 9, spacing: 8, alignment: 9, consistency: 9, affordance: 8, readability: 9 },
      overall: 8.7,
      verdict: 'clear hierarchy, comfortable rhythm',
      betterThanPrev: true,
      betterReason: 'tighter spacing, higher contrast',
    },
  },
  candidates: [{ title: 'Tighten hero vertical rhythm', lens: 'spacing', rationale: 'rhythm', effort: 'S', expectedImpact: 'S' }],
}

// A PERFECT UI: all 100 Lighthouse, zero axe, no overflow, judge.overall 10.
const perfectMetrics = {
  url: 'http://localhost:3000',
  pages: {
    '/': {
      lighthouse: { performance: 100, accessibility: 100, bestPractices: 100, seo: 100 },
      axe: { critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] },
      vitals: { lcp: 0.9, cls: 0, inp: 30 },
      responsive: {
        mobile: { overflowX: false, clipped: false, scrollW: 390, clientW: 390 },
        tablet: { overflowX: false, clipped: false, scrollW: 768, clientW: 768 },
        desktop: { overflowX: false, clipped: false, scrollW: 1280, clientW: 1280 },
      },
    },
  },
  errors: [],
}
const perfectJudge = {
  pages: {
    '/': {
      perBreakpoint: {},
      scores: { hierarchy: 10, spacing: 10, alignment: 10, consistency: 10, affordance: 10, readability: 10 },
      overall: 10,
      verdict: 'exemplary',
    },
  },
  candidates: [],
}

const config = {
  thresholds: { accessibility: 95, bestPractices: 95, performance: 90, seo: 95, visual: 8.0 },
  regressTolerance: 2,
}

// ── tests ───────────────────────────────────────────────────────────────────────

test('worse UI scores strictly below better UI', () => {
  const worse = computeRound({ metrics: worseMetrics, judge: worseJudge })
  const better = computeRound({ metrics: betterMetrics, judge: betterJudge })
  assert.ok(
    better.roundScore > worse.roundScore,
    `expected better (${better.roundScore}) > worse (${worse.roundScore})`,
  )
})

test('accessibility regression vs prev => revert', () => {
  // prev = the better, accepted round (carries its metrics so the LH-regression check can see it).
  const prev = { ...computeRound({ metrics: betterMetrics, judge: betterJudge }), metrics: betterMetrics }
  // candidate round: a11y craters from 97 -> 60 (drop 37 >> tolerance 2), everything else healthy.
  const regressedMetrics = {
    url: 'http://localhost:3000',
    pages: {
      '/': {
        lighthouse: { performance: 92, accessibility: 60, bestPractices: 96, seo: 98 },
        axe: { critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] },
        vitals: { lcp: 1.6, cls: 0.02, inp: 80 },
        responsive: {
          mobile: { overflowX: false, clipped: false, scrollW: 390, clientW: 390 },
          tablet: { overflowX: false, clipped: false, scrollW: 768, clientW: 768 },
          desktop: { overflowX: false, clipped: false, scrollW: 1280, clientW: 1280 },
        },
      },
    },
    errors: [],
  }
  const regressedJudge = {
    pages: {
      '/': {
        perBreakpoint: {},
        scores: { hierarchy: 9, spacing: 8, alignment: 9, consistency: 9, affordance: 8, readability: 7 },
        overall: 8.3,
        verdict: 'looks fine but a11y tanked',
        betterThanPrev: 'equal',
      },
    },
    candidates: [],
  }
  const res = computeRound({ metrics: regressedMetrics, judge: regressedJudge, prev, config })
  assert.equal(res.decision, 'revert', `expected revert, got ${res.decision}: ${res.rationale}`)
  assert.equal(res.accepted, false)
})

test('genuine improvement vs prev => accept', () => {
  // prev = a mediocre accepted round; candidate genuinely improves with no regression.
  const prev = { ...computeRound({ metrics: worseMetrics, judge: worseJudge }), metrics: worseMetrics }
  const res = computeRound({
    metrics: betterMetrics,
    judge: betterJudge, // betterThanPrev: true
    regression: { before: 'round-0', after: 'round-1', perShot: {}, maxChangedPct: 22.0, note: 'intended' },
    prev,
    config,
    buildPass: true,
  })
  assert.equal(res.decision, 'accept', `expected accept, got ${res.decision}: ${res.rationale}`)
  assert.equal(res.accepted, true)
  assert.ok(res.delta > 0, `expected positive delta, got ${res.delta}`)
})

test('perfect site scores ~100 (weights sum to 1.0, not capped at 80)', () => {
  const res = computeRound({ metrics: perfectMetrics, judge: perfectJudge })
  assert.equal(res.components.objective, 100, `objective should be 100, got ${res.components.objective}`)
  assert.equal(res.components.visual, 100, `visual should be 100, got ${res.components.visual}`)
  assert.equal(res.roundScore, 100, `roundScore should be 100, got ${res.roundScore}`)
})

test('round 0 (no prev) => baseline, not accepted', () => {
  const res = computeRound({ metrics: betterMetrics, judge: betterJudge })
  assert.equal(res.decision, 'baseline')
  assert.equal(res.accepted, false)
  assert.equal(res.delta, 0)
  assert.equal(res.prevRoundScore, 0)
})

test('a failing build blocks accept even on a real improvement', () => {
  const prev = { ...computeRound({ metrics: worseMetrics, judge: worseJudge }), metrics: worseMetrics }
  const res = computeRound({ metrics: betterMetrics, judge: betterJudge, prev, config, buildPass: false })
  assert.equal(res.decision, 'revert', `failing build must revert, got ${res.decision}`)
})

test('motion that ignores prefers-reduced-motion is penalized; respecting it is not', () => {
  // Same page, identical except the motion block. A parallax that keeps moving under
  // reduced-motion is an a11y defect => lower objective than one that goes static.
  const withMotion = (respected) => ({
    url: 'http://localhost:3000',
    pages: {
      '/': {
        ...betterMetrics.pages['/'],
        motion: { selector: '[data-parallax]', motionActive: true, reducedMotionRespected: respected },
      },
    },
    errors: [],
  })
  const respected = computeRound({ metrics: withMotion(true), judge: betterJudge })
  const ignored = computeRound({ metrics: withMotion(false), judge: betterJudge })
  assert.ok(
    respected.components.objective > ignored.components.objective,
    `reduced-motion-respected (${respected.components.objective}) must beat ignored (${ignored.components.objective})`,
  )
  // And a page with NO motion block scores exactly like the reduced-motion-respected one (back-compat).
  const none = computeRound({ metrics: betterMetrics, judge: betterJudge })
  assert.equal(
    none.components.objective, respected.components.objective,
    'a page with no motion block must be unaffected by the motion penalty',
  )
})

test('sparse-but-well-formed input does not crash', () => {
  const res = computeRound({ metrics: { pages: { '/': {} } }, judge: { pages: { '/': {} } } })
  assert.equal(typeof res.roundScore, 'number')
  assert.equal(res.decision, 'baseline')
})

// ── taste-validation bake: banded structural rubric + plateau-rediagnose (2026-06-18) ──────────
//
// All structural fixtures share ONE healthy metrics block, so the OBJECTIVE half is constant and the
// roundScore separation comes PURELY from the visual (structural) half — that's the point of the bake.
// NOTE: deliberately NO `motion` block on these judge-only fixtures (the v0.3.0 fail-closed motion gate
// must not trip on structural fixtures — see plan invariant 3 / brief §D).
const healthyMetrics = {
  url: 'http://localhost:3000',
  pages: {
    '/': {
      lighthouse: { performance: 92, accessibility: 97, bestPractices: 96, seo: 98 },
      axe: { critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] },
      vitals: { lcp: 1.6, cls: 0.02, inp: 80 },
      responsive: {
        mobile: { overflowX: false, clipped: false, scrollW: 390, clientW: 390 },
        tablet: { overflowX: false, clipped: false, scrollW: 768, clientW: 768 },
        desktop: { overflowX: false, clipped: false, scrollW: 1280, clientW: 1280 },
      },
    },
  },
  errors: [],
}

// legibility order = hierarchy/spacing/alignment/consistency/affordance/readability
// structural order = depth/cohesion/rhythm/hierarchyContrast/distinctiveness
const judgeOf = (leg, str, verdict) => ({
  pages: {
    '/': {
      perBreakpoint: {},
      scores: {
        hierarchy: leg[0], spacing: leg[1], alignment: leg[2], consistency: leg[3], affordance: leg[4], readability: leg[5],
        depth: str[0], cohesion: str[1], rhythm: str[2], hierarchyContrast: str[3], distinctiveness: str[4],
      },
      verdict,
    },
  },
  candidates: [],
})

// Late-binding (brief §B / PR-3 swap-in): if an env var points at a REAL captured round-6 judge.json,
// use it instead of the structurally-honest synthetic — no test rewrite when the operator's pick lands.
const realOrSynthetic = (envVar, synthetic) => {
  const p = process.env[envVar]
  if (p && existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      /* fall through to synthetic on malformed real fixture */
    }
  }
  return synthetic
}

// The six fixtures from the plan table (legibility six | structural five).
const genericOriginal = judgeOf([7, 6, 7, 7, 7, 6], [2, 6, 2, 4, 2], 'clean hero, generic (system font / indigo-on-white)')
const objectSoup = judgeOf([7, 6, 7, 7, 7, 6], [2, 2, 2, 4, 2], 'object-soup: orbs + shapes + dot grid, piled on')
const tooSubtle = judgeOf([8, 8, 8, 7, 6, 8], [2, 7, 2, 4, 2], 'too-subtle: single faint aurora on flat white (the band trap)')
const round6Editorial = realOrSynthetic('UI_EVOLVE_ROUND6_FIXTURE', judgeOf([8, 8, 8, 8, 8, 8], [8, 9, 8, 8, 9], 'warm serif, timeline rhythm, terracotta POV'))
const round6Terminal = realOrSynthetic('UI_EVOLVE_ROUND6_FIXTURE_TERMINAL', judgeOf([8, 8, 8, 8, 8, 8], [8, 8, 9, 8, 9], 'dark mono, grid depth, signal-lime POV'))
const round6Swiss = realOrSynthetic('UI_EVOLVE_ROUND6_FIXTURE_SWISS', judgeOf([8, 8, 8, 8, 8, 8], [9, 8, 9, 9, 8], 'numbered grid, hairline rhythm, Archivo POV'))

const tasteConfig = {
  thresholds: { accessibility: 95, bestPractices: 95, performance: 90, seo: 95, visual: 8.0 },
  regressTolerance: 2,
  structuralWeight: 0.5, // 0.5 / 0.5 default; structuralFloor cap intentionally OFF (soft weighting first)
}

// score a judge-only fixture against the shared healthy metrics (baseline path; diagnosis still emitted).
const scoreFixture = (judge) => computeRound({ metrics: healthyMetrics, judge, config: tasteConfig })

test('AC3/AC4/AC5 — banded structural rubric: just-right > BOTH extremes; object-soup < generic', () => {
  const generic = scoreFixture(genericOriginal).roundScore
  const soup = scoreFixture(objectSoup).roundScore
  const subtle = scoreFixture(tooSubtle).roundScore
  const rounds6 = { editorial: scoreFixture(round6Editorial).roundScore, terminal: scoreFixture(round6Terminal).roundScore, swiss: scoreFixture(round6Swiss).roundScore }

  for (const [name, rs] of Object.entries(rounds6)) {
    // AC3: each round-6 redesign clears the generic original by a strict margin (> 5 pts).
    assert.ok(rs - generic > 5, `AC3: round6${name} (${rs}) - generic (${generic}) must be > 5`)
    // AC4: each round-6 beats BOTH band extremes (the 3-way band: just-right > too-subtle AND > object-soup).
    assert.ok(rs > subtle, `AC4: round6${name} (${rs}) must beat tooSubtle (${subtle})`)
    assert.ok(rs > soup, `AC4: round6${name} (${rs}) must beat objectSoup (${soup})`)
  }
  // AC5: object-soup now scores BELOW the clean original (cohesion/noise dims bite) — un-ties the old 6.7/6.7.
  assert.ok(soup < generic, `AC5: objectSoup (${soup}) must be below genericOriginal (${generic})`)
})

test('AC6 — plateau re-diagnose: tooSubtle bottleneck is structural; weakest dims are structural', () => {
  const diag = scoreFixture(tooSubtle).diagnosis
  assert.equal(diag.bottleneckBlock, 'structural', `bottleneckBlock should be structural, got ${diag.bottleneckBlock}`)
  assert.ok(diag.structuralBlock < diag.legibilityBlock, `structuralBlock (${diag.structuralBlock}) must be below legibilityBlock (${diag.legibilityBlock})`)
  assert.ok(diag.weakestDims.length >= 2, 'at least two weakest dims reported')
  for (const w of diag.weakestDims) {
    assert.equal(w.block, 'structural', `weakest dim ${w.dim} should be tagged structural, got ${w.block}`)
  }
})

test('AC6b — diagnosis is emitted on EVERY round (baseline + accept/revert paths)', () => {
  const baseline = scoreFixture(round6Editorial)
  assert.equal(baseline.decision, 'baseline')
  assert.ok(baseline.diagnosis && baseline.diagnosis.bottleneckBlock, 'baseline round.json carries a diagnosis')
  const prev = { ...scoreFixture(genericOriginal), metrics: healthyMetrics }
  const next = computeRound({ metrics: healthyMetrics, judge: round6Editorial, prev, config: tasteConfig })
  assert.ok(next.diagnosis && next.diagnosis.bottleneckBlock, 'non-baseline round.json carries a diagnosis')
})

test('AC7 — structural-only pair separates by > 5 (the both-ends proof the structural five are consumed)', () => {
  // Two fixtures IDENTICAL on the legibility six, differing ONLY on the structural five. Each carries the
  // SAME `overall` (8.0), so the OLD legibility-only scorer (which reads `overall`) would TIE them (diff 0,
  // fails > 5 RED). The NEW scorer recomputes from the structural block -> they separate (> 5 GREEN).
  const structLow = { pages: { '/': { scores: { hierarchy: 8, spacing: 8, alignment: 8, consistency: 8, affordance: 8, readability: 8, depth: 2, cohesion: 2, rhythm: 2, hierarchyContrast: 2, distinctiveness: 2 }, overall: 8.0 } } }
  const structHigh = { pages: { '/': { scores: { hierarchy: 8, spacing: 8, alignment: 8, consistency: 8, affordance: 8, readability: 8, depth: 9, cohesion: 9, rhythm: 9, hierarchyContrast: 9, distinctiveness: 9 }, overall: 8.0 } } }
  const low = computeRound({ metrics: healthyMetrics, judge: structLow, config: tasteConfig }).roundScore
  const high = computeRound({ metrics: healthyMetrics, judge: structHigh, config: tasteConfig }).roundScore
  assert.ok(high - low > 5, `AC7: structHigh (${high}) - structLow (${low}) must be > 5 — proves the structural five move the score`)
})

test('tasteVsPrev = worse blocks accept even when the objective/roundScore improved', () => {
  // prev = a mediocre accepted round; candidate has a HIGHER roundScore but the judge flags taste worse.
  const prev = { ...scoreFixture(genericOriginal), metrics: healthyMetrics }
  const tasteRegressedJudge = judgeOf([8, 8, 8, 8, 8, 8], [8, 8, 8, 8, 9], 'higher score but uglier')
  tasteRegressedJudge.pages['/'].tasteVsPrev = 'worse'
  const res = computeRound({ metrics: healthyMetrics, judge: tasteRegressedJudge, prev, config: tasteConfig })
  assert.ok(res.delta > 0, `sanity: roundScore should have improved (delta ${res.delta})`)
  assert.equal(res.decision, 'revert', `a taste regression must revert, got ${res.decision}: ${res.rationale}`)
})

test('visualOverall band: neither object-soup nor too-subtle out-scores a structurally-real page', () => {
  // unit-level proof the BLOCK peaks in the middle (independent of objective half).
  const soupScores = objectSoup.pages['/'].scores
  const subtleScores = tooSubtle.pages['/'].scores
  const realScores = round6Swiss.pages['/'].scores
  const cfg = { structuralWeight: 0.5 }
  assert.ok(visualOverall(realScores, cfg) > visualOverall(soupScores, cfg), 'round-6 > object-soup')
  assert.ok(visualOverall(realScores, cfg) > visualOverall(subtleScores, cfg), 'round-6 > too-subtle')
})

test('structuralFloor cap (opt-in) pulls a legible-but-empty page down; OFF by default', () => {
  // High legibility (10) but a low structural block (3 < floor 6): soft weighting yields 6.5, which the
  // opt-in floor pulls back down to 6.0 — the cleanest encoding of "legible-but-empty is not good".
  const emptyButLegible = { hierarchy: 10, spacing: 10, alignment: 10, consistency: 10, affordance: 10, readability: 10, depth: 3, cohesion: 3, rhythm: 3, hierarchyContrast: 3, distinctiveness: 3 }
  const soft = visualOverall(emptyButLegible, { structuralWeight: 0.5 }) // floor OFF
  const capped = visualOverall(emptyButLegible, { structuralWeight: 0.5, structuralFloor: 6.0 })
  assert.ok(capped <= 6.0, `floor must cap at 6.0, got ${capped}`)
  assert.ok(soft > capped, `cap must lower the score (soft ${soft} vs capped ${capped})`)
})

// ── explore mode: N-way committed-directions tournament + config defaults + workflow validity (Phase 3) ──

test('rankDirections — high-structural direction outranks mid/low (ranks on the structural block)', () => {
  // Three judged directions, all with the SAME healthy legibility six; they differ on the structural five.
  const high = judgeOf([8, 8, 8, 8, 8, 8], [9, 9, 9, 9, 9], 'committed: deep, cohesive, varied')
  const mid = judgeOf([8, 8, 8, 8, 8, 8], [5, 5, 5, 5, 5], 'partway there')
  const low = judgeOf([8, 8, 8, 8, 8, 8], [2, 2, 2, 2, 2], 'flat, generic')
  const { ranking, winnerIndex } = rankDirections([low, high, mid], { structuralWeight: 0.5 })
  assert.equal(winnerIndex, 1, `high-structural (input index 1) must win, got ${winnerIndex}`)
  assert.equal(ranking[0].index, 1, 'top of ranking is the high-structural direction')
  assert.equal(ranking[1].index, 2, 'mid ranks second')
  assert.equal(ranking[2].index, 0, 'low ranks last')
  assert.ok(ranking[0].structuralBlock > ranking[1].structuralBlock, 'ranking is sorted DESC by structural block')
})

test('rankDirections both-ends — ranks on the structural block, not the reported overall (structural-blind would TIE)', () => {
  // BOTH candidates carry an IDENTICAL legibility six AND an IDENTICAL reported `overall` (8.0); they
  // differ ONLY on the structural five. A structural-BLIND ranking (reading only `overall`/legibility)
  // would TIE them and could not pick a winner -> RED. Ranking on the STRUCTURAL block separates them by
  // a wide margin -> GREEN. Same both-ends shape as the AC7 structural-only-pair proof above.
  const structHigh = { pages: { '/': { scores: { hierarchy: 8, spacing: 8, alignment: 8, consistency: 8, affordance: 8, readability: 8, depth: 9, cohesion: 9, rhythm: 9, hierarchyContrast: 9, distinctiveness: 9 }, overall: 8.0 } } }
  const structLow = { pages: { '/': { scores: { hierarchy: 8, spacing: 8, alignment: 8, consistency: 8, affordance: 8, readability: 8, depth: 2, cohesion: 2, rhythm: 2, hierarchyContrast: 2, distinctiveness: 2 }, overall: 8.0 } } }
  const { ranking, winnerIndex } = rankDirections([structLow, structHigh], { structuralWeight: 0.5 })
  assert.equal(winnerIndex, 1, 'high-structural wins despite the identical reported overall (8.0)')
  assert.ok(
    ranking[0].structuralBlock - ranking[1].structuralBlock > 5,
    `structural block must separate the two (${ranking[0].structuralBlock} vs ${ranking[1].structuralBlock})`,
  )
})

test('rankDirections — empty input is safe (winnerIndex -1, empty ranking)', () => {
  const { ranking, winnerIndex } = rankDirections([], { structuralWeight: 0.5 })
  assert.equal(winnerIndex, -1)
  assert.equal(ranking.length, 0)
})

test('resolveExploreConfig — defaults to refine/3/brief-path; explore only when explicitly set', () => {
  for (const input of [{}, undefined, null, { mode: 'something-else' }]) {
    const r = resolveExploreConfig(input)
    assert.equal(r.mode, 'refine', `mode should default to refine for ${JSON.stringify(input)}`)
    assert.equal(r.exploreDirections, 3, 'exploreDirections defaults to 3')
    assert.equal(r.directionBrief, 'references/direction-brief.md', 'directionBrief defaults to the brief path')
  }
  const ex = resolveExploreConfig({ mode: 'explore', exploreDirections: 5, directionBrief: 'custom/brief.md' })
  assert.equal(ex.mode, 'explore')
  assert.equal(ex.exploreDirections, 5)
  assert.equal(ex.directionBrief, 'custom/brief.md')
  // Bad exploreDirections (non-integer / <=0) falls back to 3.
  assert.equal(resolveExploreConfig({ exploreDirections: 0 }).exploreDirections, 3)
  assert.equal(resolveExploreConfig({ exploreDirections: 2.5 }).exploreDirections, 3)
})

test('workflow-validity — round-workflow.mjs is valid inside the runtime async-fn wrapper', () => {
  // A BARE `node --check references/round-workflow.mjs` FAILS by design (the file legally uses top-level
  // `await`/`return` + injected globals — the same reason scripts/lint.mjs skips *-workflow.mjs). The
  // achievable validity guarantee is the WRAPPED check: the Workflow runtime wraps the body in an async
  // function. We reproduce that here by stripping the module `export` keyword (the runtime hoists `meta`
  // separately) and constructing the body as an async-function body via the AsyncFunction constructor —
  // which parses (but does not execute) it, throwing a SyntaxError if the workflow body is malformed.
  const src = readFileSync(new URL('../references/round-workflow.mjs', import.meta.url), 'utf8')
  const body = src.replace(/^[ \t]*export[ \t]+/gm, '') // strip `export ` so the body is wrappable
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  assert.doesNotThrow(
    () => new AsyncFunction(body),
    'round-workflow.mjs must be syntactically valid as the body of the runtime async-fn wrapper',
  )
})

// ── taste band-calibration (Phase 4): resolveTasteConfig defaults + live-harness wrapped-validity ──

test('resolveTasteConfig — defaults to the conventional pole dirs + brief; explicit overrides respected', () => {
  const defaults = {
    tooBusy: 'references/taste-exemplars/too-busy',
    tooSubtle: 'references/taste-exemplars/too-subtle',
    genericBad: 'references/taste-exemplars/generic-bad',
    distinctiveGood: 'references/taste-exemplars/distinctive-good',
  }
  // absent / {} / non-object / absent tasteExemplars all resolve to the default paths (back-compat).
  for (const input of [{}, undefined, null, { mode: 'explore' }, { tasteExemplars: null }]) {
    const r = resolveTasteConfig(input)
    assert.deepEqual(r.tasteExemplars, defaults, `tasteExemplars should default for ${JSON.stringify(input)}`)
    assert.equal(r.tasteBrief, 'references/taste-brief.md', 'tasteBrief defaults to the brief path')
  }
  // explicit overrides respected (full + partial — a partial override keeps defaults for the rest).
  const full = resolveTasteConfig({
    tasteExemplars: { tooBusy: 'a/busy', tooSubtle: 'a/subtle', genericBad: 'a/generic', distinctiveGood: 'a/good' },
    tasteBrief: 'a/brief.md',
  })
  assert.deepEqual(full.tasteExemplars, { tooBusy: 'a/busy', tooSubtle: 'a/subtle', genericBad: 'a/generic', distinctiveGood: 'a/good' })
  assert.equal(full.tasteBrief, 'a/brief.md')
  const partial = resolveTasteConfig({ tasteExemplars: { distinctiveGood: 'custom/good' } })
  assert.equal(partial.tasteExemplars.distinctiveGood, 'custom/good', 'override respected')
  assert.equal(partial.tasteExemplars.tooBusy, defaults.tooBusy, 'unset pole keeps its default')
  assert.equal(partial.tasteBrief, 'references/taste-brief.md', 'unset tasteBrief keeps its default')
})

test('workflow-validity — taste-discriminates-live.mjs is valid inside the runtime async-fn wrapper', () => {
  // Mirrors the round-workflow.mjs proof above: the live harness legally uses top-level `await`/`return`
  // + injected agent globals, so a BARE `node --check` FAILS by design (scripts/lint.mjs defers it, same
  // as the workflow scripts). The achievable static guarantee is the WRAPPED check — strip the module
  // `export` keyword and construct the body as an async-function body, which parses (but does not execute)
  // it, throwing a SyntaxError if the harness body is malformed.
  const src = readFileSync(new URL('./taste-discriminates-live.mjs', import.meta.url), 'utf8')
  const body = src.replace(/^[ \t]*export[ \t]+/gm, '') // strip `export ` so the body is wrappable
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  assert.doesNotThrow(
    () => new AsyncFunction(body),
    'taste-discriminates-live.mjs must be syntactically valid as the body of the runtime async-fn wrapper',
  )
})
