# Theory of Quill

This is an account of what you need to hold in mind to change Quill without breaking it. It is not a tour of the files; `CLAUDE.md` covers the mechanics of building and deploying, and `WALKTHROUGH.md` follows the code line by line. Where this document and the code disagree, the code wins.

## What the system is for

Quill is a solo tabletop game, Scott Malthouse's rulebook of the same name, turned into a page in a browser. The player is a correspondent — one of six archetypes (Monk, Knight, Poet, Aristocrat, Scholar, Courtier) — writing one letter to one recipient in one of four scenarios. The letter is exactly five paragraphs. The dice do not write the letter; they decide which words the player is _obliged_ to use, and how well the letter lands.

The game's vocabulary maps onto the code almost one-to-one, and that mapping is the first thing to learn:

- A character has three **attributes** — Penmanship, Language, Heart — each rated poor, average or good, which is one, two or three six-sided dice (`diceForRating`). A die showing 5 or 6 is a success, and a roll succeeds if _any_ die succeeds. There is exactly one success rule in the codebase, `succeeded()` in `src/dice.ts`, and every screen, the scorer and the export call it.
- A scenario carries an **ink pot**: ten word pairs, an _inferior_ word ("Corpse") and a _superior_ one ("Body"). Each paragraph must be built around one word from the pot, and each word serves only one paragraph. The player sees only the inferior word when choosing; the Language roll decides which of the pair they must actually write.
- A **flourish** is an optional adjective the player proposes before writing. A Heart roll decides whether it holds. A held flourish on a superior word is worth more than the plain word; a held flourish on an inferior word costs a point. A failed Heart roll costs nothing — the flourish simply evaporates.
- **Penmanship** is rolled _after_ the paragraph is written and adds at most one point, however many dice succeed.
- A scenario's **Rules of Correspondence** bend the dice for that recipient: extra dice on an attribute, sometimes only for named archetypes, or a hazard that re-rolls the highest Penmanship die even when it was already a success.
- A **skill** (Inspiration, Illumination, Augmentation — one per attribute) adds a die to one roll, once per letter.
- The five paragraph scores sum to a total, and the total falls into one of four **consequence tiers** — unsuccessful, tepid, favourable, excellent — each of which the scenario answers with a sentence describing how the recipient responds.

The finished artifact is the letter itself, downloaded as Markdown with the dice record appended. The design spec (`docs/superpowers/specs/2026-05-01-quill-design.md`) says it plainly: there is no saved-games library, and the export is the canonical archive. The app keeps exactly one letter at a time, and only until the player starts the next one.

## The organizing ideas

### A paragraph is the unit of commitment

The most important idea in Quill is that **a paragraph is either finished and permanent, or it does not exist**. The game state has two layers with different lifetimes:

- The **session** (`GameSession`) — who is writing, to whom, with which skill, whether the skill is spent, and the list of _committed_ paragraphs. This is persisted to `localStorage` under `quill.session.v1`.
- The **draft** — the paragraph currently being worked through: which word was picked, the flourish typed, the rolls made so far, the prose in the textarea. This lives in a closure inside `renderPlay` and is never written anywhere.

`main.ts` holds the session and writes it in exactly three moments: a new letter, a committed paragraph, and a restart (plus a recovery write at mount, discussed under uncertainties). Everything else — picking a word, rolling a die, typing — repaints the play screen and touches nothing durable. These are two channels with deliberately different names: `commit()` in `main.ts` persists and re-renders the whole app; `repaint()` inside the play screen rebuilds only its own subtree. b87a87f and dbee96d are where this split was made, and their commit messages are worth reading: before them, every phase transition rewrote `localStorage` and the store notified a subscriber that re-rendered, which in turn could write to the store.

The consequence the maintainer must keep in view: **a reload mid-paragraph discards the draft, rolls included.** The committed paragraphs and the spent skill come back; the half-written paragraph does not. The original spec intended the opposite (restore "at the exact paragraph state", with a debounced textarea save); that path was never wired and was deleted as dead code in dcc851c. See the uncertainties section for what this implies about re-rolling.

Because a commit replaces the whole play screen with a fresh `renderPlay`, there is no "reset the draft" step to get wrong. A new paragraph is a new closure. If you find yourself writing code that clears draft fields after a commit, you have misunderstood the arrangement.

### The paragraph's order is the game's rule

`src/paragraph.ts` holds the seven phases (`PICK_WORD`, `DECIDE_FLOURISH`, `ROLL_HEART`, `ROLL_LANGUAGE`, `WRITE`, `ROLL_PENMANSHIP`, `PARAGRAPH_DONE`) and the single function `advance(draft, event)` that moves between them. The order is not arbitrary sequencing; it _is_ the rulebook. Heart and Language resolve before the player writes — so the player writes knowing which word, and which flourish, they are bound to — and Penmanship resolves after, judging the hand that wrote it. Moving Language after `WRITE` would type-check and produce a different game.

Events carry the data their transition records (`{ type: 'rolled', attribute, dice }`), so the order and the data flow share one home. `DECIDE_FLOURISH` is the only branch: "attempt" goes through `ROLL_HEART`, "write plainly" skips it and clears the adjective. An event that does not fit the current phase returns the draft unchanged rather than throwing, because the only caller is a click handler and the UI never offers an out-of-phase event.

`advance` is pure and tested (`tests/paragraph.test.ts`); the DOM around it is not. That is the line to preserve: anything that is _game logic_ belongs in a module a test can call without a document.

### A paragraph records rolls, not outcomes

A committed `Paragraph` stores the word's ink-pot _position_, the flourish text, and the raw dice of each roll. It does not store whether the word was superior, whether the flourish held, or how many points it scored. Every one of those is re-derived on read through `succeeded()` and `paragraphPoints()`.

This cuts two ways, and the asymmetry is the thing to understand:

- **Dice modifiers are baked in at roll time.** The Rules of Correspondence, the skill die and the art dealer's re-roll all act on how many dice are rolled and which faces survive; what lands in `languageRoll` is already the post-modifier result. Changing a scenario's rules affects only future rolls.
- **Scoring is applied at read time.** Changing `paragraphPoints`, the success threshold, or the `TIERS` boundaries silently re-scores every letter already saved in a player's browser, and changes the consequence sentence they see on the Score screen.

The same is true of the word. `inkPotIndex` is resolved against whatever `SCENARIOS` holds _now_, and a saved session outlives a deploy. An existing scenario's ink pot is therefore **append-only**: reordering, removing or repurposing an entry changes the word in every stored letter, or leaves the index pointing at nothing. 80bbd9b wrote this down on the field itself and in `CLAUDE.md`; nothing enforces it.

Some fields do encode one fact twice and are kept consistent only by the routes that produce them. After 521d3f0 dropped `attemptedFlourish`, a paragraph from this app satisfies `heartRoll !== null` exactly when `flourishAdjective !== null`, because "Attempt it" refuses an empty adjective and "Write plainly" clears it. The Score screen keys "flourish lost" off the adjective, the scorer keys off the roll; they agree only because that invariant holds.

### Rulebook content is compiled, not loaded

Characters, skills and scenarios are TypeScript constants (`src/data.ts`, `src/scenarios.ts`). The spec planned JSON files fetched and validated at startup; d5622ca replaced them with typed constants because the build had already erased the data boundary the validator guarded. The `Scenario` type is now the validator: an unknown modifier type, a misspelled attribute or a missing consequence tier is a compile error. What the type cannot state lives in `tests/scenarios.test.ts` — at least five ink-pot words per scenario (fewer would deadlock the play screen at the last paragraph, since a used word cannot be picked again), positive integer dice bonuses, and character-restricted bonuses naming real character ids. `bun test` alone does not type-check; `bun run check:ci` does.

The consequence tiers have one home, `TIERS` in `src/types.ts`, from which `TierName` derives. A scenario supplies four sentences keyed by tier name and cannot move the boundaries (0, 5, 8, 11). That restriction is the rulebook's, not a simplification: the tier names are game-global.

Because these are constants, the set of valid ids is fixed for the life of the page. `main.ts` exploits this: it checks once, at mount (`hydrate`), that the stored session's scenario, character and skill resolve, then hands the screens the resolved objects. Screens never look anything up by id and never branch on a lookup failing. If you add a screen, give it the resolved values through its context; do not import `characterById`.

### Never destroy the player's only copy

`src/store.ts` is four functions over one key, and its comments state its premise: a stored letter the app cannot read or cannot show is _set aside_, not deleted. A payload that fails to parse or fails the shape check moves to `quill.session.v1.corrupt`. The quarantine never overwrites an existing backup, on the theory that the first casualty is the letter the player most wants back. If the quarantine write itself is refused, the original is left where it was. The boot error handler's _Start a new letter_ calls `discard()`, which quarantines, rather than `clear()`, which deletes — that change (6377dca) closed a hole where the one button the app told the player to press erased the only copy of a letter the shape check had let through.

The shape check (`isSession`) is deliberately not a full schema. It checks what the render path dereferences — the session's scalar fields, `status`, and for each paragraph the index and the three roll arrays — because the goal is that anything which would crash a render fails here instead, and gets quarantined, rather than crashing on every reload.

`save()` returns `false` instead of throwing when storage refuses a write (full quota, or a browser that permits reads but not writes). `main.ts` reacts by logging one console warning. Storage is also bound to an origin: the saved letter lives under `quill.philoserf.com`, so the hostname is part of the persistence design, not just the deployment.

The legacy `{ session }` wrapper is unwrapped on read so letters saved by the first version survive; the key stays `.v1` because bumping it would orphan them.

## The seams

**Browser storage.** The only durable state, behind `src/store.ts`. Principled boundary: nothing else touches `localStorage`, and the store notifies nobody — `main.ts` decides when to re-render.

**`main.ts` as the single owner of the session.** It resolves ids once, chooses the screen from `session === null` (Setup) and `session.status` (Play or Score), and turns each screen's one callback — `onBegin`, `onCommit`, `onRestart` — into a durable write followed by a full re-render. The `try` around `mount` covers only the first render; later renders run from event handlers outside it. That is defensible only because ids cannot stop resolving mid-session and the shape check runs before the first render.

**The play screen and the paragraph machine.** `src/screens/play.ts` is the largest file and the only one with mutable state. It is a caller of `advance`, not an owner of game order. Two details here are load-bearing and easy to break:

- `v.state` is one shared object per letter. The roll button shakes for 250ms before rolling; its timer reads `v.state.draft` when it _fires_, not a copy captured when the button was built. A repaint during the shake — spending the skill is the real case — detaches the button, and the timer checks `isConnected` and aborts so the freshly built button rolls with the current dice count.
- The scenario-recall toggle flips its panel in place instead of calling `repaint()`, precisely so it cannot destroy a mid-shake roll button.

Both play-screen phase switches end in a `never`-typed default (29b8da3), as does `planRoll`'s modifier switch, so adding a phase or a modifier type makes `tsc` name every place that must handle it.

**Rules and dice.** `planRoll` turns a character, a scenario and the skill flag into a dice count and a re-roll policy; `applyReroll` carries the policy out. Both live in `src/rules.ts` so the mechanic sits beside the rule that asks for it. The skill's "+1 die" is not a Rule of Correspondence; it is added after them.

**The export.** `toMarkdown` is where player text leaves the app's control and enters a format with its own syntax. The flourish input has no pattern, so game-record cells escape backslashes, then pipes, then fold newlines to spaces (abe338d, with the backslash ordering fixed in b87045c); the scenario title is quoted as a YAML scalar for the next scenario whose title carries a colon. Character and skill names are written unquoted, which is safe only because both lists are closed constants with plain names — `tests/data.test.ts` treats the six archetypes as a fixed set. The table reports a flourish only if it held, while the Score screen shows a failed one as "flourish lost"; both are derived from the same two fields. Dates are deliberately split: the frontmatter date and the filename use the UTC date of `startedAt`, the on-screen letterhead uses the player's local calendar day.

**Deployment.** The site is static assets served by a Cloudflare Worker with no script of its own (`wrangler.jsonc` names only an asset directory and a custom domain), deployed by hand with `task deploy`. There is no CI; the gate is the pre-push hook running `check:ci`. The Cloudflare edge may inject scripts the repository does not contain, which is why the page must never carry its own analytics snippet.

## What the system is shaped to accommodate

**A new scenario** is the change the design most expects: append an entry to `SCENARIOS` with at least five ink-pot pairs and four consequence sentences, and the Setup screen, the roll planner, the scorer and the export pick it up. A new scenario's Rules of Correspondence must be expressible as the two existing modifier types.

**A new kind of Rule of Correspondence** means a new variant of the `Modifier` union, and `planRoll`'s exhaustive switch will refuse to compile until it is handled. The current model assumes every rule acts on _one roll of one attribute_ — more dice, or a post-roll re-roll — and that `RollPlan` can describe it. A rule that acts across paragraphs, or on scoring rather than dice, does not fit `RollPlan` and would need a new seam, probably in `paragraphPoints`; remember that scoring changes are retroactive.

**A new paragraph phase** goes into `PhaseName`, `advance`, `STEP_INDEX` and the two play-screen switches, and the compiler now names all of them. The stepper has five labelled columns for seven phases; check that the new phase's column makes sense.

What would require rethinking something fundamental:

- **More than one letter.** The spec's non-goals rule out multi-character continuity and a saved-games library, and the code is built on that: one key, one session, a restart that deletes it. A history of letters means a new storage shape and a different answer to "what does restart mean".
- **A different letter length.** `PARAGRAPHS_PER_LETTER` is global, and the Roman numerals in the play screen are typed to satisfy it. A supplement with seven-paragraph letters per scenario would turn a constant into a scenario property.
- **Persisting the draft.** It looks like a small kindness and changes the game: it would make a reload resume a paragraph whose rolls are already fixed, and it would put writes back on the repaint path that b87a87f took them off. If you do it, persist on the phase transitions that record dice, not on keystrokes.
- **Editing rulebook content in place.** Scenario text, consequence sentences and flavour can be corrected freely. Ink-pot entries, ids and the scoring rules cannot be changed without deciding what happens to letters already saved in players' browsers.

Where a maintainer who did not hold this theory would most likely do damage: reordering or "tidying" an ink pot; adding a `save()` call inside a play-screen handler; deleting a stored session anywhere instead of quarantining it; giving a screen its own id lookup with its own fallback; changing a scoring constant without noticing it re-scores finished letters; or putting rule logic into a DOM callback where no test can reach it.

## Uncertainties

These are the places where I am inferring intent from the code, or where the code does not fit any single theory I can state.

**Reloading is a free re-roll.** Because the draft is not persisted, a player who dislikes a Language or Heart result can reload and pick the same word again with fresh dice; the skill, if spent on that paragraph and not yet committed, comes back too. The spec said "no skip / reroll cheat" and assumed a persisted draft that would have prevented this. The commit history treats the unpersisted draft as deliberate (dcc851c, dbee96d) but never mentions this consequence. I cannot tell whether it is an accepted trade — a single-player game where cheating only cheats yourself — or an unnoticed one. The README's smoke-test step "reload during play; confirm the in-progress letter restores" is true only of committed paragraphs.

**The never-destroy rule has one exception.** `hydrate()` in `main.ts`, which checks that the stored session's scenario, character and skill ids still exist, calls `clear()` and deletes the letter when they do not, where `load()` and the boot error handler both quarantine. A deploy that renames an id would silently erase every in-progress letter that uses it. The scenario and character id sets are pinned by tests, which makes such a rename deliberate, but skill ids are not pinned. I read this as an oversight left behind when 6377dca moved the boot handler to `discard()`, not as a considered exception, because nothing in the code or history argues for deleting in this one place.

**"Empty" means two things.** The export treats a whitespace-only paragraph as empty and prints the placeholder; the play and Score screens test the raw string and render a blank paragraph. f92bdd1 intended the three to agree. This is drift rather than design.

**The shape check is narrower than the type.** `isSession` does not check a paragraph's `text`, `flourishAdjective` or `skillUsedHere`, on the stated principle that it guards only what the render path dereferences. The screens do tolerate a missing `text`, but the export calls `.trim()` on it, so such a payload would load and display and then fail on download. Whether "render path" was meant to include the export I cannot tell.

**A refused save is told to the console, not the player.** `save()` returns `false` precisely so "the caller decides whether that is worth telling the player", and the caller logs one warning. A player in a browser that refuses writes sees a working game that forgets everything on reload. This may be deliberate minimalism or an unfinished thought.

**Word retirement lives only in the UI.** That each ink-pot word serves one paragraph is enforced by the play screen disabling used words, not by `advance` or `commitParagraph`, which do not see the session's paragraphs. The tests guarding ink-pot size rely on this rule; nothing tests the rule itself.

**Fidelity to the rulebook** — that the re-roll replaces the highest die even when it succeeded, that a failed Heart roll carries no penalty, that the skill adds exactly one die to one roll — is asserted by the code's comments and the spec and pinned by tests against those readings, not against the rulebook text. I have not checked the transcription against the source.
