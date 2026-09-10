# Quill Walkthrough

*2026-09-09T22:49:58Z by Showboat 0.6.1*
<!-- showboat-id: 2200f7b0-a5ce-42a4-b1c6-658e9e33cdc2 -->

## Overview

Quill is a browser app for playing Scott Malthouse's solo letter-writing roleplaying game.
The player picks a character, a skill and a scenario, then writes a five-paragraph letter.
Dice do not decide what the letter says — they decide the vocabulary the player is obliged
to write with, and then score the result.

There is no framework and no runtime dependency. Bun is the runtime, bundler, test runner
and dev server; TypeScript is strict; Biome formats. The whole app is a bundle of a dozen
small modules plus a stylesheet, served as static files.

This walkthrough follows the code in execution order: page load, store hydration, the
domain model, scenario validation, the dice and rules layer, the play loop phase by phase,
then scoring and export.

```bash
git ls-files 'src/*' 'tests/*' 'public/*'
```

```output
public/CNAME
public/index.html
public/scenarios/archduke.json
public/scenarios/art-dealer.json
public/scenarios/father.json
public/scenarios/king.json
public/styles.css
src/data.ts
src/dice.ts
src/export.ts
src/main.ts
src/rules.ts
src/scenarios.ts
src/scoring.ts
src/screens/letterhead.ts
src/screens/play.ts
src/screens/score.ts
src/screens/setup.ts
src/store.ts
src/types.ts
tests/data.test.ts
tests/dice.test.ts
tests/export.test.ts
tests/helpers.ts
tests/rules.test.ts
tests/scenarios.test.ts
tests/scoring.test.ts
tests/store.test.ts
```

## Architecture

Three layers, and the dependency arrows only ever point downward:

- **Pure domain** — `types.ts`, `dice.ts`, `rules.ts`, `scoring.ts`, `export.ts`, `data.ts`.
  No DOM, no storage, no randomness that isn't injectable. This is where the tests live.
- **Boundary** — `scenarios.ts` validates untrusted JSON into domain types; `store.ts`
  wraps localStorage.
- **Screens** — `main.ts` plus `screens/`. These build DOM nodes directly with
  `document.createElement` and return an `HTMLElement`.

There is exactly one render path in the whole app, and it is total: the store notifies its
single subscriber, which empties the root element and rebuilds it. No diffing, no
components, no lifecycle.

## Entry point

`public/index.html` is the bundler's entry. It loads the stylesheet and fonts, provides an
empty `<main id="app">`, and pulls in the TypeScript module — Bun follows that import to
build the bundle.

```bash
sed -n '13,16p' public/index.html
```

```output
  <body>
    <main id="app"></main>
    <script type="module" src="../src/main.ts"></script>
  </body>
```

## Boot: `src/main.ts`

`main.ts` is short enough to read whole. Note the shape of the bottom of the file: the
entire mount is wrapped in a try/catch that writes the failure into `#app` and then
rethrows. `loadScenarios()` runs inside that try, so a malformed bundled scenario surfaces
as a message on the page rather than a blank screen.

```bash
sed -n '92,98p' src/main.ts
```

```output
try {
  mount(loadScenarios());
} catch (err) {
  const root = document.getElementById('app');
  if (root) root.textContent = `Failed to load Quill: ${(err as Error).message}`;
  throw err;
}
```

The app's entire state is one nullable session. `null` is not an error state — it *is* the
Setup screen. The store is constructed with a deliberately loose shape predicate; the real
staleness check happens later, in `render()`.

```bash
sed -n '9,21p' src/main.ts
```

```output
const SESSION_KEY = 'quill.session.v1';

interface AppState {
  session: GameSession | null;
}

// Minimal shape check; stale-but-well-shaped sessions are handled in render()
// by resetting when the referenced character/skill/scenario no longer exists.
const store = new Store<AppState>(
  { session: null },
  SESSION_KEY,
  (v): v is AppState => typeof v === 'object' && v !== null && 'session' in v,
);
```

`render()` is the single subscriber and the only place screens are chosen. It re-resolves
the character, skill and scenario by id on *every* render. If any of the three has vanished
— a renamed character, a deleted scenario — the session is cleared back to Setup. This is
the app's entire migration story; there is no version field on the payload beyond the `.v1`
in the storage key.

```bash
sed -n '44,66p' src/main.ts
```

```output
  function render() {
    const state = store.get();
    rootEl.replaceChildren();
    const session = state.session;

    if (!session) {
      rootEl.appendChild(
        renderSetup({
          scenarios,
          onBegin: (sel) => store.set(() => ({ session: newSession(sel) })),
        }),
      );
      return;
    }

    const scenario = scenarios.find((s) => s.id === session.scenarioId);
    const character = characterById(session.characterId);
    const skill = skillById(session.skillId);
    if (!scenario || !character || !skill) {
      // Stale session referencing renamed/removed character, skill, or scenario → reset.
      store.clear({ session: null });
      return;
    }
```

## The store: `src/store.ts`

`Store<T>` is a pub/sub with localStorage persistence, and it treats storage as hostile.
Reading `globalThis.localStorage` is itself wrapped in try/catch — a browser configured to
block site data throws `SecurityError` on the *property access*, not on `getItem`, so a
naive `typeof localStorage` guard is not enough.

```bash
sed -n '4,15p' src/store.ts
```

```output
// Even reading `localStorage` throws SecurityError when the browser blocks
// site data (e.g. Chrome with cookies disabled), so every access goes
// through this guard. Single property read: globalThis.localStorage is
// undefined (not a ReferenceError) where storage doesn't exist, and a
// potentially side-effectful getter is only invoked once.
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
```

Hydration is the interesting part of the constructor. A payload that fails `JSON.parse`, or
parses but fails the caller's shape predicate, is **moved** to a `<key>.corrupt` sibling
rather than deleted — the app never destroys the player's only copy on the strength of its
own bug. If even the backup write fails (quota, security), the original is left untouched.

```bash
sed -n '28,45p' src/store.ts
```

```output

    try {
      const parsed: unknown = JSON.parse(raw);
      const ok = isValid ? isValid(parsed) : parsed !== null && typeof parsed === 'object';
      if (!ok) throw new Error('persisted value has the wrong shape');
      this.state = parsed as T;
    } catch {
      // Move the payload to a backup key rather than destroying the user's
      // only copy; the next persist() overwrites the live key anyway. If the
      // backup write fails, leave the original in place.
      try {
        store.setItem(`${key}.corrupt`, raw);
        store.removeItem(key);
      } catch {
        // quota or security failure — keep the original rather than lose it
      }
    }
  }
```

`set()` notifies subscribers *before* persisting. That ordering matters to the play screen,
which relies on the notification being synchronous — see the paragraph-commit step below.

```bash
sed -n '51,55p' src/store.ts
```

```output
  set(updater: Updater<T>): void {
    this.state = updater(this.state);
    for (const fn of this.listeners) fn(this.state);
    this.persist();
  }
```

## The domain model: `src/types.ts`

Three attributes are the vocabulary every subsystem shares. A character has a rating per
attribute; a skill grants +1 die to one attribute; a scenario's modifiers each name an
attribute. Anything that does not reduce to "an attribute and a number of dice" does not
fit this system.

```bash
sed -n '1,3p' src/types.ts
```

```output
export const ATTRIBUTES = ['penmanship', 'language', 'heart'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Rating = 'poor' | 'average' | 'good';
```

A scenario can do exactly two things to a roll, expressed as a discriminated union. Note
`appliesTo` on `dice_bonus`: a bonus may be gated to named characters, which is how the
rulebook's "the Archduke favours a courtier" style rules are encoded.

```bash
sed -n '24,36p' src/types.ts
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

The durable record of a paragraph keeps every roll, not just the outcome, so the score
screen and the Markdown export can both re-derive the reckoning from the session alone.
`heartRoll` is nullable because a paragraph written plainly never rolls Heart.

```bash
sed -n '52,72p' src/types.ts
```

```output
export interface Paragraph {
  inkPotIndex: number;
  attemptedFlourish: boolean;
  flourishAdjective: string | null;
  heartRoll: number[] | null;
  languageRoll: number[];
  penmanshipRoll: number[];
  skillUsedHere: Attribute | null;
  text: string;
}

export interface GameSession {
  id: string;
  startedAt: string;
  characterId: string;
  skillId: string;
  scenarioId: string;
  skillSpent: boolean;
  paragraphs: Paragraph[];
  status: 'in_progress' | 'finished';
}
```

Tier names are keyed by score threshold. These four numbers are load-bearing: the scenario
validator rejects any consequence list whose thresholds are not exactly these, precisely so
this lookup cannot miss.

```bash
sed -n '74,81p' src/types.ts
```

```output
export const TIER_NAMES = {
  0: 'unsuccessful',
  5: 'tepid',
  8: 'favourable',
  11: 'excellent',
} as const;

export type TierName = (typeof TIER_NAMES)[keyof typeof TIER_NAMES];
```

## The scenario boundary: `src/scenarios.ts`

Characters are code and scenarios are data. `src/data.ts` hard-codes six characters and
three skills as rulebook content — a closed set the tests pin by id. Scenarios are JSON so
they can be authored without touching TypeScript, and `validateScenario` is the only gate
between the two worlds.

Scenarios are imported at build time rather than fetched. The comment explains why: Bun's
HTML dev server answers a request for a sibling JSON file with the SPA's HTML, so `fetch`
works in production and silently fails in development. Bundling works in both.

```bash
sed -n '129,141p' src/scenarios.ts
```

```output
// Scenarios are imported at build time so the bundle is self-contained — Bun's
// HTML dev server doesn't serve sibling JSON via fetch (it returns the SPA HTML),
// and a bundled-in copy works identically in dev and production.
import archduke from '../public/scenarios/archduke.json' with { type: 'json' };
import artDealer from '../public/scenarios/art-dealer.json' with { type: 'json' };
import father from '../public/scenarios/father.json' with { type: 'json' };
import king from '../public/scenarios/king.json' with { type: 'json' };

const BUNDLED: unknown[] = [archduke, artDealer, father, king];

export function loadScenarios(): Scenario[] {
  return BUNDLED.map((raw) => validateScenario(raw));
}
```

The strictest rule in the validator is the threshold check. It is what makes the
`TIER_NAMES` lookup in `scoring.ts` safe.

```bash
sed -n '109,117p' src/scenarios.ts
```

```output
  const thresholds = consequences.map((c) => c.threshold).sort((a, b) => a - b);
  if (
    thresholds.length !== REQUIRED_THRESHOLDS.length ||
    !thresholds.every((t, i) => t === REQUIRED_THRESHOLDS[i])
  ) {
    throw new Error(
      `Scenario.consequences thresholds must be exactly [0,5,8,11], got [${thresholds.join(',')}]`,
    );
  }
```

`validateModifier` handles `dice_bonus` in an `if` and then returns a `reroll_highest`
unconditionally, on the strength of the guard above it. Read the comment carefully — it is
true today and stops being true the moment a third modifier type is registered without a
matching branch here. That trap is filed as
#55.

```bash
sed -n '63,69p' src/scenarios.ts
```

```output
  // obj.type === 'reroll_highest' — KNOWN_MODIFIER_TYPES guard above ensures the only remaining case
  return {
    type: 'reroll_highest',
    attribute: obj.attribute as Attribute,
    description: obj.description,
  };
}
```

## Dice: `src/dice.ts`

The whole dice layer is twenty-one lines. Pools are d6; a die of 5 or 6 succeeds; ratings
map poor/average/good to one/two/three dice. `roll` takes an injectable RNG, which is the
only reason the dice are testable at all.

```bash
cat src/dice.ts
```

```output
import type { Rating } from './types';

export function diceForRating(r: Rating): number {
  return r === 'poor' ? 1 : r === 'average' ? 2 : 3;
}

export function roll(n: number, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.floor(rng() * 6) + 1);
  }
  return out;
}

export function isSuccess(die: number): boolean {
  return die >= 5;
}

export function countSuccesses(dice: number[]): number {
  return dice.filter(isSuccess).length;
}
```

## Rules of Correspondence: `src/rules.ts`

`planRoll` folds a character's base rating, the scenario's modifiers and the optional skill
bonus into a `RollPlan`. Note what a plan *is*: a dice count and a reroll flag, nothing
else. That two-field shape is the ceiling on what a scenario can do to a roll.

Note also that `planRoll` only *reports* the reroll policy — it does not execute it. The
reroll happens in the play screen, which is the one place the narrative has to jump ahead.

```bash
sed -n '4,33p' src/rules.ts
```

```output
export interface RollPlan {
  diceCount: number;
  rerollPolicy: 'highest' | null;
}

export function planRoll(args: {
  attribute: Attribute;
  character: Character;
  scenario: Scenario;
  skillBonusActive: boolean;
}): RollPlan {
  const { attribute, character, scenario, skillBonusActive } = args;
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

The `default` branch carries both a compile-time and a runtime guard, and the comments say
why each is there: the `never` assignment breaks the build if a variant is added to the
union, and the `throw` catches a payload that reached this function without passing through
`validateScenario` — a tampered localStorage session, say.

```bash
sed -n '34,45p' src/rules.ts
```

```output
      default: {
        // Compile-time exhaustiveness: TS errors if a new Modifier variant is added.
        const _exhaustive: never = mod;
        // Runtime safety: a payload that escaped validation (e.g., tampered session) still fails loudly.
        throw new Error(`Unhandled modifier: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  if (skillBonusActive) diceCount += 1;
  return { diceCount, rerollPolicy };
}
```

## The play loop: `src/screens/play.ts`

This is the largest file in the project and the only stateful screen. Everything above was
pure or nearly so; here the game actually happens.

### The phase machine

A paragraph is written by advancing through seven phases. The order is not arbitrary
sequencing — it is the domain. Heart decides whether the player's flourish survives, and
Language decides which form of the ink-pot word must be used; both shape the phrase the
player is obliged to incorporate, so both must resolve *before* writing. Penmanship judges
the hand rather than the words, so it resolves *after*.

```bash
sed -n '20,27p' src/screens/play.ts
```

```output
type PhaseName =
  | 'PICK_WORD'
  | 'DECIDE_FLOURISH'
  | 'ROLL_HEART'
  | 'ROLL_LANGUAGE'
  | 'WRITE'
  | 'ROLL_PENMANSHIP'
  | 'PARAGRAPH_DONE';
```

### The draft is deliberately not persisted

Everything about the paragraph in progress lives in a module-level mutable `Draft`, which
never reaches the store. Only committed paragraphs are durable. A reload mid-paragraph
therefore discards that paragraph and resumes at the start of it — which is what stops a
player from reloading to escape a bad roll in a game with no referee.

```bash
sed -n '73,91p' src/screens/play.ts
```

```output
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const STEP_LABELS = ['Word', 'Flourish', 'Language', 'Write', 'Hand'] as const;

let currentDraft: Draft = emptyDraft();
let scenarioRecallOpen = false;
let lastSessionId = '';

function ensureDraftFor(session: GameSession) {
  if (session.id !== lastSessionId) {
    currentDraft = emptyDraft();
    scenarioRecallOpen = false;
    lastSessionId = session.id;
  }
}

function rerender(ctx: PlayCtx) {
  // Trigger main app render by no-op session update.
  ctx.onUpdate((s) => ({ ...s }));
}
```

Two things in that snippet are worth pausing on.

`ensureDraftFor` re-keys the draft on session id, which is what stops a stale draft from
leaking into a new letter after a restart — the module-level variables outlive any one
session.

`rerender` is how the play screen repaints. It has no render authority of its own: to show
the next phase it writes a shallow-copied session through the store, and the app's single
subscriber rebuilds the entire DOM tree. Every phase transition therefore costs a
localStorage write. That is not an oversight — the write *is* the persistence.

### Picking a word

The ink pot is a list of paired synonyms. An entry already consumed by a committed
paragraph is rendered disabled and shows which form the player drew; during `PICK_WORD` the
list is the only interactive control on the screen.

```bash
sed -n '228,258p' src/screens/play.ts
```

```output
    const used = ctx.session.paragraphs.find((p) => p.inkPotIndex === idx);
    const chosen = !used && currentDraft.inkPotIndex === idx;
    const pickable = currentDraft.phase === 'PICK_WORD' && !used;

    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inkpot-item';
    btn.disabled = !pickable;

    if (used) {
      btn.classList.add('inkpot-item--used');
      btn.append(
        entry.inferior,
        ' ',
        smallCaps(isSuperior(used.languageRoll) ? '→ superior' : '→ inferior'),
      );
    } else if (chosen) {
      btn.classList.add('inkpot-item--chosen');
      btn.append(entry.inferior, ' ', smallCaps('← chosen'));
    } else {
      btn.textContent = entry.inferior;
    }

    if (pickable) {
      btn.addEventListener('click', () => {
        currentDraft.inkPotIndex = idx;
        currentDraft.phase = 'DECIDE_FLOURISH';
        rerender(ctx);
      });
    }
```

Because a used entry is disabled and has no handler, the ink pot must hold at least one
word per paragraph or the loop cannot terminate. The validator does not check that — filed
as #35.

### Rolling

All three attribute rolls share one function. It plans the roll, optionally offers the
skill button, and wires up the roll button; the caller supplies only what to do with the
dice and which phase comes next. The reroll policy that `planRoll` merely reported is
executed here — for whichever attribute the scenario named, not just penmanship.

```bash
sed -n '551,568p' src/screens/play.ts
```

```output
  const rollBtn = document.createElement('button');
  rollBtn.type = 'button';
  rollBtn.className = 'btn btn--primary';
  rollBtn.textContent = 'Roll the dice';
  attachRollButton(rollBtn, () => {
    let dice = roll(plan.diceCount);
    if (plan.rerollPolicy === 'highest' && dice.length > 0) {
      const max = Math.max(...dice);
      const i = dice.indexOf(max);
      const re = roll(1)[0] ?? 1;
      dice = [...dice.slice(0, i), re, ...dice.slice(i + 1)];
    }
    if (skillBonusActive) currentDraft.skillUsedHere = attr;
    onRolled(dice);
    rerender(ctx);
  });
  wrap.appendChild(rollBtn);
  return wrap;
```

Note that `reroll_highest` replaces the highest die unconditionally, even when that die was
already a success. It is a hazard, not a gift — `art-dealer.json` is the only scenario that
carries one.

`attachRollButton` is the seam between animation time and render time. The button shakes
for 250ms before the dice land, and any re-render during that window (the player pressing
the skill button, say) replaces the whole tree and detaches this button, leaving the
callback holding a stale dice plan. The `isConnected` check aborts in exactly that case.

```bash
sed -n '118,130p' src/screens/play.ts
```

```output
function attachRollButton(btn: HTMLButtonElement, onRoll: () => void): void {
  btn.addEventListener('click', () => {
    btn.classList.add('shake');
    btn.disabled = true;
    setTimeout(() => {
      // A re-render during the shake (skill button, recall toggle) replaces the
      // whole tree and detaches this button; its dice plan is stale, so abort
      // and let the freshly rendered button roll with the current plan.
      if (!btn.isConnected) return;
      onRoll();
    }, 250);
  });
}
```

### Writing

The write step composes the required phrase from the ink-pot word (superior or inferior,
decided by the Language roll already made) and the flourish adjective, if it held. A live
indicator tells the player whether the phrase appears in their prose — but the "Finish
paragraph" button is enabled regardless. The app prompts and scores; it does not referee
prose.

```bash
sed -n '327,339p' src/screens/play.ts
```

```output
  const wrap = document.createElement('div');
  const word = isSuperior(currentDraft.languageRoll) ? pair.superior : pair.inferior;
  const flourishApplied = flourishHeld(currentDraft.attemptedFlourish, currentDraft.heartRoll);
  const required =
    flourishApplied && currentDraft.flourishAdjective
      ? `${currentDraft.flourishAdjective} ${word}`
      : word;
  const requiredLower = required.toLowerCase();

  const chip = document.createElement('p');
  chip.className = 'word-chip';
  chip.textContent = `Incorporate: "${required}"`;
  wrap.appendChild(chip);
```

### Committing the paragraph

This is the one place in the app where ordering is genuinely load-bearing, and the comment
explains it. `store.set()` notifies subscribers synchronously, so `ctx.onUpdate` triggers a
re-render *before it returns*, and that re-render reads `currentDraft.phase`. Reset the
draft after the call and the player is stranded on the done screen with no way forward but
a reload.

```bash
sed -n '677,692p' src/screens/play.ts
```

```output
  next.addEventListener('click', () => {
    // Snapshot the draft before the reset below; nothing may read currentDraft after it.
    const newPara = draftToParagraph(currentDraft);
    if (!newPara) return;
    // Reset the draft BEFORE onUpdate. The store notifies subscribers synchronously,
    // which triggers a re-render that reads currentDraft.phase. If we reset after,
    // the re-render shows PARAGRAPH_DONE again and the player has to reload.
    currentDraft = emptyDraft();
    ctx.onUpdate((s) => {
      const skillSpent = s.skillSpent || newPara.skillUsedHere !== null;
      const paragraphs = [...s.paragraphs, newPara];
      const status: 'in_progress' | 'finished' =
        paragraphs.length >= 5 ? 'finished' : 'in_progress';
      return { ...s, paragraphs, skillSpent, status };
    });
  });
```

That `paragraphs.length >= 5` is the transition to the Score screen — the store's next
notify sees `status: 'finished'` and `main.ts` dispatches to `renderScore` instead. It is
also one of six independent spellings of "a letter is five paragraphs" in this file, none
of which is a named constant; filed as
#33.

## Scoring: `src/scoring.ts`

Scoring is pure and deliberately coarse. The count of successes past the first never
matters anywhere — one success is the whole signal. The asymmetry is the game: a held
flourish on a superior word doubles the paragraph, but a held flourish on an *inferior*
word costs a point the player would have kept by writing plainly.

```bash
sed -n '16,40p' src/scoring.ts
```

```output
export function isSuperior(languageRoll: number[]): boolean {
  return countSuccesses(languageRoll) > 0;
}

export function flourishHeld(attemptedFlourish: boolean, heartRoll: number[] | null): boolean {
  return attemptedFlourish && heartRoll !== null && countSuccesses(heartRoll) > 0;
}

export function fineHand(penmanshipRoll: number[]): boolean {
  return countSuccesses(penmanshipRoll) > 0;
}

export function paragraphPoints(p: Paragraph): number {
  const superior = isSuperior(p.languageRoll);
  const flourishApplied = flourishHeld(p.attemptedFlourish, p.heartRoll);

  let pts: number;
  if (flourishApplied && superior) pts = 2;
  else if (flourishApplied && !superior) pts = -1;
  else if (!flourishApplied && superior) pts = 1;
  else pts = 0;

  if (fineHand(p.penmanshipRoll)) pts += 1;
  return pts;
}
```

Tier lookup walks the sorted thresholds and keeps the last one the total clears, so a
negative total floors to the lowest tier. The final cast is safe only because
`validateScenario` guaranteed the four thresholds — an invariant the `Scenario` type itself
does not carry, filed as
#26.

```bash
sed -n '42,57p' src/scoring.ts
```

```output
export function score(session: GameSession, scenario: Scenario): ScoreResult {
  const paragraphs = session.paragraphs.map(paragraphPoints);
  const total = paragraphs.reduce((a, b) => a + b, 0);

  // Tier lookup: highest threshold ≤ total. Floor negatives to lowest tier.
  const sorted = [...scenario.consequences].sort((a, b) => a.threshold - b.threshold);
  const fallback = sorted[0];
  if (!fallback) throw new Error('Scenario has no consequence tiers');
  let tier: ConsequenceTier = fallback;
  for (const c of sorted) {
    if (total >= c.threshold) tier = c;
  }

  const tierName = TIER_NAMES[tier.threshold as keyof typeof TIER_NAMES];
  return { paragraphs, total, tier, tierName };
}
```

## Export: `src/export.ts`

`toMarkdown` is pure and takes the character and skill lists as arguments rather than
importing them, which is what makes it testable without the app. It emits YAML frontmatter,
the letter body, and a game-record table.

Only a flourish that *held* is reported. An attempt whose Heart roll failed earns nothing
and is not shown, matching what the play screen told the player at the time.

```bash
sed -n '10,24p' src/export.ts
```

```output
function paragraphRow(p: Paragraph, idx: number, scenario: Scenario, points: number): string {
  const pair = scenario.inkPot[p.inkPotIndex];
  const word = pair
    ? isSuperior(p.languageRoll)
      ? `${pair.superior} (superior)`
      : `${pair.inferior} (inferior)`
    : EMDASH;
  // Only a flourish that held is reported — an attempt whose Heart roll failed
  // earns nothing and is not shown, matching the play screen's done summary.
  const flourish =
    flourishHeld(p.attemptedFlourish, p.heartRoll) && p.flourishAdjective
      ? p.flourishAdjective
      : EMDASH;
  return `| ${idx + 1} | ${word} | ${flourish} | ${rollCell(p.heartRoll)} | ${rollCell(p.languageRoll)} | ${rollCell(p.penmanshipRoll)} | ${points} |`;
}
```

The browser half of the download stays in the score screen — build a Blob, mint an object
URL, click a synthetic anchor, revoke. Keeping it out of `export.ts` is what lets the
formatter be tested under `bun test` with no DOM.

```bash
sed -n '110,122p' src/screens/score.ts
```

```output
  download.addEventListener('click', () => {
    const md = toMarkdown(ctx.session, ctx.scenario, CHARACTERS, SKILLS);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = ctx.session.startedAt.slice(0, 10);
    a.href = url;
    a.download = `quill-${d}-${ctx.scenario.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
```

## What the tests cover

The suite tests the pure layer and the storage boundary, and nothing else. There are no
tests for any screen — the play loop, which is the largest and most stateful file in the
project, is covered only by the manual smoke test in the README.

```bash
git ls-files 'tests/*'
```

```output
tests/data.test.ts
tests/dice.test.ts
tests/export.test.ts
tests/helpers.ts
tests/rules.test.ts
tests/scenarios.test.ts
tests/scoring.test.ts
tests/store.test.ts
```

```bash
bun test 2>&1 | grep -oE '[0-9]+ (pass|fail)'
```

```output
53 pass
0 fail
```

## Where the linear order broke down

Two places, both worth knowing before you start editing.

The **reroll policy** is decided in `rules.ts` and executed in `play.ts`. Reading `planRoll`
alone tells you a scenario can ask for a reroll but not what a reroll does, and reading the
play screen alone tells you a reroll happens but not when it is requested. There is no
single file that answers "what does `reroll_highest` mean".

The **skill bonus** is a three-way handshake with no single owner. `canSpendSkillButton`
decides whether to offer the button, the button sets `currentDraft.skillUsedHere`,
`canSpendSkill` reads that back to decide whether `planRoll` gets `skillBonusActive`, and
`session.skillSpent` only flips when the paragraph is committed. Following one spend
requires holding all four in mind at once.

## Index

| # | Severity | Issue | Primary location |
| --- | --- | --- | --- |
| 1 | medium | #38 | `src/screens/play.ts`, `tests/` |
| 2 | low | #43 | `src/rules.ts:29-33`, `src/screens/play.ts:556-562` |

**Total: 2 issues (0 critical, 0 high, 1 medium, 1 low)**

Findings from the `code-theory` pass over the same code are #55, #35, #33 and #26.

