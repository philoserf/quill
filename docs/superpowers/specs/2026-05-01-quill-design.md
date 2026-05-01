---
date: 2026-05-01
status: approved through brainstorming; awaiting implementation plan
source: Quill — A Letter-Writing Roleplaying Game for a Single Player (Scott Malthouse, Trollish Delver Games, 2018, CC BY-SA 4.0)
---

# Quill — Local Web App Design Spec

## Goal

Build a local web app that lets a single player play Quill end-to-end: pick a character, skill, and scenario; write a five-paragraph letter following the dice mechanics; and export the finished letter as Markdown. The app runs in any modern browser on the local machine and on iPad over LAN.

## Non-goals (v1)

- Multi-character / White Box continuity.
- Custom scenario authoring UI.
- Cloud sync, accounts, or any backend service.
- Mobile-portrait-optimized layout.
- Dark mode / accessibility theme switching.
- LLM recipient replies.

## Tech stack

- **Runtime, bundler, test runner, dev server**: Bun.
- **Linter / formatter**: Biome.
- **Language**: TypeScript, strict mode.
- **UI framework**: none. Vanilla TypeScript with a small reactive store and template-literal rendering.
- **Runtime dependencies**: none. Google Fonts loaded via `<link>` from the CDN.
- **Aesthetic**: period-evocative — parchment background, calligraphic display font, serif body.

## Project layout

```text
Games/quill/
├── README.md
├── package.json
├── tsconfig.json
├── biome.json
├── public/
│   ├── index.html
│   ├── styles.css
│   └── scenarios/
│       ├── manifest.json
│       ├── archduke.json
│       ├── art-dealer.json
│       ├── father.json
│       └── king.json
├── src/
│   ├── main.ts
│   ├── types.ts
│   ├── data.ts          # 6 characters + 3 skills (rulebook constants)
│   ├── scenarios.ts     # fetch + validate scenario JSON
│   ├── rules.ts         # Rules of Correspondence → roll plan
│   ├── dice.ts          # rolling, success counting
│   ├── scoring.ts       # pure scoring function over Paragraph[]
│   ├── store.ts         # reactive store + localStorage persistence
│   ├── export.ts        # finished-letter Markdown formatter
│   └── screens/
│       ├── setup.ts
│       ├── play.ts
│       └── score.ts
└── tests/
    ├── dice.test.ts
    ├── rules.test.ts
    ├── scoring.test.ts
    └── scenarios.test.ts
```

## Domain model

```ts
type Attribute = "penmanship" | "language" | "heart";
type Rating = "poor" | "average" | "good"; // 1, 2, 3 dice

interface Character {
  id: string;
  name: string;
  flavor: string[];
  attributes: Record<Attribute, Rating>;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  bonusAttribute: Attribute;
}

interface InkPotEntry {
  inferior: string;
  superior: string;
}

type Modifier =
  | {
      type: "dice_bonus";
      attribute: Attribute;
      amount: number;
      appliesTo?: { characters: string[] };
      description: string;
    }
  | { type: "reroll_highest"; attribute: Attribute; description: string };

interface ConsequenceTier {
  threshold: number;
  text: string;
}

interface Scenario {
  id: string;
  title: string;
  profile: string[];
  rulesOfCorrespondence: Modifier[];
  inkPot: InkPotEntry[];
  consequences: ConsequenceTier[]; // ascending by threshold
}

interface Paragraph {
  inkPotIndex: number;
  attemptedFlourish: boolean;
  flourishAdjective: string | null;
  heartRoll: number[] | null;
  languageRoll: number[];
  penmanshipRoll: number[];
  skillUsedHere: Attribute | null;
  text: string;
}

interface GameSession {
  id: string;
  startedAt: string;
  characterId: string;
  skillId: string;
  scenarioId: string;
  skillSpent: boolean;
  paragraphs: Paragraph[];
  status: "in_progress" | "finished";
}
```

### Static data

- **Characters** (`src/data.ts`) — Monk, Knight, Poet, Aristocrat, Scholar, Courtier with attributes and flavor text from the rulebook.
- **Skills** (`src/data.ts`) — Inspiration (+1 Language die), Illumination (+1 Penmanship die), Augmentation (+1 Heart die).
- **Scenarios** (`public/scenarios/`) — JSON files: `archduke`, `art-dealer`, `father`, `king`. `manifest.json` is an ordered list of file names.

### Modifier types covered by v1

| type             | semantics                                                        |
| ---------------- | ---------------------------------------------------------------- |
| `dice_bonus`     | +N dice to one attribute, optionally restricted to characters.   |
| `reroll_highest` | After rolling the named attribute, re-roll its highest die once. |

The scenario loader rejects unknown modifier types with a clear error so future supplements force a code update rather than silently doing nothing.

### Rules of Correspondence engine (`src/rules.ts`)

```ts
interface RollPlan {
  diceCount: number;
  rerollPolicy: "highest" | null;
}

function planRoll(args: {
  attribute: Attribute;
  character: Character;
  scenario: Scenario;
  skillBonusActive: boolean;
}): RollPlan;
```

Pure function. Sums `dice_bonus` modifiers (filtered by character allow-list) on top of the character's base dice count for that attribute. Adds 1 if the skill bonus is being spent on this attribute. Sets `rerollPolicy` if a `reroll_highest` modifier matches the attribute.

### Scoring (`src/scoring.ts`)

Pure function `score(session: GameSession): { paragraphs: number[]; total: number; tier: ConsequenceTier; tierName: TierName }`.

Per paragraph:

- Plain superior word: +1.
- Flourished superior word: +2 (replaces the +1, not additive).
- Plain inferior word: 0.
- Flourished inferior word: −1.
- +1 if penmanship test succeeded (capped at +1 regardless of how many 5s/6s rolled).

A flourish is only "applied" if the Heart test succeeded. A failed Heart test never penalises; the player just writes without a flourish.

**Tier lookup**: highest `threshold ≤ total`. Total is _not_ clamped during play — negative running totals are shown honestly — but the tier lookup falls back to the lowest tier (`threshold: 0`) for negative totals.

**Tier names** (game-global, not per scenario; from rulebook page 20):

```ts
const TIER_NAMES = {
  0: "unsuccessful",
  5: "tepid",
  8: "favourable",
  11: "excellent",
} as const;
type TierName = (typeof TIER_NAMES)[keyof typeof TIER_NAMES];
```

The scoring function returns the tier text (from the scenario) and the global tier name (for the export frontmatter and for any UI label).

## Scenario JSON schema

```json
{
  "id": "archduke",
  "title": "The Archduke",
  "profile": ["…", "…"],
  "rulesOfCorrespondence": [
    {
      "type": "dice_bonus",
      "attribute": "heart",
      "amount": 1,
      "appliesTo": { "characters": ["courtier", "aristocrat"] },
      "description": "Courtiers and Aristocrats gain an extra Heart die in this scenario"
    }
  ],
  "inkPot": [{ "inferior": "Death", "superior": "Passing" }],
  "consequences": [
    { "threshold": 0, "text": "…" },
    { "threshold": 5, "text": "…" },
    { "threshold": 8, "text": "…" },
    { "threshold": 11, "text": "…" }
  ]
}
```

The loader validates every field. Consequence thresholds must be exactly `[0, 5, 8, 11]`. Unknown modifier types are rejected.

## Game flow

### 1. Setup screen

Three-step accordion: Character → Skill → Scenario. Each step has cards; clicking a card selects it and opens the next step. The full Profile and Rules of Correspondence appear after a scenario is selected, so the player can read them before clicking **Begin letter**.

### 2. Play screen

Three-column CSS grid (single column under 900 px):

- **Left**: Ink Pot. Word pairs as cards showing only the inferior word (the superior is the surprise on a successful Language test). Used pairs are greyed and labelled _used (Superior)_ or _used (Inferior)_.
- **Centre**: current-paragraph workspace and a "Letter so far" panel of completed paragraphs (read-only).
- **Right**: scenario header (collapsible Profile + Rules of Correspondence), per-attribute dice pool with active modifiers visible, **Use skill** button (greyed once spent), running score.

### Per-paragraph state machine

```text
PICK_WORD          — player clicks an Ink Pot card
DECIDE_FLOURISH    — "Attempt a flourish" or "Skip"
                     if attempt: enter adjective/adverb in a small text input
ROLL_HEART         — only if flourish attempted; reveals success/fail.
                     Always proceeds to ROLL_LANGUAGE; flourish only applies on success.
ROLL_LANGUAGE      — button. Reveals Superior or Inferior word.
WRITE              — textarea opens with the chosen word (and flourish adjective if it stuck)
                     pinned at the top as a chip the player must incorporate.
                     Word-presence in the textarea is shown as a soft indicator only,
                     not blocking.
ROLL_PENMANSHIP    — "Finish paragraph" → roll → reveal +1 / 0
PARAGRAPH_DONE     — shows points earned; "Next paragraph" or, after the 5th,
                     "Finish letter"
```

A skill bonus button is visible whenever the matching roll is the next action and disappears once spent. The bonus adds 1 die to that single roll. The player can only spend the skill on a roll matching the skill's `bonusAttribute`.

### Dice rolls

Button-driven, never auto. On click, the dice tray briefly shakes (~250 ms CSS animation), then displays each die face. 5s and 6s are highlighted as successes. No skip / reroll cheat. RNG is `Math.random` by default; `dice.roll(n, rng?)` accepts an injected RNG so tests can be deterministic.

### 3. Score screen

Final score banner, the matched consequence tier text, the full letter rendered as a finished missive in the parchment serif, a per-paragraph breakdown table (word, flourish, rolls, points), and a **Download letter (.md)** button. **Write another letter** clears the localStorage slot and returns to Setup.

## Persistence

Single localStorage key: `quill.session.v1`. Holds the active `GameSession` JSON.

- Saved on every state-changing action.
- Textarea changes write to the in-memory session immediately (so any other UI state derived from the text updates) but only persist to localStorage after a 200 ms debounce.
- On app start: if a session exists with `status === 'in_progress'`, the app restores into the Play screen at the exact paragraph state. Otherwise it shows Setup.
- The slot is cleared when the player clicks **Write another letter** on the Score screen.

No "saved games library" — the export-as-Markdown step is the canonical archive.

## Export format

Markdown file via `Blob` + anchor click. Filename: `quill-YYYY-MM-DD-<scenario-id>.md`.

```markdown
---
date: 2026-05-01
character: The Monk
skill: Illumination
scenario: The Archduke
score: 9
consequence: favourable
---

[paragraph 1]

[paragraph 2]

…

---

## Game record

| #   | Word               | Flourish | Heart | Language | Penmanship | Points |
| --- | ------------------ | -------- | ----- | -------- | ---------- | ------ |
| 1   | Passing (superior) | solemn   | 5,3   | 6,2      | 4,5        | 3      |

**Total**: 9 / favourable

> The Archduke thanks you for your kind letter…
```

Cells render `—` when the corresponding roll didn't happen (e.g., Heart when no flourish was attempted, or Flourish when none was applied).

## Aesthetic

- Display font: **IM Fell English SC** or **Cinzel** — the closer match to the rulebook visuals chosen in implementation.
- Body / letter font: **EB Garamond**.
- Background: subtle parchment via CSS gradient + low-opacity public-domain noise texture.
- Color tokens (CSS custom properties on `:root`):
  - `--parchment: #f4e5c2`
  - `--parchment-dark: #e8d4a6`
  - `--ink: #2a1f0e`
  - `--ink-soft: #4a3a20`
  - `--accent: #8b4513`
  - `--success: #5a6f3a`
  - `--failure: #843131`
- Decorative dividers: a single SVG knot/ornament reused between major sections.
- Layout: CSS grid, three columns at ≥ 900 px, single column below.
- Dice rendered as inline glyphs with face values (no pip art); successes wrapped in `.success`.

## Testing

`bun test` covers:

- `dice.test.ts` — success counting, attribute → dice mapping (1/2/3 for poor/average/good), seeded RNG produces deterministic results.
- `rules.test.ts` — every scenario × every character → expected dice pool per attribute. Each modifier type has at least one positive and one negative case.
- `scoring.test.ts` — pure scoring function over hand-built `Paragraph[]` arrays, covering all four consequence tiers and the flourish edge cases (flourished inferior = −1 across multiple paragraphs; tier lookup floors negative totals to the lowest tier).
- `scenarios.test.ts` — all 4 JSON files in `public/scenarios/` parse against the schema; consequence thresholds are exactly `[0, 5, 8, 11]`.

Manual smoke checklist in the README: parchment renders; fonts load; paragraph state machine advances correctly; skill button greys after use; export downloads with the correct filename; in-progress save restores after a tab reload.

## Build & run

| script          | command                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `bun run dev`   | `bun ./public/index.html` (Bun's native HTML+TS dev server, hot reload) |
| `bun run build` | `bun build ./public/index.html --outdir dist`                           |
| `bun test`      | runs all `tests/*.test.ts`                                              |
| `bun run check` | `biome check --write .`                                                 |

Bun's native HTML imports pick up `<script type="module" src="../src/main.ts">` from `index.html` and bundle on the fly. No npm install needed beyond `bun install` for Biome.

## Open questions

None as of approval. Implementation plan to follow in the next session.
