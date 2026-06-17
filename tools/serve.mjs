#!/usr/bin/env node
// serve.mjs — boot / poll / teardown the target web server for a measurement run.
// Reads config.serve = { build, start, url, port }. Fails closed (non-zero, no partial state).
//
//   node tools/serve.mjs --config <config.json>          # build, spawn start detached, poll url, write PID
//   node tools/serve.mjs --config <config.json> --down    # kill the recorded process group, remove PID file
//
// State file: <config-dir>/.ui-evolve-serve.pid (JSON: { pid, cmd, url, startedAt }). Boot prints the PID
// to stdout; everything else goes to stderr so callers can capture just the PID.

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

// Synchronous sleep without spawning a process (Atomics.wait blocks the current thread).
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const hasFlag = (name) => process.argv.includes(`--${name}`)
const fail = (msg) => { console.error(`serve: ${msg}`); process.exit(1) }
const log = (msg) => console.error(`serve: ${msg}`)

const configPath = arg('config') || fail('missing --config')
const absConfig = resolve(configPath)
if (!existsSync(absConfig)) fail(`config not found: ${absConfig}`)

const configDir = dirname(absConfig)
const pidPath = join(configDir, '.ui-evolve-serve.pid')

let config
try {
  config = JSON.parse(readFileSync(absConfig, 'utf8'))
} catch (e) {
  fail(`could not parse config ${absConfig}: ${e.message}`)
}

// --- teardown ---------------------------------------------------------------
function killGroup(pid, signal) {
  // Negative pid targets the whole process group (the child was its own group leader).
  try { process.kill(-pid, signal) } catch { /* group may already be gone */ }
  try { process.kill(pid, signal) } catch { /* leader may already be gone */ }
}

function down() {
  if (!existsSync(pidPath)) {
    log(`no state file at ${pidPath} — nothing to tear down (idempotent)`)
    process.exit(0)
  }
  let state
  try {
    state = JSON.parse(readFileSync(pidPath, 'utf8'))
  } catch (e) {
    // Corrupt state file: remove it so we don't get wedged, but report.
    rmSync(pidPath, { force: true })
    fail(`corrupt state file ${pidPath} removed: ${e.message}`)
  }
  const pid = Number(state.pid)
  if (!Number.isInteger(pid) || pid <= 0) {
    rmSync(pidPath, { force: true })
    fail(`invalid pid in state file ${pidPath}: ${state.pid}`)
  }
  log(`terminating server pid ${pid} (SIGTERM)`)
  killGroup(pid, 'SIGTERM')
  // Give it a moment to exit cleanly, then SIGKILL anything left.
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    let alive = false
    try { process.kill(pid, 0); alive = true } catch { alive = false }
    if (!alive) break
    sleepSync(150)
  }
  let stillAlive = false
  try { process.kill(pid, 0); stillAlive = true } catch { stillAlive = false }
  if (stillAlive) {
    log(`pid ${pid} survived SIGTERM — sending SIGKILL`)
    killGroup(pid, 'SIGKILL')
  }
  rmSync(pidPath, { force: true })
  log(`torn down; removed ${pidPath}`)
  process.exit(0)
}

if (hasFlag('down')) down()

// --- boot -------------------------------------------------------------------
const serve = config.serve || {}
const url = serve.url || fail('config.serve.url is required for boot')
const buildCmd = serve.build || null
const startCmd = serve.start || fail('config.serve.start is required for boot')

if (existsSync(pidPath)) {
  fail(`state file already exists at ${pidPath} — run with --down first`)
}

// repoPath (if present) is where build/start run; default to config dir.
const cwd = config.repoPath ? resolve(configDir, config.repoPath) : configDir

// 1) build to completion, fail closed on non-zero.
if (buildCmd) {
  log(`build: ${buildCmd}`)
  const b = spawnSync(buildCmd, { cwd, shell: true, stdio: 'inherit' })
  if (b.status !== 0) fail(`build failed (exit ${b.status === null ? `signal ${b.signal}` : b.status})`)
}

// 2) spawn start detached so the harness can poll while it keeps running.
log(`start (detached): ${startCmd}`)
const child = spawn(startCmd, { cwd, shell: true, detached: true, stdio: 'ignore' })
if (!child.pid) fail(`failed to spawn start command: ${startCmd}`)
child.unref()
const pid = child.pid

// 3) poll url until a 2xx/3xx (or timeout), then record + print PID.
async function poll() {
  const timeoutMs = Number(serve.pollTimeoutMs) || 90000
  const intervalMs = Number(serve.pollIntervalMs) || 1000
  const deadline = Date.now() + timeoutMs
  let lastErr = 'no response'
  while (Date.now() < deadline) {
    // Bail early if the server process already died.
    let alive = false
    try { process.kill(pid, 0); alive = true } catch { alive = false }
    if (!alive) { lastErr = 'start process exited before url responded'; break }
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'manual' })
      if (res.status >= 200 && res.status < 400) {
        return res.status
      }
      lastErr = `HTTP ${res.status}`
    } catch (e) {
      lastErr = e.message
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(lastErr)
}

try {
  const status = await poll()
  const state = { pid, cmd: startCmd, url, startedAt: new Date().toISOString() }
  writeFileSync(pidPath, JSON.stringify(state, null, 2))
  log(`up at ${url} (HTTP ${status}); pid ${pid} recorded to ${pidPath}`)
  process.stdout.write(`${pid}\n`)
  process.exit(0)
} catch (e) {
  log(`server did not come up at ${url}: ${e.message} — killing pid ${pid}`)
  killGroup(pid, 'SIGTERM')
  killGroup(pid, 'SIGKILL')
  fail('boot failed (server unreachable within timeout)')
}
