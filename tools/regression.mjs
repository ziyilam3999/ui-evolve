#!/usr/bin/env node
// regression.mjs — pixel-diff a round's screenshots vs the last ACCEPTED round.
// For each PNG present in BOTH <before>/shots/ and <after>/shots/ (matched by filename),
// decode with pngjs and count changed pixels with pixelmatch (threshold ~0.1). Writes
// <out>/regression.json per the contract. Fails closed (non-zero, no partial green).
//
//   node tools/regression.mjs --before <round-dir> --after <round-dir> --out <round-dir>

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const fail = (msg) => { console.error(`regression: ${msg}`); process.exit(1) }

const beforeDir = arg('before') || fail('missing --before')
const afterDir = arg('after') || fail('missing --after')
const out = arg('out') || fail('missing --out')

const beforeShots = join(beforeDir, 'shots')
const afterShots = join(afterDir, 'shots')
if (!existsSync(beforeShots)) fail(`before shots dir not found: ${beforeShots}`)
if (!existsSync(afterShots)) fail(`after shots dir not found: ${afterShots}`)
mkdirSync(out, { recursive: true })

const listPngs = (dir) => {
  try {
    return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'))
  } catch (e) {
    fail(`could not read ${dir}: ${e.message}`)
  }
}

const beforeSet = new Set(listPngs(beforeShots))
const afterSet = new Set(listPngs(afterShots))
const common = [...beforeSet].filter((f) => afterSet.has(f)).sort()
const onlyBefore = [...beforeSet].filter((f) => !afterSet.has(f)).sort()
const onlyAfter = [...afterSet].filter((f) => !beforeSet.has(f)).sort()

const decode = (path) => {
  try {
    return PNG.sync.read(readFileSync(path))
  } catch (e) {
    fail(`could not decode PNG ${path}: ${e.message}`)
  }
}

const round2 = (n) => Math.round(n * 100) / 100

const perShot = {}
let maxChangedPct = 0

for (const filename of common) {
  const a = decode(join(beforeShots, filename))
  const b = decode(join(afterShots, filename))

  let changedPx
  let changedPct
  if (a.width !== b.width || a.height !== b.height) {
    // Dimensions differ — treat the whole image as changed.
    const totalPx = Math.max(a.width * a.height, b.width * b.height) || 1
    changedPx = totalPx
    changedPct = 100
    console.error(`regression: ${filename} dimensions differ (${a.width}x${a.height} vs ${b.width}x${b.height}) -> changedPct=100`)
  } else {
    const totalPx = a.width * a.height
    changedPx = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 })
    changedPct = totalPx > 0 ? round2((changedPx / totalPx) * 100) : 0
  }

  perShot[filename] = { changedPct, changedPx }
  if (changedPct > maxChangedPct) maxChangedPct = changedPct
}

let note = 'diff vs last ACCEPTED round; high change on an area the round did not intend to touch = unintended regression'
if (common.length === 0) note += ' | NO common shots between before/after — coverage is 0'
if (onlyBefore.length) note += ` | only in before (skipped): ${onlyBefore.join(', ')}`
if (onlyAfter.length) note += ` | only in after (skipped): ${onlyAfter.join(', ')}`

const result = {
  before: basename(beforeDir),
  after: basename(afterDir),
  perShot,
  maxChangedPct,
  note,
}

const outPath = join(out, 'regression.json')
writeFileSync(outPath, JSON.stringify(result, null, 2))
console.error(`regression: ${common.length} common shot(s), maxChangedPct=${maxChangedPct} -> wrote ${outPath}`)
