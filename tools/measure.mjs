#!/usr/bin/env node
// measure.mjs — Lighthouse (perf/a11y/best-practices/seo) + axe-core violations + lab vitals.
// Writes/merges <out>/metrics.json per the contract. Fails closed (non-zero, no partial green).
//
//   node tools/measure.mjs --url http://localhost:3000 --pages "/,/about" --out <round-dir>
//
// Chrome resolution: chrome-launcher finds system Chrome; if absent we fall back to Playwright's
// bundled Chromium via CHROME_PATH so the harness works without a separately-installed Chrome.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const fail = (msg) => { console.error(`measure: ${msg}`); process.exit(1) }

const url = arg('url') || fail('missing --url')
const out = arg('out') || fail('missing --out')
const pages = (arg('pages', '/')).split(',').map((p) => p.trim()).filter(Boolean)
mkdirSync(out, { recursive: true })

async function resolveChromePath() {
  try {
    const { chromium } = await import('playwright')
    const p = chromium.executablePath()
    if (p && existsSync(p)) return p
  } catch { /* fall through */ }
  return null
}

async function runLighthouse(targetUrl) {
  const lighthouse = (await import('lighthouse')).default
  const chromeLauncher = await import('chrome-launcher')
  const cp = await resolveChromePath()
  if (cp) process.env.CHROME_PATH = cp
  let chrome
  try {
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] })
  } catch (e) {
    fail(`could not launch Chrome (install Chrome or Playwright chromium): ${e.message}`)
  }
  try {
    const res = await lighthouse(targetUrl, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    })
    const lhr = res.lhr
    const pct = (c) => Math.round((lhr.categories[c]?.score ?? 0) * 100)
    const num = (id) => lhr.audits[id]?.numericValue ?? null
    return {
      lighthouse: {
        performance: pct('performance'),
        accessibility: pct('accessibility'),
        bestPractices: pct('best-practices'),
        seo: pct('seo'),
      },
      vitals: {
        lcp: num('largest-contentful-paint'),
        cls: num('cumulative-layout-shift'),
        inp: num('total-blocking-time'), // lab proxy for INP (true INP is field-only)
      },
    }
  } finally {
    await chrome.kill()
  }
}

async function runAxe(targetUrl) {
  const { chromium } = await import('playwright')
  const { AxeBuilder } = await import('@axe-core/playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 })
    const results = await new AxeBuilder({ page }).analyze()
    const buckets = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    const violations = results.violations.map((v) => {
      if (buckets[v.impact] !== undefined) buckets[v.impact] += 1
      return { id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }
    })
    return { axe: { ...buckets, violations } }
  } finally {
    await browser.close()
  }
}

const metricsPath = join(out, 'metrics.json')
const existing = existsSync(metricsPath) ? JSON.parse(readFileSync(metricsPath, 'utf8')) : { url, pages: {}, errors: [] }
existing.url = url
existing.pages = existing.pages || {}
existing.errors = existing.errors || []

for (const route of pages) {
  const target = url.replace(/\/$/, '') + route
  try {
    const lh = await runLighthouse(target)
    const ax = await runAxe(target)
    existing.pages[route] = { ...(existing.pages[route] || {}), ...lh, ...ax }
    console.error(`measure: ${route} -> a11y=${lh.lighthouse.accessibility} perf=${lh.lighthouse.performance} axe-crit=${ax.axe.critical}`)
  } catch (e) {
    existing.errors.push({ route, error: e.message })
    fail(`page ${route}: ${e.message}`)
  }
}

writeFileSync(metricsPath, JSON.stringify(existing, null, 2))
console.error(`measure: wrote ${metricsPath}`)
