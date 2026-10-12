# Quill — a walkthrough

This document follows the code of Quill from the moment the browser loads the page to the moment a finished letter is downloaded as Markdown. It reads the source in the order it runs, quoting the lines that carry each idea. Every quoted block is labelled with its file and the symbol it came from; the quotes are verbatim, with `...` marking an elided middle.

## Overview

Quill is a browser implementation of Scott Malthouse's single-player letter-writing roleplaying game. The player picks a character, a skill and a scenario, then writes a five-paragraph letter. Each paragraph is shaped by dice: a word drawn from the scenario's _ink pot_ comes out in its inferior or superior form, an optional flourish holds or fails, and the hand is fine or plain. The five paragraphs add up to a score, the score picks one of four consequences the scenario defines, and the letter can be exported as a Markdown file.

The technology is deliberately small:

- **TypeScript with no framework.** Every screen builds its DOM with `document.createElement` and returns an `HTMLElement`.
- **Bun** as runtime, bundler (`bun build`), dev server (`bun ./public/index.html`) and test runner (`bun test`).
- **`localStorage`** as the only persistence. There is no server-side state at all.
- **A Cloudflare Worker serving static assets** from `dist/` at `quill.philoserf.com`, deployed by hand with `task deploy`. There is no CI; pushing deploys nothing.

There is one entry point. `public/index.html` loads `src/main.ts`, which mounts one of three screens into `<main id="app">`.

`public/index.html` — `body`

```html
  <body>
    <main id="app"></main>
    <script type="module" src="../src/main.ts"></script>
  </body>
```

## Architecture

```text
public/
  index.html          entry document; Bun bundles from here
  styles.css          all styling
src/
  main.ts             boot, hydration, the session closure, screen dispatch
  store.ts            localStorage: load / save / clear / discard
  types.ts            domain types, PARAGRAPHS_PER_LETTER, TIERS
  data.ts             the six characters and three skills
  scenarios.ts        the four scenarios
  paragraph.ts        the paragraph phase machine, Draft -> Paragraph -> session
  dice.ts             dice counts, rolling, the success rule
  rules.ts            scenario modifiers: planRoll, applyReroll
  scoring.ts          paragraph points, tiers, the total
  export.ts           the Markdown export
  screens/
    setup.ts          choose character, skill, scenario
    play.ts           write five paragraphs
    score.ts          the result, the breakdown, download and restart
    fragments.ts      letterhead and scenario detail, shared by screens
tests/                bun:test suites for every non-screen module
wrangler.jsonc        the Worker: serve ./dist at quill.philoserf.com
```

The modules fall into three layers, and the dependencies point one way:

1. **Data and rules** — `types.ts`, `data.ts`, `scenarios.ts`, `dice.ts`, `rules.ts`, `scoring.ts`, `paragraph.ts`, `export.ts`. Pure functions and constants with no DOM. These are what the tests cover.
2. **Screens** — `screens/*.ts`. Each takes a context object and returns an element. They call into the first layer but never touch storage.
3. **The shell** — `main.ts` and `store.ts`. `main.ts` owns the one mutable `GameSession | null`, writes it through `store.ts`, and chooses which screen to render.

Data flows in a single loop. A screen calls a callback it was handed (`onBegin`, `onCommit`, `onRestart`); `main.ts` computes the next session, persists it, and re-renders from scratch. Anything smaller than a session change — choosing a card on the Setup screen, moving between phases of a paragraph — is handled inside the screen, which repaints its own subtree and writes nothing.

## Core walkthrough

### 1. Boot: hydrating the saved session

`main.ts` ends with a single call to `mount(SCENARIOS)`. The first thing `mount` does is decide whether there is a letter to resume. `hydrate` asks the store for a session and then checks that its three ids still name real data.

`src/main.ts` — `hydrate`

```ts
function hydrate(scenarios: Scenario[]): GameSession | null {
  const session = load();
  if (!session) return null;
  const known =
    scenarios.some((s) => s.id === session.scenarioId) &&
    characterById(session.characterId) !== undefined &&
    skillById(session.skillId) !== undefined;
  if (!known) {
    clear();
    return null;
  }
  return session;
}
```

Characters, skills and scenarios are compile-time constants (`src/data.ts`, `src/scenarios.ts`), so the only way an id can stop resolving is a deploy that renamed or removed one. That can only be true of a session _as loaded_, which is why the check happens once, at mount, rather than in every render. A session that fails it is cleared and the player lands on the Setup screen. Note that this is a deletion: `clear()` removes the stored letter outright, unlike the quarantine the store and the boot error handler use for letters they cannot show (steps 2 and 4).

### 2. The store: four functions over one key

Before following `mount` further, it is worth reading `src/store.ts` in full, because everything durable passes through it. It persists a `GameSession | null` under the key `quill.session.v1` and notifies nobody: callers write, then repaint themselves.

Every access goes through a guard, because in some browsers even _reading_ `localStorage` throws.

`src/store.ts` — `storage`

```ts
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
```

`load` parses the stored JSON, unwraps the legacy `{ session }` shape that an earlier version wrote, and runs the result through `isSession`.

`src/store.ts` — `load`

```ts
export function load(): GameSession | null {
  const store = storage();
  const raw = store?.getItem(KEY) ?? null;
  if (!store || raw === null) return null;

  try {
    const value = unwrap(JSON.parse(raw) as unknown);
    if (value === null) return null;
    if (!isSession(value)) throw new Error('persisted session has the wrong shape');
    return value;
  } catch {
    quarantine(store, raw);
    return null;
  }
}
```

`isSession` checks what the render path dereferences, down into each paragraph: `isParagraph` requires a numeric `inkPotIndex` and number arrays for the three rolls, with `heartRoll` allowed to be `null`. Checking the paragraph elements arrived with PR #94, which fixed issue #78: before it, a malformed paragraph passed the predicate, crashed the render, and was then destroyed by the recovery the app offered.

Anything that fails to parse or fails the shape check is not deleted. It is moved aside.

`src/store.ts` — `quarantine`

```ts
function quarantine(store: Storage, raw: string): void {
  try {
    // Never overwrite an existing backup: the first quarantined letter is the
    // one the player is most likely to still want.
    if (store.getItem(CORRUPT_KEY) === null) store.setItem(CORRUPT_KEY, raw);
    store.removeItem(KEY);
  } catch {
    // quota or security failure — keep the original rather than lose it
  }
}
```

`CORRUPT_KEY` is `quill.session.v1.corrupt`. If the backup write fails, the `removeItem` never runs, so the original survives under its own key. `discard()` is the same quarantine applied on demand, used by the boot error handler in step 4. `save` reports refusal rather than throwing, and `clear()` is just `save(null)`.

`src/store.ts` — `save`

```ts
export function save(session: GameSession | null): boolean {
  const store = storage();
  if (!store) return false;
  try {
    if (session === null) store.removeItem(KEY);
    else store.setItem(KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
```

### 3. The session closure and screen dispatch

Back in `mount`, the hydrated session becomes a local variable, and every change to it flows through one inner function.

`src/main.ts` — `commit`

```ts
  function commit(next: GameSession | null) {
    session = next;
    if (!save(next) && !warnedAboutSaving) {
      warnedAboutSaving = true;
      console.warn('Quill: this letter is not being saved — localStorage refused the write.');
    }
    render();
  }
```

`commit` is the only place the session changes, and there are exactly three callers: starting a letter, committing a paragraph, and restarting. A refused write does not stop play; it warns once on the console and carries on in memory.

`render` empties the root and picks a screen. `null` means Setup; otherwise `session.status` chooses between Play and Score. The screens are handed the resolved scenario, character and skill so they never look them up again.

`src/main.ts` — `render`

```ts
    if (current.status === 'in_progress') {
      rootEl.appendChild(
        renderPlay({
          session: current,
          scenario,
          character,
          skill,
          onCommit: (paragraph) => commit(commitParagraph(current, paragraph)),
        }),
      );
    } else {
      rootEl.appendChild(
        renderScore({
          session: current,
          scenario,
          character,
          skill,
          onRestart: () => commit(null),
        }),
      );
    }
```

A few lines above this, `render` re-resolves the three ids and throws if any is missing. After `hydrate` that cannot happen; the throw exists so the types narrow without a non-null assertion.

### 4. When boot fails

The call to `mount` is wrapped so a crash on first render leaves the player a way out instead of a blank page.

`src/main.ts` — `mount(SCENARIOS)`

```ts
try {
  mount(SCENARIOS);
} catch (err) {
...
    restart.addEventListener('click', () => {
      // Set the letter aside, not delete it: the crash may be a shape the
      // store's check did not anticipate, and this is the player's only copy.
      discard();
      location.reload();
    });
    root.append(msg, restart);
  }
  throw err;
}
```

The button calls `discard()`, not `clear()`; that change is the second half of PR #94. The same PR settled issue #76, which observed that this `try` covers only `mount`'s first render: later renders run from event handlers, outside it. The comment in the `catch` records why that is acceptable — `hydrate` has already proven the ids, and compile-time constants cannot stop resolving mid-session.

### 5. The Setup screen

With no session, `render` calls `renderSetup`. The screen keeps its three selections in a local `SetupState` and rebuilds itself on every choice. Each later step appears only once the previous one is chosen: skills after a character, scenarios after a skill, and the _Begin the letter_ button after a scenario. That button calls `ctx.onBegin`, which `main.ts` turns into `commit(newSession(sel))` — a fresh `GameSession` with a random UUID, an ISO `startedAt`, no paragraphs, and `status: 'in_progress'`.

Because every selection rebuilds the whole screen, the focused card is destroyed each time. `choose` records which card should have focus and `render` restores it at the end.

`src/screens/setup.ts` — `choose`

```ts
  function choose(kind: string, apply: (id: string) => void) {
    return (item: { id: string }) => {
      apply(item.id);
      focusAfterRender = cardId(kind, item.id);
      render();
    };
  }
```

The three steps are one function, `renderChoiceStep`, called with a different noun. Each card grid is an ARIA `radiogroup` with a roving tabindex: one tab stop per group, arrows to move, Home and End for the ends. As the radio pattern requires, moving also selects.

`src/screens/setup.ts` — `renderChoiceStep`

```ts
    event.preventDefault();
    // The radio pattern selects as it moves; `onSelect` re-renders, and
    // `renderSetup` restores focus to the card that was chosen.
    const target = opts.items[to];
    if (target) opts.onSelect(target);
```

The character cards also show attribute pips. `renderAttributePips` fills one pip per die, using the same `diceForRating` the rules use, so the pips are literally the dice count: poor is one die, average two, good three.

### 6. The Play screen and its draft

With a session in progress, `render` calls `renderPlay`. This screen owns the paragraph being written — the _draft_ — in its own closure. The draft is deliberately not persisted; only completed paragraphs reach the session.

`src/screens/play.ts` — `renderPlay`

```ts
  const v: PlayView = {
    ...ctx,
    state: { draft: emptyDraft(), recallOpen: false },
    repaint,
  };

  function repaint() {
    const row = document.createElement('div');
    row.className = 'play-row';
    row.append(renderInkPotCard(v), renderLetter(v), renderMarginalia(v));
    root.replaceChildren(renderHeader(v), row);
  }
```

`v` is passed to every render function below. `state` is a single shared object rather than separate variables, so a handler that fires after a repaint reads the current draft instead of the one it captured when it was built; step 9 shows the handler that depends on this.

The screen has three columns. The ink pot card on the left lists the scenario's words, marks those already used, and is the only control during `PICK_WORD`. The letter in the middle shows committed paragraphs and a slot for the draft. The marginalia on the right holds the stepper and the controls for the current phase, plus a reference card with the character, the skill's spent state, the running score, and a toggle to recall the scenario text.

### 7. The paragraph machine

Every control on the Play screen moves the draft by calling one function. `src/paragraph.ts` defines seven phases and one event-keyed transition.

`src/paragraph.ts` — `advance`

```ts
export function advance(draft: Draft, event: DraftEvent): Draft {
  switch (event.type) {
    case 'pickWord':
      if (draft.phase !== 'PICK_WORD') return draft;
      return { ...draft, inkPotIndex: event.inkPotIndex, phase: 'DECIDE_FLOURISH' };

    case 'attemptFlourish':
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      return { ...draft, phase: 'ROLL_HEART' };

    case 'writePlainly':
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      return { ...draft, flourishAdjective: '', phase: 'ROLL_LANGUAGE' };

    case 'finishParagraph':
      if (draft.phase !== 'WRITE') return draft;
      return { ...draft, phase: 'ROLL_PENMANSHIP' };
...
```

The order of a paragraph is:

1. `PICK_WORD` — choose an ink pot entry.
2. `DECIDE_FLOURISH` — type an adjective and attempt it, or write plainly. This is the only branch: attempting goes to `ROLL_HEART`, writing plainly clears the adjective and skips straight to `ROLL_LANGUAGE`.
3. `ROLL_HEART` — does the flourish hold?
4. `ROLL_LANGUAGE` — superior or inferior word?
5. `WRITE` — the player writes the paragraph.
6. `ROLL_PENMANSHIP` — fine hand or plain?
7. `PARAGRAPH_DONE` — show the points and commit.

Heart and Language resolve _before_ writing, so the player knows exactly which word and flourish to use; Penmanship resolves after. Each event carries the data its transition records — `rolled` carries the dice, `pickWord` the index — so the order and the data flow live in one place. An event that does not belong to the current phase returns the draft unchanged; the UI never offers one, and ignoring it is safer than throwing in a click handler.

A presentation table, `STEP_INDEX`, maps phases to the five stepper labels (`Word`, `Flourish`, `Language`, `Write`, `Hand`). `DECIDE_FLOURISH` and `ROLL_HEART` share a column.

The flourish step shows how a screen drives the machine: the button handler calls `advance` with the event, stores the result, and repaints.

`src/screens/play.ts` — `renderStepFlourish`

```ts
  attempt.addEventListener('click', () => {
    if (!v.state.draft.flourishAdjective.trim()) {
      input.focus();
      return;
    }
    v.state.draft = advance(v.state.draft, { type: 'attemptFlourish' });
    v.repaint();
  });
```

Two `switch` statements on the phase render the screen: `renderLetterDraftSlot` for the middle column and `renderMarginaliaStepCard` for the controls. Both end in a `never`-typed `default`, so a new `PhaseName` that neither handles is a compile error rather than a phase that renders nothing. That was issue #75, fixed by PR #97.

`src/screens/play.ts` — `renderMarginaliaStepCard`

```ts
    default: {
      // Compile-time exhaustiveness: a new PhaseName must be rendered here.
      const _exhaustive: never = v.state.draft.phase;
      throw new Error(`Unhandled phase: ${String(_exhaustive)}`);
    }
```

### 8. Planning a roll

The three roll phases share `renderRollStep`. It works out whether the skill can apply, asks the rules how many dice to roll, offers the skill if it is unspent, and wires the roll button.

`src/screens/play.ts` — `renderRollStep`

```ts
  const wrap = document.createElement('div');
  const skillAvailable = skillAvailableFor(v, attr);
  const skillBonusActive = skillAvailable && v.state.draft.skillUsedHere === attr;
  const plan = planRoll({
    attribute: attr,
    character: v.character,
    scenario: v.scenario,
    skillBonusActive,
  });
```

A skill is available when it has not been spent on an earlier paragraph and its `bonusAttribute` matches the roll. Pressing _Spend_ sets `draft.skillUsedHere` and repaints, which re-plans the roll with the extra die. The session's `skillSpent` flag does not flip until the paragraph is committed; until then the reference card reads the draft's `skillUsedHere` to show the skill as spent.

`planRoll` starts from the character's rating and folds in the scenario's rules of correspondence.

`src/rules.ts` — `planRoll`

```ts
  let diceCount = diceForRating(character.attributes[attribute]);
  let rerollPolicy: 'highest' | null = null;

  for (const mod of scenario.rulesOfCorrespondence) {
    switch (mod.type) {
      case 'dice_bonus': {
        if (mod.attribute !== attribute) break;
        const restrict = mod.appliesTo?.characters;
        if (!restrict || restrict.includes(character.id)) {
          diceCount += mod.amount;
        }
        break;
      }
      case 'reroll_highest': {
        if (mod.attribute !== attribute) break;
        rerollPolicy = 'highest';
        break;
      }
```

There are two kinds of modifier. A `dice_bonus` adds dice, optionally only for listed characters: The Archduke gives Courtiers and Aristocrats an extra Heart die and gives everyone an extra Penmanship die. A `reroll_highest` sets a policy instead: The Art Dealer re-rolls the highest Penmanship die. The skill's bonus, if active, adds one more die at the end. The `switch` ends in a `never`-typed `default` as well. Its runtime comment speaks of "a payload that escaped validation (e.g., tampered session)", but modifiers come only from the `SCENARIOS` constant and never from storage, so a tampered session cannot reach this branch; the comment overstates what the throw guards.

### 9. Rolling

The roll button does not roll at once. It shakes for 250ms first, and the delay creates a window in which the screen may repaint.

`src/screens/play.ts` — `attachRollButton`

```ts
function attachRollButton(btn: HTMLButtonElement, onRoll: () => void): void {
  btn.addEventListener('click', () => {
    btn.classList.add('shake');
    btn.disabled = true;
    setTimeout(() => {
      // A repaint during the shake — spending the skill is the live case —
      // replaces the play subtree and detaches this button; its dice plan is
      // stale, so abort and let the freshly rendered button roll with the
      // current plan. (The recall toggle mutates in place and does not repaint.)
      if (!btn.isConnected) return;
      onRoll();
    }, 250);
  });
}
```

If the button is still attached, `onRoll` runs. In `renderRollStep` that is `onRolled(applyReroll(roll(plan.diceCount), plan.rerollPolicy))` followed by a repaint, and each roll step's `onRolled` sends a `rolled` event through `advance`. Because it assigns to `v.state.draft` at the moment it fires, it always lands on the live draft. The recall toggle on the reference card flips its panel in place, without `repaint`, for exactly this reason: a repaint would detach a shaking button and silently cancel its roll.

The dice themselves are plain d6s. `applyReroll` carries out the Art Dealer's policy.

`src/rules.ts` — `applyReroll`

```ts
  if (policy !== 'highest' || dice.length === 0) return dice;
  const i = dice.indexOf(Math.max(...dice));
  // roll(1) always yields one die; the fallback is for the type, not for a
  // reachable case — see the test that pins it.
  const replacement = roll(1, rng)[0] ?? 1;
  return [...dice.slice(0, i), replacement, ...dice.slice(i + 1)];
```

The highest die is replaced unconditionally, even when it was already a success. That makes the rule a hazard, as the rulebook intends ("re-roll the highest die and accept the final roll"), not a second chance.

Whether a roll succeeded is decided in one place.

`src/dice.ts` — `succeeded`

```ts
export function succeeded(dice: number[] | null): boolean {
  return dice !== null && countSuccesses(dice) > 0;
}
```

A die succeeds on 5 or 6, and a roll succeeds if any die does. `succeeded` accepts `null` because a Heart roll that never happened — the player wrote plainly — did not succeed. Every success verdict in the app, from the play screen's messages to scoring and export, comes from this one function; only the per-die highlight in `renderDiceRow` calls `isSuccess` directly.

### 10. Writing

In `WRITE`, the middle column becomes a textarea. `renderWriteSlot` works out the phrase the paragraph must include from the two rolls already made.

`src/screens/play.ts` — `renderWriteSlot`

```ts
  const word = succeeded(v.state.draft.languageRoll) ? pair.superior : pair.inferior;
  const flourishApplied = succeeded(v.state.draft.heartRoll);
  const required =
    flourishApplied && v.state.draft.flourishAdjective
      ? `${v.state.draft.flourishAdjective} ${word}`
      : word;
  const requiredLower = required.toLowerCase();
```

The textarea writes straight into `v.state.draft.text` on every `input` event without repainting, so focus and cursor survive typing. A case-insensitive substring check updates a hint line saying whether the phrase is on the page. That hint is advisory: _Finish paragraph_ is always enabled, and nothing requires the phrase or any text at all. An empty paragraph can be committed and is shown as `EMPTY_PARAGRAPH`, `(empty paragraph)`. The screens test `p.text || EMPTY_PARAGRAPH` while the export tests `p.text.trim() || EMPTY_PARAGRAPH`, so a paragraph of only whitespace shows the placeholder in the export but a blank paragraph on screen.

`renderWriteSlot` begins, as `renderRollPenmanshipStep` and `renderStepDone` do, by checking that the ink pot index and language roll exist and returning an `internalError` element if not. The phase order guarantees both by the time these phases render, so these branches cannot be reached through the UI; they exist to narrow the `Draft`'s nullable fields under `noUncheckedIndexedAccess`.

### 11. Committing a paragraph

After the Penmanship roll the draft reaches `PARAGRAPH_DONE`. The done step needs a `Paragraph` twice — to preview the points and then to commit — and both come from one mapping.

`src/paragraph.ts` — `draftToParagraph`

```ts
export function draftToParagraph(d: Draft): Paragraph | null {
  if (d.inkPotIndex === null || d.languageRoll === null || d.penmanshipRoll === null) return null;
  return {
    inkPotIndex: d.inkPotIndex,
    flourishAdjective: d.flourishAdjective.trim() ? d.flourishAdjective : null,
    heartRoll: d.heartRoll,
    languageRoll: d.languageRoll,
    penmanshipRoll: d.penmanshipRoll,
    skillUsedHere: d.skillUsedHere,
    text: d.text,
  };
}
```

A `Paragraph` stores the word's _position_ in the ink pot, not the word.

`src/types.ts` — `Paragraph`

```ts
export interface Paragraph {
  // A position in the scenario's inkPot, resolved at render and export time
  // against whatever SCENARIOS holds then. Saved sessions outlive deploys, so
  // an existing scenario's inkPot is append-only: reordering, removing or
  // repurposing an entry silently changes the word in every stored letter.
  inkPotIndex: number;
```

Saved letters outlive deploys, so editing a scenario's ink pot rewrites history for anyone mid-letter. That invariant was issue #79; PR #98 wrote it onto the field itself and into `CLAUDE.md`. No test enforces it.

The _Next paragraph_ button (_Seal & finish the letter_ on the fifth) calls `v.onCommit`, which in `main.ts` is `commit(commitParagraph(current, paragraph))`.

`src/paragraph.ts` — `commitParagraph`

```ts
export function commitParagraph(session: GameSession, para: Paragraph): GameSession {
  const paragraphs = [...session.paragraphs, para];
  return {
    ...session,
    paragraphs,
    skillSpent: session.skillSpent || para.skillUsedHere !== null,
    status: paragraphs.length >= PARAGRAPHS_PER_LETTER ? 'finished' : 'in_progress',
  };
}
```

This is where the skill is finally marked spent and where the fifth paragraph flips the status to `'finished'` — the only route to the Score screen. `commit` saves the new session and calls `render`, which builds a brand-new `renderPlay` with a fresh empty draft. Nothing resets the old draft; its closure is simply dropped. The ink pot card disables every entry whose index already appears in `session.paragraphs`, so each word serves one paragraph.

### 12. Scoring

Points per paragraph depend on whether the flourish held, whether the word came out superior, and whether the hand was fine.

`src/scoring.ts` — `paragraphPoints`

```ts
export function paragraphPoints(p: Paragraph): number {
  const superior = succeeded(p.languageRoll);
  const flourishApplied = succeeded(p.heartRoll);

  let pts: number;
  if (flourishApplied && superior) pts = 2;
  else if (flourishApplied && !superior) pts = -1;
  else if (!flourishApplied && superior) pts = 1;
  else pts = 0;

  if (succeeded(p.penmanshipRoll)) pts += 1;
  return pts;
}
```

A flourish that holds doubles the reward for a superior word and costs a point on an inferior one; a flourish that fails changes nothing. This is a transcript of a script run while writing this document, which called `paragraphPoints` and `tierFor` from `src/scoring.ts` with a single die of 6 for success and 2 for failure. It is not live; nothing re-runs it.

```text
heart      language  penmanship  points
not rolled fail      fail        0
not rolled fail      success     1
not rolled success   fail        1
not rolled success   success     2
fail       fail      fail        0
fail       fail      success     1
fail       success   fail        1
fail       success   success     2
success    fail      fail        -1
success    fail      success     0
success    success   fail        2
success    success   success     3
-2→unsuccessful  0→unsuccessful  4→unsuccessful  5→tepid  7→tepid  8→favourable  10→favourable  11→excellent  15→excellent
```

A letter therefore scores between -5 and 15. The total maps to a tier through one table.

`src/types.ts` — `TIERS`

```ts
export const TIERS = [
  { threshold: 11, name: 'excellent' },
  { threshold: 8, name: 'favourable' },
  { threshold: 5, name: 'tepid' },
  { threshold: 0, name: LOWEST_TIER },
] as const;
```

`TierName` is derived from this table, and `Scenario.consequences` is a `Record<TierName, string>`, so each scenario supplies exactly four consequence strings and cannot move the boundaries. `tierFor` returns the first tier whose threshold the total clears, and falls back to `LOWEST_TIER` for a negative total. `score(session)` maps `paragraphPoints` over the paragraphs and returns the per-paragraph points, the total and the tier.

### 13. The Score screen

When `status` is `'finished'`, `render` calls `renderScore`. It shows a seal with the total, the tier ("An excellent letter"), the scenario's consequence for that tier, the finished letter signed with the character's name, and a breakdown table built from the same `score` result. The breakdown reports a failed flourish as "flourish lost".

Two actions close the screen. _Write another letter_ is `onRestart`, which `main.ts` turns into `commit(null)`: the session is removed from storage and the Setup screen renders. _Download letter (.md)_ builds the Markdown and hands it to the browser.

`src/screens/score.ts` — `renderScore`

```ts
  download.addEventListener('click', () => {
    const md = toMarkdown(ctx.session, ctx.scenario, ctx.character, ctx.skill);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = ctx.session.startedAt.slice(0, 10);
    a.href = url;
    a.download = `quill-${d}-${ctx.scenario.id}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // The blob fetch is scheduled after the current task, so revoking inline
    // races it — Safari and older Firefox have produced cancelled or zero-byte
    // downloads. One turn of the event loop is enough.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
```

The filename's date is the UTC date from `startedAt`. The letterhead, by contrast, formats `startedAt` in local time (`formatOrdinalDate` in `src/screens/fragments.ts`), so it reads as the player's calendar day.

### 14. The Markdown export

`toMarkdown` assembles three parts: YAML frontmatter, the paragraphs as prose, and a game-record table with the consequence quoted at the end. Player text reaches the table cells unmodified, so every cell goes through an escape.

`src/export.ts` — `escapeCell`

```ts
function escapeCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
```

Backslashes are escaped before pipes; otherwise a typed `\|` would become an escaped backslash followed by a bare pipe that splits the cell. That ordering was issue #84, fixed by PR #95. Newlines become spaces so a pasted line break cannot end the table early. The scenario title in the frontmatter goes through `yamlScalar`, which quotes it so a future title with a colon cannot break the YAML.

As in the Score screen's breakdown, the export shows a flourish only if it held, and shows `—` for a roll that was never made. This is a transcript of `toMarkdown` run on a hand-built two-paragraph session for The Archduke; a real export always has five rows.

```markdown
---
date: 2026-10-12
character: The Monk
skill: Illumination
scenario: "The Archduke"
score: 3
consequence: unsuccessful
---

I write to you on the untimely Passing of your sister.

We spent | our summers Climbing Trees.

---

## Game record

| # | Word | Flourish | Heart | Language | Penmanship | Points |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Passing (superior) | untimely | 5 | 3,6 | 2,4,5,1 | 3 |
| 2 | Climbing Trees (inferior) | — | — | 1,2 | 3,4,2 | 0 |

**Total**: 3 / unsuccessful

> The Archduke is disgusted by your letter. You have lost his respect and will no longer be in contact with you.
```

The pipe in the second paragraph's prose is left alone — escaping applies only to table cells.

### 15. Build and deploy

The loop ends where the page began. `bun build` bundles from `public/index.html`, following its `<script>` to `src/main.ts`, and writes hashed assets to `dist/`.

`package.json` — `build`

```json
    "build": "rm -rf dist && bun build ./public/index.html --outdir dist",
```

`bun build` never cleans its output directory, so the script deletes `dist/` first; otherwise every old hashed bundle would ship beside the current one. The Worker serves that directory and nothing else.

`wrangler.jsonc` — `assets`

```jsonc
  "assets": { "directory": "./dist" },
  "routes": [{ "pattern": "quill.philoserf.com", "custom_domain": true }]
```

`task deploy` runs `bun run check:ci` (Biome, prettier on Markdown, `tsc --noEmit`, `bun test`), then `bun run build`, then `bunx wrangler deploy`. The same `check:ci` runs as a pre-push hook, but pushing deploys nothing. The hostname matters beyond routing: saved letters live in `localStorage` for the `quill.philoserf.com` origin, so serving the app from any other origin would start every player over.
