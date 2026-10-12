# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Formatting

Two formatters, split by language and not interchangeable. **Biome owns TypeScript and JSON; prettier owns markdown** — Biome 2.5 does not process markdown at all, which is the whole reason prettier is here. Both run in `check`, `check:ci` and `format`, so markdown drift fails the pre-push hook like any other formatting.

`.prettierrc.json` sets `embeddedLanguageFormatting: "off"`. That is load-bearing rather than stylistic: `WALKTHROUGH.md` quotes source verbatim, and at prettier's default of `"auto"` it reformats code inside fenced blocks to its own style — double quotes at width 80, against Biome's single quotes at 100 — so a quoted snippet silently stops matching the file it came from. `.prettierignore` excludes `.issues/`, which is ignored through the global `core.excludesfile` rather than this repo's `.gitignore` and so is invisible to git but not to prettier.

## Push and deploy

`git push` runs `bun run check:ci` via a `simple-git-hooks` pre-push hook (config in `package.json`). Bypass with `SKIP_SIMPLE_GIT_HOOKS=1 git push` for emergencies. There is no CI and no workflow: pushing deploys nothing.

The site is a Cloudflare Worker serving static assets from `dist/` (`wrangler.jsonc`) at `quill.philoserf.com`. Deploy with `task deploy` from `almanac` or `sextant`: it runs `check:ci`, then `bun run build`, then `bunx wrangler deploy`. Only `dist/` is published, so nothing else in the repo reaches the site. `build` deletes `dist/` first because `bun build` never cleans its `--outdir` — without that, every old hashed bundle would ship alongside the current one. Wrangler authenticates with `bunx wrangler login`, run once per machine from a real terminal (it refuses without a TTY); a Cloudflare API token in the login keychain as `cloudflare-api-token` takes precedence if present.

**The hostname must not change.** Saved letters live in `localStorage` under `quill.philoserf.com`, so any other origin silently starts the player over.

The domain is proxied through Cloudflare, and the edge may inject scripts the repo does not contain — Rocket Loader and the `/cdn-cgi/challenge-platform/` bot check were seen on the Pages host. Never add an analytics snippet to `public/index.html`; if the zone's Web Analytics auto-injects a beacon, a second copy double-counts. README's Deploy section documents the out-of-repo settings.

## Architecture

Vanilla TS SPA, no framework. Entry chain: `public/index.html` → `src/main.ts` → screens in `src/screens/`. Rendering is direct DOM construction (`document.createElement`); each screen function returns an `HTMLElement`. `main.ts` replaces the root via `rootEl.replaceChildren()` when the session changes; the play screen repaints its own subtree in place for everything else.

**State** — `src/store.ts` is three functions over `GameSession | null` persisted under `quill.session.v1`: `load()`, `save()` (`save(null)` clears), and `discard()`, which sets the stored session aside as a quarantine instead of deleting it. **It notifies nobody.** `main.ts` holds the session in a closure and calls `render()` itself after a write, so persisting and repainting are separate channels — only a committed paragraph, a new letter or a restart is durable. `null` means the Setup screen; otherwise `session.status` ('in_progress' | 'finished') selects Play vs Score. `load()` unwraps the legacy `{ session }` payload shape and quarantines anything failing its shape check to `quill.session.v1.corrupt` rather than destroying it; `save()` returns `false` instead of throwing when storage refuses the write. Every path that rejects a stored letter quarantines it — `load()` on a bad shape, `hydrate()` in `main.ts` on an id that no longer resolves, and the boot error handler's _Start a new letter_ through `discard()` — because it may be the player's only copy. Only a deliberate restart (`save(null)`) deletes.

**The paragraph machine** — `src/paragraph.ts` owns the seven-phase order as one event-keyed `advance(draft, event)`, plus `draftToParagraph` and `commitParagraph`. Events carry the data their transition records, so the order and the data flow have one home. It is the only part of the play loop with tests (`tests/paragraph.test.ts`); the screen around it has none.

**Play screen draft state** — `renderPlay` owns the in-progress paragraph in its closure as `v.state.draft` and repaints its own subtree. It is **deliberately not persisted**: only completed paragraphs reach `session.paragraphs`, via `onCommit`. Committing discards the closure — `main.ts` builds a fresh `renderPlay` with a fresh draft — so there is no reset to sequence. `v.state` is one shared object per letter on purpose: the roll button's 250ms shake timer reads the draft _when it fires_, not a copy captured when its button was built, so a repaint mid-shake cannot land a roll on a draft nothing will see.

**Scenarios are typed constants** — `src/scenarios.ts` exports `SCENARIOS: Scenario[]`, transcribed from the Quill rulebook. There is no runtime validation: the `Scenario` type is the gate, so a malformed scenario is a compile error rather than a startup throw. **To add a scenario**: add an entry to `SCENARIOS`. **To edit one**, treat its `inkPot` as append-only: a saved `Paragraph` stores the word's _position_ (`inkPotIndex`), not the word, and saved letters outlive deploys. Reordering, removing or repurposing an entry silently changes the word in every stored letter, or leaves the index dangling. No test enforces this. What `tsc` cannot check lives in `tests/scenarios.test.ts` — ink pots holding at least `PARAGRAPHS_PER_LETTER` words, `dice_bonus` amounts being positive integers, and `appliesTo` naming real character ids. Note `bun test` alone does not type-check; `bun run check:ci` is what catches a malformed constant.

**Tier thresholds have one home** — `TIERS` in `src/types.ts` is the ordered table of score boundaries and tier names, and `TierName` derives from it. `Scenario.consequences` is a `Record<TierName, string>`, so a scenario supplies four strings and cannot vary the boundaries. `tierFor(total)` in `src/scoring.ts` is the only lookup.

**Game logic** lives in `dice.ts`, `rules.ts`, `scoring.ts`, and `export.ts`. Two couplings the files don't show on their own: `dice_bonus` modifiers in `rules.ts` may be character-gated via `appliesTo.characters`, and `reroll_highest` is both planned and carried out in `rules.ts` — `planRoll` sets the flag, `applyReroll` replaces the highest die unconditionally, including when it was already a success.

**Data**: `src/data.ts` ships the 6 characters and 3 skills, `src/scenarios.ts` the 4 scenarios — all hard-coded constants carrying rulebook content.

## TypeScript conventions

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Array/record indexing returns `T | undefined` — handle the undefined case explicitly. For optional properties, omit the key rather than setting `undefined`.

## Historical docs

`docs/superpowers/specs/` holds the original design spec. Read it for intent — its non-goals are the clearest statement of what this app deliberately does not do — and let the code win wherever they disagree. The implementation plan that sat beside it was deleted once the build it described had finished.

## Manual smoke test

The README documents a six-step smoke test (setup → play five paragraphs → export → reload → restart). Run it after any change that touches the play loop, store persistence, or export.
