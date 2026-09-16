# THEORY.md

A theory of Quill in Naur's sense: what you need to hold in mind to change this app without
damaging it. It assumes you can read TypeScript and will not repeat what the file tree
already tells you. Regenerated 2026-09-16, after the refactor arc that runs from #59 to #74.

## What this models

Quill is Scott Malthouse's solo letter-writing roleplaying game. A **correspondent** — one of
six rulebook archetypes — writes a **letter of five paragraphs** to a recipient described by a
**scenario**.

The dice never decide what the letter says. They decide the *vocabulary the player is obliged
to write with*, and then they score the result. That inversion is the whole design and every
module inherits it.

Each paragraph is built around one **word** drawn from the scenario's **ink pot**, a list of
paired synonyms: an `inferior` form and a `superior` one. A **Language** roll decides which of
the pair the player must use. Before that, the player may attempt a **flourish** — an
adjective of their own invention — and a **Heart** roll decides whether it survives into the
required phrase. Only after the paragraph is written does a **Penmanship** roll judge the hand
it was written in; it changes no words, only points.

So the order Heart → Language → Write → Penmanship is not sequencing, it is the domain. The
two rolls that shape the required phrase must resolve *before* the player writes; the roll
that judges appearance must resolve *after*. Get this backwards and the game stops being a
game: a player who sees the word's quality before deciding whether to gamble on a flourish is
making a different bet entirely. `advance` in `src/paragraph.ts` is that order, and it is the
only place the order exists.

The three attributes — penmanship, language, heart — are the vocabulary every subsystem
shares. A character has a `Rating` per attribute, a skill grants +1 die to exactly one
attribute, and a scenario's *Rules of Correspondence* are modifiers that name an attribute.
Anything that does not reduce to "an attribute, and a number of dice" does not fit this system
at all.

Scoring is deliberately coarse and asymmetric, and the asymmetry is the game's only real
decision. A superior word is +1. A *held* flourish on a superior word is +2 instead. A held
flourish on an **inferior** word is **−1** — worse than never attempting one, which would have
been 0. A flourish that was *lost* scores exactly as if it had never been tried. A fine hand
adds +1 regardless. So attempting a flourish is a bet placed before the word's quality is
known, which is precisely what the phase order enforces. The count of successes past the first
never matters anywhere: one die showing 5 or 6 is the whole signal.

## The organizing ideas

### Invariants live in types where types can reach, and in tests where they cannot

This is the thesis of the whole recent history and the thing most likely to be undone by
someone who has not read it.

`src/scenarios.ts` used to be 141 lines, ~120 of them a hand-written runtime validator that
ran on every app start over four committed JSON files. It is gone. The reason it went is
specific and worth knowing: the JSON files were *imported at build time* — Bun's HTML dev
server answers a request for a sibling JSON file with the SPA's own HTML, so `fetch` never
worked — which means **the data boundary the validator guarded had already stopped existing**.
It was defending a frontier that the build had erased. `SCENARIOS: Scenario[]` replaced it,
and the type is the stricter gate: an unhandled modifier `type` or a stray key is now a
compile error rather than a runtime coercion.

The same move is visible everywhere once you look for it. `ConsequenceTier.threshold` was a
per-scenario field that every scenario was forbidden from varying, so it became `TIERS` in
`src/types.ts` with `TierName` derived from it — a scenario now supplies four strings and
cannot invent a fifth tier. `PhaseName` was a bare union with the real order scattered across
eight assignments in DOM-construction functions; it became `advance`. `STEP_INDEX` is typed
`Record<PhaseName, number>`. Even the Roman numerals are gated: `ROMAN` carries
`satisfies { length: typeof PARAGRAPHS_PER_LETTER }`, and a four-element array is a compile
error, which I confirmed by making one.

What the types cannot say went to `tests/scenarios.test.ts`, and that file is the residue,
not an afterthought: every ink pot holds at least `PARAGRAPHS_PER_LETTER` words (a four-word
scenario would deadlock the play screen at paragraph five, and the old validator only ever
rejected an *empty* pot); every `dice_bonus` amount is a positive integer; every `appliesTo`
names a real character id. That last one exists because `Character.id` is a plain `string`, so
nothing joins the two sides structurally. Note that `bun test` does not typecheck —
`bun run check:ci` is the gate that catches a malformed constant.

When you are tempted to add a runtime check, the question this codebase asks is: *is there a
boundary here, or am I re-checking something the build already fixed?*

### Durability is per committed paragraph, and that is a game rule

`GameSession` holds only committed paragraphs. Everything about the paragraph being written —
the word picked, the flourish text, the rolls, the prose — lives in `v.state.draft`, a closure
inside `renderPlay`, and is never persisted.

This is not an optimisation. A player who could reload mid-paragraph could re-roll a bad
result, and in a game with no referee that would make the dice advisory. Reloading discards
the paragraph in progress and resumes at the start of it. Anyone "fixing" this by persisting
the draft would be removing the only thing that makes the dice binding.

The mechanism that enforces it is worth stating because it is an absence. There is no reset.
Committing calls `onCommit`, `main.ts` builds a **fresh `renderPlay`** with a fresh
`emptyDraft()`, and the old closure is garbage. An earlier design had module-level state, an
`ensureDraftFor` that re-keyed the draft by session id, and a comment warning that resetting
in the wrong order stranded the player on the done screen until they reloaded. All of that
machinery existed to work around state living in the wrong place, and it went when the state
moved. If you find yourself writing session-change detection here, the state has escaped the
closure again.

### Persisting and repainting are separate channels

`src/store.ts` notifies nobody. There is no subscription and no reactivity. `main.ts`'s
`commit()` writes *and* renders; the play screen's `repaint()` rebuilds its own subtree and
writes nothing.

They were one channel once, and every phase transition rewrote localStorage through a
provably no-op session copy made purely to trigger a repaint. Splitting them is why a phase
transition now performs zero `setItem` calls and a commit performs exactly one.

Three consequences are load-bearing:

- `save()` returns `false` rather than throwing, because a browser that allows reads and
  refuses writes used to throw out of every click handler — and, since the notify happened
  before the persist, the screen repainted anyway and the player watched a working game
  silently save nothing. `main.ts` warns once.
- The scenario-recall toggle mutates `panel.hidden` **in place** rather than repainting. This
  looks like an inconsistency and is not: a repaint rebuilds the play subtree.
- Which matters because of `attachRollButton`. The roll button shakes for 250ms, and its
  timer closes over the dice plan computed when the button was *built*. If a repaint happens
  during the shake — spending the skill is the live case — that button is detached and a new
  one exists with a fresh plan. `btn.isConnected` aborts the stale callback. This is also why
  `v.state` is one shared object per letter rather than a copy: the new button must read the
  current draft, not a snapshot.

### Resolution happens once, at hydration

`main.ts` proves at mount that the session's scenario, character and skill all resolve, then
hands the screens the resolved **values**. The screens never look them up and never branch on
a failure that cannot happen. Seven `characterById`/`skillById` calls inside `src/screens/`
were deleted along with five different invented fallbacks for a question already answered.

The reasoning is written at `src/main.ts:27`: these are compile-time constants, so the id sets
are "fixed for the life of the page." Hold onto that sentence — it is exactly right about the
scope it names, and the section on seams is about what happens outside it.

### Only two things a scenario can do to a roll

`RollPlan` has two fields, `diceCount` and `rerollPolicy`. `dice_bonus` adds dice and may be
gated to named characters; `reroll_highest` replaces the highest die with a fresh one —
**unconditionally, including when it was already a 6**, which is what makes it a hazard rather
than a gift. `planRoll` decides the policy and `applyReroll` carries it out, and both now live
in `src/rules.ts` so that one file answers "what does this rule cost." They were 400 lines
apart, with the mechanic buried in a click handler and the only tests asserting on the flag.

## The seams

**localStorage is the only real boundary left, and it is checked one level deep.** This is the
sharpest thing in this document. The validator went because the JSON boundary was fictional;
what remains genuinely outside the build is the persisted session, and the checks there stop
one level short in two matching ways.

`isSession` tests eight fields of the session and, for `paragraphs`, only `Array.isArray` —
the elements are trusted. `hydrate` tests that the scenario, character and skill *ids* resolve
— the ink-pot *indices* inside the paragraphs are trusted. Same shape twice: the container is
validated, its contents are not. Both are filed; the second is the more interesting, because
`Paragraph` stores a *position* into scenario content and a persisted session outlives the
deploy that the "fixed for the life of the page" reasoning was scoped to. Reordering an ink
pot silently makes the game record name a word the player never drew, with the prose intact
and nothing reporting an error.

**The type migration reached data and transitions and stopped at rendering.** The phase
*order* lives in `advance` and the phase→column mapping in `Record<PhaseName, number>`, both
compiler-gated. But the two `switch (v.state.draft.phase)` statements in `src/screens/play.ts`
that decide what the letter body and the margin card show are not: adding an eighth phase
type-checks clean once `STEP_INDEX` is satisfied, and renders an empty slot and an empty card.
A maintainer who has internalised "the order has one home" will be surprised here, which is
precisely the kind of place this document exists to flag.

**Scoring is pure over the session alone.** `score()` lost its `scenario` parameter once the
tier stopped depending on the scenario; joining a tier to its prose is the caller's job, and
both callers already hold the scenario. `toMarkdown` is pure and takes the resolved character
and skill rather than the whole arrays. The browser side of the download — Blob, object URL,
synthetic anchor, and a `setTimeout` before revoking because revoking inline races the
browser's own fetch — stays in `score.ts`.

**The screens have no tests.** Eight test files and a helper cover the game layer and stop at
the DOM. `renderSetup`, `renderPlay` and `renderScore` are verified by the README's six-step
manual smoke test and by browser checks recorded in commit messages. This is a real boundary in the
theory: the most intricate code in the repo is the least pinned, and the commit messages are
where the verification evidence lives.

## What it accommodates, and what it does not

Adding a scenario is one entry in `SCENARIOS`; the type and `tests/scenarios.test.ts` will
tell you plainly what you got wrong. Adding a character-gated dice bonus is data. These are
the well-supported paths.

Four things require rethinking something:

1. **A third kind of modifier.** `RollPlan` needs a field, `planRoll` a case. This is now a
   *compile* error rather than a silent runtime fallthrough — `planRoll`'s `default` branch
   assigns `mod` to `never`. The migration made this safe; it used to be the loudest hazard in
   the codebase.
2. **A letter of a length other than five.** `PARAGRAPHS_PER_LETTER` exists and `ROMAN` is
   checked against it, so this is far better than it was — but `STEP_LABELS` and the stepper
   are about the five *phases* of a paragraph, not the five paragraphs, and conflating the two
   fives is an easy mistake.
3. **Undo, or more than one letter at a time.** There is no back button by design, the store
   holds one session under one key, and "no session" *is* the Setup screen. A history of
   letters cannot be added at the edges.
4. **Custom scenario authoring.** A v1 non-goal in `docs/superpowers/specs/`, and deleting the
   validator was the code catching up to it. If that non-goal ever flips, the runtime boundary
   reappears and `tests/scenarios.test.ts` is the specification of what the restored validator
   must check — it already enumerates exactly what the type cannot.

Where an unaware maintainer does damage: persisting the draft to "not lose work"; routing the
recall toggle through a repaint; reordering an ink pot in a shipped scenario; reordering the
cases in `advance`; adding a runtime validator back over data the build already fixed.

## Uncertainties

- **The write-step gate.** The textarea shows a live indicator for whether the required word
  appears in the prose, but *Finish paragraph* is enabled regardless and scoring never
  consults it. I read this as deliberate — the app prompts and scores, it does not referee
  prose — but no comment says so, and it could equally be an unfinished gate. This was open in
  the previous theory and the refactor arc did not settle it.
- **Whether `data.ts` is closed on purpose.** `tests/data.test.ts` asserts the exact six
  character ids, which reads as "this list is not meant to grow." I am inferring that from a
  test rather than from any statement.
- **I did not exercise the app in a browser.** Everything here comes from reading the source
  and history, and from `bun run check:ci` (Biome clean, `tsc --noEmit` clean, 82 tests) plus
  targeted probes run through `bun -e`, which is how the two filed findings were verified. The
  browser verification in this repo lives in commit messages, and I have taken it on trust.
- **Two earlier uncertainties are now closed**, recorded here so they are not re-opened.
  Whether `reroll_highest` is meant as a penalty: settled — a test now pins that a highest die
  which was already a success is replaced anyway. Whether `roll(1)[0] ?? 1` is a considered
  fallback: settled — it is `noUncheckedIndexedAccess` appeasement, now commented as such.

One methodological note on how to read the previous edition of this file, which described a
system that no longer exists. Sorting its claims by what survived the refactor arc is
informative: everything that died was **mechanism** — `validateScenario`, `TIER_NAMES`,
module-level `currentDraft`, `ensureDraftFor`, reset-before-`onUpdate`, repaint-through-the-
store. Everything that survived was **domain or principle** — the vocabulary inversion, the
phase order as the game, attribute-and-dice-count as the only extensible axis, durability per
committed paragraph, quarantine over deletion, the reroll as a hazard. That split is the best
available evidence for which parts of this account are essential and which are incidental, and
it is a reasonable bet that the same will hold for this edition.

## Index

Findings filed by this pass.

| # | Severity | Finding | Primary location | Tracked as |
| --- | --- | --- | --- | --- |
| 1 | medium | `isSession` validates the session's fields but only `Array.isArray` on `paragraphs`, so a malformed element passes unquarantined and throws in the render path. The catch handler's *Start a new letter* button then calls `clear()` with no backup — the store's stated principle is never to destroy a player's only copy, and the one click the app recommends is what destroys it. Same class as the closed #49, one level down. | `src/store.ts:22-35`, `src/store.ts:47-56`, `src/main.ts:126-129` | [#78](https://github.com/philoserf/quill/issues/78) |
| 2 | medium | `Paragraph` stores `inkPotIndex`, a position into scenario content, and `hydrate` checks that ids resolve but not that indices still fit. Trimming an ink pot dangles the index, which three call sites render three different ways; reordering one silently makes the game record name a word the player never drew, with no error anywhere. | `src/types.ts:44`, `src/main.ts:30-42`, `src/scenarios.ts` | [#79](https://github.com/philoserf/quill/issues/79) |

**Total: 2 findings (0 critical, 0 high, 2 medium, 0 low)**

**Related existing findings.** Two open issues from the `code-walkthrough` pass sit on code
this theory discusses, and are counted there rather than here.
[#75](https://github.com/philoserf/quill/issues/75) is the rendering half of the type-migration
seam above — the two play-screen phase switches that are not exhaustiveness-checked.
[#76](https://github.com/philoserf/quill/issues/76) observes that the mount error boundary
covers only the first render; it does **not** compound with finding 1, because every first
render touches `paragraphPoints` or `succeeded`, so that crash always lands inside `mount()`'s
`try` and the player does reach the recovery button.
