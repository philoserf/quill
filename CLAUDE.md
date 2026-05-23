# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
bun install
bun run dev        # http://localhost:3000 — Bun serves public/index.html and bundles src/ on the fly
bun test           # runs everything in tests/
bun test tests/scoring.test.ts          # single file
bun test -t "paragraphPoints"           # by test name
bun run check      # biome check --write (format + lint, applies fixes)
bunx tsc --noEmit  # type-check (CI runs this; no bun script for it)
bun run build      # bundle to dist/ via `bun build ./public/index.html`
```

CI (`.github/workflows/deploy.yml`) runs `bun test`, `biome check`, `tsc --noEmit`, then `bun run build`, and deploys `dist/` to GitHub Pages on push to `main`.

## Architecture

Vanilla TS SPA, no framework. Entry chain: `public/index.html` → `src/main.ts` → screens in `src/screens/`. Rendering is direct DOM construction (`document.createElement`); each screen function returns an `HTMLElement` and the root is fully replaced via `rootEl.replaceChildren()` on every store change.

**State** — `Store<T>` (`src/store.ts`) is a ~50-line pub/sub with localStorage persistence under key `quill.session.v1`. `set()` mutates, notifies subscribers, and persists (debounced if `{ debouncePersist: true }` — used for textarea input). Top-level state is `{ session: GameSession | null }`; `null` means the Setup screen, otherwise `session.status` ('in_progress' | 'finished') selects Play vs Score.

**Play screen draft state** — `src/screens/play.ts` holds a module-level `currentDraft` for the in-progress paragraph (phase, ink-pot pick, flourish, rolls, text). It is **deliberately not in the persisted store**: only completed paragraphs land in `session.paragraphs` when the player advances from `PARAGRAPH_DONE`. The draft is reset BEFORE calling `onUpdate` (see comment in `renderParagraphDone`) — the store notifies synchronously, so resetting after would cause the re-render to read stale phase state and re-show the same screen.

**Scenarios are bundled at build time** — `src/scenarios.ts` uses `import scenario from '../public/scenarios/foo.json' with { type: 'json' }` and runs every payload through `validateScenario`. Bun's HTML dev server doesn't serve sibling JSON via fetch (it returns the SPA HTML), so bundling is the only path that works in both dev and prod. **To add a scenario**: drop the JSON in `public/scenarios/`, add the import + entry to the `BUNDLED` array. The validator requires `consequences` to have exactly the thresholds `[0, 5, 8, 11]` (matches `TIER_NAMES` in `src/types.ts`).

**Game logic split**:

- `dice.ts` — pure `roll`, `countSuccesses` (5+ on d6 is a success), `diceForRating`.
- `rules.ts` — `planRoll` resolves the dice pool for one attribute given character rating + scenario `rulesOfCorrespondence` modifiers + active skill bonus. `dice_bonus` modifiers may be character-gated via `appliesTo.characters`; `reroll_highest` policy is consumed inside the play screen's penmanship roll.
- `scoring.ts` — `paragraphPoints` (superior word, flourish, penmanship), `score` walks consequence tiers (highest threshold ≤ total).
- `export.ts` — Markdown export with YAML frontmatter + paragraph table + tier text.

**Data**: `src/data.ts` ships the 6 characters and 3 skills as hard-coded constants (rulebook content); scenarios are JSON for easier authoring.

## TypeScript conventions

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Array/record indexing returns `T | undefined` — handle the undefined case explicitly. For optional properties, omit the key rather than setting `undefined`. Biome enforces single quotes, semicolons, 2-space indent, 100-col lines.

## Manual smoke test

The README documents a six-step smoke test (setup → play five paragraphs → export → reload → restart). Run it after any change that touches the play loop, store persistence, or export.
