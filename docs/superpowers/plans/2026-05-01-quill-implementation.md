# Quill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app that plays Scott Malthouse's _Quill_ end-to-end — character/skill/scenario selection, five-paragraph letter-writing with Heart/Language/Penmanship dice mechanics, and Markdown export of the finished letter.

**Architecture:** Single-page vanilla TypeScript app with a tiny reactive store, screens as render functions, scenarios in JSON. Bun is the runtime, bundler, test runner, and dev server. No UI framework. Pure functions for dice / rules / scoring (full TDD). UI verified manually.

**Tech Stack:** Bun, TypeScript (strict), Biome, native DOM, CSS Grid, Google Fonts (EB Garamond + IM Fell English SC).

**Spec:** `docs/superpowers/specs/2026-05-01-quill-design.md`

---

## File Structure (decided up front)

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
│   ├── main.ts          # entry: bootstraps router + restores session
│   ├── types.ts         # all domain interfaces (no runtime code)
│   ├── data.ts          # 6 characters + 3 skills (rulebook constants)
│   ├── scenarios.ts     # fetch + validate scenario JSON
│   ├── rules.ts         # planRoll(): Rules of Correspondence → roll plan
│   ├── dice.ts          # roll(), countSuccesses(), attribute → dice count
│   ├── scoring.ts       # score(): pure function over GameSession
│   ├── store.ts         # Store class + localStorage persistence
│   ├── export.ts        # toMarkdown(): finished letter → .md string
│   └── screens/
│       ├── setup.ts     # character → skill → scenario wizard
│       ├── play.ts      # main play screen + paragraph state machine
│       └── score.ts     # final score + download button
└── tests/
    ├── dice.test.ts
    ├── rules.test.ts
    ├── scoring.test.ts
    ├── scenarios.test.ts
    ├── export.test.ts
    └── store.test.ts
```

Boundaries: pure logic (`dice`, `rules`, `scoring`, `export`) has no DOM dependency. `store` knows about `localStorage` but not the DOM. `screens/*` are the only modules that touch the DOM. `main.ts` wires them together. This keeps the testable surface large and the UI surface thin.

---

## Task 1: Project scaffold

**Files:**

- Create: `Games/quill/package.json`
- Create: `Games/quill/tsconfig.json`
- Create: `Games/quill/biome.json`
- Create: `Games/quill/README.md`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "quill",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun ./public/index.html",
    "build": "bun build ./public/index.html --outdir dist",
    "test": "bun test",
    "check": "biome check --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "jsx": "preserve",
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "always" }
  }
}
```

- [ ] **Step 4: Write `README.md`**

```markdown
# Quill

A local web app for playing Scott Malthouse's [Quill](https://www.drivethrurpg.com/) — a single-player letter-writing roleplaying game. Pick a character, scenario, and skill; write a five-paragraph letter under the dice mechanics; export the finished letter as Markdown.

## Run

\`\`\`sh
bun install
bun run dev # http://localhost:3000
\`\`\`

## Test

\`\`\`sh
bun test
bun run check
\`\`\`

## Build

\`\`\`sh
bun run build
\`\`\`

## Manual smoke test

1. `bun run dev`, open the URL.
2. Pick a character, a skill, and a scenario; click _Begin letter_.
3. Write all five paragraphs through to the Score screen.
4. Click _Download letter (.md)_; confirm the file lands in Downloads.
5. Reload during play; confirm the in-progress letter restores.
6. Click _Write another letter_ on the Score screen; confirm Setup re-appears.
```

- [ ] **Step 5: Install and verify**

Run: `cd Games/quill && bun install`
Expected: `bun.lock` created, `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
cd Games/quill
git add package.json tsconfig.json biome.json README.md bun.lock
git commit -m "chore: initial Bun + TypeScript + Biome scaffold"
```

---

## Task 2: HTML shell, CSS skeleton, hello-world entry

**Files:**

- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `src/main.ts`

- [ ] **Step 1: Write `public/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quill</title>
    <link rel="stylesheet" href="./styles.css" />
    <link
      href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=IM+Fell+English+SC&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="../src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `public/styles.css` (skeleton — full styling later)**

```css
:root {
  --parchment: #f4e5c2;
  --parchment-dark: #e8d4a6;
  --ink: #2a1f0e;
  --ink-soft: #4a3a20;
  --accent: #8b4513;
  --success: #5a6f3a;
  --failure: #843131;
  --display-font: "IM Fell English SC", serif;
  --body-font: "EB Garamond", Georgia, serif;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--parchment);
  color: var(--ink);
  font-family: var(--body-font);
  font-size: 18px;
  line-height: 1.5;
}

#app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}
```

- [ ] **Step 3: Write `src/main.ts` hello-world**

```ts
const app = document.getElementById("app");
if (!app) throw new Error("Missing #app element");
app.textContent = "Quill — hello.";
```

- [ ] **Step 4: Run dev server, verify**

Run: `bun run dev`
Expected: Bun serves on `http://localhost:3000` (or similar). Opening it shows "Quill — hello." in EB Garamond on a parchment-colored background.

Stop the server (Ctrl-C).

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css src/main.ts
git commit -m "feat: html shell, parchment color tokens, hello entry"
```

---

## Task 3: Domain types

**Files:**

- Create: `src/types.ts`

- [ ] **Step 1: Write `src/types.ts`**

```ts
export type Attribute = "penmanship" | "language" | "heart";
export type Rating = "poor" | "average" | "good";

export interface Character {
  id: string;
  name: string;
  flavor: string[];
  attributes: Record<Attribute, Rating>;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  bonusAttribute: Attribute;
}

export interface InkPotEntry {
  inferior: string;
  superior: string;
}

export type Modifier =
  | {
      type: "dice_bonus";
      attribute: Attribute;
      amount: number;
      appliesTo?: { characters: string[] };
      description: string;
    }
  | {
      type: "reroll_highest";
      attribute: Attribute;
      description: string;
    };

export interface ConsequenceTier {
  threshold: number;
  text: string;
}

export interface Scenario {
  id: string;
  title: string;
  profile: string[];
  rulesOfCorrespondence: Modifier[];
  inkPot: InkPotEntry[];
  consequences: ConsequenceTier[];
}

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
  status: "in_progress" | "finished";
}

export const TIER_NAMES = {
  0: "unsuccessful",
  5: "tepid",
  8: "favourable",
  11: "excellent",
} as const;

export type TierName = (typeof TIER_NAMES)[keyof typeof TIER_NAMES];
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: domain types for characters, scenarios, and game session"
```

---

## Task 4: Dice module (TDD)

**Files:**

- Create: `tests/dice.test.ts`
- Create: `src/dice.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/dice.test.ts
import { describe, expect, test } from "bun:test";
import { countSuccesses, diceForRating, roll } from "../src/dice";

describe("diceForRating", () => {
  test("poor → 1, average → 2, good → 3", () => {
    expect(diceForRating("poor")).toBe(1);
    expect(diceForRating("average")).toBe(2);
    expect(diceForRating("good")).toBe(3);
  });
});

describe("roll", () => {
  test("returns N dice values in [1,6]", () => {
    const out = roll(5);
    expect(out).toHaveLength(5);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  test("uses injected RNG deterministically", () => {
    let i = 0;
    const seq = [0.0, 0.99, 0.5, 0.16, 0.83]; // → 1, 6, 4, 1, 5
    const rng = () => seq[i++] ?? 0;
    expect(roll(5, rng)).toEqual([1, 6, 4, 1, 5]);
  });

  test("returns empty array for n=0", () => {
    expect(roll(0)).toEqual([]);
  });
});

describe("countSuccesses", () => {
  test("counts 5s and 6s", () => {
    expect(countSuccesses([1, 2, 3, 4])).toBe(0);
    expect(countSuccesses([5])).toBe(1);
    expect(countSuccesses([6])).toBe(1);
    expect(countSuccesses([5, 6, 5, 1])).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `bun test tests/dice.test.ts`
Expected: tests fail because `../src/dice` does not exist.

- [ ] **Step 3: Implement `src/dice.ts`**

```ts
import type { Rating } from "./types";

export function diceForRating(r: Rating): number {
  return r === "poor" ? 1 : r === "average" ? 2 : 3;
}

export function roll(n: number, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.floor(rng() * 6) + 1);
  }
  return out;
}

export function countSuccesses(dice: number[]): number {
  return dice.filter((d) => d >= 5).length;
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `bun test tests/dice.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/dice.ts tests/dice.test.ts
git commit -m "feat: dice rolling, success counting, attribute → dice mapping"
```

---

## Task 5: Static character & skill data (TDD)

**Files:**

- Create: `tests/data.test.ts`
- Create: `src/data.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/data.test.ts
import { describe, expect, test } from "bun:test";
import { CHARACTERS, SKILLS } from "../src/data";

describe("CHARACTERS", () => {
  test("contains exactly 6 archetypes from the rulebook", () => {
    const ids = CHARACTERS.map((c) => c.id).sort();
    expect(ids).toEqual([
      "aristocrat",
      "courtier",
      "knight",
      "monk",
      "poet",
      "scholar",
    ]);
  });

  test("each character has all three attributes set to a valid rating", () => {
    for (const c of CHARACTERS) {
      for (const attr of ["penmanship", "language", "heart"] as const) {
        expect(["poor", "average", "good"]).toContain(c.attributes[attr]);
      }
    }
  });

  test("each character has at least one paragraph of flavor text", () => {
    for (const c of CHARACTERS) {
      expect(c.flavor.length).toBeGreaterThan(0);
    }
  });
});

describe("SKILLS", () => {
  test("contains exactly 3 skills, one per attribute", () => {
    expect(SKILLS).toHaveLength(3);
    const bonusAttrs = SKILLS.map((s) => s.bonusAttribute).sort();
    expect(bonusAttrs).toEqual(["heart", "language", "penmanship"]);
  });
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `bun test tests/data.test.ts`
Expected: fails because `../src/data` is missing.

- [ ] **Step 3: Implement `src/data.ts`**

Use the rulebook attributes (Monk Pen=Good Lang=Avg Heart=Poor; Knight Pen=Avg Lang=Poor Heart=Good; Poet Pen=Poor Lang=Good Heart=Avg; Aristocrat Pen=Good Lang=Poor Heart=Avg; Scholar Pen=Avg Lang=Good Heart=Poor; Courtier Pen=Poor Lang=Avg Heart=Good).

```ts
import type { Character, Skill } from "./types";

export const CHARACTERS: Character[] = [
  {
    id: "monk",
    name: "The Monk",
    flavor: [
      "The holiest of people, monks come from all walks of life, whether they are rich or poor. Monks devote their life to the teachings of their deity, living a secluded, quiet life in the monastery. Monks must take three vows that they keep sacred — the Vow of Poverty, the Vow of Chastity and the Vow of Obedience.",
      "Monks are very well respected in society. Monks have excellent penmanship, having been taught the art of calligraphy in the monastery. However, they tend to write matter-of-factly.",
      "The female version of the monk is the nun.",
    ],
    attributes: { penmanship: "good", language: "average", heart: "poor" },
  },
  {
    id: "knight",
    name: "The Knight",
    flavor: [
      "The knight is the bastion of chivalry and romance. Tales are told of great knights and their bravery in the battlefield.",
      "Knights embark upon grand quests, often given by the King or Queen — whether it is to save a village from marauders or to rid a forest of boggarts.",
      "It is worth noting that knights can be either men or women.",
      "While knights write with all their heart, they do not have the best grasp of language.",
    ],
    attributes: { penmanship: "average", language: "poor", heart: "good" },
  },
  {
    id: "poet",
    name: "The Poet",
    flavor: [
      "The poet is a master of language — able to create beauty with just a quill and parchment.",
      "Many poets form literary groups, or Poet Corners, where they meet and discuss their works. Some will even read out loud their epic works in front of an audience for payment.",
      "Because the poet is more concerned with the words on the page rather than how they are presented, their penmanship isn’t the best.",
    ],
    attributes: { penmanship: "poor", language: "good", heart: "average" },
  },
  {
    id: "aristocrat",
    name: "The Aristocrat",
    flavor: [
      "The aristocracy represents the most wealthy and privileged people in society. They have everything they could ever need — stately homes, valuable trinkets and servants at their disposal.",
      "Naturally aristocrats have a high standing in society, although not all are respected as many are seen as pompous and arrogant, throwing their money away on frivolous things rather than aiding those less fortunate.",
    ],
    attributes: { penmanship: "good", language: "poor", heart: "average" },
  },
  {
    id: "scholar",
    name: "The Scholar",
    flavor: [
      "Scholars are the great minds of the world — studying subjects like mathematics, literature, botany and geography.",
      "The halls of universities are packed with scholars, some of which teach while others study their discipline in the library.",
      "Scholars are well-educated, so their grasp of language is second-to-none.",
    ],
    attributes: { penmanship: "average", language: "good", heart: "poor" },
  },
  {
    id: "courtier",
    name: "The Courtier",
    flavor: [
      "Walking the halls of power, the courtier is a social butterfly who aims to climb the ranks through flattery and intrigue. They live within the walls of palaces and castles, aiding the monarchy with their duties.",
      "Courtiers are experts at winning people over and gaining their trust, although they are known to play people off against each other through deception in order to get ahead.",
    ],
    attributes: { penmanship: "poor", language: "average", heart: "good" },
  },
];

export const SKILLS: Skill[] = [
  {
    id: "inspiration",
    name: "Inspiration",
    description:
      "You are a born leader, with the ability to use powerful language to inspire others in your letters. Gain +1 die to a Language test.",
    bonusAttribute: "language",
  },
  {
    id: "illumination",
    name: "Illumination",
    description:
      "You have studied the art of calligraphy and manuscript illumination, able to conjure incredible works from the tip of your pen. Gain +1 die to a Penmanship test.",
    bonusAttribute: "penmanship",
  },
  {
    id: "augmentation",
    name: "Augmentation",
    description:
      "You are an emotive writer with the ability to describe a scene in such a way to transport the reader with your language. Gain +1 die to a Heart test.",
    bonusAttribute: "heart",
  },
];

export function characterById(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `bun test tests/data.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/data.ts tests/data.test.ts
git commit -m "feat: rulebook character archetypes and skill definitions"
```

---

## Task 6: Rules of Correspondence engine (TDD)

**Files:**

- Create: `tests/rules.test.ts`
- Create: `src/rules.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rules.test.ts
import { describe, expect, test } from "bun:test";
import { characterById } from "../src/data";
import { planRoll } from "../src/rules";
import type { Scenario } from "../src/types";

const baseScenario: Scenario = {
  id: "test",
  title: "Test",
  profile: [],
  rulesOfCorrespondence: [],
  inkPot: [],
  consequences: [
    { threshold: 0, text: "" },
    { threshold: 5, text: "" },
    { threshold: 8, text: "" },
    { threshold: 11, text: "" },
  ],
};

describe("planRoll", () => {
  test("uses character base attribute when no modifiers apply", () => {
    const monk = characterById("monk")!;
    const plan = planRoll({
      attribute: "penmanship",
      character: monk,
      scenario: baseScenario,
      skillBonusActive: false,
    });
    // Monk: penmanship=good → 3 dice
    expect(plan.diceCount).toBe(3);
    expect(plan.rerollPolicy).toBeNull();
  });

  test("skill bonus adds 1 die", () => {
    const monk = characterById("monk")!;
    const plan = planRoll({
      attribute: "language",
      character: monk,
      scenario: baseScenario,
      skillBonusActive: true,
    });
    // Monk: language=average → 2, +1 skill = 3
    expect(plan.diceCount).toBe(3);
  });

  test("unconditional dice_bonus adds dice", () => {
    const monk = characterById("monk")!;
    const scenario: Scenario = {
      ...baseScenario,
      rulesOfCorrespondence: [
        {
          type: "dice_bonus",
          attribute: "penmanship",
          amount: 1,
          description: "superior parchment",
        },
      ],
    };
    const plan = planRoll({
      attribute: "penmanship",
      character: monk,
      scenario,
      skillBonusActive: false,
    });
    expect(plan.diceCount).toBe(4); // 3 + 1
  });

  test("character-restricted dice_bonus only applies to listed characters", () => {
    const monk = characterById("monk")!;
    const courtier = characterById("courtier")!;
    const scenario: Scenario = {
      ...baseScenario,
      rulesOfCorrespondence: [
        {
          type: "dice_bonus",
          attribute: "heart",
          amount: 1,
          appliesTo: { characters: ["courtier", "aristocrat"] },
          description: "court favor",
        },
      ],
    };
    const monkPlan = planRoll({
      attribute: "heart",
      character: monk,
      scenario,
      skillBonusActive: false,
    });
    // Monk: heart=poor → 1 die, no bonus
    expect(monkPlan.diceCount).toBe(1);
    const courtierPlan = planRoll({
      attribute: "heart",
      character: courtier,
      scenario,
      skillBonusActive: false,
    });
    // Courtier: heart=good → 3 dice, +1 bonus = 4
    expect(courtierPlan.diceCount).toBe(4);
  });

  test("reroll_highest policy is reflected in the plan", () => {
    const monk = characterById("monk")!;
    const scenario: Scenario = {
      ...baseScenario,
      rulesOfCorrespondence: [
        {
          type: "reroll_highest",
          attribute: "penmanship",
          description: "re-roll highest",
        },
      ],
    };
    const plan = planRoll({
      attribute: "penmanship",
      character: monk,
      scenario,
      skillBonusActive: false,
    });
    expect(plan.rerollPolicy).toBe("highest");
  });

  test("reroll_highest only applies to its specific attribute", () => {
    const monk = characterById("monk")!;
    const scenario: Scenario = {
      ...baseScenario,
      rulesOfCorrespondence: [
        { type: "reroll_highest", attribute: "penmanship", description: "" },
      ],
    };
    const plan = planRoll({
      attribute: "language",
      character: monk,
      scenario,
      skillBonusActive: false,
    });
    expect(plan.rerollPolicy).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `bun test tests/rules.test.ts`
Expected: fails — `../src/rules` does not exist.

- [ ] **Step 3: Implement `src/rules.ts`**

```ts
import { diceForRating } from "./dice";
import type { Attribute, Character, Scenario } from "./types";

export interface RollPlan {
  diceCount: number;
  rerollPolicy: "highest" | null;
}

export function planRoll(args: {
  attribute: Attribute;
  character: Character;
  scenario: Scenario;
  skillBonusActive: boolean;
}): RollPlan {
  const { attribute, character, scenario, skillBonusActive } = args;
  let diceCount = diceForRating(character.attributes[attribute]);
  let rerollPolicy: "highest" | null = null;

  for (const mod of scenario.rulesOfCorrespondence) {
    if (mod.attribute !== attribute) continue;
    if (mod.type === "dice_bonus") {
      const restrict = mod.appliesTo?.characters;
      if (!restrict || restrict.includes(character.id)) {
        diceCount += mod.amount;
      }
    } else if (mod.type === "reroll_highest") {
      rerollPolicy = "highest";
    }
  }

  if (skillBonusActive) diceCount += 1;
  return { diceCount, rerollPolicy };
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `bun test tests/rules.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/rules.ts tests/rules.test.ts
git commit -m "feat: planRoll engine for Rules of Correspondence"
```

---

## Task 7: Scoring function (TDD)

**Files:**

- Create: `tests/scoring.test.ts`
- Create: `src/scoring.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/scoring.test.ts
import { describe, expect, test } from "bun:test";
import { score } from "../src/scoring";
import type {
  ConsequenceTier,
  GameSession,
  Paragraph,
  Scenario,
} from "../src/types";

const consequences: ConsequenceTier[] = [
  { threshold: 0, text: "bad" },
  { threshold: 5, text: "tepid" },
  { threshold: 8, text: "good" },
  { threshold: 11, text: "great" },
];

const scenario: Scenario = {
  id: "s",
  title: "S",
  profile: [],
  rulesOfCorrespondence: [],
  inkPot: [],
  consequences,
};

function para(overrides: Partial<Paragraph>): Paragraph {
  return {
    inkPotIndex: 0,
    attemptedFlourish: false,
    flourishAdjective: null,
    heartRoll: null,
    languageRoll: [3],
    penmanshipRoll: [3],
    skillUsedHere: null,
    text: "",
    ...overrides,
  };
}

function session(paragraphs: Paragraph[]): GameSession {
  return {
    id: "g",
    startedAt: "2026-05-01",
    characterId: "monk",
    skillId: "illumination",
    scenarioId: "s",
    skillSpent: false,
    paragraphs,
    status: "finished",
  };
}

describe("score", () => {
  test("plain inferior word + failed penmanship → 0 points", () => {
    const r = score(
      session([para({ languageRoll: [2], penmanshipRoll: [1] })]),
      scenario,
    );
    expect(r.paragraphs[0]).toBe(0);
  });

  test("plain superior + successful penmanship → 2 points", () => {
    const r = score(
      session([para({ languageRoll: [5], penmanshipRoll: [6] })]),
      scenario,
    );
    expect(r.paragraphs[0]).toBe(2);
  });

  test("flourished superior + successful penmanship → 3 points", () => {
    const r = score(
      session([
        para({
          attemptedFlourish: true,
          flourishAdjective: "solemn",
          heartRoll: [5],
          languageRoll: [6],
          penmanshipRoll: [5],
        }),
      ]),
      scenario,
    );
    expect(r.paragraphs[0]).toBe(3);
  });

  test("flourished inferior → -1, plus penmanship 0 → -1", () => {
    const r = score(
      session([
        para({
          attemptedFlourish: true,
          flourishAdjective: "gallant",
          heartRoll: [6],
          languageRoll: [2],
          penmanshipRoll: [3],
        }),
      ]),
      scenario,
    );
    expect(r.paragraphs[0]).toBe(-1);
  });

  test("flourish attempted but Heart failed → no flourish, plain word scoring", () => {
    const r = score(
      session([
        para({
          attemptedFlourish: true,
          flourishAdjective: "solemn",
          heartRoll: [3, 2],
          languageRoll: [5],
          penmanshipRoll: [3],
        }),
      ]),
      scenario,
    );
    // Heart failed → flourish doesn't apply. Superior word still scores +1.
    expect(r.paragraphs[0]).toBe(1);
  });

  test("penmanship caps at +1 even with multiple successes", () => {
    const r = score(
      session([para({ languageRoll: [2], penmanshipRoll: [5, 6, 5] })]),
      scenario,
    );
    expect(r.paragraphs[0]).toBe(1);
  });

  test("totals across paragraphs and resolves to favourable tier", () => {
    const r = score(
      session([
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
      ]),
      scenario,
    );
    expect(r.total).toBe(10);
    expect(r.tier.threshold).toBe(8);
    expect(r.tierName).toBe("favourable");
  });

  test("negative totals fall back to lowest tier", () => {
    const r = score(
      session([
        para({
          attemptedFlourish: true,
          flourishAdjective: "awful",
          heartRoll: [6],
          languageRoll: [2],
          penmanshipRoll: [1],
        }),
      ]),
      scenario,
    );
    expect(r.total).toBe(-1);
    expect(r.tier.threshold).toBe(0);
    expect(r.tierName).toBe("unsuccessful");
  });
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `bun test tests/scoring.test.ts`
Expected: fails — `../src/scoring` missing.

- [ ] **Step 3: Implement `src/scoring.ts`**

```ts
import { countSuccesses } from "./dice";
import { TIER_NAMES } from "./types";
import type {
  ConsequenceTier,
  GameSession,
  Paragraph,
  Scenario,
  TierName,
} from "./types";

export interface ScoreResult {
  paragraphs: number[];
  total: number;
  tier: ConsequenceTier;
  tierName: TierName;
}

function paragraphPoints(p: Paragraph): number {
  const isSuperior = countSuccesses(p.languageRoll) > 0;
  const flourishApplied =
    p.attemptedFlourish &&
    p.heartRoll !== null &&
    countSuccesses(p.heartRoll) > 0;

  let pts: number;
  if (flourishApplied && isSuperior) pts = 2;
  else if (flourishApplied && !isSuperior) pts = -1;
  else if (!flourishApplied && isSuperior) pts = 1;
  else pts = 0;

  if (countSuccesses(p.penmanshipRoll) > 0) pts += 1;
  return pts;
}

export function score(session: GameSession, scenario: Scenario): ScoreResult {
  const paragraphs = session.paragraphs.map(paragraphPoints);
  const total = paragraphs.reduce((a, b) => a + b, 0);

  // Tier lookup: highest threshold ≤ total. Floor negatives to lowest tier.
  const sorted = [...scenario.consequences].sort(
    (a, b) => a.threshold - b.threshold,
  );
  let tier: ConsequenceTier = sorted[0]!;
  for (const c of sorted) {
    if (total >= c.threshold) tier = c;
  }

  const tierName = TIER_NAMES[tier.threshold as keyof typeof TIER_NAMES];
  return { paragraphs, total, tier, tierName };
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `bun test tests/scoring.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scoring.ts tests/scoring.test.ts
git commit -m "feat: pure scoring function with flourish and tier resolution"
```

---

## Task 8: Scenario JSON files

**Files:**

- Create: `public/scenarios/manifest.json`
- Create: `public/scenarios/archduke.json`
- Create: `public/scenarios/art-dealer.json`
- Create: `public/scenarios/father.json`
- Create: `public/scenarios/king.json`

- [ ] **Step 1: Write `manifest.json`**

```json
["archduke.json", "art-dealer.json", "father.json", "king.json"]
```

- [ ] **Step 2: Write `archduke.json`**

```json
{
  "id": "archduke",
  "title": "The Archduke",
  "profile": [
    "You are corresponding with the Archduke Godfrey, a powerful member of the royal family who is known for his serious demeanour.",
    "You are writing to give your condolences for the passing of his sister, Mary of Linchester. She came down with the consumption and passed a week ago. You were acquainted with her, having been in the same school when you were young. You will bring up your past and what you both did when you were children."
  ],
  "rulesOfCorrespondence": [
    {
      "type": "dice_bonus",
      "attribute": "heart",
      "amount": 1,
      "appliesTo": { "characters": ["courtier", "aristocrat"] },
      "description": "Courtiers and Aristocrats gain an extra Heart die in this scenario"
    },
    {
      "type": "dice_bonus",
      "attribute": "penmanship",
      "amount": 1,
      "description": "You are using a superior parchment in this missive. Gain an extra Penmanship die."
    }
  ],
  "inkPot": [
    { "inferior": "Climbing Trees", "superior": "Scaling Oaks" },
    { "inferior": "Death", "superior": "Passing" },
    { "inferior": "Teachers", "superior": "Scholars" },
    { "inferior": "Rode Horses", "superior": "Rode Stallions" },
    { "inferior": "Town", "superior": "Riverton" },
    { "inferior": "Ducks", "superior": "Mallards" },
    { "inferior": "Angels", "superior": "Seraphim" },
    { "inferior": "Fields", "superior": "Heather Fields" },
    { "inferior": "Church", "superior": "Cathedral of Light" },
    { "inferior": "Young Boy", "superior": "Young Harold of Whent" }
  ],
  "consequences": [
    {
      "threshold": 0,
      "text": "The Archduke is disgusted by your letter. You have lost his respect and will no longer be in contact with you."
    },
    {
      "threshold": 5,
      "text": "The Archduke responds kindly, but is quick to criticise your letter. You will unlikely hear from him for some months."
    },
    {
      "threshold": 8,
      "text": "The Archduke thanks you for your kind letter. He invites you over next week to stay on his estate."
    },
    {
      "threshold": 11,
      "text": "The Archduke thanks you profusely for your excellent letter and promises that you will be repaid for your kindness with a gift of great worth."
    }
  ]
}
```

- [ ] **Step 3: Write `art-dealer.json`**

```json
{
  "id": "art-dealer",
  "title": "The Art Dealer",
  "profile": [
    "You are corresponding with Christina Bowbridge, renowned art dealer who is known for her enthusiastic personality and adoration of the monarchy.",
    "You are writing to inquire about buying a portrait of Prince Edward IV, however you have heard rumours that this painting could be a fake, but you must find this information from Christina without offending her."
  ],
  "rulesOfCorrespondence": [
    {
      "type": "reroll_highest",
      "attribute": "penmanship",
      "description": "Ms Bowbridge likes to be impressed with beautiful calligraphy so you must take care. When making a Penmanship test, re-roll the highest die and accept the final roll."
    }
  ],
  "inkPot": [
    {
      "inferior": "The Prince",
      "superior": "His Royal Highness Prince Edward IV"
    },
    { "inferior": "Fake", "superior": "Reproduction" },
    { "inferior": "Colours", "superior": "Spectrum" },
    { "inferior": "I'm sorry", "superior": "I apologise profusely" },
    { "inferior": "Fountain", "superior": "Great Fountain of Aleah" },
    { "inferior": "Look at", "superior": "Inspect" },
    { "inferior": "Skill", "superior": "Esteemed expertise" },
    { "inferior": "My mum", "superior": "My dear mother" },
    { "inferior": "Signature", "superior": "Inscription" },
    { "inferior": "Tick you off", "superior": "Offend you" }
  ],
  "consequences": [
    {
      "threshold": 0,
      "text": "Christina takes great offence to your letter and responds with a scathing letter about your character. She will not sell you the painting…ever."
    },
    {
      "threshold": 5,
      "text": "Christina's response is mild, but she has obviously taken some offence. She will sell the painting but for double the price."
    },
    {
      "threshold": 8,
      "text": "Christina is pleased with your letter and responds enthusiastically. She clearly has taken little offence and will sell you the painting."
    },
    {
      "threshold": 11,
      "text": "Christina is overwhelmed by your letter and wishes to give you the painting as a gift."
    }
  ]
}
```

- [ ] **Step 4: Write `father.json`**

```json
{
  "id": "father",
  "title": "The Father",
  "profile": [
    "You are corresponding with Mr Anthony Winsborough, an old friend of yours, whose son, Rupert, was found dead near your residences.",
    "You are writing to inform Anthony of his son's death. You must be sensitive and explain what happened and how you found Rupert."
  ],
  "rulesOfCorrespondence": [
    {
      "type": "dice_bonus",
      "attribute": "language",
      "amount": 1,
      "appliesTo": { "characters": ["monk"] },
      "description": "Anthony would prefer to hear this news from a person of the cloth. Monks and nuns gain an extra die when rolling Language tests for this scenario."
    }
  ],
  "inkPot": [
    { "inferior": "Your boy", "superior": "Your dear son" },
    { "inferior": "Corpse", "superior": "Body" },
    { "inferior": "Bawdy house", "superior": "Drinking establishment" },
    { "inferior": "Brutal", "superior": "Harrowing" },
    { "inferior": "I'm sorry", "superior": "My infinite condolences" },
    { "inferior": "At peace", "superior": "In heaven" },
    { "inferior": "A guard", "superior": "The police" },
    { "inferior": "Sadness", "superior": "Sorrow" },
    { "inferior": "Rain", "superior": "Downpour" },
    { "inferior": "Box", "superior": "Coffin" }
  ],
  "consequences": [
    {
      "threshold": 0,
      "text": "Anthony responds aggressively, blaming you for not being there for him and for not caring. You no longer hear from Anthony."
    },
    {
      "threshold": 5,
      "text": "Anthony's is clearly disappointed in how you have relayed the information to him, but he does not blame you."
    },
    {
      "threshold": 8,
      "text": "Anthony thanks you for telling him about his son and invites you to his funeral."
    },
    {
      "threshold": 11,
      "text": "Anthony commends you for your letter and wishes you to speak at his son's funeral."
    }
  ]
}
```

- [ ] **Step 5: Write `king.json`**

```json
{
  "id": "king",
  "title": "The King",
  "profile": [
    "You are corresponding with King Gerald V, who you have only met on one occasion. He is a tyrant and unloved by the populace.",
    "You are writing to inform the King of a suspicious fellow you have seen about town who you believe to be a spy. You must convince him that you are not a raving lunatic and to take your concerns seriously, while being cordial."
  ],
  "rulesOfCorrespondence": [
    {
      "type": "dice_bonus",
      "attribute": "penmanship",
      "amount": 1,
      "description": "You are using a high quality parchment and seal. Gain an extra Penmanship die."
    },
    {
      "type": "dice_bonus",
      "attribute": "heart",
      "amount": 1,
      "appliesTo": { "characters": ["courtier"] },
      "description": "Courtiers gain an extra Heart die this scenario."
    }
  ],
  "inkPot": [
    { "inferior": "Gerald", "superior": "Your Majesty" },
    { "inferior": "Smithy", "superior": "Blacksmith" },
    { "inferior": "Funny man", "superior": "Curious individual" },
    { "inferior": "Hidden", "superior": "Concealed" },
    { "inferior": "Poison", "superior": "Deadly Nightshade" },
    { "inferior": "Big bloke", "superior": "Imposing man" },
    { "inferior": "Cow house", "superior": "Barn" },
    { "inferior": "Furry lip", "superior": "Moustache" },
    { "inferior": "Buggered face", "superior": "Scarred visage" },
    { "inferior": "Worrying", "superior": "Alarming" }
  ],
  "consequences": [
    {
      "threshold": 0,
      "text": "The King does not respond. Several days after you sent your missive you are visited by the royal guard and brought to prison for your disrespectful letter."
    },
    {
      "threshold": 5,
      "text": "You receive a letter from the captain of the royal guard thanking you, but she does not believe you and does not wish you to write again."
    },
    {
      "threshold": 8,
      "text": "You receive a letter from a senior official close to the King thanking you. You also receive a monetary reward in the letter."
    },
    {
      "threshold": 11,
      "text": "The King writes to you personally with great thanks. He has positioned his guard close by and the spy will be caught. You are invited to the King's court as a guest and hero."
    }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add public/scenarios/
git commit -m "feat: rulebook scenarios — Archduke, Art Dealer, Father, King"
```

---

## Task 9: Scenario loader + validator (TDD)

**Files:**

- Create: `tests/scenarios.test.ts`
- Create: `src/scenarios.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/scenarios.test.ts
import { describe, expect, test } from "bun:test";
import { loadScenarios, validateScenario } from "../src/scenarios";

describe("validateScenario", () => {
  const valid = {
    id: "x",
    title: "X",
    profile: ["hello"],
    rulesOfCorrespondence: [],
    inkPot: [{ inferior: "a", superior: "b" }],
    consequences: [
      { threshold: 0, text: "a" },
      { threshold: 5, text: "b" },
      { threshold: 8, text: "c" },
      { threshold: 11, text: "d" },
    ],
  };

  test("accepts a well-formed scenario", () => {
    expect(() => validateScenario(valid)).not.toThrow();
  });

  test("rejects missing thresholds", () => {
    const bad = {
      ...valid,
      consequences: [
        { threshold: 0, text: "" },
        { threshold: 5, text: "" },
        { threshold: 8, text: "" },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/thresholds/i);
  });

  test("rejects unknown modifier types", () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [{ type: "magic", description: "no" }],
    };
    expect(() => validateScenario(bad)).toThrow(/modifier/i);
  });

  test("rejects empty inkPot", () => {
    const bad = { ...valid, inkPot: [] };
    expect(() => validateScenario(bad)).toThrow(/inkPot/i);
  });
});

describe("loadScenarios (integration with public/scenarios)", () => {
  test("loads all 4 rulebook scenarios from disk via fetch", async () => {
    // Bun.serve('public') in test would be heavy; read the manifest + files directly.
    const fs = await import("node:fs/promises");
    const manifest = JSON.parse(
      await fs.readFile("public/scenarios/manifest.json", "utf-8"),
    ) as string[];
    const ids: string[] = [];
    for (const f of manifest) {
      const raw = JSON.parse(
        await fs.readFile(`public/scenarios/${f}`, "utf-8"),
      );
      validateScenario(raw);
      ids.push(raw.id);
    }
    expect(ids.sort()).toEqual(["archduke", "art-dealer", "father", "king"]);
  });
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `bun test tests/scenarios.test.ts`
Expected: fails — `../src/scenarios` missing.

- [ ] **Step 3: Implement `src/scenarios.ts`**

```ts
import type { Modifier, Scenario } from "./types";

const REQUIRED_THRESHOLDS = [0, 5, 8, 11] as const;
const VALID_ATTRS = new Set(["penmanship", "language", "heart"]);

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function validateModifier(m: unknown): Modifier {
  if (typeof m !== "object" || m === null) {
    throw new Error("Modifier must be an object");
  }
  const obj = m as Record<string, unknown>;
  if (typeof obj.description !== "string") {
    throw new Error("Modifier missing description");
  }
  if (typeof obj.attribute !== "string" || !VALID_ATTRS.has(obj.attribute)) {
    throw new Error(`Modifier has invalid attribute: ${String(obj.attribute)}`);
  }

  if (obj.type === "dice_bonus") {
    if (typeof obj.amount !== "number" || obj.amount <= 0) {
      throw new Error("dice_bonus modifier requires positive numeric amount");
    }
    let appliesTo: { characters: string[] } | undefined;
    if (obj.appliesTo !== undefined) {
      const at = obj.appliesTo as Record<string, unknown>;
      if (!isStringArray(at.characters)) {
        throw new Error("dice_bonus.appliesTo.characters must be string[]");
      }
      appliesTo = { characters: at.characters };
    }
    return {
      type: "dice_bonus",
      attribute: obj.attribute as Modifier["attribute"],
      amount: obj.amount,
      ...(appliesTo ? { appliesTo } : {}),
      description: obj.description,
    };
  }

  if (obj.type === "reroll_highest") {
    return {
      type: "reroll_highest",
      attribute: obj.attribute as Modifier["attribute"],
      description: obj.description,
    };
  }

  throw new Error(`Unknown modifier type: ${String(obj.type)}`);
}

export function validateScenario(raw: unknown): Scenario {
  if (typeof raw !== "object" || raw === null)
    throw new Error("Scenario must be an object");
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string")
    throw new Error("Scenario.id must be a string");
  if (typeof obj.title !== "string")
    throw new Error("Scenario.title must be a string");
  if (!isStringArray(obj.profile))
    throw new Error("Scenario.profile must be string[]");

  if (!Array.isArray(obj.rulesOfCorrespondence)) {
    throw new Error("Scenario.rulesOfCorrespondence must be an array");
  }
  const rules = obj.rulesOfCorrespondence.map(validateModifier);

  if (!Array.isArray(obj.inkPot) || obj.inkPot.length === 0) {
    throw new Error("Scenario.inkPot must be a non-empty array");
  }
  const inkPot = obj.inkPot.map((e, i) => {
    if (typeof e !== "object" || e === null)
      throw new Error(`inkPot[${i}] must be object`);
    const entry = e as Record<string, unknown>;
    if (
      typeof entry.inferior !== "string" ||
      typeof entry.superior !== "string"
    ) {
      throw new Error(`inkPot[${i}] must have inferior+superior strings`);
    }
    return { inferior: entry.inferior, superior: entry.superior };
  });

  if (!Array.isArray(obj.consequences))
    throw new Error("Scenario.consequences must be array");
  const thresholds = obj.consequences
    .map((c) => (c as { threshold: number }).threshold)
    .sort((a, b) => a - b);
  if (
    thresholds.length !== REQUIRED_THRESHOLDS.length ||
    !thresholds.every((t, i) => t === REQUIRED_THRESHOLDS[i])
  ) {
    throw new Error(
      `Scenario.consequences thresholds must be exactly [0,5,8,11], got [${thresholds.join(",")}]`,
    );
  }
  const consequences = obj.consequences.map((c, i) => {
    const ct = c as Record<string, unknown>;
    if (typeof ct.threshold !== "number" || typeof ct.text !== "string") {
      throw new Error(`consequences[${i}] malformed`);
    }
    return { threshold: ct.threshold, text: ct.text };
  });

  return {
    id: obj.id,
    title: obj.title,
    profile: obj.profile,
    rulesOfCorrespondence: rules,
    inkPot,
    consequences,
  };
}

export async function loadScenarios(
  baseUrl = "./scenarios",
): Promise<Scenario[]> {
  const manifestRes = await fetch(`${baseUrl}/manifest.json`);
  if (!manifestRes.ok) throw new Error("Failed to fetch scenario manifest");
  const files = (await manifestRes.json()) as string[];
  const out: Scenario[] = [];
  for (const f of files) {
    const res = await fetch(`${baseUrl}/${f}`);
    if (!res.ok) throw new Error(`Failed to fetch scenario ${f}`);
    out.push(validateScenario(await res.json()));
  }
  return out;
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `bun test tests/scenarios.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios.ts tests/scenarios.test.ts
git commit -m "feat: scenario loader with strict schema validation"
```

---

## Task 10: Reactive store + localStorage persistence (TDD)

**Files:**

- Create: `tests/store.test.ts`
- Create: `src/store.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/store.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Store } from "../src/store";

// jsdom-free fake localStorage
class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    new FakeStorage() as Storage;
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe("Store", () => {
  test("get returns the initial state", () => {
    const s = new Store({ count: 0 }, "key");
    expect(s.get()).toEqual({ count: 0 });
  });

  test("set updates state and notifies subscribers", () => {
    const s = new Store({ count: 0 }, "key");
    let observed = -1;
    s.subscribe((v) => {
      observed = v.count;
    });
    s.set((cur) => ({ ...cur, count: 7 }));
    expect(observed).toBe(7);
  });

  test("persists to localStorage", () => {
    const s = new Store({ count: 0 }, "persist-key");
    s.set((cur) => ({ ...cur, count: 9 }));
    const raw = localStorage.getItem("persist-key");
    expect(raw).toBe(JSON.stringify({ count: 9 }));
  });

  test("hydrates from localStorage on construction", () => {
    localStorage.setItem("h-key", JSON.stringify({ count: 42 }));
    const s = new Store({ count: 0 }, "h-key");
    expect(s.get()).toEqual({ count: 42 });
  });

  test("clear removes from localStorage and resets in-memory to provided value", () => {
    const s = new Store({ count: 1 }, "c-key");
    s.set((cur) => ({ ...cur, count: 99 }));
    s.clear({ count: 0 });
    expect(s.get()).toEqual({ count: 0 });
    expect(localStorage.getItem("c-key")).toBeNull();
  });

  test("subscribe returns an unsubscribe function", () => {
    const s = new Store({ count: 0 }, "u-key");
    let calls = 0;
    const unsub = s.subscribe(() => {
      calls++;
    });
    s.set((c) => ({ ...c, count: 1 }));
    unsub();
    s.set((c) => ({ ...c, count: 2 }));
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `bun test tests/store.test.ts`
Expected: fails — `../src/store` missing.

- [ ] **Step 3: Implement `src/store.ts`**

```ts
type Updater<T> = (current: T) => T;
type Listener<T> = (value: T) => void;

export class Store<T> {
  private state: T;
  private listeners = new Set<Listener<T>>();
  private readonly key: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: T, key: string) {
    this.key = key;
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    this.state = raw !== null ? (JSON.parse(raw) as T) : initial;
  }

  get(): T {
    return this.state;
  }

  set(updater: Updater<T>, opts: { debouncePersist?: boolean } = {}): void {
    this.state = updater(this.state);
    for (const fn of this.listeners) fn(this.state);
    if (opts.debouncePersist) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.persist(), 200);
    } else {
      this.persist();
    }
  }

  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  clear(reset: T): void {
    this.state = reset;
    if (typeof localStorage !== "undefined") localStorage.removeItem(this.key);
    for (const fn of this.listeners) fn(this.state);
  }

  private persist(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(this.key, JSON.stringify(this.state));
    }
  }
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `bun test tests/store.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts tests/store.test.ts
git commit -m "feat: Store class with localStorage persistence and debounced writes"
```

---

## Task 11: Markdown export (TDD)

**Files:**

- Create: `tests/export.test.ts`
- Create: `src/export.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/export.test.ts
import { describe, expect, test } from "bun:test";
import { CHARACTERS, SKILLS } from "../src/data";
import { toMarkdown } from "../src/export";
import type { GameSession, Scenario } from "../src/types";

const scenario: Scenario = {
  id: "archduke",
  title: "The Archduke",
  profile: [],
  rulesOfCorrespondence: [],
  inkPot: [
    { inferior: "Death", superior: "Passing" },
    { inferior: "Town", superior: "Riverton" },
  ],
  consequences: [
    { threshold: 0, text: "bad" },
    { threshold: 5, text: "tepid" },
    { threshold: 8, text: "The Archduke thanks you for your kind letter." },
    { threshold: 11, text: "great" },
  ],
};

const session: GameSession = {
  id: "g",
  startedAt: "2026-05-01T00:00:00.000Z",
  characterId: "monk",
  skillId: "illumination",
  scenarioId: "archduke",
  skillSpent: true,
  status: "finished",
  paragraphs: [
    {
      inkPotIndex: 0,
      attemptedFlourish: true,
      flourishAdjective: "solemn",
      heartRoll: [5, 3],
      languageRoll: [6, 2],
      penmanshipRoll: [4, 5],
      skillUsedHere: "penmanship",
      text: "I write to convey solemn Passing of your dear sister.",
    },
    {
      inkPotIndex: 1,
      attemptedFlourish: false,
      flourishAdjective: null,
      heartRoll: null,
      languageRoll: [3],
      penmanshipRoll: [6],
      skillUsedHere: null,
      text: "I remain near our small Town this season.",
    },
  ],
};

describe("toMarkdown", () => {
  test("frontmatter contains character, skill, scenario, score, consequence", () => {
    const md = toMarkdown(session, scenario, CHARACTERS, SKILLS);
    expect(md).toContain("character: The Monk");
    expect(md).toContain("skill: Illumination");
    expect(md).toContain("scenario: The Archduke");
    expect(md).toContain("score: 5");
    expect(md).toContain("consequence: tepid");
  });

  test("letter body contains paragraph text in order", () => {
    const md = toMarkdown(session, scenario, CHARACTERS, SKILLS);
    const i1 = md.indexOf("solemn Passing");
    const i2 = md.indexOf("our small Town");
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
  });

  test("game-record table renders rolls and shows em-dash for missing rolls", () => {
    const md = toMarkdown(session, scenario, CHARACTERS, SKILLS);
    // Paragraph 2 had no flourish and no heart roll → both cells are em-dash.
    const lines = md.split("\n");
    const row2 = lines.find((l) => l.startsWith("| 2 |"));
    expect(row2).toBeDefined();
    expect(row2!).toContain("—"); // em-dash for missing roll/flourish
  });

  test("total score and consequence text appear at the end", () => {
    const md = toMarkdown(session, scenario, CHARACTERS, SKILLS);
    expect(md).toContain("**Total**: 5 / tepid");
    expect(md).toContain("> tepid");
  });
});
```

- [ ] **Step 2: Run tests; expect failure**

Run: `bun test tests/export.test.ts`
Expected: fails — `../src/export` missing.

- [ ] **Step 3: Implement `src/export.ts`**

```ts
import { score } from "./scoring";
import type {
  Character,
  GameSession,
  Paragraph,
  Scenario,
  Skill,
} from "./types";

const EMDASH = "—";

function rollCell(values: number[] | null): string {
  return values && values.length > 0 ? values.join(",") : EMDASH;
}

function paragraphRow(
  p: Paragraph,
  idx: number,
  scenario: Scenario,
  points: number,
): string {
  const pair = scenario.inkPot[p.inkPotIndex];
  const word = pair
    ? p.languageRoll.some((d) => d >= 5)
      ? `${pair.superior} (superior)`
      : `${pair.inferior} (inferior)`
    : EMDASH;
  const flourish =
    p.attemptedFlourish && p.flourishAdjective ? p.flourishAdjective : EMDASH;
  return `| ${idx + 1} | ${word} | ${flourish} | ${rollCell(p.heartRoll)} | ${rollCell(p.languageRoll)} | ${rollCell(p.penmanshipRoll)} | ${points} |`;
}

export function toMarkdown(
  session: GameSession,
  scenario: Scenario,
  characters: Character[],
  skills: Skill[],
): string {
  const character = characters.find((c) => c.id === session.characterId);
  const skill = skills.find((s) => s.id === session.skillId);
  if (!character || !skill)
    throw new Error("Unknown character or skill in session");

  const result = score(session, scenario);
  const date = session.startedAt.slice(0, 10);

  const frontmatter = [
    "---",
    `date: ${date}`,
    `character: ${character.name}`,
    `skill: ${skill.name}`,
    `scenario: ${scenario.title}`,
    `score: ${result.total}`,
    `consequence: ${result.tierName}`,
    "---",
    "",
  ].join("\n");

  const body = session.paragraphs.map((p) => p.text.trim()).join("\n\n");

  const tableHeader =
    "| # | Word | Flourish | Heart | Language | Penmanship | Points |\n| --- | --- | --- | --- | --- | --- | --- |";
  const tableRows = session.paragraphs
    .map((p, i) => paragraphRow(p, i, scenario, result.paragraphs[i] ?? 0))
    .join("\n");

  const footer = [
    "",
    "---",
    "",
    "## Game record",
    "",
    tableHeader,
    tableRows,
    "",
    `**Total**: ${result.total} / ${result.tierName}`,
    "",
    `> ${result.tier.text}`,
    "",
  ].join("\n");

  return `${frontmatter}\n${body}\n${footer}`;
}
```

- [ ] **Step 4: Run tests; expect pass**

Run: `bun test tests/export.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/export.ts tests/export.test.ts
git commit -m "feat: Markdown export with frontmatter, body, and game record table"
```

---

## Task 12: App shell, screen router, scenario bootstrap

**Files:**

- Modify: `src/main.ts`
- Create: `src/screens/setup.ts` (placeholder)
- Create: `src/screens/play.ts` (placeholder)
- Create: `src/screens/score.ts` (placeholder)

- [ ] **Step 1: Create placeholder screens**

```ts
// src/screens/setup.ts
import type { Scenario } from "../types";

export interface SetupCtx {
  scenarios: Scenario[];
  onBegin: (sel: {
    characterId: string;
    skillId: string;
    scenarioId: string;
  }) => void;
}

export function renderSetup(_ctx: SetupCtx): HTMLElement {
  const el = document.createElement("section");
  el.className = "screen screen--setup";
  el.textContent = "Setup screen — character / skill / scenario (placeholder)";
  return el;
}
```

```ts
// src/screens/play.ts
import type { GameSession, Scenario } from "../types";

export interface PlayCtx {
  session: GameSession;
  scenario: Scenario;
  onFinish: () => void;
}

export function renderPlay(_ctx: PlayCtx): HTMLElement {
  const el = document.createElement("section");
  el.className = "screen screen--play";
  el.textContent = "Play screen (placeholder)";
  return el;
}
```

```ts
// src/screens/score.ts
import type { GameSession, Scenario } from "../types";

export interface ScoreCtx {
  session: GameSession;
  scenario: Scenario;
  onRestart: () => void;
}

export function renderScore(_ctx: ScoreCtx): HTMLElement {
  const el = document.createElement("section");
  el.className = "screen screen--score";
  el.textContent = "Score screen (placeholder)";
  return el;
}
```

- [ ] **Step 2: Rewrite `src/main.ts` to wire scenarios + router**

```ts
import { loadScenarios } from "./scenarios";
import { renderSetup } from "./screens/setup";
import { renderPlay } from "./screens/play";
import { renderScore } from "./screens/score";
import { Store } from "./store";
import type { GameSession, Scenario } from "./types";

const SESSION_KEY = "quill.session.v1";

interface AppState {
  session: GameSession | null;
}

const store = new Store<AppState>({ session: null }, SESSION_KEY);

function newSession(sel: {
  characterId: string;
  skillId: string;
  scenarioId: string;
}): GameSession {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    characterId: sel.characterId,
    skillId: sel.skillId,
    scenarioId: sel.scenarioId,
    skillSpent: false,
    paragraphs: [],
    status: "in_progress",
  };
}

function mount(scenarios: Scenario[]) {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app");

  function render() {
    const state = store.get();
    root!.replaceChildren();
    const session = state.session;

    if (!session) {
      root!.appendChild(
        renderSetup({
          scenarios,
          onBegin: (sel) => store.set(() => ({ session: newSession(sel) })),
        }),
      );
      return;
    }

    const scenario = scenarios.find((s) => s.id === session.scenarioId);
    if (!scenario) {
      // Stale session referencing missing scenario → reset.
      store.clear({ session: null });
      return;
    }

    if (session.status === "in_progress") {
      root!.appendChild(
        renderPlay({
          session,
          scenario,
          onFinish: () =>
            store.set((s) => ({
              session: s.session
                ? { ...s.session, status: "finished" as const }
                : null,
            })),
        }),
      );
    } else {
      root!.appendChild(
        renderScore({
          session,
          scenario,
          onRestart: () => store.clear({ session: null }),
        }),
      );
    }
  }

  store.subscribe(render);
  render();
}

(async () => {
  try {
    const scenarios = await loadScenarios("./scenarios");
    mount(scenarios);
  } catch (err) {
    document.getElementById("app")!.textContent =
      `Failed to load Quill: ${(err as Error).message}`;
    throw err;
  }
})();
```

- [ ] **Step 3: Run dev server, verify**

Run: `bun run dev`
Open the URL.
Expected: shows "Setup screen — character / skill / scenario (placeholder)". No console errors.
Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/screens/setup.ts src/screens/play.ts src/screens/score.ts
git commit -m "feat: app shell with screen router and scenario bootstrap"
```

---

## Task 13: Setup screen — character step

**Files:**

- Modify: `src/screens/setup.ts`
- Modify: `public/styles.css`

- [ ] **Step 1: Replace `src/screens/setup.ts` with character step**

```ts
import { CHARACTERS, SKILLS } from "../data";
import type { Scenario } from "../types";

export interface SetupCtx {
  scenarios: Scenario[];
  onBegin: (sel: {
    characterId: string;
    skillId: string;
    scenarioId: string;
  }) => void;
}

interface SetupState {
  characterId: string | null;
  skillId: string | null;
  scenarioId: string | null;
}

export function renderSetup(ctx: SetupCtx): HTMLElement {
  const root = document.createElement("section");
  root.className = "screen screen--setup";
  const state: SetupState = {
    characterId: null,
    skillId: null,
    scenarioId: null,
  };

  function render() {
    root.replaceChildren();
    const title = document.createElement("h1");
    title.textContent = "Quill";
    title.className = "display-heading";
    root.appendChild(title);
    root.appendChild(renderCharacterStep(state, () => render()));
    if (state.characterId) {
      root.appendChild(renderSkillStep(state, () => render()));
    }
    if (state.skillId) {
      root.appendChild(
        renderScenarioStep(ctx.scenarios, state, () => render()),
      );
    }
    if (state.scenarioId) {
      const begin = document.createElement("button");
      begin.className = "btn btn--primary";
      begin.textContent = "Begin letter";
      begin.addEventListener("click", () => {
        ctx.onBegin({
          characterId: state.characterId!,
          skillId: state.skillId!,
          scenarioId: state.scenarioId!,
        });
      });
      root.appendChild(begin);
    }
  }

  render();
  return root;
}

function renderCharacterStep(
  state: SetupState,
  onChange: () => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "step";
  const h = document.createElement("h2");
  h.textContent = "1. Choose your Character";
  wrap.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "card-grid";
  for (const c of CHARACTERS) {
    const card = document.createElement("button");
    card.className =
      "card" + (state.characterId === c.id ? " card--selected" : "");
    card.innerHTML = `
      <h3>${c.name}</h3>
      <p>${c.flavor[0] ?? ""}</p>
      <ul class="attrs">
        <li>Penmanship: <strong>${c.attributes.penmanship}</strong></li>
        <li>Language: <strong>${c.attributes.language}</strong></li>
        <li>Heart: <strong>${c.attributes.heart}</strong></li>
      </ul>`;
    card.addEventListener("click", () => {
      state.characterId = c.id;
      onChange();
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderSkillStep(state: SetupState, onChange: () => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "step";
  const h = document.createElement("h2");
  h.textContent = "2. Choose your Skill";
  wrap.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "card-grid";
  for (const s of SKILLS) {
    const card = document.createElement("button");
    card.className = "card" + (state.skillId === s.id ? " card--selected" : "");
    card.innerHTML = `<h3>${s.name}</h3><p>${s.description}</p>`;
    card.addEventListener("click", () => {
      state.skillId = s.id;
      onChange();
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderScenarioStep(
  scenarios: Scenario[],
  state: SetupState,
  onChange: () => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "step";
  const h = document.createElement("h2");
  h.textContent = "3. Choose your Scenario";
  wrap.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "card-grid";
  for (const sc of scenarios) {
    const card = document.createElement("button");
    card.className =
      "card" + (state.scenarioId === sc.id ? " card--selected" : "");
    card.innerHTML = `<h3>${sc.title}</h3><p>${sc.profile[0] ?? ""}</p>`;
    card.addEventListener("click", () => {
      state.scenarioId = sc.id;
      onChange();
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);

  if (state.scenarioId) {
    const sc = scenarios.find((x) => x.id === state.scenarioId)!;
    const detail = document.createElement("div");
    detail.className = "scenario-detail";
    detail.innerHTML = `
      <h4>Profile</h4>
      ${sc.profile.map((p) => `<p>${p}</p>`).join("")}
      <h4>Rules of Correspondence</h4>
      ${sc.rulesOfCorrespondence.map((r) => `<p>${r.description}</p>`).join("") || "<p>None.</p>"}
    `;
    wrap.appendChild(detail);
  }
  return wrap;
}
```

- [ ] **Step 2: Append setup styles to `public/styles.css`**

```css
.display-heading {
  font-family: var(--display-font);
  font-size: 3rem;
  margin: 0 0 1rem;
  text-align: center;
}

.step {
  margin: 2rem 0;
  padding: 1rem;
  border: 1px solid var(--ink-soft);
  background: var(--parchment-dark);
}

.step h2 {
  font-family: var(--display-font);
  margin-top: 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.card {
  background: var(--parchment);
  border: 1px solid var(--ink-soft);
  color: var(--ink);
  font-family: var(--body-font);
  text-align: left;
  padding: 1rem;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.card:hover {
  transform: translateY(-2px);
}
.card--selected {
  border-color: var(--accent);
  border-width: 2px;
  background: var(--parchment-dark);
}
.card h3 {
  font-family: var(--display-font);
  margin: 0 0 0.5rem;
}
.card .attrs {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
}

.scenario-detail {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--parchment);
}
.scenario-detail h4 {
  font-family: var(--display-font);
  margin: 1rem 0 0.5rem;
}

.btn {
  font-family: var(--body-font);
  font-size: 1rem;
  padding: 0.5rem 1rem;
  background: var(--parchment);
  color: var(--ink);
  border: 1px solid var(--ink-soft);
  cursor: pointer;
}
.btn:hover {
  background: var(--parchment-dark);
}
.btn--primary {
  background: var(--accent);
  color: var(--parchment);
  border-color: var(--accent);
}
.btn--primary:hover {
  background: var(--ink-soft);
}
```

- [ ] **Step 3: Run dev server, smoke test**

Run: `bun run dev`
Open URL. Click each character card; the second step appears. Click each skill; third step appears. Click each scenario; the Profile + Rules of Correspondence appear and a Begin letter button appears. Clicking Begin transitions to the placeholder Play screen.

- [ ] **Step 4: Commit**

```bash
git add src/screens/setup.ts public/styles.css
git commit -m "feat: setup wizard — character, skill, scenario selection"
```

---

## Task 14: Play screen layout — three-column shell with placeholders

**Files:**

- Modify: `src/screens/play.ts`
- Modify: `public/styles.css`

- [ ] **Step 1: Rewrite `src/screens/play.ts` with the three-column shell**

```ts
import { CHARACTERS, SKILLS } from "../data";
import type { GameSession, Scenario } from "../types";

export interface PlayCtx {
  session: GameSession;
  scenario: Scenario;
  onFinish: () => void;
  onUpdate: (updater: (s: GameSession) => GameSession) => void;
}

export function renderPlay(ctx: PlayCtx): HTMLElement {
  const root = document.createElement("section");
  root.className = "screen screen--play";

  const grid = document.createElement("div");
  grid.className = "play-grid";

  grid.appendChild(renderInkPotPanel(ctx));
  grid.appendChild(renderCenterPanel(ctx));
  grid.appendChild(renderRightPanel(ctx));

  root.appendChild(grid);
  return root;
}

function renderInkPotPanel(ctx: PlayCtx): HTMLElement {
  const panel = document.createElement("aside");
  panel.className = "panel panel--inkpot";
  const h = document.createElement("h3");
  h.textContent = "Ink Pot";
  panel.appendChild(h);
  const list = document.createElement("ul");
  list.className = "inkpot-list";
  ctx.scenario.inkPot.forEach((entry, idx) => {
    const used = ctx.session.paragraphs.find((p) => p.inkPotIndex === idx);
    const li = document.createElement("li");
    li.className = "inkpot-item" + (used ? " inkpot-item--used" : "");
    if (used) {
      const isSuperior = used.languageRoll.some((d) => d >= 5);
      li.textContent = `${entry.inferior} — used (${isSuperior ? "Superior" : "Inferior"})`;
    } else {
      li.textContent = entry.inferior;
    }
    list.appendChild(li);
  });
  panel.appendChild(list);
  return panel;
}

function renderCenterPanel(ctx: PlayCtx): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "panel panel--center";
  const placeholder = document.createElement("p");
  placeholder.textContent = `Paragraph ${ctx.session.paragraphs.length + 1} of 5 — workspace coming soon.`;
  panel.appendChild(placeholder);
  return panel;
}

function renderRightPanel(ctx: PlayCtx): HTMLElement {
  const panel = document.createElement("aside");
  panel.className = "panel panel--right";
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId);
  const charLine = document.createElement("p");
  charLine.textContent = `${character?.name ?? ""} — ${skill?.name ?? ""}`;
  panel.appendChild(charLine);

  const scenarioBox = document.createElement("div");
  scenarioBox.className = "scenario-box";
  scenarioBox.innerHTML = `
    <h4>${ctx.scenario.title}</h4>
    ${ctx.scenario.profile.map((p) => `<p>${p}</p>`).join("")}
    <h5>Rules of Correspondence</h5>
    ${ctx.scenario.rulesOfCorrespondence.map((r) => `<p>${r.description}</p>`).join("") || "<p>None.</p>"}`;
  panel.appendChild(scenarioBox);

  return panel;
}
```

- [ ] **Step 2: Update `src/main.ts` so onUpdate is wired**

In `src/main.ts`, replace the `renderPlay` call's `ctx` to include an `onUpdate` callback:

```ts
// inside mount(), in the in_progress branch:
root!.appendChild(
  renderPlay({
    session,
    scenario,
    onFinish: () =>
      store.set((s) => ({
        session: s.session
          ? { ...s.session, status: "finished" as const }
          : null,
      })),
    onUpdate: (updater) =>
      store.set((s) => ({ session: s.session ? updater(s.session) : null })),
  }),
);
```

- [ ] **Step 3: Append play styles to `public/styles.css`**

```css
.play-grid {
  display: grid;
  grid-template-columns: 240px 1fr 280px;
  gap: 1rem;
}

@media (max-width: 900px) {
  .play-grid {
    grid-template-columns: 1fr;
  }
}

.panel {
  background: var(--parchment-dark);
  border: 1px solid var(--ink-soft);
  padding: 1rem;
}

.panel h3,
.panel h4,
.panel h5 {
  font-family: var(--display-font);
  margin: 0 0 0.5rem;
}

.inkpot-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.inkpot-item {
  padding: 0.4rem 0;
  border-bottom: 1px dotted var(--ink-soft);
}
.inkpot-item--used {
  color: var(--ink-soft);
  text-decoration: line-through;
}

.scenario-box {
  font-size: 0.95rem;
}
.scenario-box p {
  margin: 0.5rem 0;
}
```

- [ ] **Step 4: Run dev server; smoke test**

Run: `bun run dev`. Walk through Setup, click Begin. Confirm three columns appear: Ink Pot on left with all 10 word pairs, placeholder in middle, scenario+character on right. Resize the window below 900 px and confirm stacking.

- [ ] **Step 5: Commit**

```bash
git add src/screens/play.ts src/main.ts public/styles.css
git commit -m "feat: play screen three-column layout with Ink Pot and scenario panels"
```

---

## Task 15: Paragraph state machine — pick word and decide flourish

**Files:**

- Modify: `src/screens/play.ts`

- [ ] **Step 1: Add a "current paragraph draft" sub-store and PICK_WORD/DECIDE_FLOURISH UI**

Replace `renderCenterPanel` and add helper logic. Append the following to `src/screens/play.ts`:

```ts
type PhaseName =
  | "PICK_WORD"
  | "DECIDE_FLOURISH"
  | "ROLL_HEART"
  | "ROLL_LANGUAGE"
  | "WRITE"
  | "ROLL_PENMANSHIP"
  | "PARAGRAPH_DONE";

interface Draft {
  phase: PhaseName;
  inkPotIndex: number | null;
  attemptedFlourish: boolean;
  flourishAdjective: string;
  heartRoll: number[] | null;
  languageRoll: number[] | null;
  penmanshipRoll: number[] | null;
  text: string;
  skillUsedHere: "penmanship" | "language" | "heart" | null;
}

function emptyDraft(): Draft {
  return {
    phase: "PICK_WORD",
    inkPotIndex: null,
    attemptedFlourish: false,
    flourishAdjective: "",
    heartRoll: null,
    languageRoll: null,
    penmanshipRoll: null,
    text: "",
    skillUsedHere: null,
  };
}

let currentDraft: Draft = emptyDraft();
let lastSessionId = "";

function ensureDraftFor(session: GameSession) {
  if (session.id !== lastSessionId) {
    currentDraft = emptyDraft();
    lastSessionId = session.id;
  }
}
```

Replace `renderCenterPanel` body with:

```ts
function renderCenterPanel(ctx: PlayCtx): HTMLElement {
  ensureDraftFor(ctx.session);
  const panel = document.createElement("section");
  panel.className = "panel panel--center";

  const heading = document.createElement("h3");
  heading.textContent = `Paragraph ${ctx.session.paragraphs.length + 1} of 5`;
  panel.appendChild(heading);

  switch (currentDraft.phase) {
    case "PICK_WORD":
      panel.appendChild(renderPickWord(ctx));
      break;
    case "DECIDE_FLOURISH":
      panel.appendChild(renderDecideFlourish(ctx));
      break;
    default:
      // Future tasks.
      panel.appendChild(
        document.createTextNode(`(phase: ${currentDraft.phase})`),
      );
      break;
  }
  return panel;
}

function rerender(ctx: PlayCtx) {
  // Trigger main app render by no-op session update.
  ctx.onUpdate((s) => ({ ...s }));
}

function renderPickWord(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement("div");
  const p = document.createElement("p");
  p.textContent =
    "Choose a word from the Ink Pot to incorporate in this paragraph.";
  wrap.appendChild(p);
  const grid = document.createElement("div");
  grid.className = "pick-grid";
  ctx.scenario.inkPot.forEach((entry, idx) => {
    const used = ctx.session.paragraphs.find((pp) => pp.inkPotIndex === idx);
    if (used) return;
    const btn = document.createElement("button");
    btn.className = "card";
    btn.textContent = entry.inferior;
    btn.addEventListener("click", () => {
      currentDraft.inkPotIndex = idx;
      currentDraft.phase = "DECIDE_FLOURISH";
      rerender(ctx);
    });
    grid.appendChild(btn);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderDecideFlourish(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement("div");
  const info = document.createElement("p");
  info.textContent =
    "You may attempt a Flourish (adjective or adverb) to enrich your word — Heart test required. Flourishes are optional.";
  wrap.appendChild(info);
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = 'flourish word (e.g. "solemn")';
  input.value = currentDraft.flourishAdjective;
  input.className = "flourish-input";
  input.addEventListener("input", () => {
    currentDraft.flourishAdjective = input.value;
  });
  wrap.appendChild(input);

  const attempt = document.createElement("button");
  attempt.className = "btn btn--primary";
  attempt.textContent = "Attempt flourish";
  attempt.addEventListener("click", () => {
    if (!currentDraft.flourishAdjective.trim()) {
      input.focus();
      return;
    }
    currentDraft.attemptedFlourish = true;
    currentDraft.phase = "ROLL_HEART";
    rerender(ctx);
  });

  const skip = document.createElement("button");
  skip.className = "btn";
  skip.textContent = "Skip flourish";
  skip.addEventListener("click", () => {
    currentDraft.attemptedFlourish = false;
    currentDraft.flourishAdjective = "";
    currentDraft.phase = "ROLL_LANGUAGE";
    rerender(ctx);
  });

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(attempt, skip);
  wrap.appendChild(actions);
  return wrap;
}
```

- [ ] **Step 2: Add minimal CSS for these phases**

Append to `public/styles.css`:

```css
.pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.5rem;
  margin: 0.5rem 0 1rem;
}
.flourish-input {
  width: 100%;
  padding: 0.5rem;
  font-family: var(--body-font);
  font-size: 1rem;
  background: var(--parchment);
  border: 1px solid var(--ink-soft);
}
.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
```

- [ ] **Step 3: Smoke test**

Run: `bun run dev`. Set up a game; pick a word; verify "Decide flourish" UI appears. Type a flourish, click Attempt → log shows phase ROLL_HEART. Click Skip from a fresh paragraph → phase ROLL_LANGUAGE.

- [ ] **Step 4: Commit**

```bash
git add src/screens/play.ts public/styles.css
git commit -m "feat: paragraph phases — pick word, decide flourish"
```

---

## Task 16: Paragraph state machine — Heart and Language rolls

**Files:**

- Modify: `src/screens/play.ts`

- [ ] **Step 1: Add roll-handling phases**

In `src/screens/play.ts`, add these helpers:

```ts
import { roll, countSuccesses } from "../dice";
import { planRoll } from "../rules";
```

Add roll renderers (continue inside the same file):

```ts
function renderRollHeart(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement("div");
  const p = document.createElement("p");
  p.textContent = `Roll Heart to attempt a flourish (“${currentDraft.flourishAdjective}”).`;
  wrap.appendChild(p);

  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId)!;
  const skillBonusActive = canSpendSkill(ctx, "heart");
  const plan = planRoll({
    attribute: "heart",
    character,
    scenario: ctx.scenario,
    skillBonusActive,
  });

  const dicePool = document.createElement("p");
  dicePool.textContent = `Rolling ${plan.diceCount} dice${skillBonusActive ? " (skill applied)" : ""}.`;
  wrap.appendChild(dicePool);

  if (canSpendSkillButton(ctx, "heart")) {
    wrap.appendChild(makeSkillButton(ctx, "heart", () => rerender(ctx)));
  }

  const rollBtn = document.createElement("button");
  rollBtn.className = "btn btn--primary";
  rollBtn.textContent = "Roll dice";
  rollBtn.addEventListener("click", () => {
    const dice = roll(plan.diceCount);
    currentDraft.heartRoll = dice;
    currentDraft.phase = "ROLL_LANGUAGE";
    if (skillBonusActive) {
      currentDraft.skillUsedHere = "heart";
    }
    rerender(ctx);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderRollLanguage(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement("div");
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId)!;
  const skillBonusActive = canSpendSkill(ctx, "language");
  const plan = planRoll({
    attribute: "language",
    character,
    scenario: ctx.scenario,
    skillBonusActive,
  });

  if (currentDraft.heartRoll) {
    const heartLine = document.createElement("p");
    const ok = countSuccesses(currentDraft.heartRoll) > 0;
    heartLine.innerHTML = `Heart roll: ${formatDice(currentDraft.heartRoll)} — ${ok ? '<span class="success">flourish stuck</span>' : '<span class="failure">flourish lost</span>'}`;
    wrap.appendChild(heartLine);
  }

  const info = document.createElement("p");
  info.textContent = `Roll Language (${plan.diceCount} dice${skillBonusActive ? " — skill applied" : ""}) to determine if you draw the Superior word.`;
  wrap.appendChild(info);

  if (canSpendSkillButton(ctx, "language")) {
    wrap.appendChild(makeSkillButton(ctx, "language", () => rerender(ctx)));
  }

  const rollBtn = document.createElement("button");
  rollBtn.className = "btn btn--primary";
  rollBtn.textContent = "Roll dice";
  rollBtn.addEventListener("click", () => {
    const dice = roll(plan.diceCount);
    currentDraft.languageRoll = dice;
    if (skillBonusActive) currentDraft.skillUsedHere = "language";
    currentDraft.phase = "WRITE";
    rerender(ctx);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function formatDice(values: number[]): string {
  return values
    .map((v) => (v >= 5 ? `<span class="success">${v}</span>` : String(v)))
    .join(" ");
}

function canSpendSkill(
  ctx: PlayCtx,
  attr: "penmanship" | "language" | "heart",
): boolean {
  if (ctx.session.skillSpent) return false;
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId);
  return (
    !!skill &&
    skill.bonusAttribute === attr &&
    currentDraft.skillUsedHere === attr
  );
}

function canSpendSkillButton(
  ctx: PlayCtx,
  attr: "penmanship" | "language" | "heart",
): boolean {
  if (ctx.session.skillSpent) return false;
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId);
  return (
    !!skill &&
    skill.bonusAttribute === attr &&
    currentDraft.skillUsedHere !== attr
  );
}

function makeSkillButton(
  ctx: PlayCtx,
  attr: "penmanship" | "language" | "heart",
  onChange: () => void,
): HTMLElement {
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId)!;
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = `Use ${skill.name} (+1 ${attr} die)`;
  btn.addEventListener("click", () => {
    currentDraft.skillUsedHere = attr;
    onChange();
  });
  return btn;
}
```

Update the switch in `renderCenterPanel`:

```ts
switch (currentDraft.phase) {
  case "PICK_WORD":
    panel.appendChild(renderPickWord(ctx));
    break;
  case "DECIDE_FLOURISH":
    panel.appendChild(renderDecideFlourish(ctx));
    break;
  case "ROLL_HEART":
    panel.appendChild(renderRollHeart(ctx));
    break;
  case "ROLL_LANGUAGE":
    panel.appendChild(renderRollLanguage(ctx));
    break;
  default:
    panel.appendChild(
      document.createTextNode(`(phase: ${currentDraft.phase})`),
    );
    break;
}
```

- [ ] **Step 2: Append small style for `.success` / `.failure`**

```css
.success {
  color: var(--success);
  font-weight: 600;
}
.failure {
  color: var(--failure);
  font-weight: 600;
}
```

- [ ] **Step 3: Smoke test**

Run: `bun run dev`. Pick a character whose skill matches a roll (e.g., Monk + Illumination). Pick a scenario; play through to ROLL_HEART (with flourish) or ROLL_LANGUAGE (skipped). Click "Roll dice"; see the dice values; advance to next phase. Skill button only appears for the matching attribute and disappears once spent.

- [ ] **Step 4: Commit**

```bash
git add src/screens/play.ts public/styles.css
git commit -m "feat: paragraph phases — Heart and Language rolls with skill button"
```

---

## Task 17: Paragraph state machine — write, Penmanship, finish paragraph

**Files:**

- Modify: `src/screens/play.ts`

- [ ] **Step 1: Add WRITE, ROLL_PENMANSHIP, PARAGRAPH_DONE phase renderers**

```ts
function renderWrite(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement("div");
  const idx = currentDraft.inkPotIndex!;
  const pair = ctx.scenario.inkPot[idx]!;
  const isSuperior = countSuccesses(currentDraft.languageRoll!) > 0;
  const word = isSuperior ? pair.superior : pair.inferior;
  const flourishApplied =
    currentDraft.attemptedFlourish &&
    currentDraft.heartRoll !== null &&
    countSuccesses(currentDraft.heartRoll) > 0;
  const required =
    flourishApplied && currentDraft.flourishAdjective
      ? `${currentDraft.flourishAdjective} ${word}`
      : word;

  const rollLine = document.createElement("p");
  rollLine.innerHTML = `Language roll: ${formatDice(currentDraft.languageRoll!)} — ${
    isSuperior
      ? `<span class="success">Superior</span>`
      : `<span class="failure">Inferior</span>`
  } word.`;
  wrap.appendChild(rollLine);

  const chip = document.createElement("p");
  chip.className = "word-chip";
  chip.textContent = `Incorporate: ${required}`;
  wrap.appendChild(chip);

  const ta = document.createElement("textarea");
  ta.className = "paragraph-area";
  ta.rows = 6;
  ta.placeholder = `Write your paragraph using "${required}".`;
  ta.value = currentDraft.text;
  ta.addEventListener("input", () => {
    currentDraft.text = ta.value;
    indicator.textContent = ta.value
      .toLowerCase()
      .includes(required.toLowerCase())
      ? "✓ word found in paragraph"
      : "… word not yet present";
  });
  wrap.appendChild(ta);

  const indicator = document.createElement("p");
  indicator.className = "word-indicator";
  indicator.textContent = "… word not yet present";
  wrap.appendChild(indicator);

  const next = document.createElement("button");
  next.className = "btn btn--primary";
  next.textContent = "Finish paragraph (Penmanship roll)";
  next.addEventListener("click", () => {
    currentDraft.phase = "ROLL_PENMANSHIP";
    rerender(ctx);
  });
  wrap.appendChild(next);
  return wrap;
}

function renderRollPenmanship(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement("div");
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId)!;
  const skillBonusActive = canSpendSkill(ctx, "penmanship");
  const plan = planRoll({
    attribute: "penmanship",
    character,
    scenario: ctx.scenario,
    skillBonusActive,
  });

  const info = document.createElement("p");
  info.textContent = `Roll Penmanship (${plan.diceCount} dice${plan.rerollPolicy === "highest" ? ", re-roll the highest" : ""}${skillBonusActive ? ", skill applied" : ""}).`;
  wrap.appendChild(info);

  if (canSpendSkillButton(ctx, "penmanship")) {
    wrap.appendChild(makeSkillButton(ctx, "penmanship", () => rerender(ctx)));
  }

  const rollBtn = document.createElement("button");
  rollBtn.className = "btn btn--primary";
  rollBtn.textContent = "Roll dice";
  rollBtn.addEventListener("click", () => {
    let dice = roll(plan.diceCount);
    if (plan.rerollPolicy === "highest" && dice.length > 0) {
      const max = Math.max(...dice);
      const i = dice.indexOf(max);
      const re = roll(1)[0]!;
      dice = [...dice.slice(0, i), re, ...dice.slice(i + 1)];
    }
    currentDraft.penmanshipRoll = dice;
    if (skillBonusActive) currentDraft.skillUsedHere = "penmanship";
    currentDraft.phase = "PARAGRAPH_DONE";
    rerender(ctx);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderParagraphDone(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement("div");
  const idx = currentDraft.inkPotIndex!;
  const pair = ctx.scenario.inkPot[idx]!;
  const isSuperior = countSuccesses(currentDraft.languageRoll!) > 0;
  const flourishApplied =
    currentDraft.attemptedFlourish &&
    currentDraft.heartRoll !== null &&
    countSuccesses(currentDraft.heartRoll) > 0;
  const penOk = countSuccesses(currentDraft.penmanshipRoll!) > 0;
  let pts = isSuperior ? (flourishApplied ? 2 : 1) : flourishApplied ? -1 : 0;
  if (penOk) pts += 1;

  const summary = document.createElement("p");
  summary.innerHTML = `Word: ${isSuperior ? pair.superior : pair.inferior} (${
    isSuperior
      ? '<span class="success">superior</span>'
      : '<span class="failure">inferior</span>'
  })${flourishApplied ? ` + flourish "${currentDraft.flourishAdjective}"` : ""}.<br>
    Penmanship: ${formatDice(currentDraft.penmanshipRoll!)} — ${penOk ? '<span class="success">+1</span>' : '<span class="failure">no bonus</span>'}.<br>
    <strong>Points this paragraph: ${pts}</strong>`;
  wrap.appendChild(summary);

  const isLast = ctx.session.paragraphs.length === 4;
  const next = document.createElement("button");
  next.className = "btn btn--primary";
  next.textContent = isLast ? "Finish letter" : "Next paragraph";
  next.addEventListener("click", () => {
    const draft = currentDraft;
    ctx.onUpdate((s) => {
      const newPara = {
        inkPotIndex: draft.inkPotIndex!,
        attemptedFlourish: draft.attemptedFlourish,
        flourishAdjective: draft.attemptedFlourish
          ? draft.flourishAdjective
          : null,
        heartRoll: draft.heartRoll,
        languageRoll: draft.languageRoll!,
        penmanshipRoll: draft.penmanshipRoll!,
        skillUsedHere: draft.skillUsedHere,
        text: draft.text,
      };
      const skillSpent = s.skillSpent || draft.skillUsedHere !== null;
      const paragraphs = [...s.paragraphs, newPara];
      const status =
        paragraphs.length >= 5
          ? ("finished" as const)
          : ("in_progress" as const);
      return { ...s, paragraphs, skillSpent, status };
    });
    currentDraft = emptyDraft();
  });
  wrap.appendChild(next);
  return wrap;
}
```

Update the switch:

```ts
    case 'WRITE':
      panel.appendChild(renderWrite(ctx));
      break;
    case 'ROLL_PENMANSHIP':
      panel.appendChild(renderRollPenmanship(ctx));
      break;
    case 'PARAGRAPH_DONE':
      panel.appendChild(renderParagraphDone(ctx));
      break;
```

- [ ] **Step 2: Append textarea/chip styling**

```css
.paragraph-area {
  width: 100%;
  min-height: 8rem;
  padding: 0.75rem;
  font-family: var(--body-font);
  font-size: 1.05rem;
  background: var(--parchment);
  color: var(--ink);
  border: 1px solid var(--ink-soft);
}
.word-chip {
  display: inline-block;
  background: var(--accent);
  color: var(--parchment);
  padding: 0.25rem 0.75rem;
  font-style: italic;
}
.word-indicator {
  font-size: 0.9rem;
  color: var(--ink-soft);
}
```

- [ ] **Step 3: Smoke test**

Run: `bun run dev`. Play through five paragraphs. Verify: textarea reflects what you type; word indicator turns ✓ when you type the word; Penmanship roll succeeds → +1 visible; "Next paragraph" advances; after the fifth paragraph, "Finish letter" sets `status: 'finished'` and the screen switches to the (still placeholder) Score screen.

- [ ] **Step 4: Commit**

```bash
git add src/screens/play.ts public/styles.css
git commit -m "feat: paragraph phases — write, Penmanship, paragraph done; advance to score on 5th"
```

---

## Task 18: Letter-so-far panel + running score

**Files:**

- Modify: `src/screens/play.ts`

- [ ] **Step 1: Render previously written paragraphs and a live score below the workspace**

In `renderCenterPanel`, after the phase switch:

```ts
const completed = ctx.session.paragraphs;
if (completed.length > 0) {
  const lsf = document.createElement("div");
  lsf.className = "letter-so-far";
  const h = document.createElement("h4");
  h.textContent = "Letter so far";
  lsf.appendChild(h);
  for (const p of completed) {
    const para = document.createElement("p");
    para.textContent = p.text || "(empty paragraph)";
    lsf.appendChild(para);
  }
  panel.appendChild(lsf);
}
```

In `renderRightPanel`, append a running-score element at the bottom:

```ts
// running score
const totals = ctx.session.paragraphs.reduce<{ pts: number }>(
  (acc, p) => {
    const isSuperior = countSuccesses(p.languageRoll) > 0;
    const flourishApplied =
      p.attemptedFlourish &&
      p.heartRoll !== null &&
      countSuccesses(p.heartRoll) > 0;
    let pts = isSuperior ? (flourishApplied ? 2 : 1) : flourishApplied ? -1 : 0;
    if (countSuccesses(p.penmanshipRoll) > 0) pts += 1;
    return { pts: acc.pts + pts };
  },
  { pts: 0 },
);
const scoreLine = document.createElement("p");
scoreLine.className = "running-score";
scoreLine.innerHTML = `<strong>Running score: ${totals.pts}</strong> (after ${ctx.session.paragraphs.length}/5)`;
panel.appendChild(scoreLine);
```

- [ ] **Step 2: Append styling**

```css
.letter-so-far {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ink-soft);
}
.letter-so-far p {
  margin: 0.5rem 0;
}
.running-score {
  margin-top: 1rem;
}
```

- [ ] **Step 3: Smoke test**

Run: `bun run dev`. Play through 2-3 paragraphs and confirm completed paragraphs appear under "Letter so far" and the running score updates in the right column.

- [ ] **Step 4: Commit**

```bash
git add src/screens/play.ts public/styles.css
git commit -m "feat: letter-so-far panel and running score"
```

---

## Task 19: Score screen with download

**Files:**

- Modify: `src/screens/score.ts`
- Modify: `public/styles.css`

- [ ] **Step 1: Replace `src/screens/score.ts`**

```ts
import { CHARACTERS, SKILLS } from "../data";
import { toMarkdown } from "../export";
import { score } from "../scoring";
import type { GameSession, Scenario } from "../types";

export interface ScoreCtx {
  session: GameSession;
  scenario: Scenario;
  onRestart: () => void;
}

export function renderScore(ctx: ScoreCtx): HTMLElement {
  const root = document.createElement("section");
  root.className = "screen screen--score";

  const result = score(ctx.session, ctx.scenario);

  const banner = document.createElement("div");
  banner.className = "score-banner";
  banner.innerHTML = `
    <h2>${ctx.scenario.title}</h2>
    <p class="score-total">Final score: <strong>${result.total}</strong> — ${result.tierName}</p>
    <p class="consequence">${result.tier.text}</p>`;
  root.appendChild(banner);

  const letterCard = document.createElement("article");
  letterCard.className = "finished-letter";
  for (const p of ctx.session.paragraphs) {
    const para = document.createElement("p");
    para.textContent = p.text;
    letterCard.appendChild(para);
  }
  root.appendChild(letterCard);

  const breakdown = document.createElement("details");
  breakdown.className = "breakdown";
  breakdown.innerHTML = `
    <summary>Per-paragraph breakdown</summary>
    <table class="breakdown-table">
      <thead><tr><th>#</th><th>Word</th><th>Flourish</th><th>Heart</th><th>Language</th><th>Penmanship</th><th>Points</th></tr></thead>
      <tbody>
        ${ctx.session.paragraphs
          .map((p, i) => {
            const pair = ctx.scenario.inkPot[p.inkPotIndex];
            const sup = p.languageRoll.some((d) => d >= 5);
            const word = pair
              ? `${sup ? pair.superior : pair.inferior} (${sup ? "superior" : "inferior"})`
              : "—";
            const flourish =
              p.attemptedFlourish && p.flourishAdjective
                ? p.flourishAdjective
                : "—";
            return `<tr>
              <td>${i + 1}</td>
              <td>${word}</td>
              <td>${flourish}</td>
              <td>${p.heartRoll?.join(",") ?? "—"}</td>
              <td>${p.languageRoll.join(",")}</td>
              <td>${p.penmanshipRoll.join(",")}</td>
              <td>${result.paragraphs[i] ?? 0}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
  root.appendChild(breakdown);

  const actions = document.createElement("div");
  actions.className = "actions actions--score";

  const download = document.createElement("button");
  download.className = "btn btn--primary";
  download.textContent = "Download letter (.md)";
  download.addEventListener("click", () => {
    const md = toMarkdown(ctx.session, ctx.scenario, CHARACTERS, SKILLS);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = ctx.session.startedAt.slice(0, 10);
    a.href = url;
    a.download = `quill-${d}-${ctx.scenario.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  const restart = document.createElement("button");
  restart.className = "btn";
  restart.textContent = "Write another letter";
  restart.addEventListener("click", ctx.onRestart);

  actions.append(download, restart);
  root.appendChild(actions);

  return root;
}
```

- [ ] **Step 2: Append score screen styles**

```css
.score-banner {
  text-align: center;
  margin: 2rem 0;
}
.score-banner h2 {
  font-family: var(--display-font);
  font-size: 2.5rem;
  margin: 0;
}
.score-total {
  font-size: 1.4rem;
}
.consequence {
  font-style: italic;
  max-width: 50rem;
  margin: 1rem auto;
}

.finished-letter {
  background: var(--parchment);
  border: 1px solid var(--ink-soft);
  padding: 2rem;
  max-width: 50rem;
  margin: 2rem auto;
  font-size: 1.1rem;
  line-height: 1.7;
}
.finished-letter p {
  margin: 0 0 1rem;
  text-indent: 1.5rem;
}

.breakdown {
  max-width: 50rem;
  margin: 1rem auto;
}
.breakdown-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.breakdown-table th,
.breakdown-table td {
  border-bottom: 1px solid var(--ink-soft);
  padding: 0.4rem;
  text-align: left;
}

.actions--score {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin: 2rem 0;
}
```

- [ ] **Step 3: Smoke test**

Run: `bun run dev`. Play a complete letter through to the Score screen. Verify the finished letter renders, the consequence text matches the right tier (vary your luck or pick a strong character/scenario combo to see different tiers). Click Download — confirm a `quill-2026-05-01-<scenario>.md` file lands in Downloads with frontmatter and the game-record table. Click "Write another letter" — confirm the app returns to Setup.

- [ ] **Step 4: Commit**

```bash
git add src/screens/score.ts public/styles.css
git commit -m "feat: score screen with finished letter, breakdown, and Markdown download"
```

---

## Task 20: Aesthetic polish — fonts, parchment background, ornament divider

**Files:**

- Modify: `public/styles.css`

- [ ] **Step 1: Add background texture and refined typography**

Append:

```css
body {
  background:
    radial-gradient(ellipse at top, rgba(255, 255, 255, 0.4), transparent 60%),
    radial-gradient(ellipse at bottom, rgba(0, 0, 0, 0.05), transparent 60%),
    var(--parchment);
  background-attachment: fixed;
}

h1,
h2,
h3,
h4,
h5 {
  letter-spacing: 0.02em;
}

.display-heading::after {
  content: "";
  display: block;
  margin: 0.5rem auto 0;
  width: 6rem;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--ink-soft),
    transparent
  );
}

.screen {
  padding: 1rem 0;
}

button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Smoke test visually**

Run: `bun run dev`. Walk through a session. Confirm: parchment shading is visible but not garish, the centered "Quill" heading has an ornamental rule under it, focus rings are visible on tab navigation.

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "style: parchment background gradient and focus rings"
```

---

## Task 21: Dice shake animation

**Files:**

- Modify: `src/screens/play.ts`
- Modify: `public/styles.css`

- [ ] **Step 1: Add a small shake-then-reveal animation around the roll buttons**

In `src/screens/play.ts`, factor a helper that animates the dice tray on click. Replace the inline `rollBtn.addEventListener` calls in `renderRollHeart`, `renderRollLanguage`, `renderRollPenmanship` with a helper:

```ts
function attachShake(btn: HTMLElement) {
  btn.addEventListener("click", () => {
    btn.classList.add("shake");
    setTimeout(() => btn.classList.remove("shake"), 250);
  });
}
```

Call `attachShake(rollBtn)` after each `rollBtn` is created in those three functions. Order of listeners: `attachShake` first, then the existing click listener. (`addEventListener` runs handlers in registration order; both fire.)

- [ ] **Step 2: Add CSS animation**

Append to `public/styles.css`:

```css
@keyframes shake {
  0% {
    transform: translate(0, 0) rotate(0);
  }
  25% {
    transform: translate(-2px, 1px) rotate(-1deg);
  }
  50% {
    transform: translate(2px, -1px) rotate(1deg);
  }
  75% {
    transform: translate(-1px, 2px) rotate(-1deg);
  }
  100% {
    transform: translate(0, 0) rotate(0);
  }
}
.shake {
  animation: shake 0.25s ease;
}
```

- [ ] **Step 3: Smoke test**

Run: `bun run dev`. Click roll dice on each phase; the button shakes briefly before the dice display.

- [ ] **Step 4: Commit**

```bash
git add src/screens/play.ts public/styles.css
git commit -m "feat: shake animation on dice roll button"
```

---

## Task 22: Final smoke pass and merge

**Files:** none (verification + merge)

- [ ] **Step 1: Run all tests + checks**

```bash
bun test
bun run check
```

Expected: all tests pass, no Biome errors. Fix anything inline.

- [ ] **Step 2: Manual smoke checklist**

In a browser:

1. `bun run dev` and open the URL.
2. Pick character / skill / scenario; profile + rules appear after scenario selected.
3. Click _Begin letter_; arrive on Play screen with three columns.
4. Play through all five paragraphs:
   - Pick word from Ink Pot; chosen word stays in Ink Pot panel as "used (Superior/Inferior)" once the Language roll resolves.
   - Attempt and skip flourishes in different paragraphs.
   - Spend the skill on a single matching roll; skill button disappears afterwards.
   - Verify the Letter-so-far panel grows and the running score updates.
5. On the Score screen, confirm:
   - Final score matches the running score.
   - Consequence text matches the tier.
   - Finished letter renders.
   - Download produces `quill-<date>-<scenario>.md` with valid frontmatter, body, table, and consequence quote.
6. Reload the page mid-paragraph (e.g., during ROLL_LANGUAGE) — confirm Setup is re-entered (the in-memory paragraph draft is intentionally non-persisted; only completed paragraphs survive). Confirm previously committed paragraphs are still in the right order.
7. Click _Write another letter_ — Setup re-appears.

- [ ] **Step 3: Tag the working version and merge to main**

```bash
git checkout main
git merge --no-ff feature/initial-implementation
git tag v0.1.0
```

- [ ] **Step 4: Confirm**

```bash
bun test && bun run check && bun run build
```

Expected: all green. `dist/` contains the built bundle.

---

## Known deviation from spec

- **Mid-paragraph draft persistence.** The spec calls for restoring the exact paragraph state on reload (including textarea text and any in-flight rolls). The plan as written keeps the per-paragraph draft in a module-level `currentDraft` variable inside `play.ts`, so completed paragraphs persist but a paragraph in progress is lost on reload. Acceptable for v1 because it's a one-evening game and the cost of reload mid-paragraph is one paragraph. If you want strict spec parity, add a `currentDraft: Draft | null` field to `GameSession`, replace module-level `currentDraft` reads/writes with `ctx.session.currentDraft` accessed through `ctx.onUpdate`, and use `store.set(updater, { debouncePersist: true })` for textarea changes. This is a cross-cutting edit across Tasks 3, 12, 15, 16, 17.

## Verification summary

Each spec section maps to tasks:

- Domain types → Task 3
- Static character/skill data → Task 5
- Dice mechanics → Task 4
- Rules of Correspondence engine → Task 6
- Scoring (pure) → Task 7
- Scenario JSON files + loader → Tasks 8 & 9
- State store + persistence → Task 10
- Markdown export → Task 11
- Setup screen → Tasks 12 & 13
- Play screen layout & Ink Pot → Task 14
- Paragraph state machine → Tasks 15, 16, 17
- Letter-so-far + running score → Task 18
- Score screen + download → Task 19
- Aesthetic polish → Tasks 20 & 21
- Manual smoke + merge → Task 22

Out of scope (per spec): multi-character continuity, custom scenario authoring UI, cloud sync, mobile-portrait layout, dark mode, LLM recipient replies. None of these are addressed.
