#!/usr/bin/env node
// capture.mjs — Playwright full-page screenshots + responsive-overflow detection.
// Writes/merges <out>/metrics.json per the contract (responsive block). Fails closed
// (non-zero, no partial green).
//
//   node tools/capture.mjs --url http://localhost:3000 --pages "/,/about" --config <config.json> --out <round-dir>
//
// For each page route × breakpoint: set viewport, goto(networkidle), full-page screenshot to
// <out>/shots/<page-slug>-<breakpoint>.png, then measure documentElement scrollWidth vs clientWidth
// (overflowX) and scan for elements overflowing the viewport right edge (clipped). A single browser
// is reused across every page/breakpoint and closed in a finally.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const fail = (msg) => { console.error(`capture: ${msg}`); process.exit(1) }

const url = arg('url') || fail('missing --url')
const out = arg('out') || fail('missing --out')
const configPath = arg('config')
const pages = (arg('pages', '/')).split(',').map((p) => p.trim()).filter(Boolean)

const DEFAULT_BREAKPOINTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'desktop', width: 1440, height: 900 },
]

function loadBreakpoints() {
  if (!configPath) return DEFAULT_BREAKPOINTS
  if (!existsSync(configPath)) fail(`config not found: ${configPath}`)
  let cfg
  try {
    cfg = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (e) {
    fail(`could not parse config ${configPath}: ${e.message}`)
  }
  const bps = cfg.breakpoints
  if (!Array.isArray(bps) || bps.length === 0) return DEFAULT_BREAKPOINTS
  for (const bp of bps) {
    if (!bp || typeof bp.name !== 'string' || !bp.name ||
        typeof bp.width !== 'number' || typeof bp.height !== 'number') {
      fail(`invalid breakpoint in config (need {name,width,height}): ${JSON.stringify(bp)}`)
    }
  }
  return bps
}

// page-slug: route with `/`→`_`, root route `/` becomes `home`.
function pageSlug(route) {
  if (route === '/') return 'home'
  return route.replace(/\//g, '_').replace(/^_/, '') || 'home'
}

const breakpoints = loadBreakpoints()
const shotsDir = join(out, 'shots')
mkdirSync(shotsDir, { recursive: true })

const metricsPath = join(out, 'metrics.json')
const existing = existsSync(metricsPath)
  ? JSON.parse(readFileSync(metricsPath, 'utf8'))
  : { url, pages: {}, errors: [] }
existing.url = existing.url || url
existing.pages = existing.pages || {}
existing.errors = existing.errors || []

// Measure overflow inside the page. overflowX = documentElement scrollWidth > clientWidth + 1.
// clipped = any visible, on-screen element whose right edge exceeds innerWidth + 1.
function measureOverflow() {
  const docEl = document.documentElement
  const scrollW = docEl.scrollWidth
  const clientW = docEl.clientWidth
  const overflowX = scrollW > clientW + 1
  const vw = window.innerWidth
  let clipped = false
  const all = document.body ? document.body.querySelectorAll('*') : []
  for (const el of all) {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    // Skip zero-area and intentionally off-screen-left elements (negative left = off-canvas).
    if (r.width === 0 || r.height === 0) continue
    if (r.right < 0 || r.left >= vw) continue
    if (r.right > vw + 1) { clipped = true; break }
  }
  return { overflowX, clipped, scrollW, clientW }
}

let browser
let hadError = false
try {
  const { chromium } = await import('playwright')
  try {
    browser = await chromium.launch()
  } catch (e) {
    fail(`could not launch Playwright chromium (run: npx playwright install chromium): ${e.message}`)
  }

  for (const route of pages) {
    const target = url.replace(/\/$/, '') + route
    const slug = pageSlug(route)
    existing.pages[route] = existing.pages[route] || {}
    const responsive = existing.pages[route].responsive || {}
    let routeFailed = false

    for (const bp of breakpoints) {
      let context
      try {
        context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } })
        const page = await context.newPage()
        await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 })
        await page.screenshot({
          path: join(shotsDir, `${slug}-${bp.name}.png`),
          fullPage: true,
        })
        const r = await page.evaluate(measureOverflow)
        responsive[bp.name] = {
          overflowX: r.overflowX,
          clipped: r.clipped,
          scrollW: r.scrollW,
          clientW: r.clientW,
        }
        console.error(`capture: ${route} @${bp.name} -> overflowX=${r.overflowX} clipped=${r.clipped} scrollW=${r.scrollW} clientW=${r.clientW}`)
      } catch (e) {
        routeFailed = true
        existing.errors.push({ route, breakpoint: bp.name, error: e.message })
        console.error(`capture: ${route} @${bp.name} FAILED: ${e.message}`)
      } finally {
        if (context) await context.close()
      }
    }

    existing.pages[route].responsive = responsive
    if (routeFailed) hadError = true
  }
} finally {
  if (browser) await browser.close()
}

writeFileSync(metricsPath, JSON.stringify(existing, null, 2))
console.error(`capture: wrote ${metricsPath}`)

if (hadError) fail('one or more page/breakpoint captures failed (see errors[])')
