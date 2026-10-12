# Quill — a walkthrough

This document follows the code in the order it runs: from the HTML page that boots the app, through the three screens a player passes through, down into the rules that turn dice into points, and out through the Markdown export. Every quoted block names its file and the symbol it comes from; the quotes are verbatim, with `...` marking an elided middle.

## Overview

Quill is a browser version of Scott Malthouse's letter-writing roleplaying game. The player picks a character, a skill and a scenario, then writes a five-paragraph letter. Each paragraph is built around one word from the scenario's _ink pot_ and passes through up to three dice tests — Heart (does an optional flourish hold?), Language (does the player get the superior word?) and Penmanship (is the hand fine?). The points from those tests add up to a tier, and the scenario says how the recipient responds to a letter of that tier. The finished letter can be downloaded as Markdown.

Technology is deliberately thin:

- **TypeScript, no framework.** Every screen is a function that builds DOM nodes with `document.createElement` and returns an `HTMLElement`.
- **Bun** bundles (`bun build ./public/index.html --outdir dist`), serves in development, and runs the tests (`bun test`).
- **`localStorage`** is the only persistence. There is no server-side state.
- **A Cloudflare Worker** serves the built `dist/` directory as static assets (`wrangler.jsonc`), at `quill.philoserf.com`. It is deployed by hand with `task deploy`; there is no CI.

There is one entry point: `public/index.html`, which loads `src/main.ts` as a module.

## Architecture

```text
public/
  index.html          the page shell: <main id="app"> and the module script
  styles.css          all styling
src/
  main.ts             boot: hydrate the stored session, pick a screen, own the commit path
  store.ts            localStorage: load / save / discard, with quarantine
  types.ts            domain types, PARAGRAPHS_PER_LETTER, the TIERS table
  data.ts             the 6 characters and 3 skills (rulebook constants)
  scenarios.ts        the 4 scenarios (rulebook constants)
  paragraph.ts        the per-paragraph state machine, commit, the empty-prose rule
  dice.ts             rolling and the success rule
  rules.ts            how many dice a roll gets, and the re-roll mechanic
  scoring.ts          points per paragraph, total, tier
  export.ts           the Markdown letter
  screens/
    setup.ts          choose character, skill, scenario
    play.ts           write the five paragraphs
    score.ts          the finished letter, breakdown, download, restart
    fragments.ts      letterhead and scenario detail, shared by two screens
tests/                bun tests for every non-screen module
```

The module boundaries follow one rule: **game logic never touches the DOM, and screens never touch storage.** `dice.ts`, `rules.ts`, `scoring.ts`, `paragraph.ts` and `export.ts` are pure functions over plain data, which is why they are the tested part of the code. The screens call into them and report back to `main.ts` through callbacks (`onBegin`, `onCommit`, `onRestart`). Only `main.ts` calls the store.

Data flows in one loop. `main.ts` holds the current `GameSession | null` in a closure. A screen callback hands it a new session; `main.ts` saves it and re-renders the root. Everything that happens _within_ a paragraph — picking a word, rolling, typing — lives in the play screen's own closure and is neither saved nor seen by `main.ts` until the paragraph is committed.

## Boot: from the page to the first screen

The page is an empty `<main id="app">` and one module script:

`public/index.html` — `body`

```html
  <body>
    <main id="app"></main>
    <script type="module" src="../src/main.ts"></script>
  </body>
```

`bun build` follows that script tag, bundles `src/main.ts` and everything it imports, and rewrites the tag to point at a hashed bundle in `dist/`. The bottom of `main.ts` is the whole of the startup sequence: call `mount` with the scenario constants, and if that throws, replace the page with a way out.

`src/main.ts` — `mount(SCENARIOS)`

```ts
try {
  mount(SCENARIOS);
} catch (err) {
  // A failed boot gets a way out rather than a dead-end string. This covers
  // mount's first render only: later renders run from event handlers, outside
  // this try. That is safe because hydrate() has already proven the session's
  // ids, and compile-time constants cannot stop resolving mid-session.
  const root = document.getElementById('app');
  if (root) {
    root.replaceChildren();
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

Two details in that handler matter. The comment is precise about its reach — it guards only the first render, a scope that was stated explicitly when #76 was closed. And the recovery button calls `discard()`, which sets the stored letter aside rather than deleting it; before 6377dca (closing #78) it deleted it. The error is re-thrown afterwards so it still reaches the console.

`mount` finds the root element, recovers any saved session, and defines the two functions that drive the rest of the app's life:

`src/main.ts` — `mount`

```ts
function mount(scenarios: Scenario[]) {
  const el = document.getElementById('app');
  if (!el) throw new Error('Missing #app');
  const rootEl: HTMLElement = el;

  let session = hydrate(scenarios);
  let warnedAboutSaving = false;
```

### Hydrating a saved letter

`hydrate` asks the store for whatever was saved, then checks that the session's three ids still name things that exist. The ids are all compile-time constants, so this check can only fail for a letter saved by an older deploy that has since renamed or removed a scenario, character or skill.

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
    // Set aside, not delete: a deploy that renamed an id must not erase the
    // letter (#100).
    discard();
    return null;
  }
  return session;
}
```

An unresolvable letter is set aside with `discard()` and the player starts at Setup. That is the fix for #100 (207a366); it used to delete the letter, the only rejection path that did.

### The store

`store.ts` is three exported functions over one key, `quill.session.v1`, plus a quarantine key beside it. Every access goes through one guard, because in some browsers merely _reading_ `localStorage` throws:

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

`load` parses the stored string, unwraps a legacy `{ session }` wrapper if present, and checks the result against `isSession`. Anything that fails to parse or fails the check is quarantined rather than thrown away:

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

`isSession` checks the five string fields, `skillSpent`, `status`, and — through `isParagraph` — each paragraph's `inkPotIndex`, roll arrays and `text`, which its comment describes as the fields the render path dereferences. `text` joined that list in 42409a2 (#106), because the render path now calls `paragraphProse(p.text)` on every committed paragraph (below); without it, a stored paragraph missing `text` passed `load` and then threw during the first render. It does not check `flourishAdjective`, nor that `inkPotIndex` is in range; the screens and export handle a missing ink-pot entry by showing a dash.

`quarantine` copies the raw string to `quill.session.v1.corrupt` and removes the live key. The backup is written only when the slot is empty:

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

`discard` is the same quarantine applied to whatever is currently stored, for callers (`hydrate`, the boot handler) that have a session which loaded but cannot be shown. `save` is the only writer of the live key; it serialises a session, or removes the key for `null`, and returns `false` instead of throwing when storage refuses:

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

So there are three ways a rejected letter leaves the live key — `load` on a bad shape, `hydrate` on an unknown id, the boot handler's button — and all three go through `quarantine`. Note what that does and does not promise. There is one backup slot, nothing in the app reads or clears it, and `removeItem(KEY)` runs whether or not the backup was written. The first rejected letter on a browser is kept; any rejected after it is deleted. Apart from that, the only path that deletes a letter is `save(null)`, the player's deliberate restart from the Score screen. If the storage calls themselves throw, the `catch` leaves the live key untouched.

### Commit and render

Back in `mount`, `commit` is the single path by which the session changes. It updates the closure, persists, warns once on the console if storage refused the write, and re-renders:

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

The store notifies nobody; `commit` calls `render()` itself. Persisting and repainting are separate channels, which is why the play screen can repaint dozens of times per paragraph without writing to storage.

`render` empties the root and picks one of three screens. No session means Setup; otherwise `status` chooses between Play and Score:

`src/main.ts` — `render`

```ts
    // hydrate() proved all three resolve; the screens are handed the values so
    // they never look them up again or branch on a failure that cannot happen.
    const current = session;
    const scenario = scenarios.find((s) => s.id === current.scenarioId);
    const character = characterById(current.characterId);
    const skill = skillById(current.skillId);
    if (!scenario || !character || !skill) {
      throw new Error(`Session ${current.id} references data that no longer exists`);
    }

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
```

The `throw` exists for the type checker: `hydrate` has already proven all three lookups succeed, and the data is constant, so in practice it cannot fire. The screens receive resolved objects, not ids.

## The Setup screen

With no session, `render` builds the Setup screen and passes an `onBegin` callback that creates a fresh session:

`src/main.ts` — `newSession`

```ts
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    characterId: sel.characterId,
    skillId: sel.skillId,
    scenarioId: sel.scenarioId,
    skillSpent: false,
    paragraphs: [],
    status: 'in_progress',
  };
```

`renderSetup` keeps a three-field selection in its own closure and rebuilds the whole screen on every choice. The steps reveal progressively — the skill step appears once a character is chosen, the scenario step once a skill is, and the _Begin the letter_ button once a scenario is. Because a rebuild destroys the focused card, each selection records which card to refocus:

`src/screens/setup.ts` — `renderSetup`

```ts
  function choose(kind: string, apply: (id: string) => void) {
    return (item: { id: string }) => {
      apply(item.id);
      focusAfterRender = cardId(kind, item.id);
      render();
    };
  }
```

All three steps are one generic builder, `renderChoiceStep`, parameterised by how to name and describe an item. It renders a `radiogroup` of `<button role="radio">` cards with a roving tabindex — the group is one tab stop, and the arrow keys move _and select_ within it, wrapping at the ends:

`src/screens/setup.ts` — `renderChoiceStep`

```ts
  grid.addEventListener('keydown', (event) => {
    const from = cards.indexOf(document.activeElement as HTMLButtonElement);
    if (from === -1) return;
    const last = cards.length - 1;
    let to: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        to = from === last ? 0 : from + 1;
        break;
...
    event.preventDefault();
    // The radio pattern selects as it moves; `onSelect` re-renders, and
    // `renderSetup` restores focus to the card that was chosen.
    const target = opts.items[to];
    if (target) opts.onSelect(target);
  });
```

Character cards carry an extra block of attribute pips (`renderAttributePips`), drawn with `diceForRating` so a _good_ rating shows three filled pips — the same number of dice it rolls. Once a scenario is selected, its profile and rules of correspondence appear below the cards through `renderScenarioDetail` in `fragments.ts`, which the play screen reuses for its recall panel.

The content on these cards is constant data. A character is a name, flavour text and three attribute ratings; a skill names the one attribute it boosts:

`src/types.ts` — `Character`

```ts
export interface Character {
  id: string;
  name: string;
  flavor: string[];
  attributes: Record<Attribute, Rating>;
}
```

A scenario carries its rules as a list of `Modifier`s, its ink pot as ten inferior/superior word pairs, and one consequence string per tier:

`src/types.ts` — `Scenario`

```ts
export interface Scenario {
  id: string;
  title: string;
  profile: string[];
  rulesOfCorrespondence: Modifier[];
  inkPot: InkPotEntry[];
  consequences: Record<TierName, string>;
}
```

Clicking _Begin the letter_ calls `onBegin`, which `commit`s the new session. `render` runs again, finds an in-progress session, and builds the play screen.

## The Play screen

### The screen's own state

`renderPlay` is called once per paragraph. It creates a `PlayView` — the context from `main.ts` plus a mutable `state` object and a `repaint` function — and paints:

`src/screens/play.ts` — `renderPlay`

```ts
export function renderPlay(ctx: PlayCtx): HTMLElement {
  const root = document.createElement('section');
  root.className = 'screen screen--play';

  // Owned by this invocation. A new letter means a new renderPlay call means a
  // fresh draft, so there is no session-change detection to get wrong.
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

`repaint` rebuilds everything inside the play section: a header with five Roman-numeral medallions, then three columns — the Ink Pot card, the letter itself, and the marginalia (the current step's controls plus a reference card). Every handler on the screen follows the same two-beat pattern: update `v.state.draft`, then call `v.repaint()`. None of it is saved; the draft lives only in this closure.

`state` is one shared object rather than values captured per render on purpose. A handler that fires _after_ a repaint — the roll button's delayed callback, below — reads `v.state.draft` at that moment and so sees the current draft, not a stale copy.

### The paragraph machine

The order a paragraph moves through lives in `src/paragraph.ts`, not in the screen. A `Draft` is the in-progress paragraph:

`src/paragraph.ts` — `Draft`

```ts
export interface Draft {
  phase: PhaseName;
  inkPotIndex: number | null;
  flourishAdjective: string;
  heartRoll: number[] | null;
  languageRoll: number[] | null;
  penmanshipRoll: number[] | null;
  text: string;
  skillUsedHere: Attribute | null;
}
```

and `advance` is the transition function. Each event is legal in exactly one phase; any other combination returns the draft unchanged:

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
```

`DECIDE_FLOURISH` is the one branch: attempting a flourish goes through `ROLL_HEART`, writing plainly skips straight to `ROLL_LANGUAGE`. The three `rolled` events record their dice and advance — Heart to Language, Language to `WRITE`, Penmanship to `PARAGRAPH_DONE`. Heart and Language are rolled _before_ the player writes, because their results decide which word (and whether the flourish) must appear in the text; Penmanship is rolled after.

Here is the machine driven through a full paragraph, including one out-of-order event. This is a transcript of a throwaway script run with `bun` against the current source while writing this document; nothing re-runs it.

```text
emptyDraft()                                 -> PICK_WORD
rolled heart (out of order: ignored)         -> PICK_WORD
pickWord 1                                   -> DECIDE_FLOURISH
attemptFlourish                              -> ROLL_HEART
rolled heart [2,5]                           -> ROLL_LANGUAGE
rolled language [6,1]                        -> WRITE
finishParagraph                              -> ROLL_PENMANSHIP
rolled penmanship [3,4,1]                    -> PARAGRAPH_DONE
paragraphPoints = 2
```

`advance` owns the phase and the three rolls, but not every field of the draft. Three fields are written by the screen directly, outside any event: `flourishAdjective` and `text` on every keystroke, and `skillUsedHere` when the player spends the skill. Keep both channels in mind when reading the handlers below.

The stepper across the top of the marginalia maps phases to five columns through `STEP_INDEX`, a presentation table in the same file; `DECIDE_FLOURISH` and `ROLL_HEART` share the _Flourish_ column.

### Picking a word

In `PICK_WORD`, every unused ink-pot entry is a live button. A word already used by a committed paragraph shows which side of the pair it became; the word chosen for the current draft is marked:

`src/screens/play.ts` — `renderInkPotCard`

```ts
  v.scenario.inkPot.forEach((entry, idx) => {
    const used = v.session.paragraphs.find((p) => p.inkPotIndex === idx);
    const chosen = !used && v.state.draft.inkPotIndex === idx;
    const pickable = v.state.draft.phase === 'PICK_WORD' && !used;
...
    if (pickable) {
      btn.addEventListener('click', () => {
        v.state.draft = advance(v.state.draft, { type: 'pickWord', inkPotIndex: idx });
        v.repaint();
      });
    }
```

The draft records the word's _position_, `inkPotIndex`, not the word. That position is what ends up in storage, and it is resolved against `SCENARIOS` every time the letter is displayed — including after a deploy. The type carries the warning that follows from this (added by 80bbd9b, closing #79):

`src/types.ts` — `Paragraph`

```ts
export interface Paragraph {
  // A position in the scenario's inkPot, resolved at render and export time
  // against whatever SCENARIOS holds then. Saved sessions outlive deploys, so
  // an existing scenario's inkPot is append-only: reordering, removing or
  // repurposing an entry silently changes the word in every stored letter.
  inkPotIndex: number;
```

### Deciding on a flourish

`renderStepFlourish` offers a text input and two buttons. Typing writes straight into the draft; _Attempt it_ refuses an empty or whitespace-only adjective by refocusing the input; _Write plainly_ fires `writePlainly`, which also clears whatever was typed:

`src/screens/play.ts` — `renderStepFlourish`

```ts
  input.addEventListener('input', () => {
    v.state.draft.flourishAdjective = input.value;
  });
  wrap.appendChild(input);

  const attempt = document.createElement('button');
  attempt.type = 'button';
  attempt.className = 'btn btn--primary';
  attempt.textContent = 'Attempt it';
  attempt.addEventListener('click', () => {
    if (!v.state.draft.flourishAdjective.trim()) {
      input.focus();
      return;
    }
    v.state.draft = advance(v.state.draft, { type: 'attemptFlourish' });
    v.repaint();
  });
```

The blank-adjective guard lives only in this click handler: `attemptFlourish` carries no payload, and `advance` moves any `DECIDE_FLOURISH` draft to `ROLL_HEART` whatever its adjective. It matters because scoring decides whether a flourish counted from `heartRoll`, while the Score screen's breakdown decides whether to mention one from `flourishAdjective`; the handler is what keeps those two in step. The check also trims, but what is stored is the untrimmed input. That matters later, in the write step.

### Rolling

All three rolls share one builder, `renderRollStep`. It works out whether the skill can be spent on this roll, asks `rules.ts` how many dice to throw, and renders the info line, an optional _Spend skill_ button, and the roll button:

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

`skillAvailableFor` is true when the session has not yet spent its skill and the skill boosts this attribute. Pressing _Spend_ sets `v.state.draft.skillUsedHere` and repaints; the next render sees `skillBonusActive` and asks for one more die. The session's `skillSpent` flag does not flip until the paragraph is committed, which is why the reference card computes "spent" from both `v.session.skillSpent` and the draft.

`planRoll` starts from the character's rating and walks the scenario's modifiers:

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

A rating is worth one, two or three dice:

`src/dice.ts` — `diceForRating`

```ts
export function diceForRating(r: Rating): number {
  return r === 'poor' ? 1 : r === 'average' ? 2 : 3;
}
```

A `dice_bonus` modifier adds dice, and may be limited to certain characters — The Archduke gives Courtiers and Aristocrats an extra Heart die, for example. A `reroll_highest` modifier (The Art Dealer, on Penmanship) does not change the count; it sets a policy. The `switch` ends in a `never`-typed default, so adding a `Modifier` variant without a branch is a compile error. Its runtime `throw` is reachable only if a cast defeats that check — modifiers come from the compiled `SCENARIOS`, never from storage; ee642b8 (closing #102) reworded the comment to say so. Finally, a spent skill adds one die.

The roll button runs through `attachRollButton`, which shakes it for 250 ms before rolling:

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

The `isConnected` check is what makes the delay safe. The _Spend_ button stays clickable during the shake, and spending repaints; the old roll button, holding a plan computed without the extra die, is then detached and silently does nothing. The recall toggle on the reference card flips its panel's `hidden` attribute in place rather than repainting, precisely so it cannot cancel a roll this way.

When the roll does fire, it throws `plan.diceCount` dice, applies the re-roll policy, and hands the result to the step's callback, which dispatches the `rolled` event:

`src/screens/play.ts` — `renderRollStep`

```ts
  attachRollButton(rollBtn, () => {
    onRolled(applyReroll(roll(plan.diceCount), plan.rerollPolicy));
    v.repaint();
  });
```

`roll` is `Math.floor(rng() * 6) + 1` per die, with the random source injectable for tests. `applyReroll` carries out the Art Dealer's rule, and it is a hazard rather than a bonus — the highest die is replaced whether or not it was already a success:

`src/rules.ts` — `applyReroll`

```ts
export function applyReroll(
  dice: number[],
  policy: RollPlan['rerollPolicy'],
  rng?: () => number,
): number[] {
  if (policy !== 'highest' || dice.length === 0) return dice;
  const i = dice.indexOf(Math.max(...dice));
  // roll(1) always yields one die; the fallback is for the type, not for a
  // reachable case — see the test that pins it.
  const replacement = roll(1, rng)[0] ?? 1;
  return [...dice.slice(0, i), replacement, ...dice.slice(i + 1)];
}
```

Each subsequent step shows the previous roll's verdict above its own controls: the Language step reports whether the flourish held, and the Penmanship step reports whether the superior word was drawn.

### Writing

After the Language roll the draft is in `WRITE`, and the letter column shows a textarea. `renderWriteSlot` works out the exact phrase the paragraph must contain — the superior or inferior word, prefixed with the flourish if the Heart roll held — and keeps a live indicator of whether the text contains it:

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

The indicator is advisory: _Finish paragraph_ fires `finishParagraph` whatever the text says, and an empty paragraph is allowed. Because `flourishAdjective` is the untrimmed input, a flourish typed with a trailing space (`"solemn "`) makes the required phrase `"solemn  Passing"`, with two spaces, which ordinary prose never matches — the indicator stays on "not yet set down" though the player wrote the phrase. The same string logic, run in the throwaway script:

```text
flourish "solemn " -> required "solemn  passing" matches "a solemn passing": false
```

Since the indicator blocks nothing, the cost is a misleading hint, not a lost paragraph.

### The paragraph done, and the commit

After the Penmanship roll, `PARAGRAPH_DONE` shows a summary and the commit button. Both the summary and the commit go through one mapping from draft to stored paragraph, so the points the player previews are the points recorded:

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

`text` is not required, and a blank flourish becomes `null`. The button hands the paragraph to `onCommit`:

`src/screens/play.ts` — `renderStepDone`

```ts
  next.addEventListener('click', () => {
    const newPara = draftToParagraph(v.state.draft);
    if (!newPara) return;
    // Committing replaces the whole screen with a fresh renderPlay, discarding
    // this closure and its draft — there is no reset to sequence.
    v.onCommit(newPara);
  });
```

In `main.ts`, `onCommit` is `commit(commitParagraph(current, paragraph))`. `commitParagraph` appends the paragraph, folds its skill use into `skillSpent`, and finishes the letter on the fifth:

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

`commit` saves the new session and calls `render`, which builds a brand-new `renderPlay` with a fresh `emptyDraft()` — or, after the fifth paragraph, the Score screen. A draft abandoned mid-paragraph (by reloading the page) is simply lost; only committed paragraphs are durable.

Committed paragraphs are shown in the letter column through one rule shared with the Score screen and the export:

`src/paragraph.ts` — `paragraphProse`

```ts
export function paragraphProse(text: string): string {
  return text.trim() || EMPTY_PARAGRAPH;
}
```

Whitespace-only text counts as empty and shows _(empty paragraph)_. Before 21aa5a0 (closing #101) the screens tested only for the literal empty string, so a paragraph of spaces exported as the placeholder but showed as a blank on screen.

The play screen has two `switch`es over the phase — what goes in the letter's draft slot, and what goes in the step card — and both end in a `never`-typed default, so a new phase that neither renders is a compile error (29b8da3, closing #75). The `internalError` returns scattered through the step renderers cover draft fields that `advance` guarantees are set by the time their phase is reached; no sequence of events through `advance` reaches them.

## Scoring

Points are computed from the stored rolls whenever they are needed — on the play screen's reference card, in the done summary, on the Score screen and in the export. Nothing caches them. The one success rule is that any die showing 5 or 6 succeeds, and a roll that never happened did not:

`src/dice.ts` — `succeeded`

```ts
export function succeeded(dice: number[] | null): boolean {
  return dice !== null && countSuccesses(dice) > 0;
}
```

`paragraphPoints` combines the Heart and Language outcomes, then adds a point for a fine hand:

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

A flourish that holds is a gamble on the Language roll: it doubles a superior word's value and turns an inferior one into a penalty. A flourish whose Heart roll _fails_ scores exactly as if the player had written plainly. The table, as printed by the same throwaway script (Penmanship failing throughout; a success adds one to every row):

```text
heart  language  points (penmanship fails)
null   [1]       0
null   [5]       1
[1]    [1]       0
[1]    [5]       1
[5]    [1]       -1
[5]    [5]       2
```

The five paragraph scores sum to a total, and `tierFor` walks `TIERS` from the top, taking the first threshold the total clears:

`src/types.ts` — `TIERS`

```ts
export const TIERS = [
  { threshold: 11, name: 'excellent' },
  { threshold: 8, name: 'favourable' },
  { threshold: 5, name: 'tepid' },
  { threshold: 0, name: LOWEST_TIER },
] as const;
```

`TierName` is derived from this table, and `Scenario.consequences` is keyed by it, so every scenario must supply exactly these four consequences and none can move a boundary. A negative total clears no threshold and falls through to the lowest tier:

```text
tierFor: -3=unsuccessful 0=unsuccessful 4=unsuccessful 5=tepid 7=tepid 8=favourable 10=favourable 11=excellent 15=excellent
```

## The Score screen

When the fifth paragraph commits, `status` becomes `'finished'` and `render` builds `renderScore`. It calls `score(session)` once and lays out a seal with the total, the tier ("A tepid letter", "An excellent letter"), and the scenario's consequence for that tier; then the finished letter on a letterhead, signed with the character's name; then a paragraph-by-paragraph breakdown:

`src/screens/score.ts` — `renderScore`

```ts
  for (const [i, p] of ctx.session.paragraphs.entries()) {
    const pair = ctx.scenario.inkPot[p.inkPotIndex];
    const sup = succeeded(p.languageRoll);
    const flourish = p.flourishAdjective;
    let word = pair
      ? `"${sup ? pair.superior : pair.inferior}" (${sup ? 'superior' : 'inferior'})`
      : '—';
    if (flourish !== null) {
      word += succeeded(p.heartRoll) ? ` + "${flourish}"` : ' — flourish lost';
    }
```

The breakdown names a failed flourish as lost; the export, below, omits a failed flourish entirely. Both score it the same way.

The letterhead's date comes from `renderLetterhead` in `fragments.ts`, which formats `startedAt` in _local_ time ("Written this 12th day of October"), while the export's date and filename take the first ten characters of the ISO string, which is UTC. Near midnight the two can name different days; the comment on `formatOrdinalDate` says this is intended.

Two buttons close the screen. _Write another letter_ is `onRestart`, which `main.ts` wires to `commit(null)` — `save(null)` removes the stored letter, and `render` returns to Setup. This is the one place a letter is deliberately deleted. _Download letter (.md)_ builds the export.

## The export

The download handler calls `toMarkdown`, wraps the string in a `Blob`, clicks a temporary link named `quill-<date>-<scenario id>.md`, and revokes the object URL one tick later rather than inline, because revoking synchronously raced the download in some browsers.

`toMarkdown` assembles three parts: YAML frontmatter, the letter's prose, and a game-record table with the total and consequence:

`src/export.ts` — `toMarkdown`

```ts
  const frontmatter = [
    '---',
    `date: ${date}`,
    `character: ${character.name}`,
    `skill: ${skill.name}`,
    `scenario: ${yamlScalar(scenario.title)}`,
    `score: ${result.total}`,
    `consequence: ${result.tierName}`,
    '---',
    '',
  ].join('\n');

  const body = session.paragraphs.map((p) => paragraphProse(p.text)).join('\n\n');
```

The prose goes through `paragraphProse`, the same rule the screens use. The table is where player text meets Markdown syntax, so each cell of player text is escaped:

`src/export.ts` — `escapeCell`

```ts
function escapeCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
```

The order matters: backslashes are doubled first, so a typed `\|` becomes `\\\|` — an escaped backslash followed by an escaped pipe — instead of an escaped backslash followed by a bare pipe that splits the cell. That ordering is the fix for #84 (b87045c).

`paragraphRow` builds one table row per paragraph: the word with its tier (superior or inferior, or a dash if the index no longer resolves), the flourish only if it held, the three rolls as comma-separated dice, and the points. `yamlScalar` quotes the scenario title in the frontmatter so a future title with a colon cannot break the YAML; the four bundled titles do not need it.

## Tests, build and deploy

`tests/` has a file for each non-screen module — `data`, `dice`, `export`, `paragraph`, `rules`, `scenarios`, `scoring` and `store` — with `helpers.ts` beside them. The store tests run against an in-memory `Storage` stand-in, including storage that throws on access and storage that refuses writes. `tests/scenarios.test.ts` checks what the `Scenario` type cannot: every ink pot holds at least five words, `dice_bonus` amounts are positive integers, and `appliesTo` names real characters. The screens have no automated tests; the README's six-step manual smoke test covers them.

`bun test` runs the tests but does not type-check. `bun run check:ci` runs Biome, prettier's markdown check, `tsc --noEmit` and the tests, and is wired as the git pre-push hook. `task deploy` runs `check:ci`, then `bun run build` (which deletes `dist/` before bundling so stale hashed bundles never ship), then `bunx wrangler deploy`, which publishes `dist/` to the Worker at `quill.philoserf.com`. That hostname is also the `localStorage` origin, so it is where every saved letter lives.
