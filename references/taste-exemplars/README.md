# Taste exemplars — the four-pole picture book (LOCAL, user-supplied)

The vision-judge can score taste against a **picture book of four corners**, so it judges
against real reference points instead of in a vacuum. This directory is where YOU drop your
OWN exemplar screenshots — one folder per pole:

| Pole folder         | What it holds (your own renders)                                            |
|---------------------|------------------------------------------------------------------------------|
| `too-busy/`         | clutter / object-soup pages — competing focal points, no depth hierarchy     |
| `too-subtle/`       | flat-but-legible pages — high legibility, empty, no committed depth           |
| `generic-bad/`      | clean-but-default pages — tidy, system-font, no point of view                 |
| `distinctive-good/` | the GOOD corner — committed depth + strong rhythm + cohesion + a distinct POV |

Drop ≥1 `*.png` into each pole you want anchored. For the good corner, prefer **several
diverse** renders (not one favourite) so the judge learns "good = committed + distinctive,"
not "good = clone this one image."

## These images are LOCAL and NEVER committed

The pole subfolders and every `*.png` under this tree are **gitignored** (see `.gitignore`).
A full-page screenshot of a real résumé/site can render employer names or other PII, and a
text privacy gate is blind to pixels — so the harness keeps the exemplars on your disk and
ships only the wiring + the abstract rubric (`references/taste-brief.md`) + numeric findings.
This README is the only tracked file in this directory.

## Back-compat — exemplars are optional

If a pole folder is **empty or absent**, the judge simply scores **without** that picture
anchor (no error, no penalty). With zero exemplars present, the judge scores exactly as it
did before the picture book existed. The resolver `resolveTasteConfig()` in `tools/score.mjs`
provides the conventional default paths; override them per-target in `config.json` via
`tasteExemplars{ tooBusy, tooSubtle, genericBad, distinctiveGood }` and `tasteBrief`.

## How the judge uses them

See `references/judge-prompt.md` (the `{{TASTE_EXEMPLAR_PATHS}}` + `{{TASTE_BRIEF}}` slots and
the picture-book pre-step). The judge names **which pole** the candidate is closest to and why
— it scores "which pole," explicitly NOT "distance to the one good image." Distinctiveness
still rewards NOVEL commitment, never exemplar-cloning.
