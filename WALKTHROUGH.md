# Quill Walkthrough

How the code runs, in execution order. For _why_ it is shaped this way, read `THEORY.md`; where
the two disagree, the code wins and both documents are wrong.

## Overview

Quill is a browser implementation of Scott Malthouse's solo letter-writing roleplaying game. You
choose a character, a skill and a scenario, then write a five-paragraph letter. The dice never
decide what the letter says — they decide which words you are _obliged_ to write with, and
afterwards they score what you wrote.

There is no framework and no runtime dependency. Bun is the runtime, bundler, test runner and dev
server; TypeScript runs strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`;
Biome formats and lints. The shipped artefact is one bundled module and a stylesheet, served as
static files from GitHub Pages.

`package.json` — `scripts`

```json
"dev": "bun ./public/index.html",
"build": "bun build ./public/index.html --outdir dist && cp public/CNAME dist/CNAME",
"test": "bun test",
"check": "biome check --write .",
"check:ci": "biome check . && tsc --noEmit && bun test",
"format": "biome format --write .",
"prepare": "simple-git-hooks"
```

`check:ci` is the whole gate — lint, typecheck, tests — and a `simple-git-hooks` pre-push hook runs
it before every push. Note what it does _not_ include: `bun run build`. Nothing local ever runs the
bundler, so a broken reference in `public/index.html` passes every check on your machine and fails
in CI. The workflow covers both directions: on a pull request an explicit _Verify the bundle builds_
step, and on a push to `main` the `build` job that gates the deploy.

This walkthrough follows first-run execution order: page load, boot and hydration, persistence, the
domain types, the content constants, the Setup screen, the paragraph machine, the dice and rules
that feed it, the Play screen that drives it, then scoring and export.

## Architecture

Every module and what it imports, in dependency order:

| Module                 | Imports                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `types.ts`             | —                                                                          |
| `dice.ts`              | `./types`                                                                  |
| `data.ts`              | `./types`                                                                  |
| `scenarios.ts`         | `./types`                                                                  |
| `rules.ts`             | `./dice` `./types`                                                         |
| `paragraph.ts`         | `./types`                                                                  |
| `scoring.ts`           | `./dice` `./types`                                                         |
| `export.ts`            | `./dice` `./paragraph` `./scoring` `./types`                               |
| `store.ts`             | `./types`                                                                  |
| `screens/fragments.ts` | `../types`                                                                 |
| `screens/setup.ts`     | `../data` `../dice` `../types` `./fragments`                               |
| `screens/play.ts`      | `../dice` `../paragraph` `../rules` `../scoring` `../types` `./fragments`  |
| `screens/score.ts`     | `../dice` `../export` `../paragraph` `../scoring` `../types` `./fragments` |
| `main.ts`              | `./data` `./paragraph` `./scenarios` `./screens/*` `./store` `./types`     |

Three things that table settles.

**The graph is acyclic and shallow.** `types.ts` imports nothing and everything imports it. No
module imports a screen except `main.ts`, and no screen imports another screen except through
`fragments.ts`, the shared-DOM-fragment module.

**`store.ts` has exactly one consumer.** No screen imports it. Persistence is `main.ts`'s business
alone, and the screens cannot write to `localStorage` even by accident.

**The game layer never touches the DOM.** `dice`, `rules`, `paragraph`, `scoring` and `export` are
pure functions over plain data. That is what lets the tests cover the rules with no DOM stub of any
kind — and it is also the dividing line for what _is_ tested, since the screens have no tests at
all.

## Entry point: `public/index.html`

Bun's bundler takes the HTML file as its entry, follows the `<script>` and `<link>` tags, and emits
only what it can reach from here.

`public/index.html` — `<body>`

```html
<body>
  <main id="app"></main>
  <script type="module" src="../src/main.ts"></script>
</body>
```

`<main id="app">` is the entire application surface; everything else is built by
`document.createElement`. Two details are load-bearing and easy to break:

- **`public/CNAME` is unreachable from this file**, so the bundler does not copy it. The `build`
  script copies it by hand — that `cp` is what keeps `quill.philoserf.com` bound across deploys.
- **There is no analytics snippet here on purpose.** Cloudflare injects the Web Analytics beacon at
  the edge; a second copy in this file would double-count every page view.

## Boot: `src/main.ts`

`main.ts` is a closure holding one mutable `session` and two functions that act on it. Before either
runs, the persisted session has to be proved usable.

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

This runs **once**, at mount. The comment above it gives the reason: characters, skills and
scenarios are compile-time constants, so the set of valid ids is fixed for the life of the page. A
session that resolves at mount cannot stop resolving later, which keeps the `clear()` recovery write
out of the render path.

The two channels that follow are the single most important thing to understand about this app.

`src/main.ts` — `commit`, inside `mount`

```ts
// Persisting and repainting are separate channels. A phase transition inside
// the play screen repaints without writing; only a committed paragraph, a new
// letter, or a restart is durable.
function commit(next: GameSession | null) {
  session = next;
  if (!save(next) && !warnedAboutSaving) {
    warnedAboutSaving = true;
    console.warn('Quill: this letter is not being saved — localStorage refused the write.');
  }
  render();
}
```

`commit` writes _and_ repaints. Everything else repaints without writing. The store notifies nobody
— there is no subscription, no observer, no reactivity — so `commit` calling `render()` itself is
the only thing connecting a write to the screen. The practical consequence: **an in-progress
paragraph is not durable**. Reloading mid-paragraph restores the letter up to the last committed
paragraph and discards the draft. The Play screen section below shows how that is enforced.

`save` returns a boolean rather than throwing, so a browser that refuses the write degrades to one
console warning instead of a dead app — and `warnedAboutSaving` keeps it to one.

`render()` then picks a screen from two facts: whether there is a session, and `session.status`.
`null` → Setup, `'in_progress'` → Play, `'finished'` → Score. It also re-resolves the scenario,
character and skill so the screens receive values rather than ids, and throws if any is missing.

The mount itself is wrapped so that an unrecoverable state offers a way out:

`src/main.ts` — the mount `try`/`catch`

```ts
try {
  mount(SCENARIOS);
} catch (err) {
  // Any unrecoverable state gets a way out rather than a dead-end string.
  const root = document.getElementById('app');
  if (root) {
    root.replaceChildren();
    const msg = document.createElement('p');
    msg.textContent = `Quill could not open this letter: ${(err as Error).message}`;
    // ...
    restart.addEventListener('click', () => {
      clear();
      location.reload();
    });
    root.append(msg, restart);
  }
  throw err;
}
```

Be precise about the reach of this handler, because the code reads wider than it is. `mount()` calls
`render()` once before returning, so that first render is covered. Every later render is triggered
by `commit()` from inside a click handler, which is outside this `try` — a throw there would be an
unhandled exception with no recovery button. In practice nothing can throw, which is why this is a
shape worth knowing rather than a bug to fix; it is filed as
[#76](https://github.com/philoserf/quill/issues/76) because the comment claims a wider scope than
the code has.

Note also that `clear()` on that button is a `removeItem` with no backup — which matters for the
finding in the next section.

## Persistence: `src/store.ts`

Three functions over `GameSession | null`, under the key `quill.session.v1`.

`src/store.ts` — `load`

```ts
export function load(): GameSession | null {
  const store = storage();
  const raw = store?.getItem(KEY) ?? null;
  if (!store || raw === null) return null;

  try {
    const value = unwrap(JSON.parse(raw) as unknown);
    if (value === null) return null;
    if (!isSession(value))
      throw new Error('persisted session has the wrong shape');
    return value;
  } catch {
    quarantine(store, raw);
    return null;
  }
}
```

Read it inside out. `storage()` wraps even the _access_ to `globalThis.localStorage` in a try/catch,
because a browser with site data blocked throws `SecurityError` on the property read, not just on
`getItem`. `unwrap()` peels the legacy `{ session }` envelope that v1 wrote. Then the shape check:

`src/store.ts` — `isSession`

```ts
function isSession(v: unknown): v is GameSession {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    // ... five more field checks ...
    Array.isArray(s.paragraphs) &&
    (s.status === 'in_progress' || s.status === 'finished')
  );
}
```

This checks what the render path dereferences and no more. **`paragraphs` is only tested for
`Array.isArray` — its contents are not validated**, which is the boundary of what this guard
promises and the subject of [#78](https://github.com/philoserf/quill/issues/78).

A payload that fails the check is not deleted:

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

The three outcomes, driven against a stubbed `localStorage`. Transcript of a script run while
writing this document; nothing re-runs it:

```text
legacy envelope  → session a  | live key: true  | quarantined: false
wrong shape      → null       | live key: false | quarantined: true
not JSON         → null       | live key: false | quarantined: true
```

The legacy envelope unwraps silently. Both failures return `null` — so the player lands on Setup
rather than a crash — while the original bytes move to `quill.session.v1.corrupt`, where a
determined player could still recover the text of a letter.

## The domain model: `src/types.ts`

The scenario modifiers are a discriminated union, and the discriminant is what `rules.ts` switches
on.

`src/types.ts` — `Modifier`

```ts
export type Modifier =
  | {
      type: 'dice_bonus';
      attribute: Attribute;
      amount: number;
      appliesTo?: { characters: string[] };
      description: string;
    }
  | {
      type: 'reroll_highest';
      attribute: Attribute;
      description: string;
    };
```

`appliesTo` is optional and gates the bonus on character id — absent means it applies to everyone.
`reroll_highest` carries no amount because it is a policy, not a quantity.

Now the record a finished paragraph leaves behind:

`src/types.ts` — `Paragraph`

```ts
export interface Paragraph {
  inkPotIndex: number;
  flourishAdjective: string | null;
  heartRoll: number[] | null;
  languageRoll: number[];
  penmanshipRoll: number[];
  skillUsedHere: Attribute | null;
  text: string;
}
```

The nullability here is the paragraph machine's postcondition written into the type. `heartRoll` is
nullable because the Heart roll only happens if the player attempts a flourish. `languageRoll` and
`penmanshipRoll` are **not** nullable: there is no path to a committed paragraph that skips them.
Compare this with `Draft` below, where all three are nullable — the difference between the two types
_is_ the guarantee that committing provides.

`inkPotIndex` is a position, not a word. That is the subject of
[#79](https://github.com/philoserf/quill/issues/79).

Finally, the score table:

`src/types.ts` — `TIERS`

```ts
// Ordered high to low: the first threshold a total clears wins. The single
// home for both the boundaries and the names — TierName derives from it.
export const LOWEST_TIER = 'unsuccessful';

export const TIERS = [
  { threshold: 11, name: 'excellent' },
  { threshold: 8, name: 'favourable' },
  { threshold: 5, name: 'tepid' },
  { threshold: 0, name: LOWEST_TIER },
] as const;

export type TierName = (typeof TIERS)[number]['name'];
```

`TierName` derives from `TIERS`, and `Scenario.consequences` is a `Record<TierName, string>`. A
scenario therefore supplies exactly four strings and cannot invent a fifth tier or move a boundary.
Adding a tier is a compile error in all four scenarios at once.

## Content: `src/data.ts` and `src/scenarios.ts`

`data.ts` holds the six characters and three skills; `scenarios.ts` holds the four scenarios,
transcribed from the rulebook. All are plain typed constants — nothing is fetched, and there is no
runtime validation. The `Scenario` type is the gate, so a malformed scenario is a compile error
rather than a startup throw.

The Archduke carries one modifier of each interesting kind:

`src/scenarios.ts` — `SCENARIOS`, the archduke entry

```ts
rulesOfCorrespondence: [
  {
    type: 'dice_bonus',
    attribute: 'heart',
    amount: 1,
    appliesTo: { characters: ['courtier', 'aristocrat'] },
    description: 'Courtiers and Aristocrats gain an extra Heart die in this scenario',
  },
  {
    type: 'dice_bonus',
    attribute: 'penmanship',
    amount: 1,
    description:
      'You are using a superior parchment in this missive. Gain an extra Penmanship die.',
  },
],
```

The first is character-gated, the second unconditional. The Art Dealer is where `reroll_highest`
appears.

What `tsc` cannot check lives in `tests/scenarios.test.ts` instead — the properties that are true of
the _values_, not the types: every ink pot holds at least `PARAGRAPHS_PER_LETTER` words, every
`dice_bonus` amount is a positive integer, every `appliesTo` names a real character id. The ink-pot
rule matters most: each word serves one paragraph, so a pot with fewer than five entries would
strand a player with no legal move on the last paragraph. Nothing in the type system says so. Note
also that `bun test` does not typecheck — `bun run check:ci` is what catches a malformed constant.

## The Setup screen: `src/screens/setup.ts`

Three choices — character, skill, scenario — each revealed only once the previous one is made, and
each rendered by the same `renderChoiceStep` function with a different noun. Selecting anything
rebuilds the entire screen.

The cards are `<button>` elements inside a `radiogroup`, which is a deliberate accessibility
decision rather than a styling one:

`src/screens/setup.ts` — `renderChoiceStep`, the roving tabindex

```ts
// Roving tabindex: the group is one tab stop, landing on the current choice
// or the first option when nothing is chosen yet.
const selectedIndex = opts.items.findIndex((i) => i.id === opts.selectedId);
const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;
// ...
card.setAttribute('role', 'radio');
card.setAttribute('aria-checked', String(selected));
card.tabIndex = index === tabbableIndex ? 0 : -1;
```

Picking a character is one choice of six, not six independent toggles, so the group is one tab stop
and the arrow keys move within it. Card content is phrasing content only (`<span>`, never `<h3>` or
`<p>`) because `<button>`'s content model forbids the rest. The accessible name comes from the title
span via `aria-labelledby`, with the blurb and attribute pips as `aria-describedby`; an `aria-label`
would replace the subtree name and hide the attribute ratings the whole choice is based on.

The keyboard handler ends with the detail that ties the screen together:

`src/screens/setup.ts` — `renderChoiceStep`, the `keydown` tail

```ts
event.preventDefault();
// The radio pattern selects as it moves; `onSelect` re-renders, and
// `renderSetup` restores focus to the card that was chosen.
const target = opts.items[to];
if (target) opts.onSelect(target);
```

The radio pattern _selects as it moves_, so an arrow key calls `onSelect`, which re-renders the
whole screen and destroys the focused element. `renderSetup` compensates by recording
`focusAfterRender` before re-rendering and restoring focus by element id afterwards. Without that,
every arrow press would drop focus to `<body>`.

When all three are chosen, a Begin button calls `ctx.onBegin`, which reaches `main.ts`'s
`newSession` — a fresh uuid, an ISO timestamp, no paragraphs, `status: 'in_progress'` — and through
`commit` becomes the first durable write.

## The paragraph machine: `src/paragraph.ts`

This module is the spine of the play loop, and the only part of it with tests. A paragraph runs
through seven phases. Rather than a phase-to-phase table, the transitions are keyed by _event_,
because each event carries the data its transition records.

`src/paragraph.ts` — `DraftEvent`

```ts
export type DraftEvent =
  | { type: 'pickWord'; inkPotIndex: number }
  | { type: 'attemptFlourish' }
  | { type: 'writePlainly' }
  | { type: 'rolled'; attribute: Attribute; dice: number[] }
  | { type: 'finishParagraph' };
```

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

    case 'rolled':
      switch (event.attribute) {
        case 'heart':
          if (draft.phase !== 'ROLL_HEART') return draft;
          return { ...draft, heartRoll: event.dice, phase: 'ROLL_LANGUAGE' };
        case 'language':
          if (draft.phase !== 'ROLL_LANGUAGE') return draft;
          return { ...draft, languageRoll: event.dice, phase: 'WRITE' };
        case 'penmanship':
          if (draft.phase !== 'ROLL_PENMANSHIP') return draft;
          return { ...draft, penmanshipRoll: event.dice, phase: 'PARAGRAPH_DONE' };
      }
  }
}
```

Two things to read off this. **Heart and Language resolve before writing; Penmanship after** — you
learn which word you must use before you compose, and how well you wrote it only once you have. And
**`DECIDE_FLOURISH` is the only branching phase**: `attemptFlourish` goes through `ROLL_HEART`,
`writePlainly` skips it and blanks any adjective already typed.

Driving it through the flourish path. Transcript:

```text
(initial)                  → PICK_WORD
pickWord                   → DECIDE_FLOURISH
attemptFlourish            → ROLL_HEART
rolled:heart               → ROLL_LANGUAGE
rolled:language            → WRITE
finishParagraph            → ROLL_PENMANSHIP
rolled:penmanship          → PARAGRAPH_DONE
```

Every case guards on the current phase and returns the draft **unchanged** when the event does not
belong to it. The UI never offers a wrong-phase event, so this is defence in depth — and silently
ignoring is safer than throwing inside a click handler. Transcript:

```text
rolling Language from PICK_WORD returns the same object: true
an incomplete draft refuses to become a Paragraph:       null
```

`advance` never mutates — every transition spreads into a new object, which is what makes that
identity check meaningful.

The conversion from working state to permanent record has one home:

`src/paragraph.ts` — `draftToParagraph`

```ts
// The single Draft -> Paragraph mapping. The done step needs a Paragraph twice —
// once to preview the points, once to commit the record — and a second copy of
// this mapping would let the previewed score drift from the recorded one.
export function draftToParagraph(d: Draft): Paragraph | null {
  if (
    d.inkPotIndex === null ||
    d.languageRoll === null ||
    d.penmanshipRoll === null
  )
    return null;
  return {
    inkPotIndex: d.inkPotIndex,
    flourishAdjective: d.flourishAdjective.trim() ? d.flourishAdjective : null,
    // ... the remaining fields copy across unchanged ...
  };
}
```

`text` is deliberately _not_ required. An empty paragraph is committable and renders as
`(empty paragraph)` downstream — in the letter, in the Score screen and in the export. That is a
decision, not an oversight: refusing to advance because a text box is empty would trap a player
mid-letter.

Committing is what ends the letter:

`src/paragraph.ts` — `commitParagraph`

```ts
/** Appending the fifth paragraph is the only route to the Score screen. */
export function commitParagraph(session: GameSession, para: Paragraph): GameSession {
  const paragraphs = [...session.paragraphs, para];
  return {
    ...session,
    paragraphs,
    skillSpent: session.skillSpent || para.skillUsedHere !== null,
    status:
      paragraphs.length >= PARAGRAPHS_PER_LETTER ? 'finished' : 'in_progress',
  };
}
```

Two latches in four lines. `skillSpent` is sticky — once true it stays true for the letter. And
`status` flips to `'finished'` on the fifth paragraph, which is the _only_ way the Score screen is
ever reached.

## Dice: `src/dice.ts`

Small and entirely pure. `diceForRating` maps poor/average/good to 1/2/3 dice; `roll(n, rng =
Math.random)` takes an injectable RNG so tests are deterministic. The rule everything else asks
about:

`src/dice.ts` — `succeeded`

```ts
/** The rulebook's one success rule: a roll succeeds if any die shows 5 or 6.
 *  Accepts null because a roll that never happened did not succeed — which is
 *  what the Heart roll is when the player writes plainly. */
export function succeeded(dice: number[] | null): boolean {
  return dice !== null && countSuccesses(dice) > 0;
}
```

Accepting `null` is what lets the rest of the codebase stop special-casing the skipped Heart roll:
"did not happen" and "happened and failed" score the same, so one predicate serves both.

## Rules of Correspondence: `src/rules.ts`

`planRoll` answers "how many dice, and with what policy" before any die is thrown.

`src/rules.ts` — `planRoll`, the modifier loop

```ts
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
    default: {
      // Compile-time exhaustiveness: TS errors if a new Modifier variant is added.
      const _exhaustive: never = mod;
      throw new Error(`Unhandled modifier: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

if (skillBonusActive) diceCount += 1;
```

The `default` branch is doubly guarded: `const _exhaustive: never = mod` makes adding a `Modifier`
variant without handling it a compile error, and the `throw` catches a payload that somehow reached
here at runtime. Neither is reachable today; both are cheap.

Concretely, on The Archduke — which grants Heart to courtiers and aristocrats only, and Penmanship
to everyone. Transcript:

```text
character      attribute   rating    dice
The Courtier    heart        good      4
The Courtier    penmanship   poor      2
The Monk        heart        poor      1
The Monk        penmanship   good      4
```

The Courtier's good Heart (3) picks up the gated bonus for 4; the Monk's poor Heart (1) does not.
Both collect the unconditional Penmanship die.

The other modifier kind is carried out separately, and it is a trap rather than a gift:

`src/rules.ts` — `applyReroll`

```ts
/** Carries out the policy `planRoll` requests. The highest die is replaced
 *  unconditionally — including when it was already a success — which is what
 *  makes `reroll_highest` a hazard rather than a bonus. */
export function applyReroll(
  dice: number[],
  policy: RollPlan['rerollPolicy'],
  rng?: () => number,
): number[] {
  if (policy !== 'highest' || dice.length === 0) return dice;
  const i = dice.indexOf(Math.max(...dice));
  const replacement = roll(1, rng)[0] ?? 1;
  return [...dice.slice(0, i), replacement, ...dice.slice(i + 1)];
}
```

`planRoll` sets the flag; `applyReroll` acts on it. On The Art Dealer, where this rule lives,
rolling well on Penmanship means losing your best die. It lives here rather than in a click handler
so it can be tested without a DOM.

## The Play screen: `src/screens/play.ts`

The largest module, and the one with no tests. It owns the in-progress draft in a closure and
repaints its own subtree.

`src/screens/play.ts` — `PlayView`

```ts
/** What the render functions below actually need: the context plus the state
 *  this invocation owns. `state` is one shared object so a handler that fires
 *  after a repaint — the roll button's shake timer — reads the current draft
 *  rather than a copy captured when its button was built. */
interface PlayView extends PlayCtx {
  state: { draft: Draft; recallOpen: boolean };
  repaint: () => void;
}
```

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

  repaint();
  return root;
}
```

`v.state` being **one shared object** rather than a copy is the subtle part, and the roll button is
why. Every render function receives the same `v`, so a handler that fires _after_ a repaint reads
the draft as it is at that moment, not as it was when the handler was built.

Note what is absent: no session-change detection, no reset. A new letter means `main.ts` builds a
fresh `renderPlay`, which means a fresh `emptyDraft()`.

Everything the player can do next comes from one switch on the phase:

`src/screens/play.ts` — `renderMarginaliaStepCard`, the phase dispatch

```ts
switch (v.state.draft.phase) {
  case 'PICK_WORD': {
    // ... an instruction paragraph ...
    break;
  }
  case 'DECIDE_FLOURISH':
    card.appendChild(renderStepFlourish(v));
    break;
  case 'ROLL_HEART':
    card.appendChild(renderRollHeartStep(v));
    break;
  case 'ROLL_LANGUAGE':
    card.appendChild(renderRollLanguageStep(v));
    break;
  case 'WRITE':
    break;
  case 'ROLL_PENMANSHIP':
    card.appendChild(renderRollPenmanshipStep(v));
    break;
  case 'PARAGRAPH_DONE':
    card.appendChild(renderStepDone(v));
    break;
}
```

`WRITE` is the empty case — during writing the margin holds only the stepper, because the controls
live in the letter itself. A second switch on the same phase, in `renderLetterDraftSlot`, decides
what the letter body shows: placeholder prose for the pre-writing phases, the textarea for `WRITE`,
and the committed-looking paragraph for the two after it. **Neither switch has a `default`**, and
neither is exhaustiveness-checked — the subject of
[#75](https://github.com/philoserf/quill/issues/75).

The three roll steps are one function with different nouns:

`src/screens/play.ts` — `renderRollStep`, the plan

```ts
const skillAvailable = skillAvailableFor(v, attr);
const skillBonusActive = skillAvailable && v.state.draft.skillUsedHere === attr;
const plan = planRoll({
  attribute: attr,
  character: v.character,
  scenario: v.scenario,
  skillBonusActive,
});
```

The skill splits into two questions on purpose. `skillAvailableFor` asks whether this skill _could_
apply — right attribute, not yet spent for the letter. `skillBonusActive` asks whether the player
has already pressed the button for _this_ paragraph. Only the second feeds `planRoll`; the first
decides whether to offer the button at all.

Pressing it sets `v.state.draft.skillUsedHere = attr` and repaints — and that repaint is exactly the
hazard the next function exists to handle:

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

Trace the race. You press _Roll the dice_; the button shakes for 250ms. The timer's callback closes
over `plan` — the dice count computed when this button was _built_. If a repaint happens during
those 250ms, this button is detached and a new one exists with a fresh plan. Firing the stale
callback would roll the wrong number of dice. `btn.isConnected` catches exactly that, and the
`v.state` sharing above is what makes the _new_ button's plan correct.

The roll itself is one line, and it is where `rules.ts` rejoins:

`src/screens/play.ts` — `renderRollStep`, the roll

```ts
attachRollButton(rollBtn, () => {
  onRolled(applyReroll(roll(plan.diceCount), plan.rerollPolicy));
  v.repaint();
});
```

Plan, roll, apply the reroll policy, hand the dice to `advance` via the caller's `onRolled`,
repaint. Each of the three callers supplies its attribute, its prose, and a verdict element
reporting the _previous_ roll — so the Language step shows whether the flourish held, and the
Penmanship step shows whether the word came out superior.

Once Language has resolved, the required word is known and the textarea appears:

`src/screens/play.ts` — `renderWriteSlot`, the required word

```ts
const word = succeeded(v.state.draft.languageRoll)
  ? pair.superior
  : pair.inferior;
const flourishApplied = succeeded(v.state.draft.heartRoll);
const required =
  flourishApplied && v.state.draft.flourishAdjective
    ? `${v.state.draft.flourishAdjective} ${word}`
    : word;
const requiredLower = required.toLowerCase();
```

A successful Language roll earns the superior word; a failed one leaves the inferior. A flourish
that held prefixes its adjective. The indicator below the textarea does a case-insensitive
`includes` against this string and updates on every keystroke — but nothing _enforces_ it. You can
finish a paragraph without using the word at all; the check is a nudge, not a gate, and the scoring
never consults it.

Committing ends the closure's life:

`src/screens/play.ts` — `renderStepDone`, the commit handler

```ts
const newPara = draftToParagraph(v.state.draft);
if (!newPara) return;
// Committing replaces the whole screen with a fresh renderPlay, discarding
// this closure and its draft — there is no reset to sequence.
v.onCommit(newPara);
```

One control deliberately does _not_ repaint:

`src/screens/play.ts` — `renderMarginaliaReferenceCard`, the recall toggle

```ts
// Toggling is purely local UI — flip the panel in place rather than
// v.repaint(), which would rebuild the play subtree and destroy e.g. a
// mid-shake roll button.
const panel = renderScenarioDetail(v.scenario, {
  className: 'recall-panel',
  headingClass: 'small-caps',
});
panel.hidden = !v.state.recallOpen;
card.appendChild(panel);
toggle.addEventListener('click', () => {
  v.state.recallOpen = !v.state.recallOpen;
  panel.hidden = !v.state.recallOpen;
  toggle.textContent = v.state.recallOpen
    ? 'Hide the scenario…'
    : 'Recall the scenario…';
});
```

Calling `v.repaint()` here would rebuild the play subtree — and, per the shake timer above, could
detach a roll button mid-shake and silently cancel a roll the player had already committed to.

## Scoring: `src/scoring.ts`

The whole rulebook's arithmetic, in one function:

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

The full matrix, every combination. Transcript:

```text
flourish   word        hand      points
held       superior    fine      3
held       superior    plain     2
held       inferior    fine      0
held       inferior    plain     -1
lost       superior    fine      2
lost       superior    plain     1
lost       inferior    fine      1
lost       inferior    plain     0
none       superior    fine      2
none       superior    plain     1
none       inferior    fine      1
none       inferior    plain     0
```

Read the two halves against each other and the risk becomes visible. A flourish that **held** on a
superior word is worth +2 against the plain +1 — but a flourish that held on an _inferior_ word is
**-1**, worse than not trying. A flourish that was **lost** scores exactly as if you had never
attempted it.

So attempting a flourish is a bet placed before you know the Language result, and that ordering is
precisely what `advance` enforces: `DECIDE_FLOURISH` comes before `ROLL_LANGUAGE`, so the player can
never see the word's quality first. The seven-phase order is not presentation — it is the game.

Penmanship is a flat +1 and caps there regardless of how many dice succeed.

`tierFor` walks `TIERS` high to low and returns the first threshold the total clears; the
`LOWEST_TIER` fallback at the end is unreachable for any total the game can produce, since the last
threshold is `0` and only a negative total falls through.

## The Score screen and export

`renderScore` is a straight-line render: a seal with the total, the tier sentence, the scenario's
consequence prose, the finished letter, and a paragraph-by-paragraph breakdown table. The download
is the one piece with a hazard in it:

`src/screens/score.ts` — the download handler

```ts
const blob = new Blob([md], { type: 'text/markdown' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `quill-${d}-${ctx.scenario.id}.md`;
document.body.appendChild(a);
a.click();
a.remove();
// The blob fetch is scheduled after the current task, so revoking inline
// races it — Safari and older Firefox have produced cancelled or zero-byte
// downloads. One turn of the event loop is enough.
setTimeout(() => URL.revokeObjectURL(url), 0);
```

`toMarkdown` builds YAML frontmatter, the letter body, and a game-record table. Both escaping
helpers exist because player text reaches the output unfiltered:

`src/export.ts` — `escapeCell`

```ts
/** Player text reaches the game-record table unmodified, and the flourish input
 *  has no pattern or sanitisation. A literal pipe adds a cell; a pasted newline
 *  splits the row and terminates the table early. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
```

`yamlScalar` does the same job for the frontmatter, where an unquoted scenario title carrying a
colon would write an invalid document. None of the four bundled titles do, so that one is for the
next scenario.

The table row is also where a rule from the Play screen has to be repeated:

`src/export.ts` — `paragraphRow`

```ts
// Only a flourish that held is reported — an attempt whose Heart roll failed
// earns nothing and is not shown, matching the play screen's done summary.
const flourish =
  succeeded(p.heartRoll) && p.flourishAdjective
    ? escapeCell(p.flourishAdjective)
    : EMDASH;
```

End to end, a complete five-paragraph session through the exporter. Transcript:

```text
---
date: 2026-09-16
character: The Poet
skill: Inspiration
scenario: "The Archduke"
score: 6
consequence: tepid
---

Your Grace, word of her passing reached me on Tuesday.

We were children then, scaling oaks behind the school.

I think often of the town and its quiet streets.

She spoke of the cathedral as though she had built it.

(empty paragraph)

---

## Game record

| # | Word | Flourish | Heart | Language | Penmanship | Points |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Passing (superior) | solemn | 6 | 6 | 6 | 3 |
| 2 | Scaling Oaks (superior) | — | 2 | 6 | 2 | 1 |
| 3 | Town (inferior) | — | — | 2 | 6 | 1 |
| 4 | Church (inferior) | solemn | 6 | 2 | 2 | -1 |
| 5 | Seraphim (superior) | — | — | 6 | 6 | 2 |

**Total**: 6 / tepid

> The Archduke responds kindly, but is quick to criticise your letter. You will unlikely hear from him for some months.
```

Everything in this walkthrough is visible in that output. Paragraph 1 flourished a superior word
with a fine hand for the maximum 3. Paragraph 4 flourished an _inferior_ word and lost a point for
it. Paragraph 3 never attempted a flourish, so its Heart column is an em-dash rather than a failed
roll. Paragraph 5 has no text and exports as `(empty paragraph)`. The total, 6, lands in `tepid`,
and the scenario's `tepid` string is quoted at the bottom.

## What the tests cover

Eight test files and a helper, all against the pure game layer. Transcript of `bun test`:

```text
bun test v1.4.2 (744846f84)

 82 pass
 0 fail
 141 expect() calls
Ran 82 tests across 8 files.
```

`tests/paragraph.test.ts` is the one the play loop depends on most. Its cases pin ordering (the
flourish path runs in order; the plain path skips `ROLL_HEART`), refusal (an event from the wrong
phase leaves the draft untouched), immutability (`advance` does not mutate; `commitParagraph` leaves
its session untouched), and the two committing latches (the letter finishes on the last paragraph
and not before; spending the skill latches for the rest of the letter).

`tests/helpers.ts` supplies a `scenarioFixture` of don't-cares only, with a comment insisting that
anything a test asserts on be passed as an override, so the assertion and the value it reads stay in
the same file.

The gap is deliberate and worth stating plainly: **the three screens have no tests**. `renderSetup`,
`renderPlay` and `renderScore` are verified by the README's six-step manual smoke test and by
browser checks recorded in commit messages.

## Where the linear order broke down

Three places where following the call chain meant holding two things at once.

**The phase dispatch has three homes.** `advance` in `paragraph.ts` owns the transitions;
`renderMarginaliaStepCard` switches on the phase to pick a margin card; `renderLetterDraftSlot`
switches on the same phase to pick what the letter body shows. Explaining a single phase means
visiting all three, in two files. `STEP_INDEX` is a fourth mapping, though it is honest about being
presentation.

**Persisting and repainting run on separate channels.** Nothing in `store.ts` notifies anything;
`main.ts` calls `render()` by hand after a write. This is documented and intentional, but it means
"what is on screen" and "what is on disk" have to be tracked as two separate questions throughout
the Play screen — the draft exists only in the first.

**The roll button's 250ms timer could not be explained in order.** Understanding `attachRollButton`
requires already knowing that `v.state` is shared, that spending the skill repaints, and that the
recall toggle deliberately does not. Those are three facts from three different parts of the file,
and the shake timer is the only thing that makes the difference between them matter.

Beyond those: the five `internalError(...)` guards in `play.ts`, the `?? 1` fallback in
`applyReroll`, the `LOWEST_TIER` fallback in `tierFor`, and the `default: never` branch in
`planRoll` are all branches for which no input can be constructed through the UI. Each is commented
as deliberate, and several are pinned by tests. They are noted here so a reader does not spend time
looking for the path that reaches them.

## Index

**This pass filed no new findings.** The source is unchanged since the previous walkthrough was
written against it, and every claim in that document still held — so there was no stale prose to
file, and the structural observations above were already recorded. Manufacturing an entry to fill
the table would be worse than leaving it empty.

**Related existing findings.** Four open issues touch code this walkthrough covers. They belong to
earlier passes and are counted there, not here.

| Issue                                               | Source             | Where it appears above           |
| --------------------------------------------------- | ------------------ | -------------------------------- |
| [#75](https://github.com/philoserf/quill/issues/75) | `code-walkthrough` | The Play screen's phase switches |
| [#76](https://github.com/philoserf/quill/issues/76) | `code-walkthrough` | The mount `try`/`catch`          |
| [#78](https://github.com/philoserf/quill/issues/78) | `code-theory`      | `isSession` and `paragraphs`     |
| [#79](https://github.com/philoserf/quill/issues/79) | `code-theory`      | `Paragraph.inkPotIndex`          |
