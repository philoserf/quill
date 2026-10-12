# Theory of Quill

This is an account of what you need to hold in mind to change Quill without breaking it. It is not a tour of the files; `CLAUDE.md` and `WALKTHROUGH.md` cover where things are and how a click becomes a repaint. This is about why the code is shaped the way it is, which of its rules are load-bearing, and where the shape is thinner than it looks.

## What the system is for

Quill is a solo tabletop game by Scott Malthouse in which the player writes a letter, five paragraphs long, to a fictional correspondent, and dice decide how well each paragraph lands. This app is a faithful-but-minimal digital table for it: it holds the rulebook's content, rolls the dice, keeps score, and hands the finished letter back as a Markdown file. It does not write, judge or reply to the prose. The player's words are the one thing in the system the code never interprets, apart from escaping them for export.

The domain has a small, fixed vocabulary, and the code uses it literally:

- A **character** (Monk, Knight, Poet, Aristocrat, Scholar, Courtier) has a rating of poor, average or good in three **attributes**: Penmanship, Language and Heart. A rating is a number of six-sided dice: 1, 2 or 3 (`diceForRating`).
- A **skill** adds one die to one attribute's roll, once per letter. There are three skills and exactly one per attribute, which `tests/data.test.ts` pins as a property of the game rather than of the data.
- A **scenario** is a correspondent and a reason for writing. It carries a profile to read, **Rules of Correspondence** (modifiers to the dice), an **Ink Pot** of word pairs, and four **consequences**, one per score tier.
- The Ink Pot is the heart of the mechanic. Each entry is an _inferior_ word the player sees and a _superior_ word they earn. Each paragraph spends one entry: the player picks it, a Language roll decides which form they must use, and an optional **flourish** (an adjective the player supplies) holds only if a Heart roll succeeds. They then write, and a Penmanship roll decides whether the hand was fine.
- A roll **succeeds** if any die shows 5 or 6. Count never matters, only presence; `succeeded()` in `dice.ts` is the rulebook's one success rule and every scoring, display and export decision goes through it.

A **letter** in the rules is a **session** in the code (`GameSession`), and a committed paragraph is a `Paragraph` record: which Ink Pot entry, the flourish word, the three rolls, whether the skill was spent on it, and the prose. Scores are not stored. They are recomputed from the rolls every time they are shown, so the rolls are the facts and points are a view of them.

## The organizing ideas

### The rolls are the record; everything else is derived

`paragraphPoints` turns a paragraph's rolls into points by a four-way table: a held flourish on a superior word is +2, on an inferior word −1; no flourish is +1 superior, 0 inferior; a fine hand adds 1. So a paragraph is worth −1 to 3, and a letter −5 to 15. `TIERS` in `types.ts` maps totals to the rulebook's four tier names (11 excellent, 8 favourable, 5 tepid, 0 unsuccessful), and `tierFor` floors a negative total to the lowest. The tier boundaries are game-global by construction: `Scenario.consequences` is a `Record<TierName, string>`, so a scenario can supply prose for each tier but cannot move a boundary. That was a deliberate collapse (d5622ca, #64) of the original design's per-scenario `threshold` field, which every scenario was forbidden from varying anyway.

Because points are derived, the three places that show a letter — the play screen's running score, the Score screen, and the export — cannot disagree about points; they all call the same functions. Where they have disagreed in the past, it was about _display_ rules that each copied: whether a failed flourish is shown, and what an empty paragraph looks like. Those now have single homes too. `paragraphProse()` in `src/paragraph.ts` is the one rule for prose, treating empty and whitespace-only text alike and showing it trimmed (#101), and the export reports a flourish only when it held, as the play screen does. Of the summaries of a committed paragraph, the Score screen's breakdown is the one that still says "flourish lost", on purpose: it is the reckoning, and it shows the attempt.

One quiet redundancy remains in the record. Whether a flourish was attempted is stored twice: `heartRoll !== null` and `flourishAdjective !== null` always agree, because the only way to reach the Heart roll is the _Attempt it_ button, which refuses a blank word. Scoring reads the first, the Score screen's breakdown reads the second. 521d3f0 (#66, closing #28) removed a third copy and recorded the invariant in its message. Keep them agreeing: a paragraph whose two fields disagree scores a flourish the breakdown never mentions.

### The paragraph machine owns the order of play

The order in which a paragraph resolves is a rule of the game, not a UI sequence: Heart and Language resolve before you write, Penmanship after. `advance(draft, event)` in `src/paragraph.ts` is that order's single home. There are seven phases (`PICK_WORD`, `DECIDE_FLOURISH`, `ROLL_HEART`, `ROLL_LANGUAGE`, `WRITE`, `ROLL_PENMANSHIP`, `PARAGRAPH_DONE`), and `DECIDE_FLOURISH` is the only branch, which is why `advance` is keyed on events rather than being a phase-to-phase table. Events carry the data their transition records (`rolled` carries the dice), so a reordering is caught by `tests/paragraph.test.ts` rather than merely compiling. An event that does not belong to the current phase returns the draft unchanged rather than throwing, because it would be thrown inside a click handler.

The machine owns order and rolls but not everything the draft holds. The prose, the flourish word and `skillUsedHere` are written directly onto the draft by the play screen's input and button handlers. That is the line to know: if you add a rule about _when_ something may happen, it belongs in `advance`; a rule enforced only in a handler (the non-blank flourish word is one) has no test, because the play screen has none.

`draftToParagraph` is the single mapping from draft to record, used twice on purpose: once to preview the points on the done step and once to commit, so the preview cannot drift from what is stored. It requires the word and the two mandatory rolls and deliberately does not require prose. An empty paragraph is committable, because refusing it after the Penmanship roll would strand the player, and it renders as `(empty paragraph)` everywhere. `commitParagraph` appends, latches `skillSpent`, and flips `status` to `finished` on the fifth paragraph. That flip is the only route to the Score screen. `PARAGRAPHS_PER_LETTER` is the one definition of five; the Roman numerals in `play.ts` are tied to it at compile time with `satisfies`.

### Durability is coarse on purpose

Only three things are ever written to storage: a new letter, a committed paragraph, and a restart. Phase changes, rolls, typed prose and a spent-but-uncommitted skill live only in the play screen's closure (`v.state`) and are repainted, not persisted. `main.ts` holds the session, calls `save()`, and then calls `render()` itself; the store notifies nobody. The separation is the result of b87a87f (#65), which removed a pub/sub store whose every phase transition rewrote `localStorage`, and of the draft moving out of a module-level variable into the `renderPlay` closure (dbee96d, #68).

The consequence is the app's most important behavioural fact for a player: **reloading mid-paragraph throws the paragraph away**, including any dice already rolled and a skill already spent on it. The letter restores to the start of the paragraph after the last committed one. The original design asked for the opposite (restore "at the exact paragraph state", with a debounced textarea write), and that plan was dropped in the code rather than forgotten: dcc851c (#23) deleted the unused debounce path and recorded the draft as deliberately unpersisted.

The `v.state` object is shared by every handler in one `renderPlay` call. That is what lets the roll button's 250 ms shake timer read the draft as it is when the timer fires; the timer also aborts if a repaint has detached its button, which is the live case when the skill is spent mid-shake. The object's lifetime is one paragraph, not one letter, because each commit makes `main.ts` build a fresh `renderPlay`. That is also why the _Recall the scenario_ panel closes at every new paragraph.

### A stored letter is the player's only copy

`localStorage` holds exactly one letter, under `quill.session.v1`. The design's stance, still true, is that the downloaded Markdown is the canonical archive and there is no library of saved games. _Write another letter_ on the Score screen calls `save(null)` with no confirmation, so a finished letter that was not downloaded is gone.

Within that one slot the store is built around one rule: a letter the app cannot show is set aside, not destroyed. `load()` parses, unwraps the legacy `{ session }` shape that v1 originally wrote, and checks the result with `isSession`/`isParagraph`. Those predicates are not general validation. They check what the render path dereferences, so that a payload that would crash a render is caught before it reaches one. Anything that fails is moved to `quill.session.v1.corrupt`. Three paths reject a stored letter, and all three quarantine:

- `load()`, on a bad shape;
- `hydrate()` in `main.ts`, on a scenario, character or skill id that no longer resolves (207a366, #100);
- the boot error screen's _Start a new letter_, through `discard()` (6377dca, #94).

The only intentional deletion is `save(null)`, the restart; the separate `clear()` was removed with #100. Two qualifications matter. The backup slot holds one letter and is never overwritten: the first quarantined letter is kept on the grounds that it is the one the player most likely wants, so once the slot is occupied, a later rejected letter is removed without a backup (the `discard` tests assert this). And nothing in the app reads the backup. Recovering a quarantined letter means opening the browser's storage inspector.

Storage itself is treated as hostile. Merely reading `globalThis.localStorage` can throw in a browser that blocks site data, so `storage()` wraps the property read; `save()` returns `false` instead of throwing, and `main.ts` warns once in the console rather than pretending to save.

The error boundary in `main.ts` covers the first render only. Later renders run from event handlers outside it. That is safe because `hydrate()` resolves the session's ids once at mount, and characters, skills and scenarios are compile-time constants that cannot stop resolving while the page is open. `render()` still throws if they do not resolve, as a narrowing for the types rather than a reachable branch. Its comment and `planRoll`'s exhaustive default (reworded in ee642b8, #102) are honest about which of their throws can actually fire.

### Rulebook content is code, joined to stored data by name and by position

Characters, skills and scenarios are typed constants (`src/data.ts`, `src/scenarios.ts`), transcribed from the rulebook. The original design loaded scenarios as JSON through a validator; d5622ca (#64) replaced that with constants, so a malformed scenario is a `tsc` error. Only `bun run check:ci` type-checks; `bun test` alone does not. `tests/scenarios.test.ts` holds what the types cannot express: at least five Ink Pot entries per scenario (fewer deadlocks the play screen, since a used word cannot be picked again), positive integer dice bonuses, and character ids in `appliesTo` that exist.

The seam that needs the most care is where these constants meet stored letters, because **saved letters outlive deploys** and refer to the constants in two different ways:

- **By id.** A session stores `scenarioId`, `characterId` and `skillId`. Renaming or removing one quarantines every in-progress letter that names it. The scenario and character id sets are pinned exactly by tests, which turns a rename into a deliberate act; skill ids are not pinned.
- **By position.** A `Paragraph` stores `inkPotIndex`, not the word. So an existing scenario's Ink Pot is append-only (80bbd9b, #98). Reordering or repurposing an entry silently changes the word in every stored letter; removing one leaves an index that renders as `—`. No test enforces this, and nothing could from inside one build.

The same join by character id appears inside the rules: a `dice_bonus` may be restricted to listed characters (`appliesTo.characters`). `reroll_highest` is the other modifier kind, and it is a hazard rather than a bonus. `applyReroll` replaces the first highest die with a fresh one unconditionally, including when it was already a success, as the Art Dealer's rule ("re-roll the highest die and accept the final roll") requires. `planRoll` sums base dice, matching bonuses, and the skill die, and is exhaustive over `Modifier` at compile time.

### Rendering is disposable DOM

There is no framework and no virtual DOM. Every screen function builds a fresh element tree; `main.ts` replaces the root when the session changes, Setup re-renders itself on each selection (restoring focus by element id so arrow-key navigation survives), and the play screen replaces its own subtree on each phase change. The one deliberate exception is the recall toggle, which flips its panel in place because a full repaint would destroy a mid-shake roll button. A handler that can fire after a repaint therefore reads state from `v.state` rather than from anything captured when its element was built, and checks that its element is still connected. The two `switch`es over the phase in `play.ts` are exhaustive with a `never` default (29b8da3, #97), so a new phase fails to compile until both the letter slot and the step card render it.

## The seams

- **The browser origin.** Letters live in `localStorage` for `quill.philoserf.com`. The hostname is part of the persistence format: serving the app from any other origin starts every player over, silently. The move from GitHub Pages to a Cloudflare Worker (d978347 and 9d60a6a, #92 and #93) kept the hostname for exactly this reason. The Worker is nothing but static assets from `dist/` (`wrangler.jsonc`), deployed by `task deploy` (check, build, `bunx wrangler deploy`). There is no CI; pushing deploys nothing. `bun run build` deletes `dist/` first, because `bun build` never cleans its output and would otherwise publish every stale hashed bundle.
- **Cloudflare's edge.** The zone is proxied, and the edge can inject scripts the repo does not contain. Analytics, if any, is injected there; a beacon in `public/index.html` would double-count.
- **Fonts.** `index.html` loads EB Garamond and IM Fell from Google Fonts. It is the only runtime dependency outside the bundle, and the look degrades rather than breaks without it.
- **The export.** `toMarkdown` produces YAML frontmatter, the prose, and a game-record table. Player text is the only untrusted input in the system, and it reaches exactly one structured format: table cells escape backslashes, then pipes, then newlines, in that order (b87045c, #95), and the scenario title is quoted as a YAML scalar. The export's date and filename use the UTC date of `startedAt`, while the on-screen letterhead uses the player's local calendar day; both choices are deliberate.
- **The stored shape.** `quill.session.v1` has never been version-bumped. It has absorbed two changes in place: the `{ session }` wrapper, unwrapped on load, and the removed `attemptedFlourish` field, which old paragraphs still carry and the code ignores. `isSession` is the whole compatibility layer, and it is tolerant of extra fields and strict only about what rendering reads.

## What it is shaped to accommodate

**Cheap:** a new scenario (append to `SCENARIOS`, keep five or more Ink Pot entries, supply four consequence strings); new prose or corrected transcription in an existing scenario, as long as Ink Pot positions keep their meaning; a new modifier kind (extend `Modifier`, and `tsc` points at `planRoll`); a new phase (extend `PhaseName` and `STEP_INDEX`, and `tsc` points at both play-screen switches).

**Moderate:** a new attribute or skill, which touches `ATTRIBUTES`, every character literal, the one-skill-per-attribute test, the stepper and the roll steps; changing the letter length, which `PARAGRAPHS_PER_LETTER` mostly centralizes but which also bounds the Roman numerals and each scenario's Ink Pot minimum.

**Fundamental:** anything that needs more than one letter at a time (a library, continuity between letters as in the rulebook's White Box), sync across devices, or resuming mid-paragraph. Each changes the single-slot, commit-only persistence theory, and the last one also changes the game: a persisted draft removes the reload escape hatch described above. The design spec's non-goals rule most of these out.

**Where a maintainer who did not hold this theory would do damage:** reordering an Ink Pot "for readability"; renaming a scenario, character or skill id; adding a field the screens read without widening `isSession`/`isParagraph` to match; moving the deploy to another hostname; adding a deletion path that skips `discard()`; or "fixing" the Score screen's flourish display by keying it off `heartRoll` without noticing that the two fields are the same fact.

## Uncertainties

- **Reload as a free reroll.** Discarding the draft on reload means a player can abandon a bad Language or Penmanship roll, and recover a spent skill, by reloading. The design spec says "no skip / reroll cheat" and expected the draft to persist. The code chose not to persist it, and dcc851c records that choice, but I found no record that anyone weighed the reroll consequence. My guess is that it is accepted as part of an honour-system game: the "word is set upon the page" indicator is likewise advisory and never blocks _Finish paragraph_. That is inference, not record.
- **One backup slot.** Whether "first quarantined letter wins, later ones are deleted" is the intended end state or a placeholder is unclear. The comment defends it, `CLAUDE.md` states it (42409a2), and no UI reads the backup. Treat the backup as a last resort for a developer with devtools, not a player-facing feature, until someone decides otherwise.
- **The flourish invariant's home.** The rule that an attempted flourish has a non-blank word is enforced by one click handler, not by `advance`, even though the paragraph machine is described as the single home of the order and the data flow. I read this as an unfinished edge of the #67 extraction, not a principled split, but the commit that extracted the machine does not say.
- **Rulebook fidelity.** I have not read the rulebook. Where I describe the rules (success on any 5 or 6, the four-way scoring table, the reroll accepting a worse result, tier boundaries at 0, 5, 8 and 11), I am reporting what the code and its tests encode and what the spec says the rulebook says. A transcription error would be invisible to every test here, because the tests were written from the same reading.
- **Untested surfaces.** `main.ts` and all three screens have no automated tests. Claims above about hydration order, the error boundary and repaint behaviour come from reading the code and commit messages, not from tests that pin them. The README's six-step manual smoke test is the only check on the play loop as a whole.
