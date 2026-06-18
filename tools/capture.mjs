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

// Parse the config once (breakpoints + optional motion block). Returns {} when no --config.
function loadConfig() {
  if (!configPath) return {}
  if (!existsSync(configPath)) fail(`config not found: ${configPath}`)
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (e) {
    fail(`could not parse config ${configPath}: ${e.message}`)
  }
}

function loadBreakpoints(cfg) {
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

const config = loadConfig()
const breakpoints = loadBreakpoints(config)
// Optional motion block: { scrollStops:[0,..,1], selector:"[data-parallax]" }. When present, capture
// viewport stills at several scroll offsets (so a still-frame judge SEES parallax) and verify the
// prefers-reduced-motion fallback. Absent => behavior unchanged (back-compat with the discriminator).
const motionCfg = (config.motion && typeof config.motion === 'object') ? config.motion : null
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
        // Trigger scroll-reveal / lazy-loaded content before the full-page shot: many modern sites
        // start below-fold sections at opacity:0 and reveal them via IntersectionObserver on scroll.
        // A full-page screenshot at scroll-top would capture them BLANK. Step to the bottom (firing
        // every observer) then back to top so the full-page capture shows the real, settled page.
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
            let y = 0
            const timer = setInterval(() => {
              window.scrollTo(0, y)
              y += step
              if (y >= document.documentElement.scrollHeight) {
                clearInterval(timer)
                window.scrollTo(0, document.documentElement.scrollHeight)
                setTimeout(resolve, 150)
              }
            }, 50)
          })
        })
        await page.waitForTimeout(200)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(150)
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

  // --- motion pass (parallax / scroll-driven) — only when config.motion present -----------------
  if (motionCfg) {
    const stops = Array.isArray(motionCfg.scrollStops) && motionCfg.scrollStops.length
      ? motionCfg.scrollStops.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 1)
      : [0, 0.25, 0.5, 0.75, 1.0]
    const selector = typeof motionCfg.selector === 'string' && motionCfg.selector ? motionCfg.selector : null
    const settleMs = Number.isFinite(motionCfg.settleMs) ? motionCfg.settleMs : 250
    const pct = (f) => String(Math.round(f * 100)).padStart(3, '0')

    // In-page probe: page scrollY + the tracked layer's translateY (px) parsed from its matrix.
    const probe = (sel) => {
      const o = { scrollY: window.scrollY, ty: null }
      if (sel) {
        const el = document.querySelector(sel)
        if (el) {
          const t = window.getComputedStyle(el).transform
          if (!t || t === 'none') { o.ty = 0 } else {
            const m = t.match(/matrix(3d)?\(([^)]+)\)/)
            if (m) {
              const v = m[2].split(',').map((x) => parseFloat(x))
              o.ty = m[1] ? (v.length === 16 ? v[13] : null) : (v.length === 6 ? v[5] : null)
            }
          }
        }
      }
      return o
    }
    const scrollToFrac = (frac) => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, Math.round(frac * Math.max(0, max)))
    }

    for (const route of pages) {
      const target = url.replace(/\/$/, '') + route
      const slug = pageSlug(route)
      const motionOut = { selector, perBreakpoint: {}, motionActive: null, reducedMotionRespected: null }

      for (const bp of breakpoints) {
        let context
        try {
          // (1) motion ON: scroll-frame stills + layer translate at each stop.
          context = await browser.newContext({
            viewport: { width: bp.width, height: bp.height },
            reducedMotion: 'no-preference',
          })
          let page = await context.newPage()
          await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 })
          const frames = []
          for (const f of stops) {
            await page.evaluate(scrollToFrac, f)
            await page.waitForTimeout(settleMs)
            await page.screenshot({ path: join(shotsDir, `${slug}-${bp.name}-s${pct(f)}.png`), fullPage: false })
            frames.push(await page.evaluate(probe, selector))
          }
          await context.close()
          context = null

          // (2) motion OFF (reduced): the tracked layer must NOT travel between top and mid-scroll.
          let movesWhenOn = null
          let reducedTravel = null
          if (selector) {
            const tys = frames.map((fr) => fr.ty).filter((v) => typeof v === 'number')
            movesWhenOn = tys.length >= 2 ? Math.max(...tys) - Math.min(...tys) : null
            context = await browser.newContext({
              viewport: { width: bp.width, height: bp.height },
              reducedMotion: 'reduce',
            })
            page = await context.newPage()
            await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 })
            const a = await page.evaluate(probe, selector)
            await page.evaluate(scrollToFrac, 0.5)
            await page.waitForTimeout(settleMs)
            const b = await page.evaluate(probe, selector)
            await context.close()
            context = null
            reducedTravel = (typeof a.ty === 'number' && typeof b.ty === 'number') ? Math.abs(b.ty - a.ty) : null
          }

          motionOut.perBreakpoint[bp.name] = { stops, frames, movesWhenOn, reducedTravel }
          console.error(`capture: motion ${route} @${bp.name} -> movesWhenOn=${movesWhenOn} reducedTravel=${reducedTravel}`)
        } catch (e) {
          hadError = true
          existing.errors.push({ route, breakpoint: bp.name, phase: 'motion', error: e.message })
          console.error(`capture: motion ${route} @${bp.name} FAILED: ${e.message}`)
        } finally {
          if (context) await context.close()
        }
      }

      // Aggregate (selector-based, 2px noise floor): motion is active if any breakpoint's layer
      // travelled > 2px; reduced-motion is respected only if EVERY breakpoint stayed within 2px.
      const bpsOut = Object.values(motionOut.perBreakpoint)
      const moved = bpsOut.map((b) => b.movesWhenOn).filter((v) => typeof v === 'number')
      const reduced = bpsOut.map((b) => b.reducedTravel).filter((v) => typeof v === 'number')
      motionOut.motionActive = moved.length ? moved.some((v) => Math.abs(v) > 2) : null
      motionOut.reducedMotionRespected = reduced.length ? reduced.every((v) => Math.abs(v) <= 2) : null
      existing.pages[route] = existing.pages[route] || {}
      existing.pages[route].motion = motionOut
    }
  }
} finally {
  if (browser) await browser.close()
}

writeFileSync(metricsPath, JSON.stringify(existing, null, 2))
console.error(`capture: wrote ${metricsPath}`)

if (hadError) fail('one or more page/breakpoint captures failed (see errors[])')
