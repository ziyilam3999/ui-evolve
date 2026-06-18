export const meta = {
  name: 'ui-evolve-round-research',
  description:
    'Two modes. REFINE (default): sharpen the top UI-improvement candidate into a concrete minimal change spec via parallel design lenses, then synthesize the single best one. EXPLORE (mode:"explore"): generate N DISTINCT committed full-redesign directions (editorial/terminal/swiss seeds), each handed the bold-POV direction brief, for the structural-block tournament. Explore is opt-in; absent/refine mode is byte-unchanged.',
  phases: [
    { title: 'Lenses', detail: 'refine mode: parallel design-lens proposals for the candidate' },
    { title: 'Synthesize', detail: 'refine mode: pick + harden the single best concrete change spec' },
    { title: 'Directions', detail: 'explore mode: N agents each generate ONE distinct committed full-redesign direction' },
  ],
}

// args (refine): { candidate:{title,lens,rationale}, critique, metricsSummary, repoPath, pages, directionBriefText? }
//   Returns a hardened change spec { title, files, change, rationale, validation, risks }.
// args (explore): { mode:'explore', exploreDirections:N, directionBriefText, repoPath, pages }
//   Returns { mode:'explore', directions: DIRECTION_SCHEMA[] } — the tournament candidates.
// The direction-brief POV TEXT is passed in via args.directionBriefText (the skill/orchestrator reads
// the directionBrief file and injects it) — this script does NOT read files or import fs, so it stays
// runtime-safe and valid as a wrapped Workflow script.

const a = args || {}
const mode = a.mode === 'explore' ? 'explore' : 'refine'
const briefText = typeof a.directionBriefText === 'string' ? a.directionBriefText : ''
const candidate = a.candidate || { title: 'unspecified', rationale: '' }
const ctx = `Target repo: ${a.repoPath || '(unknown)'}\nPages: ${(a.pages || ['/']).join(', ')}
Top candidate: ${candidate.title}
Why: ${candidate.rationale}
Vision critique: ${a.critique || '(none)'}
Objective metrics summary: ${a.metricsSummary || '(none)'}`

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'files', 'change', 'rationale', 'risks'],
  properties: {
    title: { type: 'string' },
    files: { type: 'array', items: { type: 'string' }, description: 'concrete files likely to change' },
    change: { type: 'string', description: 'the precise, minimal edit to make' },
    rationale: { type: 'string' },
    risks: { type: 'string', description: 'what could regress; what to re-check' },
  },
}

// A committed full-redesign direction (explore mode) — a COMPLETE recipe, not a tweak. Each field is a
// commitment the bold-POV brief demands (named fonts, a real palette, a depth + rhythm plan, ONE motion).
const DIRECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'posture', 'fonts', 'palette', 'structure', 'motion', 'rationale'],
  properties: {
    title: { type: 'string', description: 'the committed direction name (e.g. "editorial", "terminal", "swiss")' },
    posture: { type: 'string', description: 'the committed aesthetic stance, one line' },
    fonts: { type: 'string', description: 'a NAMED font pairing (display + body) — never system/Inter default' },
    palette: { type: 'string', description: 'accent + full grey ramp + semantic colors — never indigo-on-white' },
    structure: { type: 'string', description: 'the depth concept + the section-rhythm plan' },
    motion: { type: 'string', description: 'ONE cohesive content-motion technique' },
    rationale: { type: 'string', description: 'why this committed direction fixes the structural bottleneck' },
  },
}

// ── EXPLORE mode: N distinct committed directions for the tournament (gated; opt-in) ──────────────
if (mode === 'explore') {
  const N = Number.isInteger(a.exploreDirections) && a.exploreDirections > 0 ? a.exploreDirections : 3
  const SEEDS = ['editorial', 'terminal', 'swiss']
  const povMandate = briefText
    ? `\n\nBOLD-POV MANDATE — you MUST obey this (intentionality, not intensity):\n${briefText}`
    : ''

  phase('Directions')
  const directions = await parallel(
    Array.from({ length: N }, (_, i) => {
      const seed = SEEDS[i % SEEDS.length]
      return () =>
        agent(
          `You are a designer committing to ONE bold, distinctive FULL redesign direction. Seed flavor: "${seed}". ` +
            `Generate a COMPLETE committed direction — NOT a tweak, NOT a refinement of the current page. Commit to a ` +
            `named font pairing, a real palette (accent + full grey ramp + semantic), a depth concept, a section-rhythm ` +
            `plan, and ONE cohesive content-motion technique. Make it genuinely distinct from a generic system-font / ` +
            `indigo-on-white template.${povMandate}\n\n${ctx}\n\nRead the repo to ground your direction in the real ` +
            `content. Do NOT edit anything. Return ONE complete direction brief.`,
          { label: `direction:${seed}`, phase: 'Directions', schema: DIRECTION_SCHEMA, agentType: 'Explore' },
        )
    }),
  )
  const validDirections = directions.filter(Boolean)
  if (!validDirections.length) return { error: 'no direction produced a brief', mode: 'explore' }
  return { mode: 'explore', directions: validDirections }
}

// ── REFINE mode (default): the existing Lenses → Synthesize flow (control flow unchanged) ─────────
const LENSES = [
  { key: 'css-craft', prompt: 'You are a CSS/layout craftsperson. Inspect the repo and propose the MINIMAL concrete edit (spacing scale, grid alignment, type ramp) that realizes the candidate. Name exact files/classes.' },
  { key: 'a11y', prompt: 'You are an accessibility engineer. Propose the minimal concrete edit that realizes the candidate WITHOUT introducing WCAG issues (contrast, focus, semantics, target size). Name exact files.' },
  { key: 'responsive', prompt: 'You are a responsive-design specialist. Propose the minimal concrete edit that realizes the candidate and holds at mobile/tablet/desktop with no overflow/clipping. Name exact files.' },
]

phase('Lenses')
const proposals = await parallel(
  LENSES.map((l) => () =>
    agent(
      `${l.prompt}\n\n${ctx}\n\nReturn ONE hardened, minimal change spec. Read the repo to ground file names. Do NOT edit anything.`,
      { label: `lens:${l.key}`, phase: 'Lenses', schema: SPEC_SCHEMA, agentType: 'Explore' }
    )
  )
)

const valid = proposals.filter(Boolean)
if (!valid.length) return { error: 'no lens produced a spec', candidate }

// Inject the bold-POV brief as ADDITIVE context (refine path only change) — the synthesized spec must
// respect the committed-direction mandate instead of defaulting to a generic page. No control-flow change.
const povContext = briefText
  ? `\n\nBOLD-POV MANDATE (additive context — the synthesized spec must respect it; do not default to generic system-font / indigo-on-white):\n${briefText}`
  : ''

phase('Synthesize')
const synthesized = await agent(
  `Three design lenses proposed concrete change specs for this candidate:\n\n${ctx}\n\nProposals:\n${JSON.stringify(valid, null, 2)}${povContext}\n\nSynthesize the SINGLE best minimal change spec: the one that most improves the UI per the candidate while minimizing regression risk and respecting a11y + responsiveness. Merge the best ideas; keep it minimal and concrete.`,
  { label: 'synthesize', phase: 'Synthesize', schema: { ...SPEC_SCHEMA, properties: { ...SPEC_SCHEMA.properties, validation: { type: 'string', description: 'how to confirm it improved' } } } }
)

return synthesized || valid[0]
