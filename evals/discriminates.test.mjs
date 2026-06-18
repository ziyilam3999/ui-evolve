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
import { computeRound } from '../tools/score.mjs'

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
