# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Formatting

Two formatters, split by language and not interchangeable. **Biome owns TypeScript and JSON; prettier owns markdown** — Biome 2.5 does not process markdown at all, which is the whole reason prettier is here. Both run in `check`, `check:ci` and `format`, so markdown drift fails the pre-push hook like any other formatting.

`.prettierrc.json` sets `embeddedLanguageFormatting: "off"`. That is load-bearing rather than stylistic: `WALKTHROUGH.md` quotes source verbatim, and at prettier's default of `"auto"` it reformats code inside fenced blocks to its own style — double quotes at width 80, against Biome's single quotes at 100 — so a quoted snippet silently stops matching the file it came from. `.prettierignore` excludes `.issues/`, which is ignored through the global `core.excludesfile` rather than this repo's `.gitignore` and so is invisible to git but not to prettier.

## Push and deploy

`git push` runs `bun run check:ci` via a `simple-git-hooks` pre-push hook (config in `package.json`). Bypass with `SKIP_SIMPLE_GIT_HOOKS=1 git push` for emergencies. `.github/workflows/deploy.yml` is the only workflow: a `check` job runs the same suite on pushes and PRs to `main`, then `build` and `deploy` jobs run on pushes only and publish `dist/` to GitHub Pages, serving the site at `quill.philoserf.com`. PRs additionally run `bun run build`, which `check:ci` does not cover. The custom domain lives in `public/CNAME`, which `bun run build` copies to `dist/CNAME` — Bun only emits assets reachable from `public/index.html`, so the copy step is what keeps the domain bound across deploys. The domain is proxied through Cloudflare, which also injects the Web Analytics beacon at the edge — never add that snippet to `public/index.html`, or page views are counted twice. README's Deploy section documents the out-of-repo settings.

## Architecture

Vanilla TS SPA, no framework. Entry chain: `public/index.html` → `src/main.ts` → screens in `src/screens/`. Rendering is direct DOM construction (`document.createElement`); each screen function returns an `HTMLElement`. `main.ts` replaces the root via `rootEl.replaceChildren()` when the session changes; the play screen repaints its own subtree in place for everything else.

**State** — `src/store.ts` is three functions over `GameSession | null` persisted under `quill.session.v1`: `load()`, `save()`, `clear()`. **It notifies nobody.** `main.ts` holds the session in a closure and calls `render()` itself after a write, so persisting and repainting are separate channels — only a committed paragraph, a new letter or a restart is durable. `null` means the Setup screen; otherwise `session.status` ('in_progress' | 'finished') selects Play vs Score. `load()` unwraps the legacy `{ session }` payload shape and quarantines anything failing its shape check to `quill.session.v1.corrupt` rather than destroying it; `save()` returns `false` instead of throwing when storage refuses the write.

**The paragraph machine** — `src/paragraph.ts` owns the seven-phase order as one event-keyed `advance(draft, event)`, plus `draftToParagraph` and `commitParagraph`. Events carry the data their transition records, so the order and the data flow have one home. It is the only part of the play loop with tests (`tests/paragraph.test.ts`); the screen around it has none.

**Play screen draft state** — `renderPlay` owns the in-progress paragraph in its closure as `v.state.draft` and repaints its own subtree. It is **deliberately not persisted**: only completed paragraphs reach `session.paragraphs`, via `onCommit`. Committing discards the closure — `main.ts` builds a fresh `renderPlay` with a fresh draft — so there is no reset to sequence. `v.state` is one shared object per letter on purpose: the roll button's 250ms shake timer reads the draft _when it fires_, not a copy captured when its button was built, so a repaint mid-shake cannot land a roll on a draft nothing will see.

**Scenarios are typed constants** — `src/scenarios.ts` exports `SCENARIOS: Scenario[]`, transcribed from the Quill rulebook. There is no runtime validation: the `Scenario` type is the gate, so a malformed scenario is a compile error rather than a startup throw. **To add a scenario**: add an entry to `SCENARIOS`. What `tsc` cannot check lives in `tests/scenarios.test.ts` — ink pots holding at least `PARAGRAPHS_PER_LETTER` words, `dice_bonus` amounts being positive integers, and `appliesTo` naming real character ids. Note `bun test` alone does not type-check; `bun run check:ci` is what catches a malformed constant.

**Tier thresholds have one home** — `TIERS` in `src/types.ts` is the ordered table of score boundaries and tier names, and `TierName` derives from it. `Scenario.consequences` is a `Record<TierName, string>`, so a scenario supplies four strings and cannot vary the boundaries. `tierFor(total)` in `src/scoring.ts` is the only lookup.

**Game logic** lives in `dice.ts`, `rules.ts`, `scoring.ts`, and `export.ts`. Two couplings the files don't show on their own: `dice_bonus` modifiers in `rules.ts` may be character-gated via `appliesTo.characters`, and `reroll_highest` is both planned and carried out in `rules.ts` — `planRoll` sets the flag, `applyReroll` replaces the highest die unconditionally, including when it was already a success.

**Data**: `src/data.ts` ships the 6 characters and 3 skills, `src/scenarios.ts` the 4 scenarios — all hard-coded constants carrying rulebook content.

## TypeScript conventions

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Array/record indexing returns `T | undefined` — handle the undefined case explicitly. For optional properties, omit the key rather than setting `undefined`.

## Historical docs

`docs/superpowers/specs/` holds the original design spec. Read it for intent — its non-goals are the clearest statement of what this app deliberately does not do — and let the code win wherever they disagree. The implementation plan that sat beside it was deleted once the build it described had finished.

## Manual smoke test

The README documents a six-step smoke test (setup → play five paragraphs → export → reload → restart). Run it after any change that touches the play loop, store persistence, or export.
