#!/usr/bin/env node
// score.mjs — turns a round's metrics.json + judge.json (+ optional regression.json) into round.json
// per the contract (### roundScore formula / ### accept / revert decision). Pure scorer + CLI wrapper.
//
//   node tools/score.mjs --round <round-dir> [--prev <prev-accepted-round-dir>] \
//                        [--config <config.json>] [--build-pass true|false]
//
// computeRound() is a PURE function (no I/O, deterministic) — the self-test imports it. The CLI reads
// the round's files, calls computeRound(), writes <round-dir>/round.json (2-space). Fails closed on
// malformed input (bad JSON => non-zero, nothing written).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// ── scoring weights (MUST sum to 1.0 so a perfect site scores 100) ──────────────
const LH_WEIGHTS = { accessibility: 0.35, performance: 0.30, bestPractices: 0.20, seo: 0.15 }
const AXE_PENALTY = { critical: 15, serious: 8 }
const OVERFLOW_PENALTY = 10
// A motion effect (parallax/scroll-driven) that does NOT go static under prefers-reduced-motion is an
// accessibility defect (vestibular-disorder trigger). Penalize only when capture observed motion AND
// proved the reduced-motion fallback failed; pages with no motion block are unaffected (back-compat).
const MOTION_REDUCED_PENALTY = 12
const DEFAULT_REGRESS_TOLERANCE = 2

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const round1 = (n) => Math.round(n * 10) / 10
const num = (v, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

// ── visual-judge dimension blocks (taste-validation bake, 2026-06-18) ───────────
// The judge scores ELEVEN dims, split into two OPPOSING blocks so the weighted overall
// PEAKS in the sweet spot (neither a busy nor an empty page maxes the structural block).
//   legibility  = can you read/use it (correctness; the original six).
//   structural  = is it deep / cohesive / varied / committed (taste; the new five).
const LEGIBILITY_DIMS = ['hierarchy', 'spacing', 'alignment', 'consistency', 'affordance', 'readability']
const STRUCTURAL_DIMS = ['depth', 'cohesion', 'rhythm', 'hierarchyContrast', 'distinctiveness']

// A page carries the structural block only when ALL five structural dims are present numbers.
// Sparse / round-0 / legacy judge.json (legibility-only) returns false -> back-compat fallback.
const hasStructural = (scores) => !!scores && STRUCTURAL_DIMS.every((d) => isNum(scores[d]))

const blockMean = (scores, dims) => mean(dims.map((d) => num(scores?.[d])))

/**
 * visualOverall(scores, {structuralWeight, structuralFloor}) -> 0–10 weighted-block score.
 * = structuralWeight*structuralBlock + (1-structuralWeight)*legibilityBlock  (default 0.5/0.5).
 * Optional structuralFloor (default OFF/undefined): if set AND structuralBlock < floor, cap the
 * result at 6.0 — the cleanest single encoding of "legible-but-empty is not good". Ships OFF.
 */
export function visualOverall(scores, { structuralWeight = 0.5, structuralFloor } = {}) {
  const w = isNum(structuralWeight) ? clamp(structuralWeight, 0, 1) : 0.5
  const structural = blockMean(scores, STRUCTURAL_DIMS)
  const legibility = blockMean(scores, LEGIBILITY_DIMS)
  let overall = w * structural + (1 - w) * legibility
  if (isNum(structuralFloor) && structural < structuralFloor) overall = Math.min(overall, 6.0)
  return overall
}

// objective sub-score (0–100) for a single page's metrics entry.
function pageObjective(page) {
  const lh = page?.lighthouse || {}
  let score =
    LH_WEIGHTS.accessibility * num(lh.accessibility) +
    LH_WEIGHTS.performance * num(lh.performance) +
    LH_WEIGHTS.bestPractices * num(lh.bestPractices) +
    LH_WEIGHTS.seo * num(lh.seo)
  const axe = page?.axe || {}
  score -= AXE_PENALTY.critical * num(axe.critical)
  score -= AXE_PENALTY.serious * num(axe.serious)
  const resp = page?.responsive || {}
  for (const bp of Object.values(resp)) {
    if (bp && (bp.overflowX === true || bp.clipped === true)) score -= OVERFLOW_PENALTY
  }
  const motion = page?.motion || null
  if (motion && motion.reducedMotionRespected === false) score -= MOTION_REDUCED_PENALTY
  return clamp(score, 0, 100)
}

// objective (0–100) averaged across all pages in metrics.json.
function objectiveScore(metrics) {
  const pages = metrics?.pages || {}
  const per = Object.values(pages).map(pageObjective)
  return per.length ? mean(per) : 0
}

// visual (0–100), averaged across all pages in judge.json. Per page: when the structural block
// is present, recompute overall from the weighted blocks (visualOverall) so taste moves the score;
// else fall back to the page's reported `overall` (sparse / round-0 / legacy back-compat).
function visualScore(judge, config) {
  const pages = judge?.pages || {}
  const per = Object.values(pages).map((p) =>
    hasStructural(p?.scores) ? visualOverall(p.scores, config || {}) * 10 : num(p?.overall) * 10,
  )
  return per.length ? mean(per) : 0
}

// per-dim averages across all pages (only dims actually present, so sparse inputs stay honest).
function dimAverages(judge) {
  const pages = Object.values(judge?.pages || {})
  const acc = {}
  for (const p of pages) {
    const s = p?.scores || {}
    for (const dim of [...LEGIBILITY_DIMS, ...STRUCTURAL_DIMS]) {
      if (isNum(s[dim])) {
        acc[dim] = acc[dim] || { sum: 0, count: 0 }
        acc[dim].sum += s[dim]
        acc[dim].count += 1
      }
    }
  }
  const out = {}
  for (const [dim, { sum, count }] of Object.entries(acc)) out[dim] = sum / count
  return out
}

const presentBlockMean = (avgs, dims) => {
  const vals = dims.filter((d) => isNum(avgs[d])).map((d) => avgs[d])
  return vals.length ? mean(vals) : null
}

// weakestDims(judge, n): the n lowest-scoring dims across BOTH blocks, each tagged with its block.
// Drives plateau re-diagnosis ("the weakest layer is structural -> stop tuning the backdrop").
export function weakestDims(judge, n = 2) {
  const avgs = dimAverages(judge)
  const tagged = Object.entries(avgs).map(([dim, score]) => ({
    dim,
    score: round1(score),
    block: STRUCTURAL_DIMS.includes(dim) ? 'structural' : 'legibility',
  }))
  tagged.sort((a, b) => a.score - b.score)
  return tagged.slice(0, Math.max(0, n))
}

// diagnosis emitted EVERY round: which block is the bottleneck + its two weakest dims, so the
// next round always has a NAMED target (and SKILL.md can refuse to converge on a structural plateau).
function buildDiagnosis(judge) {
  const avgs = dimAverages(judge)
  const structuralBlock = presentBlockMean(avgs, STRUCTURAL_DIMS)
  const legibilityBlock = presentBlockMean(avgs, LEGIBILITY_DIMS)
  let bottleneckBlock = null
  if (structuralBlock != null && legibilityBlock != null) {
    bottleneckBlock = structuralBlock <= legibilityBlock ? 'structural' : 'legibility'
  } else if (structuralBlock != null) bottleneckBlock = 'structural'
  else if (legibilityBlock != null) bottleneckBlock = 'legibility'
  return {
    weakestDims: weakestDims(judge, 2),
    bottleneckBlock,
    structuralBlock: structuralBlock == null ? null : round1(structuralBlock),
    legibilityBlock: legibilityBlock == null ? null : round1(legibilityBlock),
  }
}

// taste aggregator (mirrors judgeBetterThanPrev): 'worse' if ANY page reports a taste regression.
export function tasteVsPrev(judge) {
  const pages = judge?.pages || {}
  let sawWorse = false
  let sawBetter = false
  for (const page of Object.values(pages)) {
    const t = page?.tasteVsPrev
    if (t === false || t === 'worse') sawWorse = true
    else if (t === true || t === 'better') sawBetter = true
  }
  if (sawWorse) return 'worse'
  if (sawBetter) return 'better'
  return 'equal'
}

// thresholdsMet: true only if config.thresholds present AND every page clears every bar.
function computeThresholdsMet(metrics, judge, config) {
  const t = config?.thresholds
  if (!t) return false
  const metricPages = metrics?.pages || {}
  const judgePages = judge?.pages || {}
  if (!Object.keys(metricPages).length) return false
  const ge = (v, bar) => num(v, -Infinity) >= bar
  for (const page of Object.values(metricPages)) {
    const lh = page?.lighthouse || {}
    if (!ge(lh.accessibility, t.accessibility ?? 95)) return false
    if (!ge(lh.bestPractices, t.bestPractices ?? 95)) return false
    if (!ge(lh.performance, t.performance ?? 90)) return false
    if (!ge(lh.seo, t.seo ?? 95)) return false
    const axe = page?.axe || {}
    if (num(axe.critical) > 0 || num(axe.serious) > 0) return false
    const resp = page?.responsive || {}
    for (const bp of Object.values(resp)) {
      if (bp && (bp.overflowX === true || bp.clipped === true)) return false
    }
    const motion = page?.motion || null
    if (motion && motion.reducedMotionRespected === false) return false
  }
  const visualBar = t.visual ?? 8.0
  for (const page of Object.values(judgePages)) {
    if (!ge(page?.overall, visualBar)) return false
  }
  return true
}

// worst (max) axe count of a kind across all pages — for the "no NEW axe" regression check.
function maxAxe(metrics, kind) {
  const pages = metrics?.pages || {}
  let m = 0
  for (const page of Object.values(pages)) m = Math.max(m, num(page?.axe?.[kind]))
  return m
}

// worst (min) LH category across all pages — for the "category dropped" regression check.
function minLh(metrics, cat) {
  const pages = metrics?.pages || {}
  const vals = Object.values(pages).map((p) => num(p?.lighthouse?.[cat]))
  return vals.length ? Math.min(...vals) : 0
}

// judge.betterThanPrev across pages: false if ANY page says false (conservative).
function judgeBetterThanPrev(judge) {
  const pages = judge?.pages || {}
  let sawFalse = false
  let sawTrue = false
  for (const page of Object.values(pages)) {
    const b = page?.betterThanPrev
    if (b === false) sawFalse = true
    else if (b === true) sawTrue = true
  }
  if (sawFalse) return false
  if (sawTrue) return true
  return undefined // "equal" or omitted everywhere
}

// first candidate echoed into round.json (round.json holds a single `candidate`).
function firstCandidate(judge) {
  const list = judge?.candidates
  if (Array.isArray(list) && list.length) {
    const c = list[0]
    return { title: c?.title ?? null, lens: c?.lens ?? null }
  }
  return null
}

/**
 * PURE: build the full round.json object. No file I/O, deterministic, no network.
 * @param {object} a
 * @param {object} a.metrics    parsed metrics.json
 * @param {object} a.judge      parsed judge.json
 * @param {object} [a.regression] parsed regression.json (optional)
 * @param {object} [a.prev]     prev accepted round.json (null/undefined => round 0 baseline)
 * @param {object} [a.config]   parsed config.json (thresholds, regressTolerance)
 * @param {boolean} [a.buildPass] target build/test/smoke exit-0 (default true; false blocks accept)
 */
export function computeRound({ metrics, judge, regression, prev, config, buildPass } = {}) {
  const objective = objectiveScore(metrics)
  const visual = visualScore(judge, config)
  const roundScore = round1(0.5 * objective + 0.5 * visual)

  const hasPrev = prev != null && typeof prev === 'object'
  const prevRoundScore = hasPrev ? num(prev.roundScore) : 0
  const delta = hasPrev ? round1(roundScore - prevRoundScore) : 0
  const thresholdsMet = computeThresholdsMet(metrics, judge, config)
  const candidate = firstCandidate(judge)
  const roundNumber = num(metrics?.round, hasPrev ? num(prev.round) + 1 : 0)
  // emitted EVERY round so the next round always has a named structural/legibility target.
  const diagnosis = buildDiagnosis(judge)

  // ── round 0 (no prev): baseline, no accept/revert ─────────────────────────────
  if (!hasPrev) {
    return {
      round: roundNumber,
      roundScore,
      components: { objective: round1(objective), visual: round1(visual) },
      prevRoundScore: 0,
      delta: 0,
      thresholdsMet,
      accepted: false,
      decision: 'baseline',
      rationale: 'Round 0 baseline: first measured UI, nothing to accept or revert against.',
      candidate,
      diagnosis,
    }
  }

  // ── accept / revert decision vs prev ──────────────────────────────────────────
  const regressTolerance = num(config?.regressTolerance, DEFAULT_REGRESS_TOLERANCE)
  const reasons = []

  // 1) delta must be a real improvement.
  const deltaOk = delta > 0
  if (!deltaOk) reasons.push(`roundScore did not improve (delta ${delta} <= 0)`)

  // 2) no LH category dropped by more than regressTolerance vs prev.
  let lhRegressed = false
  const prevMetrics = prev.metrics // optional: prev round.json may carry its metrics for the check
  if (prevMetrics) {
    for (const cat of ['accessibility', 'performance', 'bestPractices', 'seo']) {
      const drop = minLh(prevMetrics, cat) - minLh(metrics, cat)
      if (drop > regressTolerance) {
        lhRegressed = true
        reasons.push(`Lighthouse ${cat} dropped ${round1(drop)} (> tolerance ${regressTolerance})`)
      }
    }
  }

  // 3) no NEW axe critical/serious vs prev.
  let newAxe = false
  if (prevMetrics) {
    for (const kind of ['critical', 'serious']) {
      if (maxAxe(metrics, kind) > maxAxe(prevMetrics, kind)) {
        newAxe = true
        reasons.push(`new axe ${kind} violation introduced vs prev`)
      }
    }
  }

  // 4) regression diff: a large unintended diff is only allowed when the judge confirms it's better.
  let regressionBlocks = false
  if (regression && typeof regression === 'object') {
    const maxChangedPct = num(regression.maxChangedPct)
    const better = judgeBetterThanPrev(judge)
    const highChangeThreshold = num(config?.maxChangedPctThreshold, 40)
    if (maxChangedPct >= highChangeThreshold && better === false) {
      regressionBlocks = true
      reasons.push(
        `large visual diff (maxChangedPct ${maxChangedPct} >= ${highChangeThreshold}) the judge flagged NOT better than prev`,
      )
    }
  }

  // 5) build/test/smoke must not fail.
  const buildOk = buildPass !== false
  if (!buildOk) reasons.push('target build/test/smoke did not exit 0')

  // 6) a TASTE regression blocks accept even if the objective half improved — the judge's
  // pixel-grounded tasteVsPrev is the oracle for "it got uglier" (a busier/emptier redesign).
  const tasteRegressed = tasteVsPrev(judge) === 'worse'
  if (tasteRegressed) reasons.push('taste regressed vs prev (judge tasteVsPrev = worse)')

  const accepted = deltaOk && !lhRegressed && !newAxe && !regressionBlocks && buildOk && !tasteRegressed
  const decision = accepted ? 'accept' : 'revert'
  const rationale = accepted
    ? `Accepted: roundScore rose by ${delta} with no Lighthouse regression beyond tolerance, no new axe critical/serious, no unintended large visual diff, no taste regression, and build passing.`
    : `Reverted: ${reasons.join('; ')}.`

  return {
    round: roundNumber,
    roundScore,
    components: { objective: round1(objective), visual: round1(visual) },
    prevRoundScore: round1(prevRoundScore),
    delta,
    thresholdsMet,
    accepted,
    decision,
    rationale,
    candidate,
    diagnosis,
  }
}

// ── CLI wrapper (runs only when invoked directly) ───────────────────────────────
function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const fail = (msg) => {
  console.error(`score: ${msg}`)
  process.exit(1)
}

function readJson(path, { required = true } = {}) {
  if (!existsSync(path)) {
    if (required) fail(`missing ${path}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    fail(`bad JSON in ${path}: ${e.message}`)
  }
}

function main() {
  const roundDir = arg('round') || fail('missing --round')
  const prevDir = arg('prev')
  const configPath = arg('config')
  const buildPassArg = arg('build-pass')
  const buildPass = buildPassArg == null ? true : buildPassArg !== 'false'

  const metrics = readJson(join(roundDir, 'metrics.json'))
  const judge = readJson(join(roundDir, 'judge.json'))
  const regression = readJson(join(roundDir, 'regression.json'), { required: false })
  const config = configPath ? readJson(configPath) : null
  const prev = prevDir ? readJson(join(prevDir, 'round.json')) : null
  // round.json does NOT carry metrics, but the LH-category-drop + new-axe guards need the prev
  // round's metrics — load them from the prev round dir so those guards actually fire in the CLI.
  if (prev && prevDir) {
    const prevMetrics = readJson(join(prevDir, 'metrics.json'), { required: false })
    if (prevMetrics) prev.metrics = prevMetrics
  }

  // Fail-closed (2026-06-18): if the config declares a `motion` block (the author expects
  // parallax/scroll motion) but the captured metrics carry NO motion data for a page, the capture
  // was almost certainly run with a motion-BLIND tool (e.g. a pre-motion capture.mjs from a stale
  // clone while the motion upgrade still lives in an unshipped worktree). Scoring it would silently
  // drop the reduced-motion a11y penalty and lose the motion evidence. Refuse rather than mis-score.
  if (config?.motion && metrics?.pages) {
    const blind = Object.entries(metrics.pages)
      .filter(([, p]) => !p?.motion || Object.keys(p.motion).length === 0)
      .map(([route]) => route)
    if (blind.length) {
      fail(
        `config declares a motion block but metrics has no motion data for page(s): ${blind.join(', ')}. ` +
          `The capture was likely run with a motion-blind tool — re-run capture.mjs from the motion-aware ` +
          `harness (the build that writes a "motion" key per page) before scoring.`,
      )
    }
  }

  const result = computeRound({ metrics, judge, regression, prev, config, buildPass })

  const outPath = join(roundDir, 'round.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.error(
    `score: round ${result.round} -> ${result.roundScore} ` +
      `(obj ${result.components.objective} / vis ${result.components.visual}) ` +
      `delta ${result.delta} decision=${result.decision} -> wrote ${outPath}`,
  )
}

// Run main only as a CLI (when this file is the entry point), not when imported by the self-test.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main()
