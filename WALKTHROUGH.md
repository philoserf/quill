# Quill Walkthrough

*2026-09-16T12:44:51Z by Showboat 0.6.1*
<!-- showboat-id: 1f6947db-5b0d-487b-9f36-dd7d50456892 -->

## Overview

Quill is a browser implementation of Scott Malthouse's solo letter-writing
roleplaying game. You choose a character, a skill and a scenario, then write a
five-paragraph letter. The dice never decide what the letter says — they decide
which words you are *obliged* to write with, and afterwards they score what you
wrote.

There is no framework and no runtime dependency. Bun is the runtime, bundler,
test runner and dev server; TypeScript runs strict with `noUncheckedIndexedAccess`
and `exactOptionalPropertyTypes`; Biome formats and lints. The shipped artefact is
one bundled module and a stylesheet, served as static files from GitHub Pages.

```bash
sed -n '/"scripts"/,/^  },/p' package.json
```

```output
  "scripts": {
    "dev": "bun ./public/index.html",
    "build": "bun build ./public/index.html --outdir dist && cp public/CNAME dist/CNAME",
    "test": "bun test",
    "check": "biome check --write .",
    "check:ci": "biome check . && tsc --noEmit && bun test",
    "format": "biome format --write .",
    "prepare": "simple-git-hooks"
  },
```

`check:ci` is the whole gate — lint, typecheck, tests — and a `simple-git-hooks`
pre-push hook runs it before every push. Note what it does *not* include:
`bun run build`. Nothing local ever runs the bundler, so a broken reference in
`public/index.html` passes every check on your machine and fails in CI. The
workflow covers both directions: on a pull request an explicit *Verify the
bundle builds* step, and on a push to `main` the `build` job that gates the
deploy.

This walkthrough follows first-run execution order: page load, boot and
hydration, persistence, the domain types, the content constants, the Setup
screen, the paragraph machine, the dice and rules that feed it, the Play screen
that drives it, then scoring and export.

## Architecture

Every module and what it imports, in dependency order:

```bash
for f in src/types.ts src/dice.ts src/data.ts src/scenarios.ts src/rules.ts src/paragraph.ts src/scoring.ts src/export.ts src/store.ts src/screens/fragments.ts src/screens/setup.ts src/screens/play.ts src/screens/score.ts src/main.ts; do
  deps=$(grep -o "from '[^']*'" "$f" | sed "s/from '//;s/'$//" | sort -u | paste -sd' ' -)
  printf '%-22s %s\n' "${f#src/}" "${deps:-—}"
done
```

```output
types.ts               —
dice.ts                ./types
data.ts                ./types
scenarios.ts           ./types
rules.ts               ./dice ./types
paragraph.ts           ./types
scoring.ts             ./dice ./types
export.ts              ./dice ./paragraph ./scoring ./types
store.ts               ./types
screens/fragments.ts   ../types
screens/setup.ts       ../data ../dice ../types ./fragments
screens/play.ts        ../dice ../paragraph ../rules ../scoring ../types ./fragments
screens/score.ts       ../dice ../export ../paragraph ../scoring ../types ./fragments
main.ts                ./data ./paragraph ./scenarios ./screens/play ./screens/score ./screens/setup ./store ./types
```

Three things that table settles.

**The graph is acyclic and shallow.** `types.ts` imports nothing and everything
imports it. No module imports a screen except `main.ts`, and no screen imports
another screen except through `fragments.ts`, the shared-DOM-fragment module.

**`store.ts` has exactly one consumer.** No screen imports it. Persistence is
`main.ts`'s business alone, and the screens cannot write to `localStorage` even
by accident.

**The game layer never touches the DOM.** `dice`, `rules`, `paragraph`,
`scoring` and `export` are pure functions over plain data. That is what lets
`tests/` cover the rules with no DOM stub of any kind — and it is also the
dividing line for what *is* tested, since the screens have no tests at all.

## Entry point: `public/index.html`

Bun's bundler takes the HTML file as its entry, follows the `<script>` and
`<link>` tags, and emits only what it can reach from here.

```bash
cat public/index.html
```

```output
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quill</title>
    <link rel="stylesheet" href="./styles.css" />
    <link
      href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="../src/main.ts"></script>
  </body>
</html>
```

`<main id="app">` is the entire application surface; everything else is built by
`document.createElement`. Two details are load-bearing and easy to break:

- **`public/CNAME` is unreachable from this file**, so the bundler does not copy
  it. The `build` script copies it by hand — that `cp` is what keeps
  `quill.philoserf.com` bound across deploys.
- **There is no analytics snippet here on purpose.** Cloudflare injects the Web
  Analytics beacon at the edge; a second copy in this file would double-count
  every page view.

## Boot: `src/main.ts`

`main.ts` is a closure holding one mutable `session` and two functions that act
on it. Before either runs, the persisted session has to be proved usable.

```bash
sed -n '/^function hydrate/,/^}/p' src/main.ts
```

```output
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

This runs **once**, at mount. The comment above it gives the reason: characters,
skills and scenarios are compile-time constants, so the set of valid ids is
fixed for the life of the page. A session that resolves at mount cannot stop
resolving later, which keeps the `clear()` recovery write out of the render path.

The two channels that follow are the single most important thing to understand
about this app.

```bash
sed -n '/^  \/\/ Persisting and repainting/,/^  }$/p' src/main.ts
```

```output
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

`commit` writes *and* repaints. Everything else repaints without writing. The
store notifies nobody — there is no subscription, no observer, no reactivity —
so `commit` calling `render()` itself is the only thing connecting a write to
the screen. The practical consequence: **an in-progress paragraph is not
durable**. Reloading mid-paragraph restores the letter up to the last committed
paragraph and discards the draft. That is a deliberate choice, and the Play
screen section below shows how it is enforced.

`save` returns a boolean rather than throwing, so a browser that refuses the
write degrades to one console warning instead of a dead app — and
`warnedAboutSaving` keeps it to one.

`render()` then picks a screen from two facts: whether there is a session, and
`session.status`. `null` → Setup, `'in_progress'` → Play, `'finished'` → Score.
It also re-resolves the scenario, character and skill so the screens receive
values rather than ids, and throws if any is missing.

The mount itself is wrapped so that an unrecoverable state offers a way out:

```bash
sed -n '/^try {/,$p' src/main.ts
```

```output
try {
  mount(SCENARIOS);
} catch (err) {
  // Any unrecoverable state gets a way out rather than a dead-end string.
  const root = document.getElementById('app');
  if (root) {
    root.replaceChildren();
    const msg = document.createElement('p');
    msg.textContent = `Quill could not open this letter: ${(err as Error).message}`;
    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'btn btn--primary';
    restart.textContent = 'Start a new letter';
    restart.addEventListener('click', () => {
      clear();
      location.reload();
    });
    root.append(msg, restart);
  }
  throw err;
}
```

Worth being precise about the reach of this handler, because the code reads
wider than it is. `mount()` calls `render()` once before returning, so that
first render is covered. Every later render is triggered by `commit()` from
inside a click handler, which is outside this `try` — a throw there would be an
unhandled exception with no recovery button. In practice nothing can throw
(the ids were proved at mount and the data is constant), so this is a shape
worth knowing rather than a bug to fix.

## Persistence: `src/store.ts`

Three functions over `GameSession | null`, under the key `quill.session.v1`.

```bash
sed -n '/^export function load/,/^}/p' src/store.ts
```

```output
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

Read it inside out. `storage()` — not shown — wraps even the *access* to
`globalThis.localStorage` in a try/catch, because a browser with site data
blocked throws `SecurityError` on the property read, not just on `getItem`.
`unwrap()` peels the legacy `{ session }` envelope that v1 wrote. Then the shape
check:

```bash
sed -n '/^function isSession/,/^}$/p' src/store.ts
```

```output
function isSession(v: unknown): v is GameSession {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.startedAt === 'string' &&
    typeof s.characterId === 'string' &&
    typeof s.skillId === 'string' &&
    typeof s.scenarioId === 'string' &&
    typeof s.skillSpent === 'boolean' &&
    Array.isArray(s.paragraphs) &&
    (s.status === 'in_progress' || s.status === 'finished')
  );
}
```

This checks exactly what the render path dereferences and no more. `paragraphs`
is only tested for `Array.isArray` — its *contents* are not validated, which is
the boundary of what this guard promises.

A payload that fails the check is not deleted:

```bash
sed -n '/^function quarantine/,/^}$/p' src/store.ts
```

```output
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

The three outcomes, driven against a stubbed `localStorage`:

```bash
bun -e "
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
const { load } = await import('./src/store');
const good = '{\"session\":{\"id\":\"a\",\"startedAt\":\"x\",\"characterId\":\"poet\",\"skillId\":\"inspiration\",\"scenarioId\":\"archduke\",\"skillSpent\":false,\"paragraphs\":[],\"status\":\"in_progress\"}}';
for (const [label, raw] of [['legacy envelope', good], ['wrong shape', '{\"id\":\"b\",\"status\":\"halfway\"}'], ['not JSON', 'nonsense']]) {
  mem.clear(); mem.set('quill.session.v1', raw);
  const got = load();
  console.log(label.padEnd(16), '→', (got ? 'session ' + got.id : 'null').padEnd(10), '| live key:', String(mem.has('quill.session.v1')).padEnd(5), '| quarantined:', mem.has('quill.session.v1.corrupt'));
}
"
```

```output
legacy envelope  → session a  | live key: true  | quarantined: false
wrong shape      → null       | live key: false | quarantined: true
not JSON         → null       | live key: false | quarantined: true
```

The legacy envelope unwraps silently. Both failures return `null` — so the
player lands on Setup rather than a crash — while the original bytes move to
`quill.session.v1.corrupt`, where a determined player could still recover the
text of a letter. `quarantine` never overwrites an existing backup, on the
theory that the first letter lost is the one most worth keeping.

## The domain model: `src/types.ts`

The scenario modifiers are a discriminated union, and the discriminant is what
`rules.ts` switches on:

```bash
sed -n '/^export type Modifier/,/^    };$/p' src/types.ts
```

```output
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

`appliesTo` is optional and gates the bonus on character id — absent means it
applies to everyone. `reroll_highest` carries no amount because it is a policy,
not a quantity.

Now the record a finished paragraph leaves behind:

```bash
sed -n '/^export interface Paragraph/,/^}$/p' src/types.ts
```

```output
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

The nullability here is the paragraph machine's postcondition written into the
type. `heartRoll` is nullable because the Heart roll only happens if the player
attempts a flourish. `languageRoll` and `penmanshipRoll` are **not** nullable:
there is no path to a committed paragraph that skips them. Compare this with
`Draft` in the next section, where all three are nullable — the difference
between the two types *is* the guarantee that committing provides.

Finally, the score table:

```bash
sed -n '/^\/\/ Ordered high to low/,/^export type TierName/p' src/types.ts
```

```output
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

`TierName` derives from `TIERS`, and `Scenario.consequences` is a
`Record<TierName, string>`. A scenario therefore supplies exactly four strings
and cannot invent a fifth tier or move a boundary. Adding a tier here is a
compile error in all four scenarios at once, which is the intended pressure.

## Content: `src/data.ts` and `src/scenarios.ts`

`data.ts` holds the six characters and three skills; `scenarios.ts` holds the
four scenarios, transcribed from the rulebook. All are plain typed constants —
nothing is fetched, and there is no runtime validation. The `Scenario` type is
the gate, so a malformed scenario is a compile error rather than a startup throw.

The Archduke carries one modifier of each interesting kind:

```bash
sed -n "/    id: 'archduke',/,/^    inkPot: \[/p" src/scenarios.ts | sed -n '/rulesOfCorrespondence/,$p' | sed '$d'
```

```output
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

The first is character-gated, the second unconditional. Both are `dice_bonus`;
The Art Dealer is where `reroll_highest` appears.

What `tsc` cannot check lives in the tests instead — the properties that are
true of the *values*, not the types:

```bash
grep -n "  test('" tests/scenarios.test.ts
```

```output
11:  test('contains exactly the four rulebook scenarios', () => {
16:  test('ids are unique', () => {
20:  test('every ink pot holds at least one word per paragraph', () => {
30:  test('every dice_bonus amount is a positive integer', () => {
40:  test('every appliesTo names a real character id', () => {
55:  test('every scenario carries prose in all four tiers and a profile', () => {
```

The ink-pot rule matters most: each word serves one paragraph, so a pot holding
fewer than `PARAGRAPHS_PER_LETTER` entries would strand a player with no legal
move on the last paragraph. Nothing in the type system says so. Note also that
`bun test` alone does not typecheck — `bun run check:ci` is what catches a
malformed constant.

## The Setup screen: `src/screens/setup.ts`

Three choices — character, skill, scenario — each revealed only once the
previous one is made, and each rendered by the same `renderChoiceStep` function
with a different noun. Selecting anything rebuilds the entire screen.

The cards are `<button>` elements inside a `radiogroup`, which is a deliberate
accessibility decision rather than a styling one:

```bash
sed -n '/^  \/\/ Roving tabindex/,/^    card.tabIndex/p' src/screens/setup.ts
```

```output
  // Roving tabindex: the group is one tab stop, landing on the current choice
  // or the first option when nothing is chosen yet.
  const selectedIndex = opts.items.findIndex((i) => i.id === opts.selectedId);
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const cards: HTMLButtonElement[] = [];
  opts.items.forEach((item, index) => {
    const selected = opts.selectedId === item.id;
    const card = document.createElement('button');
    card.type = 'button';
    card.id = cardId(opts.kind, item.id);
    card.className = `card${selected ? ' card--selected' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(selected));
    card.tabIndex = index === tabbableIndex ? 0 : -1;
```

Picking a character is one choice of six, not six independent toggles, so the
group is one tab stop and the arrow keys move within it. `card.tabIndex` is `0`
on the current choice and `-1` on the rest — the roving tabindex pattern.

Card content is phrasing content only (`<span>`, never `<h3>` or `<p>`) because
`<button>`'s content model forbids the rest. The accessible name comes from the
title span via `aria-labelledby`, with the blurb and attribute pips as
`aria-describedby`; an `aria-label` would replace the subtree name and hide the
attribute ratings the whole choice is based on.

The keyboard handler ends with the detail that ties the screen together:

```bash
sed -n '/^    event.preventDefault/,/^  });$/p' src/screens/setup.ts
```

```output
    event.preventDefault();
    // The radio pattern selects as it moves; `onSelect` re-renders, and
    // `renderSetup` restores focus to the card that was chosen.
    const target = opts.items[to];
    if (target) opts.onSelect(target);
  });
```

The radio pattern *selects as it moves*, so an arrow key calls `onSelect`, which
re-renders the whole screen and destroys the focused element. `renderSetup`
compensates by recording `focusAfterRender` before re-rendering and restoring
focus by element id afterwards. Without that, every arrow press would drop focus
to `<body>`.

When all three are chosen, a Begin button calls `ctx.onBegin`, which reaches
`main.ts`'s `newSession` — a fresh uuid, an ISO timestamp, no paragraphs,
`status: 'in_progress'` — and through `commit` becomes the first durable write.

## The paragraph machine: `src/paragraph.ts`

This module is the spine of the play loop, and the only part of it with tests.
A paragraph runs through seven phases. Rather than a phase-to-phase table, the
transitions are keyed by *event*, because each event carries the data its
transition records:

```bash
sed -n '/^export type DraftEvent/,/^  | { type: .finishParagraph/p' src/paragraph.ts
```

```output
export type DraftEvent =
  | { type: 'pickWord'; inkPotIndex: number }
  | { type: 'attemptFlourish' }
  | { type: 'writePlainly' }
  | { type: 'rolled'; attribute: Attribute; dice: number[] }
  | { type: 'finishParagraph' };
```

```bash
sed -n '/^export function advance/,/^}$/p' src/paragraph.ts
```

```output
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

Two things to read off this. **Heart and Language resolve before writing;
Penmanship after** — you learn which word you must use before you compose, and
how well you wrote it only once you have. And **`DECIDE_FLOURISH` is the only
branching phase**: `attemptFlourish` goes through `ROLL_HEART`, `writePlainly`
skips it and blanks any adjective already typed.

Driving it through the flourish path:

```bash
bun -e "
import { advance, emptyDraft } from './src/paragraph';
let d = emptyDraft();
console.log('(initial)'.padEnd(26), '→', d.phase);
for (const ev of [
  { type: 'pickWord', inkPotIndex: 1 },
  { type: 'attemptFlourish' },
  { type: 'rolled', attribute: 'heart', dice: [6] },
  { type: 'rolled', attribute: 'language', dice: [2, 5] },
  { type: 'finishParagraph' },
  { type: 'rolled', attribute: 'penmanship', dice: [3] },
]) { d = advance(d, ev); console.log((ev.type + (ev.attribute ? ':' + ev.attribute : '')).padEnd(26), '→', d.phase); }
"
```

```output
(initial)                  → PICK_WORD
pickWord                   → DECIDE_FLOURISH
attemptFlourish            → ROLL_HEART
rolled:heart               → ROLL_LANGUAGE
rolled:language            → WRITE
finishParagraph            → ROLL_PENMANSHIP
rolled:penmanship          → PARAGRAPH_DONE
```

Every case guards on the current phase and returns the draft **unchanged** when
the event does not belong to it. The UI never offers a wrong-phase event, so
this is defence in depth rather than a reachable path — and silently ignoring is
safer than throwing inside a click handler:

```bash
bun -e "
import { advance, emptyDraft, draftToParagraph } from './src/paragraph';
const d = emptyDraft();
const out = advance(d, { type: 'rolled', attribute: 'language', dice: [6] });
console.log('rolling Language from PICK_WORD returns the same object:', out === d);
console.log('an incomplete draft refuses to become a Paragraph:      ', draftToParagraph(d));
"
```

```output
rolling Language from PICK_WORD returns the same object: true
an incomplete draft refuses to become a Paragraph:       null
```

`advance` never mutates — every transition spreads into a new object, which is
what makes that identity check meaningful.

The conversion from working state to permanent record has one home:

```bash
sed -n '/^\/\/ The single Draft -> Paragraph mapping/,/^}$/p' src/paragraph.ts
```

```output
// The single Draft -> Paragraph mapping. The done step needs a Paragraph twice —
// once to preview the points, once to commit the record — and a second copy of
// this mapping would let the previewed score drift from the recorded one.
// Returns null when the draft is not yet complete enough to score. `text` is
// deliberately not required: an empty paragraph is committable and renders as
// a placeholder downstream (see the Score screen and the export).
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

The "once to preview, once to commit" comment names the reason it is a function
rather than two inline object literals: the Play screen's done-step shows you
your points for the paragraph and then records it, and a second copy of this
mapping would let the previewed score drift from the recorded one.

Note also that `text` is *not* required. An empty paragraph is committable and
renders as `(empty paragraph)` downstream — in the letter, in the Score screen
and in the export. That is a decision, not an oversight: the game is about the
dice ritual, and refusing to advance because a text box is empty would trap a
player mid-letter.

Committing is what ends the letter:

```bash
sed -n '/^\/\*\* Appending the fifth paragraph/,/^}$/p' src/paragraph.ts
```

```output
/** Appending the fifth paragraph is the only route to the Score screen. */
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

Two latches in four lines. `skillSpent` is sticky — once true it stays true for
the letter. And `status` flips to `'finished'` on the fifth paragraph, which is
the *only* way the Score screen is ever reached.

## Dice: `src/dice.ts`

Small and entirely pure. `diceForRating` maps poor/average/good to 1/2/3 dice; `roll(n, rng = Math.random)` takes an injectable RNG so tests are
deterministic. The rule everything else asks about:

```bash
sed -n '/^\/\*\* The rulebook.s one success rule/,/^}$/p' src/dice.ts
```

```output
/** The rulebook's one success rule: a roll succeeds if any die shows 5 or 6.
 *  Accepts null because a roll that never happened did not succeed — which is
 *  what the Heart roll is when the player writes plainly. */
export function succeeded(dice: number[] | null): boolean {
  return dice !== null && countSuccesses(dice) > 0;
}
```

Accepting `null` is what lets the rest of the codebase stop special-casing the
skipped Heart roll: "did not happen" and "happened and failed" score the same,
so one predicate serves both.

## Rules of Correspondence: `src/rules.ts`

`planRoll` answers "how many dice, and with what policy" before any die is
thrown:

```bash
sed -n '/^export function planRoll/,/^  let rerollPolicy/p' src/rules.ts
```

```output
export function planRoll(args: {
  attribute: Attribute;
  character: Character;
  scenario: Scenario;
  skillBonusActive: boolean;
}): RollPlan {
  const { attribute, character, scenario, skillBonusActive } = args;
  let diceCount = diceForRating(character.attributes[attribute]);
  let rerollPolicy: 'highest' | null = null;
```

```bash
sed -n '/^  for (const mod of scenario/,/^  if (skillBonusActive)/p' src/rules.ts
```

```output
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
        // Runtime safety: a payload that escaped validation (e.g., tampered session) still fails loudly.
        throw new Error(`Unhandled modifier: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  if (skillBonusActive) diceCount += 1;
```

The `default` branch is doubly guarded: `const _exhaustive: never = mod` makes
adding a `Modifier` variant without handling it a compile error, and the `throw`
catches a payload that somehow reached here at runtime. Neither is reachable
today; both are cheap.

Concretely, on The Archduke — which grants Heart to courtiers and aristocrats
only, and Penmanship to everyone:

```bash
bun -e "
import { SCENARIOS } from './src/scenarios';
import { characterById } from './src/data';
import { planRoll } from './src/rules';
const archduke = SCENARIOS.find((s) => s.id === 'archduke');
console.log('character      attribute   rating    dice');
for (const id of ['courtier', 'monk']) {
  const c = characterById(id);
  for (const attr of ['heart', 'penmanship']) {
    const p = planRoll({ attribute: attr, character: c, scenario: archduke, skillBonusActive: false });
    console.log(c.name.padEnd(15), attr.padEnd(12), c.attributes[attr].padEnd(9), p.diceCount);
  }
}
"
```

```output
character      attribute   rating    dice
The Courtier    heart        good      4
The Courtier    penmanship   poor      2
The Monk        heart        poor      1
The Monk        penmanship   good      4
```

The Courtier's good Heart (3) picks up the gated bonus for 4; the Monk's poor
Heart (1) does not. Both collect the unconditional Penmanship die.

The other modifier kind is carried out separately, and it is a trap rather than
a gift:

```bash
sed -n '/^\/\*\* Carries out the policy/,/^}$/p' src/rules.ts
```

```output
/** Carries out the policy `planRoll` requests. The highest die is replaced
 *  unconditionally — including when it was already a success — which is what
 *  makes `reroll_highest` a hazard rather than a bonus.
 *
 *  Lives here rather than in the roll button's callback so the mechanic sits
 *  beside the rule that asks for it, and so it can be tested without a DOM. */
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

`planRoll` sets the flag; `applyReroll` acts on it. The highest die is replaced
**unconditionally — including when it was already a 6**. On The Art Dealer,
where this rule lives, rolling well on Penmanship means losing your best die.
That is the rulebook's intent, and the reason it lives here rather than in a
click handler is so it can be tested without a DOM.

## The Play screen: `src/screens/play.ts`

The largest module, and the one with no tests. It owns the in-progress draft in
a closure and repaints its own subtree.

```bash
sed -n '/^\/\*\* What the render functions below/,/^}$/p' src/screens/play.ts
```

```output
/** What the render functions below actually need: the context plus the state
 *  this invocation owns. `state` is one shared object so a handler that fires
 *  after a repaint — the roll button's shake timer — reads the current draft
 *  rather than a copy captured when its button was built. */
interface PlayView extends PlayCtx {
  state: { draft: Draft; recallOpen: boolean };
  repaint: () => void;
}
```

```bash
sed -n '/^export function renderPlay/,/^}$/p' src/screens/play.ts
```

```output
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

`v.state` being **one shared object** rather than a copy is the subtle part, and
the roll button is why. Every render function receives the same `v`, so a
handler that fires *after* a repaint reads the draft as it is at that moment,
not as it was when the handler was built.

Note also what is absent: no session-change detection, no reset. A new letter
means `main.ts` builds a fresh `renderPlay`, which means a fresh `emptyDraft()`.
There is no sequence of resets to get wrong because there is no reset.

Everything the player can do next comes from one switch on the phase:

```bash
sed -n '/^  card.appendChild(renderStepper/,/^  }$/p' src/screens/play.ts
```

```output
  card.appendChild(renderStepper(v.state.draft.phase));

  switch (v.state.draft.phase) {
    case 'PICK_WORD': {
      const p = document.createElement('p');
      p.className = 'step-instruction';
      p.textContent = 'Dip your quill: choose one word from the Ink Pot to begin this paragraph.';
      card.appendChild(p);
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

`WRITE` is the empty case — during writing the margin holds only the stepper,
because the controls live in the letter itself. A second switch on the same
phase, in `renderLetterDraftSlot`, decides what the letter body shows:
placeholder prose for the pre-writing phases, the textarea for `WRITE`, and the
committed-looking paragraph for the two after it.

The three roll steps are one function with different nouns:

```bash
sed -n '/^\/\*\* The one underlying fact/,/^}$/p' src/screens/play.ts
```

```output
/** The one underlying fact: this skill applies to this attribute and has not
 *  been spent. Whether the player has already pressed the button this paragraph
 *  is a separate question, answered by `skillUsedHere` at the call site. */
function skillAvailableFor(v: PlayView, attr: Attribute): boolean {
  return !v.session.skillSpent && v.skill.bonusAttribute === attr;
}
```

```bash
sed -n '/^  const skillAvailable = skillAvailableFor/,/^  });$/p' src/screens/play.ts
```

```output
  const skillAvailable = skillAvailableFor(v, attr);
  const skillBonusActive = skillAvailable && v.state.draft.skillUsedHere === attr;
  const plan = planRoll({
    attribute: attr,
    character: v.character,
    scenario: v.scenario,
    skillBonusActive,
  });
```

The skill splits into two questions on purpose. `skillAvailableFor` asks whether
this skill *could* apply — right attribute, not yet spent for the letter.
`skillBonusActive` asks whether the player has already pressed the button for
*this* paragraph. Only the second feeds `planRoll`; the first decides whether to
offer the button at all.

Pressing it sets `v.state.draft.skillUsedHere = attr` and repaints — and that
repaint is exactly the hazard the next function exists to handle:

```bash
sed -n '/^function attachRollButton/,/^}$/p' src/screens/play.ts
```

```output
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

Trace the race. You press *Roll the dice*; the button shakes for 250ms. The
timer's callback closes over `plan` — the dice count computed when this button
was *built*. If a repaint happens during those 250ms, this button is detached
and a new one exists with a fresh plan. Firing the stale callback would roll the
wrong number of dice. `btn.isConnected` catches exactly that, and the
`v.state` sharing above is what makes the *new* button's plan correct.

The roll itself is one line, and it is where `rules.ts` rejoins:

```bash
sed -n '/^  attachRollButton(rollBtn/,/^  });$/p' src/screens/play.ts
```

```output
  attachRollButton(rollBtn, () => {
    onRolled(applyReroll(roll(plan.diceCount), plan.rerollPolicy));
    v.repaint();
  });
```

Plan, roll, apply the reroll policy, hand the dice to `advance` via the
caller's `onRolled`, repaint. Each of the three callers supplies its attribute,
its prose, and a verdict element reporting the *previous* roll — so the Language
step shows whether the flourish held, and the Penmanship step shows whether the
word came out superior.

Once Language has resolved, the required word is known and the textarea appears:

```bash
sed -n '/^  const word = succeeded/,/^  const requiredLower/p' src/screens/play.ts
```

```output
  const word = succeeded(v.state.draft.languageRoll) ? pair.superior : pair.inferior;
  const flourishApplied = succeeded(v.state.draft.heartRoll);
  const required =
    flourishApplied && v.state.draft.flourishAdjective
      ? `${v.state.draft.flourishAdjective} ${word}`
      : word;
  const requiredLower = required.toLowerCase();
```

A successful Language roll earns the superior word; a failed one leaves the
inferior. A flourish that held prefixes its adjective. The indicator below the
textarea does a case-insensitive `includes` against this string and updates on
every keystroke — but nothing *enforces* it. You can finish a paragraph without
using the word at all; the check is a nudge, not a gate, and the scoring never
consults it.

Committing ends the closure's life:

```bash
sed -n '/^    const newPara = draftToParagraph/,/^  });$/p' src/screens/play.ts
```

```output
    const newPara = draftToParagraph(v.state.draft);
    if (!newPara) return;
    // Committing replaces the whole screen with a fresh renderPlay, discarding
    // this closure and its draft — there is no reset to sequence.
    v.onCommit(newPara);
  });
```

`onCommit` reaches `main.ts`, which calls `commitParagraph`, saves, and renders
— building a brand-new `renderPlay` with a brand-new draft. The old closure and
everything in it is garbage.

One control deliberately does *not* repaint:

```bash
sed -n '/^  \/\/ Toggling is purely local UI/,/^  return card;$/p' src/screens/play.ts | sed '$d'
```

```output
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
    toggle.textContent = v.state.recallOpen ? 'Hide the scenario…' : 'Recall the scenario…';
  });

```

Hiding and showing the scenario recall panel is pure local UI, so it flips
`panel.hidden` in place. Calling `v.repaint()` here would rebuild the play
subtree — and, per the shake timer above, could detach a roll button mid-shake
and silently cancel a roll the player had already committed to.

## Scoring: `src/scoring.ts`

The whole rulebook's arithmetic, in one function:

```bash
sed -n '/^export function paragraphPoints/,/^}$/p' src/scoring.ts
```

```output
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

The full matrix, every combination:

```bash
bun -e "
import { paragraphPoints } from './src/scoring';
const HIT = [6], MISS = [2];
const p = (heart, lang, pen) => ({ inkPotIndex: 0, flourishAdjective: heart ? 'solemn' : null, heartRoll: heart, languageRoll: lang, penmanshipRoll: pen, skillUsedHere: null, text: '' });
console.log('flourish   word        hand      points');
for (const [h, hl] of [[HIT, 'held'], [MISS, 'lost'], [null, 'none']])
  for (const [l, ll] of [[HIT, 'superior'], [MISS, 'inferior']])
    for (const [n, nl] of [[HIT, 'fine'], [MISS, 'plain']])
      console.log(hl.padEnd(10), ll.padEnd(11), nl.padEnd(9), paragraphPoints(p(h, l, n)));
"
```

```output
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

Read the two halves against each other and the risk becomes visible. A flourish
that **held** on a superior word is worth +2 against the plain +1 — but a
flourish that held on an *inferior* word is **-1**, worse than not trying. A
flourish that was **lost** scores exactly as if you had never attempted it.

So attempting a flourish is a bet placed before you know the Language result, and
that ordering is precisely what `advance` enforces: `DECIDE_FLOURISH` comes
before `ROLL_LANGUAGE`, so the player can never see the word's quality first.
The seven-phase order is not presentation — it is the game.

Penmanship is a flat +1 and caps there regardless of how many dice succeed.

The total picks a tier by walking `TIERS` high to low:

```bash
sed -n '/^export function tierFor/,/^}$/p' src/scoring.ts
```

```output
export function tierFor(total: number): TierName {
  for (const tier of TIERS) {
    if (total >= tier.threshold) return tier.name;
  }
  // Only reachable for a negative total: floor it to the lowest tier.
  return LOWEST_TIER;
}
```

```bash
bun -e "
import { tierFor } from './src/scoring';
for (const t of [-3, 0, 4, 5, 7, 8, 10, 11, 20]) console.log(String(t).padStart(3), '→', tierFor(t));
"
```

```output
 -3 → unsuccessful
  0 → unsuccessful
  4 → unsuccessful
  5 → tepid
  7 → tepid
  8 → favourable
 10 → favourable
 11 → excellent
 20 → excellent
```

The `LOWEST_TIER` fallback at the end is unreachable for any total the game can
produce: the last threshold is `0`, so only a negative total falls through, and
reaching one takes five held flourishes on inferior words with plain hands
throughout — the -1 row of the matrix above, five times.

## The Score screen and export

`renderScore` is a straight-line render: a seal with the total, the tier
sentence, the scenario's consequence prose, the finished letter, and a
paragraph-by-paragraph breakdown table. It reaches for `EMPTY_PARAGRAPH` for the
same reason the letter does.

The download is the one piece with a hazard in it:

```bash
sed -n '/download.addEventListener/,/^  });$/p' src/screens/score.ts
```

```output
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

The `setTimeout` is not cosmetic. The browser fetches the blob *after* the
current task completes, so revoking the object URL inline races that fetch —
Safari and older Firefox have produced cancelled or zero-byte downloads. One
turn of the event loop is enough.

`toMarkdown` builds YAML frontmatter, the letter body, and a game-record table.
Both escaping helpers exist because player text reaches the output unfiltered:

```bash
sed -n '/^\/\*\* Player text reaches/,/^}$/p' src/export.ts
```

```output
/** Player text reaches the game-record table unmodified, and the flourish input
 *  has no pattern or sanitisation. A literal pipe adds a cell; a pasted newline
 *  splits the row and terminates the table early. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
```

The flourish input has no pattern and no sanitisation, so a literal `|` would
add a table cell and a pasted newline would split the row and terminate the
table early. `yamlScalar` does the same job for the frontmatter, where an
unquoted scenario title carrying a colon would write an invalid document — none
of the four bundled titles do, so that one is for the next scenario.

The table row is also where a rule from the Play screen has to be repeated:

```bash
sed -n '/^function paragraphRow/,/^}$/p' src/export.ts
```

```output
function paragraphRow(p: Paragraph, idx: number, scenario: Scenario, points: number): string {
  const pair = scenario.inkPot[p.inkPotIndex];
  const word = pair
    ? succeeded(p.languageRoll)
      ? `${escapeCell(pair.superior)} (superior)`
      : `${escapeCell(pair.inferior)} (inferior)`
    : EMDASH;
  // Only a flourish that held is reported — an attempt whose Heart roll failed
  // earns nothing and is not shown, matching the play screen's done summary.
  const flourish =
    succeeded(p.heartRoll) && p.flourishAdjective ? escapeCell(p.flourishAdjective) : EMDASH;
  return `| ${idx + 1} | ${word} | ${flourish} | ${rollCell(p.heartRoll)} | ${rollCell(p.languageRoll)} | ${rollCell(p.penmanshipRoll)} | ${points} |`;
}
```

Only a flourish that *held* is reported. An attempt whose Heart roll failed
earns nothing and is not shown — matching the done-step summary, which makes the
same `succeeded(p.heartRoll)` decision in its own code.

End to end, a complete five-paragraph session through the exporter:

```bash
bun -e "
import { toMarkdown } from './src/export';
import { SCENARIOS } from './src/scenarios';
import { characterById, skillById } from './src/data';
const HIT = [6], MISS = [2];
const p = (i, text, heart, lang, pen) => ({ inkPotIndex: i, flourishAdjective: heart ? 'solemn' : null, heartRoll: heart, languageRoll: lang, penmanshipRoll: pen, skillUsedHere: null, text });
console.log(toMarkdown(
  { id: 'demo', startedAt: '2026-09-16T10:00:00.000Z', characterId: 'poet', skillId: 'inspiration', scenarioId: 'archduke', skillSpent: true, status: 'finished',
    paragraphs: [
      p(1, 'Your Grace, word of her passing reached me on Tuesday.', HIT, HIT, HIT),
      p(0, 'We were children then, scaling oaks behind the school.', MISS, HIT, MISS),
      p(4, 'I think often of the town and its quiet streets.', null, MISS, HIT),
      p(8, 'She spoke of the cathedral as though she had built it.', HIT, MISS, MISS),
      p(6, '', null, HIT, HIT),
    ] },
  SCENARIOS.find((s) => s.id === 'archduke'), characterById('poet'), skillById('inspiration')));
"
```

```output
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

Everything in this walkthrough is visible in that output. Paragraph 1 flourished
a superior word with a fine hand for the maximum 3. Paragraph 4 flourished an
*inferior* word and lost a point for it. Paragraph 3 never attempted a flourish,
so its Heart column is an em-dash rather than a failed roll. Paragraph 5 has no
text and exports as `(empty paragraph)` rather than as blank lines. The total, 6,
lands in `tepid`, and the scenario's `tepid` string is quoted at the bottom.

## What the tests cover

Eight test files and a helper, all against the pure game layer. The paragraph machine is the
one the play loop depends on most, so it is worth seeing what its tests actually
pin:

```bash
grep -n "  test('" tests/paragraph.test.ts
```

```output
45:  test('the flourish path runs PICK_WORD → … → PARAGRAPH_DONE in order', () => {
73:  test('the plain path skips ROLL_HEART', () => {
80:  test('writePlainly discards a flourish word already typed', () => {
90:  test('each roll lands its dice on the matching field', () => {
102:  test('pickWord records the chosen index', () => {
106:  test('an event from the wrong phase leaves the draft untouched', () => {
115:  test('does not mutate the draft it is given', () => {
124:  test('DECIDE_FLOURISH and ROLL_HEART share a stepper column', () => {
128:  test('columns never move backwards along the flourish path', () => {
155:  test('returns a Paragraph once the two required rolls and the word exist', () => {
159:  test('returns null while any required field is missing', () => {
165:  test('empty text is committable — it renders as a placeholder, not nothing', () => {
171:  test('a flourish word that was never confirmed becomes null', () => {
184:  test('the letter finishes on the last paragraph and not before', () => {
195:  test('appends rather than replacing', () => {
200:  test('spending the skill latches for the rest of the letter', () => {
207:  test('leaves the session it is given untouched', () => {
```

## Index

Findings from this pass.

| # | Severity | Finding | Primary location | Tracked as |
| --- | --- | --- | --- | --- |
| 1 | medium | Adding a `PhaseName` variant type-checks clean. `STEP_INDEX` is the only compile-time gate and it only asks for a stepper column; both phase switches in the Play screen fall through to an empty container, so the new phase renders a letter slot and a margin card with no controls. The `default: never` guard already used in `planRoll` is the fix. | `src/screens/play.ts:220`, `src/screens/play.ts:342`, `src/paragraph.ts:93` | [#75](https://github.com/philoserf/quill/issues/75) |
| 2 | low | The mount `try/catch` is commented as giving "any unrecoverable state" a way out, but it wraps only the first render — later renders run from `commit()` inside event handlers, outside the `try`. Nothing reachable can throw there today, so this is a comment claiming a scope the code lacks. | `src/main.ts:113-133`, `src/main.ts:84` | [#76](https://github.com/philoserf/quill/issues/76) |
| 3 | low | An orphaned JSDoc block above `cardId` was a pre-radiogroup copy of `renderChoiceStep`'s comment, asserting "the `aria-label` below is the name" — contradicted both by the live comment eight lines below it and by the code, which uses `aria-labelledby`. | `src/screens/setup.ts` | corrected in place |

**Total: 3 findings (0 critical, 0 high, 1 medium, 2 low)**

Not filed, and noted here so they are not rediscovered as defects: the five
`internalError(...)` guards in `play.ts`, the `?? 1` fallback in `applyReroll`,
the `LOWEST_TIER` fallback in `tierFor`, and the `default: never` branch in
`planRoll` are all unreachable through the UI. Each is commented as deliberate
and several are pinned by tests.

