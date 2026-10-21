# Quill — a walkthrough

## Overview

Quill is a single-page web app for playing Scott Malthouse's _Quill_, a solo letter-writing roleplaying game. The player picks a character, a skill and a scenario, then writes a letter of five paragraphs. Each paragraph draws a word from the scenario's ink pot, may attempt a flourish, and is scored by three dice rolls — Heart, Language and Penmanship. After the fifth paragraph the letter is totalled into one of four tiers, the scenario's consequence for that tier is shown, and the letter can be downloaded as Markdown.

The technology is deliberately small: vanilla TypeScript with no framework, direct DOM construction, `localStorage` for persistence, Bun for the dev server, bundler and test runner, Biome for TypeScript formatting and lint, prettier for markdown. The built `dist/` is served as static assets by a Cloudflare Worker at `quill.philoserf.com`.

There is one entry point. `public/index.html` loads `src/main.ts` as a module; everything else is reached from there.

`public/index.html` — `body`

```html
  <body>
    <main id="app"></main>
    <script type="module" src="../src/main.ts"></script>
  </body>
```

## Architecture

```text
public/index.html, styles.css   page shell and the candlelit-desk stylesheet
src/main.ts                     boot, the session closure, screen selection
src/store.ts                    load / save / discard over localStorage
src/types.ts                    domain types, PARAGRAPHS_PER_LETTER, TIERS
src/data.ts                     the six characters and three skills
src/scenarios.ts                the four scenarios, as typed constants
src/paragraph.ts                the paragraph state machine and the Draft -> Paragraph mapping
src/dice.ts                     rolling and the success rule
src/rules.ts                    planRoll and applyReroll: how many dice, and the re-roll hazard
src/scoring.ts                  per-paragraph points, totals, tiers
src/export.ts                   the Markdown export
src/screens/setup.ts            choose character, skill, scenario
src/screens/play.ts             the five-paragraph play loop
src/screens/score.ts            the finished letter, breakdown, download
src/screens/fragments.ts        letterhead and scenario detail, shared by screens
tests/                          bun tests for everything except the screens
```

The modules layer cleanly. `types.ts`, `data.ts` and `scenarios.ts` are data with no behaviour beyond two id lookups. `dice.ts`, `rules.ts`, `scoring.ts`, `paragraph.ts` and `export.ts` are pure functions over that data, with no DOM, and they carry the test suite. The screens build DOM and call into the pure layer. `main.ts` sits on top, owning the one piece of durable state.

Data flows in a single loop. `main.ts` holds a `GameSession | null` in a closure. A screen receives the session plus the resolved scenario, character and skill, and hands a callback result back up — a selection from Setup, a finished `Paragraph` from Play, a restart from Score. `main.ts` turns that into the next session, writes it to storage, and repaints the root. Inside the Play screen a second, smaller loop runs: the in-progress paragraph lives in the screen's own closure and repaints the screen's own subtree, and none of it is persisted until the paragraph is committed.

## Core walkthrough

### 1. Boot

The last lines of `main.ts` run on load. `mount()` is wrapped so that a failure during the first render leaves the player a way out instead of a blank page.

`src/main.ts` — module top level

```ts
try {
  mount();
} catch (err) {
  // A failed boot gets a way out rather than a dead-end string. This covers
  // mount's first render only: later renders run from event handlers, outside
  // this try. That is safe because hydrate() has already proven the session's
  // ids, and compile-time constants cannot stop resolving mid-session.
  const root = document.getElementById('app');
```

The fallback shows the error message and a _Start a new letter_ button. That button calls `discard()` rather than clearing storage, then reloads — the stored letter is set aside, not deleted, because the crash may be a shape the store did not anticipate and this may be the player's only copy. The error is rethrown afterwards so it still reaches the console.

`mount()` finds `#app`, hydrates the session, and defines the two inner functions that make up the outer loop: `commit` and `render`.

### 2. Loading the session

`hydrate()` is the first thing `mount()` calls. It loads from the store and then checks the one thing the store cannot: that the session's ids still name a scenario, character and skill that exist in this build. Which ids must resolve is stated once, in `resolve()`, using the three lookups `scenarioById`, `characterById` and `skillById`.

`src/main.ts` — `resolve`

```ts
function resolve(
  session: GameSession,
): { scenario: Scenario; character: Character; skill: Skill } | null {
  const scenario = scenarioById(session.scenarioId);
  const character = characterById(session.characterId);
  const skill = skillById(session.skillId);
  return scenario && character && skill ? { scenario, character, skill } : null;
}
```

`src/main.ts` — `hydrate`

```ts
function hydrate(): GameSession | null {
  const session = load();
  if (!session) return null;
  if (!resolve(session)) {
    // Set aside, not delete: a deploy that renamed an id must not erase the
    // letter (#100).
    discard();
    return null;
  }
  return session;
}
```

Characters, skills and scenarios are compile-time constants, so this check only needs to run once, at mount: an id that resolves now resolves for the life of the page.

`load()` lives in `src/store.ts`. Every storage access goes through a guard, because in some browsers merely reading `globalThis.localStorage` throws when site data is blocked.

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

`load()` then parses, unwraps the legacy `{ session }` envelope that v1 wrote, and checks the shape. Anything that fails — a JSON syntax error or a value of the wrong shape — goes to quarantine rather than being returned or destroyed.

`src/store.ts` — `load`

```ts
  try {
    const value = unwrap(JSON.parse(raw) as unknown);
    if (value === null) return null;
    if (!isSession(value)) throw new Error('persisted session has the wrong shape');
    return value;
  } catch {
    quarantine(store, raw);
    return null;
  }
```

The shape check is sized to what the render path dereferences, not to the full type. `isSession` checks the session's scalar fields and status, and requires every paragraph to pass `isParagraph`, which checks the fields the screens and the export read: the rolls are counted, the index looks up a word, the text is trimmed, and the flourish word is printed.

`src/store.ts` — `isParagraph`

```ts
  return (
    typeof p.inkPotIndex === 'number' &&
    typeof p.text === 'string' &&
    (p.flourishAdjective === null || typeof p.flourishAdjective === 'string') &&
    isNumbers(p.languageRoll) &&
    isNumbers(p.penmanshipRoll) &&
    (p.heartRoll === null || isNumbers(p.heartRoll))
  );
```

`skillUsedHere` is the one `Paragraph` field left unchecked; only `commitParagraph` reads it, and only on a paragraph the app has just built. An `inkPotIndex` that is a number but names no entry passes too — the Score screen and the export both render a missing word as a dash rather than failing.

Quarantine copies the raw string to `quill.session.v1.corrupt` and removes the live key. There is one backup slot, and a quarantine never overwrites it: the first letter set aside is the one the player is most likely to want back.

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

So while the slot is full, a later rejected letter is removed without a copy. Nothing in the app reads the backup back; recovering it means reading `localStorage` by hand.

`discard()` — used by `hydrate()` and by the boot fallback — is the same quarantine applied to whatever is currently stored. All three rejection paths therefore end in the same place.

### 3. The outer loop: commit and render

With the session in hand, `mount()` defines how it changes. Persisting and repainting are separate steps called in sequence; the store notifies nobody.

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

`save()` returns `false` instead of throwing when the browser refuses the write, and `save(null)` removes the key. A refused write is warned about once per page and otherwise ignored: the game carries on in memory.

`render()` empties the root and picks a screen. `null` means Setup. Otherwise the session's three ids are resolved through the same `resolve()` — `hydrate()` has already proven they resolve, so the throw that follows is a type narrowing rather than a reachable branch — and `status` chooses between Play and Score.

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
```

There are exactly three calls to `commit`: Setup's `onBegin` with a fresh session from `newSession`, Play's `onCommit` with one more paragraph, and Score's `onRestart` with `null`. Those are the only durable writes in the app.

### 4. Setup

`renderSetup` holds three nullable ids in a local `state` object and rebuilds its whole subtree on every selection. The steps reveal progressively: the skill step appears once a character is chosen, the scenario step once a skill is chosen, and _Begin the letter_ once a scenario is chosen.

The three steps are one function, `renderChoiceStep`, called with a different noun each time. Each step is an ARIA radiogroup of `<button role="radio">` cards with a roving tab stop: one tab stop per group, arrows and Home/End to move, and moving also selects.

`src/screens/setup.ts` — `renderChoiceStep`

```ts
    event.preventDefault();
    // The radio pattern selects as it moves; `onSelect` re-renders, and
    // `renderSetup` restores focus to the card that was chosen.
    const target = opts.items[to];
    if (target) opts.onSelect(target);
```

Because selecting rebuilds the screen, the focused card is destroyed. `choose` records the card's id before re-rendering and `render` focuses it again afterwards, so keyboard navigation does not fall back to the body.

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

Card children are all `<span>`s, because a `<button>` may contain only phrasing content. The character cards add attribute pips via `renderAttributePips`, which reuses `diceForRating` so a pip count is a dice count. The chosen scenario's profile and rules are shown below its cards by `renderScenarioDetail` from `fragments.ts`, the same function the Play screen uses for its recall panel.

_Begin the letter_ calls `onBegin`, which `main.ts` turns into a fresh `GameSession` with `status: 'in_progress'`, no paragraphs and the skill unspent.

### 5. The Play screen and its draft

`renderPlay` is called once per paragraph. `main.ts` rebuilds it after every commit, so each call starts with an empty draft and there is no reset to sequence. The draft is created knowing which attribute, if any, the letter's skill can still boost; that is the only place the screen reads the session's skill latch.

`src/screens/play.ts` — `renderPlay`

```ts
  const v: PlayView = {
    ...ctx,
    state: {
      draft: emptyDraft(ctx.session.skillSpent ? null : ctx.skill.bonusAttribute),
      recallOpen: false,
    },
    repaint,
  };

  function repaint() {
    const row = document.createElement('div');
    row.className = 'play-row';
    row.append(renderInkPotCard(v), renderLetter(v), renderMarginalia(v));
    root.replaceChildren(renderHeader(v), row);
  }
```

`v` is the context plus two things this invocation owns: `state` and `repaint`. `state` is one shared object rather than a value passed down, so a handler that fires late reads the current draft rather than the one that existed when its button was built. Every render function below takes `v` and reads `v.state.draft`; every handler that changes the draft assigns `v.state.draft = advance(...)` and, unless the DOM already shows the change, calls `v.repaint()`.

The layout is a header with five Roman-numeral medallions, then three columns: the ink pot on the left, the letter in the middle, and the marginalia on the right — a stepper, the current step's controls, and a reference card with the character, skill status, running score and a recall toggle for the scenario.

### 6. The paragraph machine

The draft's phase order lives in `src/paragraph.ts`, not in the screen. A `Draft` is a union discriminated on `phase`: each phase carries exactly the fields it has earned, so code handed one phase cannot find a roll missing that the order guarantees is there. `advance(draft, event)` is the only function that produces a new one.

`src/paragraph.ts` — `Draft`

```ts
export type Draft =
  | (DraftBase & { phase: 'PICK_WORD' })
  // The word being typed; trimmed and checked only when it is attempted.
  | (Worded & { phase: 'DECIDE_FLOURISH'; flourishAdjective: string })
  | (Worded & { phase: 'ROLL_HEART'; flourishAdjective: string })
  | (Resolved & { phase: 'ROLL_LANGUAGE' })
  | (Written & { phase: 'WRITE' })
  | (Written & { phase: 'ROLL_PENMANSHIP' })
  | DoneDraft;
```

The variants are built from nested shapes so no field is declared twice: `DraftBase` holds the skill (`spendable`, the attribute the letter's skill can still boost, and `skillUsedHere`), `Worded` adds the ink-pot index, `Resolved` adds `flourish` — the adjective and its Heart roll together, or `null` for a paragraph written plainly — and `Written` adds the Language roll and the prose. `PhaseName` is derived from the union, and `DraftAt<P>` names one phase's variant for the render functions in section 7.

`src/paragraph.ts` — `DraftEvent`

```ts
export type DraftEvent =
  | { type: 'pickWord'; inkPotIndex: number }
  | { type: 'setFlourish'; adjective: string }
  | { type: 'attemptFlourish' }
  | { type: 'writePlainly' }
  | { type: 'spendSkill'; attribute: Attribute }
  | { type: 'rolled'; attribute: Attribute; dice: number[] }
  | { type: 'setText'; text: string }
  | { type: 'finishParagraph' };
```

Each event carries the data its transition records, so a phase change and the field it fills happen in one place. An event that does not belong to the current phase returns the draft unchanged — the screen relies on that identity, as section 7 shows.

The one branching phase is `DECIDE_FLOURISH`. Attempting a flourish requires a non-blank word and trims it once, here, so the phrase the write step later asks for is exactly the phrase the player typed. Writing plainly builds the next variant field by field, so a word typed but never attempted is dropped rather than carried along.

`src/paragraph.ts` — `advance`

```ts
    case 'attemptFlourish': {
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      const adjective = draft.flourishAdjective.trim();
      if (!adjective) return draft;
      return { ...draft, flourishAdjective: adjective, phase: 'ROLL_HEART' };
    }
...
    case 'writePlainly': {
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      const { spendable, skillUsedHere, inkPotIndex } = draft;
      return { phase: 'ROLL_LANGUAGE', spendable, skillUsedHere, inkPotIndex, flourish: null };
    }
```

The skill is guarded here too. `spendSkill` is refused unless its attribute is the draft's `spendable`, the phase is that attribute's roll, and nothing has been spent this paragraph — so once per letter, on the skill's own attribute, is a rule of the machine rather than of which buttons the screen draws.

The following is a transcript of a script run while writing this document, driving `advance` with a mix of valid and out-of-order events and then mapping the result with `draftToParagraph`. Nothing re-runs it.

```text
PICK_WORD        {"type":"rolled","attribute":"language","dice":[6]}              -> (ignored)
PICK_WORD        {"type":"pickWord","inkPotIndex":1}                              -> DECIDE_FLOURISH
DECIDE_FLOURISH  {"type":"attemptFlourish"}                                       -> (ignored)
DECIDE_FLOURISH  {"type":"setFlourish","adjective":"  solemn "}                   -> DECIDE_FLOURISH
DECIDE_FLOURISH  {"type":"attemptFlourish"}                                       -> ROLL_HEART
ROLL_HEART       {"type":"rolled","attribute":"heart","dice":[2,5]}               -> ROLL_LANGUAGE
ROLL_LANGUAGE    {"type":"rolled","attribute":"language","dice":[3,4]}            -> WRITE
WRITE            {"type":"setText","text":"With solemn Death…"}                   -> WRITE
WRITE            {"type":"finishParagraph"}                                       -> ROLL_PENMANSHIP
ROLL_PENMANSHIP  {"type":"rolled","attribute":"penmanship","dice":[6,1]}          -> PARAGRAPH_DONE
{"inkPotIndex":1,"flourishAdjective":"solemn","heartRoll":[2,5],"languageRoll":[3,4],"penmanshipRoll":[6,1],"skillUsedHere":null,"text":"With solemn Death…"}
```

The Language roll offered before a word was picked is ignored, as is the attempt with no word. The padded `"  solemn "` reaches the record trimmed.

`draftToParagraph` is the single mapping from a draft to the stored `Paragraph`. It accepts only the finished variant, so it always returns one. The Heart roll is the record of whether a flourish was attempted, and the draft keeps the word and the roll in one `flourish` field, so the two cannot disagree in a stored letter.

`src/paragraph.ts` — `draftToParagraph`

```ts
export function draftToParagraph(d: DoneDraft): Paragraph {
  return {
    inkPotIndex: d.inkPotIndex,
    flourishAdjective: d.flourish?.adjective ?? null,
    heartRoll: d.flourish?.heartRoll ?? null,
```

`text` is not required: an empty paragraph can be committed, and every place that shows prose goes through `paragraphProse`, which trims and substitutes _(empty paragraph)_ for blank or whitespace-only text.

### 7. Playing a paragraph, phase by phase

Two switches in the screen follow the phase — `renderLetterDraftSlot` for the middle column and `renderMarginaliaStepCard` for the right — and both end in a `never` default, so adding a phase to the `Draft` union fails to compile until both render it. Each case hands its step renderer the narrowed variant, `DraftAt<'WRITE'>` and so on, so a renderer reads the rolls its phase guarantees without checking for them.

**Pick a word.** The ink pot lists every entry's inferior word. Entries already used by a committed paragraph are disabled and annotated with whether they came out superior or inferior; during `PICK_WORD` the rest are buttons that send `pickWord`. Since a word serves only one paragraph, a scenario needs at least five entries — `tests/scenarios.test.ts` enforces that, because fewer would leave the player with nothing to click.

**Decide the flourish.** The text input sends `setFlourish` on every keystroke without repainting. _Attempt it_ compares the result of `advance` with the current draft to detect a refusal:

`src/screens/play.ts` — `renderStepFlourish`

```ts
  attempt.addEventListener('click', () => {
    const next = advance(v.state.draft, { type: 'attemptFlourish' });
    if (next === v.state.draft) {
      // advance refused a blank word; point the player at the field.
      input.focus();
      return;
    }
```

_Write plainly_ sends `writePlainly`, which skips the Heart roll altogether.

**Roll Heart, then Language.** Both use `renderRollStep`, which asks `rules.ts` how many dice to roll. `planRoll` starts from the character's rating (poor 1, average 2, good 3), adds each scenario `dice_bonus` for this attribute — some gated to particular characters — notes any `reroll_highest`, and adds one die if the skill is being spent on this roll.

`src/rules.ts` — `planRoll`

```ts
      case 'dice_bonus': {
        if (mod.attribute !== attribute) break;
        const restrict = mod.appliesTo?.characters;
        if (!restrict || restrict.includes(character.id)) {
          diceCount += mod.amount;
        }
        break;
      }
```

The skill is the letter's single once-only bonus. The screen offers _Spend …_ only when the draft's `spendable` is this roll's attribute and nothing has been spent this paragraph. Pressing it sends `spendSkill`, which `advance` records as `skillUsedHere`, and the repaint makes the dice count include the extra die. The session's `skillSpent` flag does not change until the paragraph is committed, so the reference card reads the draft to show _spent_ in between.

The roll button shakes for 250 ms before rolling. The timer checks that its button is still in the document: if a repaint replaced the subtree during the shake, this button's dice plan is stale and the freshly rendered button is the one to use.

`src/screens/play.ts` — `attachRollButton`

```ts
    setTimeout(() => {
      // A repaint during the shake — spending the skill is the live case —
      // replaces the play subtree and detaches this button; its dice plan is
      // stale, so abort and let the freshly rendered button roll with the
      // current plan. (The recall toggle mutates in place and does not repaint.)
      if (!btn.isConnected) return;
      onRoll();
    }, 250);
```

When the timer does fire, it rolls with `roll(plan.diceCount)`, passes the dice through `applyReroll`, and hands them to the step's callback, which sends `rolled` with the attribute. `applyReroll` is a no-op unless the plan asked for `highest`; when it did, the highest die is replaced unconditionally — including a success — which is what makes the Art Dealer's calligraphy rule a hazard rather than a bonus.

`src/rules.ts` — `applyReroll`

```ts
  if (policy !== 'highest' || dice.length === 0) return dice;
  const i = dice.indexOf(Math.max(...dice));
  // roll(1) always yields one die; the fallback is for the type, not for a
  // reachable case — see the test that pins it.
  const replacement = roll(1, rng)[0] ?? 1;
  return [...dice.slice(0, i), replacement, ...dice.slice(i + 1)];
```

Success is one rule for every roll: a die succeeds on 5 or 6, and a roll succeeds if any die does. `succeeded` accepts `null` so that a Heart roll which never happened — the plain path — counts as a failure without a special case.

`src/dice.ts` — `succeeded`

```ts
export function succeeded(dice: number[] | null): boolean {
  return dice !== null && countSuccesses(dice) > 0;
}
```

The Language step shows the Heart verdict above its own button, and the Penmanship step shows the Language verdict, so each roll's outcome stays on screen while the next is made.

**Write.** The Language roll decides the word — superior on success, inferior otherwise — and a held flourish is prefixed to it. `writtenWord` in `scoring.ts` makes that choice, and holds the app's only lookup into a scenario's ink pot; an index that no longer resolves shows as `—`, as on the Score screen and in the export. The write slot shows the phrase and a textarea.

`src/screens/play.ts` — `renderWriteSlot`

```ts
  const word = writtenWord(v.scenario, d.inkPotIndex, d.languageRoll) ?? MISSING_WORD;
  const required =
    d.flourish && succeeded(d.flourish.heartRoll) ? `${d.flourish.adjective} ${word}` : word;
  const requiredLower = required.toLowerCase();
```

Typing sends `setText` and updates a case-insensitive indicator saying whether the phrase appears, without repainting — the textarea already shows the text, and a repaint would lose the cursor. The indicator is advisory: _Finish paragraph_ sends `finishParagraph` whether or not the phrase is present.

**Roll Penmanship, then done.** Penmanship is the last roll, made after writing. `PARAGRAPH_DONE` builds the paragraph with `draftToParagraph`, reads it through `paragraphOutcome` (section 9), and shows the verdicts and the points it would earn. The button — _Next paragraph_, or _Seal & finish the letter_ on the fifth — hands that same paragraph to `onCommit`. No event changes a finished draft, so the previewed points are the recorded ones.

### 8. Committing a paragraph

`onCommit` arrives in `main.ts` as `commit(commitParagraph(current, paragraph))`. `commitParagraph` appends the paragraph, marks the skill spent if this paragraph used it, and flips the status when the letter reaches its length.

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

`commit` saves the new session and re-renders. For paragraphs one to four, that builds a fresh `renderPlay` with an empty draft; for the fifth, `status` is now `'finished'` and the Score screen appears. Reloading the page mid-paragraph therefore loses only the paragraph in progress — committed paragraphs are restored, and the draft starts over at `PICK_WORD`.

The stored `Paragraph` keeps the word's position, `inkPotIndex`, not the word itself. The word is resolved against `SCENARIOS` at display time, so an existing scenario's ink pot is append-only: reordering or removing an entry would change the word in every letter already saved.

### 9. Scoring

A paragraph's points come from the three rolls. A held flourish doubles the stakes of the Language roll — it turns a superior word into two points and an inferior one into a loss — and a fine hand adds one regardless.

`src/scoring.ts` — `paragraphPoints`

```ts
  let pts: number;
  if (flourishApplied && superior) pts = 2;
  else if (flourishApplied && !superior) pts = -1;
  else if (!flourishApplied && superior) pts = 1;
  else pts = 0;

  if (succeeded(p.penmanshipRoll)) pts += 1;
  return pts;
```

The total is the sum over the five paragraphs, and `tierFor` walks `TIERS`, the one ordered table of thresholds and names in `types.ts`.

`src/types.ts` — `TIERS`

```ts
export const TIERS = [
  { threshold: 11, name: 'excellent' },
  { threshold: 8, name: 'favourable' },
  { threshold: 5, name: 'tepid' },
  { threshold: 0, name: LOWEST_TIER },
] as const;
```

`TierName` is derived from this table, and each scenario's `consequences` is a `Record<TierName, string>`, so a scenario supplies four strings and cannot change the boundaries. A negative total falls through every threshold and is floored to `unsuccessful`.

The following is a transcript of the same script, printing `paragraphPoints` for every combination of outcomes (a `null` Heart roll is the plain path) and `tierFor` at the boundaries. Nothing re-runs it.

```text
heart  language penmanship  points
null   [1]      [1]         0
null   [1]      [6]         1
null   [6]      [1]         1
null   [6]      [6]         2
[1]    [1]      [1]         0
[1]    [1]      [6]         1
[1]    [6]      [1]         1
[1]    [6]      [6]         2
[5]    [1]      [1]         -1
[5]    [1]      [6]         0
[5]    [6]      [1]         2
[5]    [6]      [6]         3
-1:unsuccessful  0:unsuccessful  4:unsuccessful  5:tepid  7:tepid  8:favourable  10:favourable  11:excellent  15:excellent
```

A flourish attempted and lost scores exactly like writing plainly; only a held flourish changes the outcome. The best possible letter scores 15.

Points are one of the things a paragraph's dice mean. `paragraphOutcome` collects all of them in one reading, which every view of a committed paragraph goes through: the play screen's ink pot and done step, the Score screen's breakdown, and the export's table.

`src/scoring.ts` — `ParagraphOutcome`

```ts
export interface ParagraphOutcome {
  /** null when `inkPotIndex` no longer resolves against the scenario. */
  word: string | null;
  superior: boolean;
  /** null when the player wrote plainly. */
  flourish: { word: string; held: boolean } | null;
  fineHand: boolean;
  points: number;
}
```

The outcome reports a lost flourish as well as a held one, and each consumer chooses what to print.

### 10. The Score screen

`renderScore` calls `score(session)` once and builds four parts: a seal with the total, tier name and the scenario's consequence; the finished letter with its letterhead and signature; a per-paragraph breakdown table; and two buttons.

The breakdown reads each paragraph through `paragraphOutcome`, renders a missing word as a dash, and reports the flourish in one of three ways — held, lost, or absent.

`src/screens/score.ts` — `renderScore`

```ts
    const o = paragraphOutcome(p, ctx.scenario);
    let word = o.word === null ? '—' : `"${o.word}" (${o.superior ? 'superior' : 'inferior'})`;
    if (o.flourish) {
      word += o.flourish.held ? ` + "${o.flourish.word}"` : ' — flourish lost';
    }
```

_Write another letter_ calls `onRestart`, which `main.ts` maps to `commit(null)`: the stored session is removed and Setup is shown.

The letterhead, built by `renderLetterhead` in `fragments.ts`, formats `startedAt` in local time as "Written this 12th day of October", so it reads as the player's calendar day even though the timestamp is stored in UTC.

### 11. The Markdown export

_Download letter (.md)_ calls `toMarkdown`, wraps the result in a `Blob`, and clicks a temporary link. The filename uses the UTC date from `startedAt` and the scenario id. The object URL is revoked on the next turn of the event loop rather than immediately, because revoking it synchronously races the download in some browsers.

`toMarkdown` writes YAML frontmatter, the five paragraphs through `paragraphProse`, and a game-record table. The character name, skill name and scenario title are quoted as YAML scalars; every cell built from player-controlled or content text goes through `escapeCell`.

`src/export.ts` — `escapeCell`

```ts
function escapeCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
```

Backslashes are escaped first, so a typed `\|` becomes `\\\|` — an escaped backslash and an escaped pipe — rather than leaving a bare pipe to split the cell. The table reports a flourish only when it held, matching the play screen's done summary, and the footer closes with the total, the tier and the consequence as a blockquote.

### 12. Building and deploying

`bun run dev` serves `public/index.html` directly; Bun's HTML bundler follows the module script and the stylesheet. `bun run build` deletes `dist/` and bundles the same HTML into it, because `bun build` never cleans its output directory and old hashed bundles would otherwise ship. It then copies `public/_headers` into `dist/`. That file marks every `.js` and `.css` file as immutable for a year, which is safe because the bundler hashes each file's name, so a changed file is a new URL.

`wrangler.jsonc` publishes `dist/` as the static assets of a Worker named `quill` on the custom domain `quill.philoserf.com`. `task deploy` runs `check:ci`, builds, picks up a Cloudflare API token from the login keychain if one is there, and runs `bunx wrangler deploy`. There is no CI: pushing runs `check:ci` through a pre-push hook and deploys nothing.

The hostname is part of the data model. Saved letters live in `localStorage`, which is scoped to the origin, so serving the app from any other host would start every player over.
