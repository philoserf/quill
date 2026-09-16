# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Push and deploy

`git push` runs `bun run check:ci` via a `simple-git-hooks` pre-push hook (config in `package.json`). Bypass with `SKIP_SIMPLE_GIT_HOOKS=1 git push` for emergencies. `.github/workflows/deploy.yml` is the only workflow: a `check` job runs the same suite on pushes and PRs to `main`, then `build` and `deploy` jobs run on pushes only and publish `dist/` to GitHub Pages, serving the site at `quill.philoserf.com`. PRs additionally run `bun run build`, which `check:ci` does not cover. The custom domain lives in `public/CNAME`, which `bun run build` copies to `dist/CNAME` — Bun only emits assets reachable from `public/index.html`, so the copy step is what keeps the domain bound across deploys. The domain is proxied through Cloudflare, which also injects the Web Analytics beacon at the edge — never add that snippet to `public/index.html`, or page views are counted twice. README's Deploy section documents the out-of-repo settings.

## Architecture

Vanilla TS SPA, no framework. Entry chain: `public/index.html` → `src/main.ts` → screens in `src/screens/`. Rendering is direct DOM construction (`document.createElement`); each screen function returns an `HTMLElement` and the root is fully replaced via `rootEl.replaceChildren()` on every store change.

**State** — `Store<T>` (`src/store.ts`) is a small pub/sub with localStorage persistence under key `quill.session.v1`. `set()` mutates, notifies subscribers, and persists. Top-level state is `{ session: GameSession | null }`; `null` means the Setup screen, otherwise `session.status` ('in_progress' | 'finished') selects Play vs Score.

**Play screen draft state** — `src/screens/play.ts` holds a module-level `currentDraft` for the in-progress paragraph (phase, ink-pot pick, flourish, rolls, text). It is **deliberately not in the persisted store**: only completed paragraphs land in `session.paragraphs` when the player advances from `PARAGRAPH_DONE`. The draft is reset BEFORE calling `onUpdate` (see comment in `renderStepDone`) — the store notifies synchronously, so resetting after would cause the re-render to read stale phase state and re-show the same screen.

**Scenarios are typed constants** — `src/scenarios.ts` exports `SCENARIOS: Scenario[]`, transcribed from the Quill rulebook. There is no runtime validation: the `Scenario` type is the gate, so a malformed scenario is a compile error rather than a startup throw. **To add a scenario**: add an entry to `SCENARIOS`. What `tsc` cannot check lives in `tests/scenarios.test.ts` — ink pots holding at least `PARAGRAPHS_PER_LETTER` words, `dice_bonus` amounts being positive integers, and `appliesTo` naming real character ids. Note `bun test` alone does not type-check; `bun run check:ci` is what catches a malformed constant.

**Tier thresholds have one home** — `TIERS` in `src/types.ts` is the ordered table of score boundaries and tier names, and `TierName` derives from it. `Scenario.consequences` is a `Record<TierName, string>`, so a scenario supplies four strings and cannot vary the boundaries. `tierFor(total)` in `src/scoring.ts` is the only lookup.

**Game logic** lives in `dice.ts`, `rules.ts`, `scoring.ts`, and `export.ts`. Two couplings the files don't show on their own: `dice_bonus` modifiers in `rules.ts` may be character-gated via `appliesTo.characters`, and the `reroll_highest` policy is resolved not in `rules.ts` but inside `renderRollStep` in the play screen, the shared step behind all three attribute rolls.

**Data**: `src/data.ts` ships the 6 characters and 3 skills, `src/scenarios.ts` the 4 scenarios — all hard-coded constants carrying rulebook content.

## TypeScript conventions

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Array/record indexing returns `T | undefined` — handle the undefined case explicitly. For optional properties, omit the key rather than setting `undefined`.

## Historical docs

`docs/superpowers/specs/` holds the original design spec. Read it for intent — its non-goals are the clearest statement of what this app deliberately does not do — and let the code win wherever they disagree. The implementation plan that sat beside it was deleted once the build it described had finished.

## Manual smoke test

The README documents a six-step smoke test (setup → play five paragraphs → export → reload → restart). Run it after any change that touches the play loop, store persistence, or export.
