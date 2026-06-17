#!/usr/bin/env node
// lint.mjs — cheap, dependency-free repo lint that runs in CI with no browser.
//  1. `node --check` every .mjs under the repo (syntax-validates the harness scripts).
//  2. JSON.parse every .json (catches a malformed manifest before it ships).
// Exits non-zero on the first failure so CI goes red on a real defect. This is the
// honest day-1 gate; the behavioral discriminator self-test (evals/) lands in 0.2.0.

import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname
const SKIP = new Set(['node_modules', '.git', '.ui-evolve', '_quarantine'])

// Workflow scripts (`*-workflow.mjs`) are executed inside the Claude Code Workflow
// runtime, which wraps the body in an async function — so they legally use top-level
// `await`/`return` and the injected globals (agent/parallel/phase/args). `node --check`
// treats a file as a standalone ESM module and would falsely reject that, so we exclude
// them from the syntax pass. Their real validation is the end-to-end run. (Logged below,
// not silently skipped.)
const isWorkflowScript = (f) => /-workflow\.mjs$/.test(basename(f))

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

const files = walk(ROOT)
let checked = 0
const skippedWorkflows = []
const errors = []

for (const f of files) {
  const ext = extname(f)
  if (ext === '.mjs' || ext === '.js') {
    if (isWorkflowScript(f)) {
      skippedWorkflows.push(f)
      continue
    }
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
      checked++
    } catch (e) {
      errors.push(`syntax: ${f}\n${e.stderr?.toString() || e.message}`)
    }
  } else if (ext === '.json') {
    try {
      JSON.parse(readFileSync(f, 'utf8'))
      checked++
    } catch (e) {
      errors.push(`json: ${f} — ${e.message}`)
    }
  }
}

if (errors.length) {
  console.error(`lint: FAIL (${errors.length})\n\n${errors.join('\n\n')}`)
  process.exit(1)
}
for (const f of skippedWorkflows) {
  console.log(`lint: SKIP syntax-check (workflow script, runtime-wrapped) — ${f}`)
}
console.log(`lint: OK — ${checked} files checked (mjs syntax + json parse), ${skippedWorkflows.length} workflow script(s) deferred to e2e`)
