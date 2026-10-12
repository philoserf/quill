# Theory of Quill

This is an account of what you need to hold in mind to change Quill without breaking it. It is not a tour of the files. Where it says something the code alone cannot prove, it says so, and the last section collects those places.

## What the system is for

Quill is a solo tabletop game played in a browser. In Scott Malthouse's rulebook, a player takes on a character (Monk, Knight, Poet, Aristocrat, Scholar or Courtier) and writes one letter to one correspondent (the Archduke, the Art Dealer, the Father, the King). The letter has five paragraphs. In each one the player takes a word from the scenario's _ink pot_. A Language test decides whether they must use its _superior_ or _inferior_ form. They may first attempt a _flourish_, an adjective of their own, which a Heart test decides whether it holds. After writing, a Penmanship test decides whether the hand was fine. Points come only from those three tests. The total falls into one of four _consequence tiers_, and each tier has its own prose ending for that correspondent.

The code's vocabulary follows the rulebook closely, and the mapping is worth learning once:

- A **character** has three **attributes** (`penmanship`, `language`, `heart`), each rated `poor | average | good`. The rating is a dice count of 1, 2 or 3 (`diceForRating`). Nothing else about a character affects play.
- A **skill** is a one-time gift of one extra die on one attribute, spendable once per _letter_, not once per paragraph. `GameSession.skillSpent` is the latch for the letter; `Draft.skillUsedHere` is the spend inside the current paragraph.
- A **scenario** carries its **rules of correspondence** (`Modifier[]`), which change dice counts or reroll policy, an **ink pot** of ten inferior/superior pairs, and four **consequences**, one per tier.
- A **roll succeeds** if any die shows 5 or 6. That one rule (`succeeded` in `dice.ts`) is the only success test anywhere. The number of successes beyond one never matters.

Points are not a sum of independent tests. A held flourish _multiplies the stakes_ of the Language roll: with a flourish, superior is +2 and inferior is −1; without one, superior is +1 and inferior is 0. Penmanship adds +1 on success either way (`paragraphPoints`). A flourish is a bet, not a bonus. Any change to scoring that treats Heart as an additive bonus has misread the game.

The app checks no prose. The write step shows the phrase the player should use ("Incorporate: …") and a live indicator of whether it appears, but _Finish paragraph_ is always enabled and nothing gates on the indicator. The game is an honour system around dice. The software keeps the dice honest and the record faithful, and leaves the writing to the player.

## The organizing ideas

### A paragraph records dice, not outcomes

A committed `Paragraph` stores the raw dice of each test (`heartRoll`, `languageRoll`, `penmanshipRoll`), the flourish word, the skill spend, the text, and the _index_ of the ink-pot word. It stores no verdicts: not "superior", not "flourish held", not points. Every consumer works them out again from the dice through `succeeded`: the play screen's ink pot and done summary, the Score screen's breakdown, `score()`, and the Markdown export.

Two consequences follow, and both matter more than they look.

First, **the success rule and the scoring table apply retroactively.** Change `isSuccess`, `paragraphPoints` or `TIERS` and every letter already saved in a player's browser rescores on its next render, finished letters included. The design accepts this because it keeps one source of truth. A maintainer who wants letters to keep their original score would have to start storing verdicts, which is a change of theory, not a tweak.

Second, **the word is a position, not a string.** `inkPotIndex` resolves against whatever `SCENARIOS` holds at render time. Saved letters outlive deploys, so an existing scenario's `inkPot` is append-only. Reordering, removing or rewording an entry silently changes the word in every stored letter. This is stated in `CLAUDE.md` and at the `Paragraph` type (#79), and no test enforces it. The render paths tolerate an index that resolves to nothing: the Score screen and the export print `—`. So the failure is silent wrongness, not a crash.

### The record versus the draft

There are two lifetimes in play, and keeping them apart is the central discipline of the play loop.

The **record** is the `GameSession`: the three choices, the skill latch, the committed paragraphs, and a status of `in_progress | finished`. It is the only thing persisted. It changes only through `commit()` in `main.ts`, and only three events reach it: beginning a letter, committing a paragraph, restarting.

The **draft** is the paragraph in progress. It lives in `renderPlay`'s closure as `v.state.draft` and is never persisted. Committing replaces the whole play subtree with a fresh `renderPlay` and a fresh `emptyDraft()`, so there is no reset step to forget. Before b87a87f (#65) and dbee96d (#68), persistence and repainting shared one channel, and every phase transition rewrote `localStorage` (#42). Splitting them is what lets the play screen repaint freely.

The cost of an ephemeral draft is visible to players. Reloading mid-paragraph throws the draft away, including any dice already rolled and a skill spent but not yet committed. The player can therefore reroll a paragraph by reloading. In a solo game that is a tolerable leak, and README's smoke test only promises that the _letter_ restores on reload, not the paragraph. Persisting the draft would close it, but would also bring back every hazard the split removed.

### The paragraph machine is the only writer of the draft

`advance(draft, event)` in `src/paragraph.ts` owns the seven phases: `PICK_WORD → DECIDE_FLOURISH → (ROLL_HEART) → ROLL_LANGUAGE → WRITE → ROLL_PENMANSHIP → PARAGRAPH_DONE`. Since c77e599 (#112), every change to the draft is an event, including the three plain edits (`setFlourish`, `setText`, `spendSkill`). Each event is phase-guarded, and an event from the wrong phase returns the draft unchanged rather than throwing. The play screen calls `advance` and repaints; it does not assign draft fields itself. The reason is that the machine, unlike the screen, is under test (`tests/paragraph.test.ts`). An invariant enforced only in a click handler is not covered by the tests.

The invariant that took the most passes to settle is **the Heart roll is the record of a flourish attempt.** There used to be three fields for one decision: `attemptedFlourish`, a non-null adjective, and a non-null Heart roll (#28, removed in 521d3f0). What remains:

- `attemptFlourish` refuses a blank word and stores it trimmed (#107, #108), so the phrase the write step asks for is exactly the phrase the player typed.
- `writePlainly` clears the word and skips `ROLL_HEART`, so `heartRoll` stays `null`.
- `draftToParagraph` keeps the word if and only if there is a Heart roll (#116). On a committed paragraph, `heartRoll !== null` and `flourishAdjective !== null` therefore always agree.

`draftToParagraph` is the single Draft-to-Paragraph mapping. The done step calls it twice, once to preview the points and once to commit, so the previewed score and the recorded score cannot drift. Empty text is deliberately committable. `paragraphProse` turns empty or whitespace-only text into `(empty paragraph)` the same way on screen and in the export (#101).

`STEP_INDEX` maps phases to stepper columns, and it is presentation, not transition. `DECIDE_FLOURISH` and `ROLL_HEART` share a column because the player sees "Flourish" as one step whether or not they attempt it.

### Rules are typed data, executed in one place

Scenarios used to be JSON fetched at runtime and checked by a hand-written validator (#45, #55). Since d5622ca (#64) they are `Scenario`-typed constants in `src/scenarios.ts`, so a malformed scenario is a compile error. `tests/scenarios.test.ts` covers only what `tsc` cannot express: each ink pot holds at least `PARAGRAPHS_PER_LETTER` words (fewer would deadlock `PICK_WORD`), `dice_bonus` amounts are positive integers, `appliesTo` names real character ids, and every tier has prose. `bun test` alone does not type-check; `check:ci` does.

`Modifier` is a two-variant union. `planRoll` turns a character, a scenario, an attribute and the skill into a dice count and a reroll policy, and its `switch` is exhaustive at compile time. `applyReroll` carries out `reroll_highest` beside the rule that asks for it (#43). It replaces the highest die _unconditionally_, even a success. That is what makes the Art Dealer's Penmanship rule a hazard rather than a help, and a "fix" that only rerolls failures would invert the rulebook.

`TIERS` in `src/types.ts` is the one ordered table of thresholds and names. `TierName` derives from it, and `Scenario.consequences` is a `Record<TierName, string>`, so a scenario supplies prose but cannot move the boundaries (#30). `tierFor` floors negative totals to `unsuccessful`, which is reachable because a held flourish on an inferior word scores −1.

`PARAGRAPHS_PER_LETTER` is the one definition of letter length (#33). The play screen's `ROMAN` numerals are pinned to it with `satisfies { length: … }`, so changing the length is a compile error until the numerals agree.

### Storage is the only untrusted input

Everything the app renders is either a compile-time constant or something it wrote itself, except what `localStorage` hands back at boot. The whole defensive posture is aimed at that one boundary, and nowhere else.

`store.ts` is three functions: `load`, `save` and `discard`. They notify nobody; they replaced a generic pub/sub store that had one subscriber (#51). Every storage access goes through `storage()`, because merely _reading_ `globalThis.localStorage` throws when the browser blocks site data. `save` returns `false` rather than throwing, and `main.ts` logs a console warning once. The player is not told. Whether they should be is a product choice the code leaves open.

`isSession`/`isParagraph` check exactly the fields the render path dereferences: rolls that get counted, an index that gets looked up, text that gets trimmed, a flourish word that gets printed (#78, #117). The yardstick is "would rendering this crash", not "does this look like a session". `skillUsedHere` is not checked because nothing renders it. If you add a render path that reads a new field, extend the predicate in the same change.

The recovery rule is **set aside, never delete.** A stored letter may be the player's only copy, so every path that rejects one moves it to `quill.session.v1.corrupt`:

- `load()` on a parse failure or a bad shape;
- `hydrate()` in `main.ts` when the character, skill or scenario id no longer resolves (#100, fixed in 207a366);
- the boot error screen's _Start a new letter_, through `discard()` (6377dca, #94).

There is one backup slot, and a quarantine never overwrites it, because the first letter set aside is judged the one the player most wants. So while the slot is full, a later rejected letter is deleted. Nothing in the app reads the backup back; recovery is by hand in devtools. This is documented in `CLAUDE.md` and accepted.

`load()` also unwraps the original `{ session }` envelope, so letters saved by the first version still open.

The boot `try` in `main.ts` covers only the first render. Later renders run from event handlers. That is sound only because hydration has already proven the ids, and every later session is produced by `commitParagraph` from one that rendered. Add a second source of sessions (an import, a sync) and that argument no longer holds.

### Two repaint scopes, one shared state object

`main.ts` rebuilds the root whenever the record changes. The play screen rebuilds only its own subtree, through `v.repaint()`, whenever the draft changes. The textarea and flourish input do not repaint at all, because the element already shows what was typed, so focus and caret survive. The recall toggle flips `hidden` in place for the same reason.

`v.state` is one object shared by every render function for the life of one paragraph. That matters for the roll button. It shakes for 250 ms before rolling, and the dice are produced when the timer fires. Spending the skill during the shake repaints and detaches the old button, whose dice plan is now stale, so the timer checks `btn.isConnected` and aborts. The fresh button rolls with the current plan. If the state were copied into each render, a mid-shake repaint could land a roll on a draft nothing reads.

The Setup screen has the same rebuild-everything shape. Because of it, the radiogroup's keyboard model (#47, #74) must find the focused card again by id after each selection (`cardId`, `focusAfterRender`).

## The seams

**The browser origin.** Saved letters are keyed to `quill.philoserf.com`. Changing the hostname silently starts every player over. This boundary is principled and absolute.

**The host.** `dist/` is served as static assets by a Cloudflare Worker (`wrangler.jsonc`) and deployed by `task deploy`, which runs `check:ci`, then a clean `bun run build`, then `wrangler deploy` (d978347, 9d60a6a). There is no CI. The pre-push hook runs `check:ci`, and a push deploys nothing. The Worker has no code. If one is ever added, it is the first server-side component, and the spec's non-goals ("cloud sync, accounts, or any backend service") would need revisiting. The Cloudflare edge may inject scripts the repo does not contain, which is why `CLAUDE.md` forbids an analytics snippet in `public/index.html`.

**The rulebook.** `data.ts` and `scenarios.ts` are transcription. Their ids are a storage contract: `characterId`, `skillId` and `scenarioId` are persisted, so renaming one sets every letter that uses it aside. Their ink pots are a positional contract, as described above. Their prose (descriptions, profiles, consequences) is free to edit.

**The export.** `toMarkdown` is the one thing a player keeps outside the browser. Player text reaches a Markdown table, so `escapeCell` escapes backslashes before pipes (#84) and folds newlines. The scenario title is quoted as a YAML scalar. Character and skill names are not, which is safe only while those constants stay plain. The table reports a flourish only when it held, while the Score screen also shows "flourish lost". The export follows the play screen's done summary. The date in the frontmatter and filename is the UTC date of `startedAt`; the on-screen letterhead deliberately uses local time.

**Fonts.** Google Fonts load from the CDN, the one network dependency at runtime. If they fail, the app still works.

## What the system is shaped to accommodate

**Easy, and safe for anyone who reads `CLAUDE.md`:** a new scenario (append to `SCENARIOS`; the scenario tests cover what types cannot); new consequence prose; a new `dice_bonus` with a character gate; restyling (`public/styles.css` is independent of logic).

**Mechanical, with the compiler as guide:** a new `Modifier` variant (extend the union; `planRoll`'s exhaustive `default` breaks until it is handled, and its executor belongs in `rules.ts` beside `applyReroll`). A new phase (`PhaseName`, then `advance`, `STEP_INDEX`, and both exhaustive switches in `play.ts`, which were made exhaustive for this reason, #75). A different letter length (`PARAGRAPHS_PER_LETTER` and `ROMAN`).

**Fundamental, and where an uninformed change does damage:**

- _Anything that rewrites stored meaning._ Editing an existing ink pot, renaming an id, or changing the success rule or point table changes letters already in players' browsers. The first two are quiet; the last rescores history.
- _Persisting the draft._ Doing so would close the reload-to-reroll leak, but brings back the write-on-every-transition design that #42 removed, and it puts a second, richer shape through the storage predicate.
- _More than one letter._ The store holds exactly one session under one key; "Write another letter" discards the finished one. A history of letters means a new storage shape, a migration from `quill.session.v1`, and a quarantine policy for a collection rather than a slot.
- _Any second source of sessions._ An import, a sync or a share link would put untrusted sessions into later renders, outside the boot error boundary, and against an id check that currently runs once.
- _Two tabs._ Each tab holds its own copy of the session, and saves are last-write-wins. This is accepted. Fixing it means listening for `storage` events and deciding how a draft reconciles with a record it did not write.

## Accepted trade-offs

These are known and deliberately left alone:

- Two open tabs on one letter reconcile last-write-wins.
- Letters saved before c77e599 (#112) may carry a stray space around a flourish word, because the word was not trimmed when stored. New letters store it trimmed.
- One backup slot: while it is full, a later rejected letter is deleted.
- The draft is not persisted, so reloading mid-paragraph discards its rolls and any uncommitted skill spend.

## Uncertainties

- **Whether reload-to-reroll is consciously accepted.** The code makes it plain: the draft is not persisted, by design and in writing. I found no statement that anyone weighed it as a way around the dice, though. I am inferring acceptance from the solo, honour-system nature of the game, and that is a guess.
- **Whether retroactive rescoring is intended or only tolerated.** Storing dice rather than verdicts is clearly deliberate: one success rule, applied everywhere. Whether the authors decided that a rules correction _should_ rescore finished letters, or never considered it, the code does not say.
- **Why the save failure only reaches the console.** `save()`'s doc comment says the caller decides whether to tell the player. `main.ts` decides not to, beyond `console.warn`. That may be a considered choice (no UI for an error the player cannot fix) or a placeholder.
- **The word indicator's role.** I read the unenforced "Incorporate" check as faithful to a tabletop honour system. It may instead be an unfinished gate. The original spec (`docs/superpowers/specs/`) predates most of the current design, and `CLAUDE.md` says to let the code win where they disagree, so I have not used the spec to settle this.
- **The single backup slot's policy.** "The first quarantined letter is the one the player most likely wants" is the authors' stated judgment. It is plausible for a crash loop, where every later letter is a fresh one. It is less obvious for a long gap between two unrelated failures. The code is consistent with the rule; the rule itself is a judgment call.
- **Character and skill names in the export frontmatter** are unquoted while the scenario title is quoted. This is safe for every bundled value. I read it as an omission that only matters for future data, not a decision, but the export comment says the quoting is "for the next one" and mentions only titles.
