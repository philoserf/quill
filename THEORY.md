# THEORY.md

A theory of Quill, in Naur's sense: what you need to hold in mind to change this app
without damaging it. It assumes you can read TypeScript and will not repeat what the file
tree already tells you.

## What this models

Quill is Scott Malthouse's solo letter-writing roleplaying game. A **correspondent** — one
of six rulebook archetypes — writes a **letter of five paragraphs** to a recipient described
by a **scenario**. The dice never decide what the letter says. They decide the *vocabulary
the player is obliged to write with*, and then they score the result.

That inversion is the whole design, and every module inherits it. Each paragraph is built
around one **word** drawn from the scenario's **ink pot**, which is a list of paired synonyms:
an `inferior` form and a `superior` one. A **Language** roll decides which of the pair the
player must actually use. Before that, the player may attempt a **flourish** — an adjective
of their own invention — and a **Heart** roll decides whether it survives to be part of the
required phrase. Only after the paragraph is written does a **Penmanship** roll judge the
hand it was written in; it changes no words, only points.

So the causal order Heart → Language → Write → Penmanship is not arbitrary sequencing, it is
the domain: the two rolls that shape the required phrase must resolve *before* the player
writes, and the roll that judges appearance must resolve *after*. `PhaseName` in
`src/screens/play.ts` is that order made into a type, and it is the single place the order
exists. Reordering those cases would silently change the game.

The three attributes — penmanship, language, heart — are the vocabulary every subsystem
shares. `ATTRIBUTES` in `src/types.ts` is the pivot: a character has a `Rating` per
attribute, a skill grants +1 die to exactly one attribute, and a scenario's *Rules of
Correspondence* are modifiers that name an attribute. Anything that does not fit into
"an attribute, and a number of dice" does not fit into this system at all.

Dice are pools of d6; a die of 5 or 6 is a success (`src/dice.ts`). Ratings map poor/average/
good to 1/2/3 dice. Scoring (`src/scoring.ts`) is deliberately coarse and asymmetric: a
superior word is +1, a *held* flourish on a superior word is +2 instead, a held flourish on
an inferior word is **−1**, and a fine hand adds +1 regardless. Attempting a flourish is
therefore a real gamble — success doubles the paragraph, failure of the *word* while the
flourish holds costs you a point you would otherwise have kept at zero. The count of
successes past the first never matters anywhere; one success is the whole signal.

## The organizing ideas

**Durability is per finished paragraph, not per action.** This is the load-bearing
separation and the one most likely to be broken by accident. `GameSession` (persisted) holds
only committed paragraphs. Everything about the paragraph currently being written — which
word was picked, the flourish text, the rolls, the prose — lives in `currentDraft`, a
module-level mutable object in `play.ts` that is never persisted. A reload mid-paragraph
discards that paragraph and resumes at the start of it. That is intentional: it means a
player cannot reload to re-roll a bad result, which is what makes the dice binding in a
game with no referee. `ensureDraftFor` re-keys the draft when the session id changes, which
is what stops a draft from surviving into a new letter.

The draft's volatility has a sharp consequence that is documented in a comment and easy to
undo: in `renderStepDone`, the draft must be reset *before* `ctx.onUpdate` is called, because
the store notifies subscribers synchronously and the resulting re-render reads
`currentDraft.phase`. Reset afterwards and the player is stranded on the done screen.

**The play screen has no render authority.** It cannot repaint itself. To show the next
phase it writes a shallow-copied session through the store (`rerender`), and the app's single
subscriber replaces the whole DOM tree. This is why phase transitions cost a localStorage
write, and why the scenario-recall panel deliberately does *not* use it — toggling a panel
through the store would rebuild the tree and destroy, among other things, a roll button
mid-animation. That animation is itself a seam: `attachRollButton` waits 250ms and then
checks `btn.isConnected` before rolling, because a re-render during the shake would leave
the callback holding a stale dice plan.

**Characters are code; scenarios are data.** `src/data.ts` hard-codes six characters and
three skills as rulebook content — a closed set, and `tests/data.test.ts` asserts the exact
ids, which is the authors saying "this list is not meant to grow." Scenarios are JSON so they
can be authored without touching TypeScript. `validateScenario` is the only gate between
those two worlds, and it is a real one: it rejects unknown modifier types, non-integer or
non-positive dice bonuses, `appliesTo.characters` naming ids that no character has, and — the
strictest rule — consequence thresholds that are not exactly `[0, 5, 8, 11]`, because
`TIER_NAMES` keys off those numbers to produce the tier's name.

**Only two things a scenario can do to a roll.** `RollPlan` has exactly two fields:
`diceCount` and `rerollPolicy`. `dice_bonus` adds dice and may be gated to named characters;
`reroll_highest` replaces the highest die with a fresh one — unconditionally, even when that
die was a success, which is what makes it a hazard rather than a gift. Note that `planRoll`
only *reports* the policy; the reroll itself is executed in `renderRollStep` in the play
screen, so a headless caller of `planRoll` gets a dice count and a flag, not a result.

## The seams

- **`validateScenario` and everything downstream.** `score()` casts `tier.threshold` to a
  key of `TIER_NAMES` without checking. That is only safe because the validator guaranteed
  the thresholds. The `Scenario` type does not carry that guarantee, and the test fixtures
  construct `Scenario` objects directly, bypassing it. Filed as a finding.
- **localStorage.** `src/store.ts` treats storage as hostile: reading `globalThis.localStorage`
  is itself wrapped in try/catch (blocked site data throws on access, not on use), and a
  payload that fails to parse or fails the caller's shape predicate is *moved* to a
  `.corrupt` sibling key rather than deleted, so a player's only copy is never destroyed by
  a bug in this app.
- **Stale sessions.** `main.ts` re-resolves character, skill and scenario by id on every
  render; if any is gone — a renamed character, a deleted scenario — the session is cleared
  back to Setup. This is the migration story, and it is the only one: there is no version
  field on the persisted payload beyond the `.v1` in the storage key.
- **Export.** `toMarkdown` is pure and takes the character and skill lists as arguments
  rather than importing them, so it is testable without the app; the browser side of the
  download (Blob, object URL, synthetic anchor) stays in `score.ts`.

## What it accommodates, and what it does not

Adding a scenario is two lines and a JSON file. Adding a character-gated dice bonus is
data. Both are well-supported paths, and the validator will tell you plainly when you get
them wrong.

Three things would require rethinking something fundamental:

1. **A modifier that is not "more dice" or "reroll the highest."** `RollPlan` would need a
   new field, `planRoll` a new case, `validateModifier` a new branch, and `KNOWN_MODIFIER_TYPES`
   a new entry. Only one of those four fails at compile time. See the finding on
   `validateModifier`'s fallthrough — the failure mode is silent, not loud.
2. **A letter of a length other than five.** The number five is not defined anywhere; it is
   spelled out independently as an array of five numerals, a literal `=== 4`, a literal
   `>= 5`, and two pieces of display text. Filed as a finding.
3. **Anything requiring undo, or more than one letter at a time.** There is no back button in
   the play loop by design, the store holds exactly one session under one key, and "no
   session" *is* the Setup screen. A history of letters is not a feature that can be added at
   the edges.

Where an unaware maintainer does damage: moving the draft reset after `onUpdate`; replacing
`rerender` with a direct render call to "avoid the write" (that write *is* the persistence);
routing the recall-panel toggle through the store; adding a scenario with fewer than five
ink-pot entries.

## Uncertainties

- I am inferring from the code that `reroll_highest` is meant as a penalty. Nothing in the
  repo states it, and `art-dealer.json` is the only scenario that uses it. If it were meant
  to reroll only *failed* highest dice, the current implementation is wrong and no test
  would catch it.
- The write step shows a live indicator for whether the required word appears in the
  prose, but "Finish paragraph" is enabled regardless. I read this as deliberate — the app
  prompts and scores, it does not referee prose — but it could equally be an unfinished
  gate. There is no comment either way.
- `roll(1)[0] ?? 1` in the reroll path defaults to 1 on a branch that `roll(1)` cannot
  reach. It is `noUncheckedIndexedAccess` appeasement rather than a considered fallback, but
  I cannot prove that from the code alone.
- `docs/superpowers/` describes "template-literal rendering"; the code builds DOM nodes
  directly. `CLAUDE.md` already declares those documents historical and says the code wins,
  so I have not filed it, but be aware the spec's implementation details are not a guide.
- I did not exercise the app in a browser. Everything above comes from reading the source and
  running `bun test` (53 pass), `tsc --noEmit` (clean), and `biome check .` (clean).

## Index

| # | Severity | Issue | Primary location |
| --- | --- | --- | --- |
| 1 | medium | #55 | `src/scenarios.ts:63-68` |
| 2 | medium | #35 | `src/scenarios.ts:83-85`, `src/screens/play.ts:227-262` |
| 3 | medium | #33 | `src/screens/play.ts:73,420,422,672,689,723` |
| 4 | low | #26 | `src/scoring.ts:55` |

**Total: 4 issues (0 critical, 0 high, 3 medium, 1 low)**
