// taste-discriminates-live.mjs — Layer-2 LIVE harness scaffold (NOT pure CI).
//
// ⚠ THE ORCHESTRATOR EXECUTES THIS LIVE (Group B). It is NOT run by `node evals/...` and NOT a CI
// test — it SPAWNS the updated 11-dim vision-judge (Agent subagents) on REAL rendered screenshots,
// so it needs the agent runtime + injected globals (agent / parallel / phase / args). Like
// `references/round-workflow.mjs` it legally uses top-level `await`/`return` + injected globals, so a
// BARE `node --check` FAILS by design; its achievable static guarantee is the WRAPPED-validity proof
// in `evals/discriminates.test.mjs` (strip `export `, AsyncFunction-construct the body — parses without
// throwing). `scripts/lint.mjs` therefore defers this file's syntax check to the live run (same as the
// workflow scripts). Keep it IMPORT-FREE and fs-FREE (paths come in via `args`, the agents do the
// Read/Write) so the wrapped-validity proof holds.
//
// WHAT IT PROVES (Rule-18 honesty check): the UPDATED judge's OWN structural dimensions
// (depth/cohesion/rhythm/hierarchyContrast/distinctiveness) put each of the 3 round-6 renders
// (editorial / terminal / swiss) MATERIALLY ABOVE all three bad poles — round-1 (generic-bad),
// round-3 (too-busy / object-soup), round-4 (too-subtle / aurora-on-white) — and that round-3-vs-
// round-1 is a real `tasteVsPrev:'worse'`. The orchestrator turns the returned NUMBERS into the
// committed `evals/LAYER2-FINDING.md` (numbers only — no résumé pixels, no PII). The exemplar PNGs
// the judge reads live in the LOCAL, gitignored `references/taste-exemplars/` pole dirs and are
// NEVER committed.

export const meta = {
  name: 'ui-evolve-taste-discriminates-live',
  description:
    'Layer-2 live honesty proof: spawn the updated 11-dim vision-judge on the REAL round-1/3/4 + 3 round-6 ' +
    'shots and assert the judge\'s OWN structural block separates round-6 above the three bad poles, plus ' +
    'tasteVsPrev:"worse" round-3-vs-round-1. Agent-spawning (NOT CI); the orchestrator runs it live and ' +
    'writes the numbers-only LAYER2-FINDING. Exemplar PNGs are local/gitignored — never committed.',
  phases: [{ title: 'Judge', detail: 'spawn the updated 11-dim judge per input on its real shots' }],
}

// args (injected by the orchestrator — it resolves these from resolveTasteConfig + the captured rounds):
//   { tasteBriefText, tasteExemplarPaths,
//     inputs: [ { id, kind:'pole'|'candidate', pole?, design?, shots:[png...], prevShots?:[png...],
//                 outPath /* round-dir/judge.json the judge writes */, label } ] }
//   Expected inputs: generic-bad(round-1), too-busy(round-3, prev=round-1), too-subtle(round-4),
//   and the 3 candidates round6Editorial / round6Terminal / round6Swiss.
const a = args || {}
const briefText = typeof a.tasteBriefText === 'string' ? a.tasteBriefText : ''
const exemplarPaths = typeof a.tasteExemplarPaths === 'string' ? a.tasteExemplarPaths : '(none configured)'
const inputs = Array.isArray(a.inputs) ? a.inputs : []

// the structural five (the leap target) — inlined (NO import of score.mjs, to stay wrapped-valid).
const STRUCTURAL_DIMS = ['depth', 'cohesion', 'rhythm', 'hierarchyContrast', 'distinctiveness']
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const structuralMean = (scores) => {
  const vals = STRUCTURAL_DIMS.map((d) => scores && scores[d]).filter(isNum)
  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null
}
const round1 = (n) => (isNum(n) ? Math.round(n * 10) / 10 : null)

// The judge returns its page-level structural block + tasteVsPrev IN-PROCESS (schema) so the harness
// can assert without reading files; it ALSO writes the full judge.json to `outPath` (committed evidence).
const JUDGE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scores', 'judgeJsonPath'],
  properties: {
    scores: {
      type: 'object',
      additionalProperties: true,
      description: 'page-level aggregated scores — MUST include the structural five (depth..distinctiveness)',
    },
    tasteVsPrev: { description: 'true|false|"better"|"worse"|"equal" — taste-only, vs the prev accepted shots (omit if no prevShots)' },
    closestPole: { type: 'string', description: 'which exemplar pole the candidate is closest to + why (the picture-book pre-step)' },
    judgeJsonPath: { type: 'string', description: 'the path the judge wrote the full judge.json to (= input.outPath)' },
  },
}

// Build the live judge prompt for one input: fills the same slots as references/judge-prompt.md, with
// the four-pole picture book + abstract brief as the anchor and the "which pole, NOT clone" instruction.
const judgePrompt = (inp) =>
  `You are a senior product designer doing a rigorous, screenshot-grounded design review. You judge ONLY\n` +
  `what is visible in the provided screenshots.\n\n` +
  `READ these candidate shots (Read tool — they render visually): ${(inp.shots || []).join(', ')}\n` +
  (inp.prevShots && inp.prevShots.length ? `PRIOR ACCEPTED shots (for betterThanPrev / tasteVsPrev): ${inp.prevShots.join(', ')}\n` : '') +
  `\nFollow the fixed rubric (references/rubric.md): eleven dims 0–10 in two blocks — legibility\n` +
  `(hierarchy/spacing/alignment/consistency/affordance/readability) + structural\n` +
  `(depth/cohesion/rhythm/hierarchyContrast/distinctiveness).\n\n` +
  `PICTURE-BOOK PRE-STEP — taste exemplars (the four-pole anchor):\n` +
  `Exemplar pole dirs (each may hold 0+ PNGs): ${exemplarPaths}\n` +
  `Abstract four-pole rubric:\n${briefText || '(no brief text injected — score without anchors, back-compat)'}\n` +
  `IF the pole dirs resolve to real images: Read the labeled poles, then state WHICH POLE this candidate\n` +
  `is closest to and WHY, and score the STRUCTURAL block by "which pole" — NOT by distance to the one good\n` +
  `image. A candidate committing to its OWN novel direction is still distinctive-good (distinctiveness\n` +
  `rewards committed NOVELTY, never exemplar-cloning). IF no exemplars are present, score WITHOUT anchors.\n\n` +
  `WRITE the full verdict (the exact judge.json shape in references/contract.md — all ELEVEN dims, overall,\n` +
  `verdict, betterThanPrev/tasteVsPrev when prior shots were given, candidates[]) to: ${inp.outPath}\n` +
  `Then RETURN the page-level structural scores + tasteVsPrev + closestPole + judgeJsonPath per the schema.`

phase('Judge')
// SYNCHRONOUS fan-out (the orchestrator awaits this scaffold; per #846 a heavy owned step never backgrounds).
const judged = await parallel(
  inputs.map((inp) => () =>
    agent(judgePrompt(inp), {
      label: `judge:${inp.id || inp.label || 'input'}`,
      phase: 'Judge',
      schema: JUDGE_RESULT_SCHEMA,
      agentType: 'general-purpose', // WRITE-capable — it must Read the PNGs AND Write judge.json
    }),
  ),
)

// Index results by input id, with the real structural-block mean the judge actually produced.
const byId = {}
inputs.forEach((inp, i) => {
  const r = judged[i] || {}
  byId[inp.id] = {
    id: inp.id,
    kind: inp.kind,
    pole: inp.pole || null,
    design: inp.design || null,
    structuralBlock: round1(structuralMean(r.scores)),
    tasteVsPrev: r.tasteVsPrev ?? null,
    closestPole: r.closestPole || null,
    judgeJsonPath: r.judgeJsonPath || inp.outPath || null,
  }
})

// The three bad poles + the round-6 candidates (ids the orchestrator assigns).
const badPoleIds = inputs.filter((i) => i.kind === 'pole').map((i) => i.id)
const candidateIds = inputs.filter((i) => i.kind === 'candidate').map((i) => i.id)
const worse = (t) => t === false || t === 'worse'

// ASSERTIONS (the Rule-18 numeric proof) — each candidate's structural block must clear EVERY bad pole;
// and round-3 (too-busy) vs round-1 (generic) must be a real taste regression.
const margins = []
let allCandidatesAboveAllPoles = candidateIds.length > 0 && badPoleIds.length > 0
for (const cid of candidateIds) {
  const cand = byId[cid]
  for (const pid of badPoleIds) {
    const pole = byId[pid]
    const above = isNum(cand.structuralBlock) && isNum(pole.structuralBlock) && cand.structuralBlock > pole.structuralBlock
    margins.push({ candidate: cid, pole: pid, candidateStructural: cand.structuralBlock, poleStructural: pole.structuralBlock, above })
    if (!above) allCandidatesAboveAllPoles = false
  }
}
// round-3-vs-round-1 taste regression: the input judging round-3 carries tasteVsPrev (prev = round-1).
const round3 = inputs.find((i) => i.pole === 'too-busy')
const tasteWorseRound3VsRound1 = round3 ? worse(byId[round3.id]?.tasteVsPrev) : null

const finding = {
  note: 'Layer-2 LIVE structural-discrimination numbers (orchestrator writes these into evals/LAYER2-FINDING.md, numbers only).',
  exemplarPaths,
  structuralBlocks: Object.values(byId).map(({ id, kind, pole, design, structuralBlock, closestPole }) => ({ id, kind, pole, design, structuralBlock, closestPole })),
  margins,
  asserts: {
    allCandidatesAboveAllBadPoles: allCandidatesAboveAllPoles,
    tasteWorseRound3VsRound1,
  },
}

console.error(
  `taste-live: candidates=${candidateIds.length} badPoles=${badPoleIds.length} ` +
    `allAbove=${allCandidatesAboveAllPoles} round3<round1(taste)=${tasteWorseRound3VsRound1}`,
)

return finding
