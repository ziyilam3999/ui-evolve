export const meta = {
  name: 'ui-evolve-round-research',
  description: 'Sharpen the top UI-improvement candidate into a concrete, minimal change spec via parallel design lenses, then synthesize the single best one.',
  phases: [
    { title: 'Lenses', detail: 'parallel design-lens proposals for the candidate' },
    { title: 'Synthesize', detail: 'pick + harden the single best concrete change spec' },
  ],
}

// args: { candidate:{title,lens,rationale}, critique, metricsSummary, repoPath, pages }
// Returns: a hardened change spec { title, files, change, rationale, validation, risks }

const a = args || {}
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

phase('Synthesize')
const synthesized = await agent(
  `Three design lenses proposed concrete change specs for this candidate:\n\n${ctx}\n\nProposals:\n${JSON.stringify(valid, null, 2)}\n\nSynthesize the SINGLE best minimal change spec: the one that most improves the UI per the candidate while minimizing regression risk and respecting a11y + responsiveness. Merge the best ideas; keep it minimal and concrete.`,
  { label: 'synthesize', phase: 'Synthesize', schema: { ...SPEC_SCHEMA, properties: { ...SPEC_SCHEMA.properties, validation: { type: 'string', description: 'how to confirm it improved' } } } }
)

return synthesized || valid[0]
