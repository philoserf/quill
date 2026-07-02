# Quill — Writing-Desk Redesign: Handoff Spec

Implementation spec for the `quill` codebase (Bun + vanilla TS, `src/screens/*.ts`, `public/styles.css`).
Reference mockup: `Quill Redesign.dc.html` (fully interactive; play it end-to-end to see every state).
No rules/logic changes — this is presentation + flow only. `data.ts`, `dice.ts`, `rules.ts`, `scoring.ts`, `store.ts`, `export.ts` stay untouched.

---

## 1. Design language: "the writing desk"

The app is a candlelit desk; every UI surface is a piece of paper lying on it.

### Tokens (replace `:root` in styles.css)

```css
:root {
  --desk-dark: #241708;      /* page background base */
  --desk-mid: #453016;       /* wood highlight */
  --paper: #f3e7cc;          /* main sheets (letter, setup panels) */
  --paper-side: #efe2c1;     /* margin cards (ink pot, marginalia) */
  --paper-raised: #f8eed6;   /* clickable cards at rest */
  --paper-pressed: #ece0be;  /* selected cards / detail insets */
  --line: #c9b183;           /* input borders, rules */
  --edge: #d3bd8e;           /* paper borders */
  --ink: #2b2115;
  --ink-soft: #6c5a3c;
  --ink-faint: #a48f63;      /* used/disabled text */
  --annotation: #8c6f42;     /* small-caps labels, letterhead */
  --wax: #7e2a1e;            /* accent: seals, primary buttons, selection */
  --gold: #9a7328;           /* skill affordances */
  --success: #4a6b2f;
  --failure: #8c3226;
  --on-desk: #f0dfb6;        /* light text sitting on the desk */
  --on-desk-soft: #c2a878;
}
```

### Desk background (body)

```css
body {
  background:
    radial-gradient(900px 480px at 50% -120px, rgba(255,178,74,0.16), transparent 70%), /* candle glow */
    repeating-linear-gradient(88deg, rgba(0,0,0,0.05) 0 3px, transparent 3px 11px),      /* wood grain */
    radial-gradient(1400px 900px at 50% 28%, var(--desk-mid), var(--desk-dark) 78%);
}
```

### Paper sheets

Every panel: `background: var(--paper)` (or `--paper-side` for margin cards),
`border: 1px solid var(--edge)`,
`box-shadow: 0 20px 44px rgba(0,0,0,.55), inset 0 0 70px rgba(163,131,77,.18)`.
Alternate a tiny rotation per sheet (`transform: rotate(±0.2–0.5deg)`) so the desk feels hand-laid. No border-radius on paper.

### Type

Keep the existing families, add the SC face:
- `IM Fell English SC` — app title, small-caps annotations/letterhead (letter-spacing 0.1–0.16em).
- `IM Fell English` — headings, primary-button labels, score numerals.
- `EB Garamond` — body; *italic* Garamond for everything the player "writes" (letter paragraphs, textarea, flourish input).

Buttons: primary = wax background (`linear-gradient(rgba(255,255,255,.12), rgba(0,0,0,.15)), var(--wax)`), cream text, IM Fell English, no radius. Secondary = transparent with `1px solid var(--line)` (on paper) or `#8f7649` (on desk).

Dice: 28px squares, radius 5px; success (5–6) = `--success` bg + cream text; otherwise `--paper-raised` bg + ink. Render actual rolled values, not comma strings.

---

## 2. Setup screen (`setup.ts`)

Keep the progressive-reveal flow; restyle and re-copy it.

- Title block on the desk (not on paper): "Quill" in IM Fell English SC, `--on-desk`, warm text-shadow; subtitle "A letter-writing roleplaying game · by Scott Malthouse"; helper line "Choose a character, a skill, and a scenario — then take up your quill."
- Each step is a paper sheet, headed `I. The Character` / `II. The Skill` / `III. The Scenario` with an italic one-line prompt ("Who holds the quill?", "One gift, spent once per letter.", "To whom do you write, and why?").
- Character cards: name (IM Fell), 1–2 sentence blurb (truncate `flavor[0]` to its first sentence or a curated short blurb), then a 2-col grid of attribute pips — label in small caps + `●●○` (poor=1, average=2, good=3 filled dots, wax-colored). Selected card: `2px solid var(--wax)`, `--paper-pressed` bg. Hover: lift 2px + shadow.
- Scenario detail (on select): inset `--paper-pressed` block with profile paragraphs + "Rules of Correspondence" small-caps heading; narrative rules keep the "Player-enforced" badge (small caps chip).
- Begin button centered below detail: **"Begin the letter"** (primary).
- New-paragraph smooth-scroll on step reveal is optional; do NOT use `scrollIntoView`-free? (use `window.scrollTo` if desired).

## 3. Play screen (`play.ts`) — letter-centric

Replace the 3-column `play-grid` with a centered flex row, letter dominant:

```
[Ink Pot 200–250px] [ The Letter — flex, max 700px ] [ Marginalia 245–310px ]
```

`display:flex; gap:26px; flex-wrap:wrap; justify-content:center;` — margins wrap naturally on small screens (ink pot above, marginalia below the letter). No media query needed for the grid itself.

### Header (on desk)

Left: "Quill" small + scenario title italic. Right: **paragraph medallions I–V** — 30px circles; done = wax fill/cream numeral, current = outlined `--on-desk-soft`, future = faint. This replaces "Paragraph N of 5" as primary progress.

### The Letter (center paper, the hero)

- Letterhead: scenario title in small caps, centered, `--annotation`; below it a right-aligned italic date line ("Written this 2nd day of July").
- Completed paragraphs render as the letter itself: italic Garamond 18.5px, line-height 1.7, `text-indent: 1.6em`.
- The in-progress paragraph lives **inside the letter**:
  - Phases before WRITE: a faint italic placeholder line ("… the next paragraph awaits a word from the ink pot." / "… the quill hovers while the word is prepared.").
  - WRITE phase: word chip ("Incorporate: “solemn passing”" — wax outline chip) + a **borderless transparent textarea** with ruled lines via `repeating-linear-gradient` background, italic Garamond matching the rendered paragraphs, plus the found/not-found indicator line beneath.
  - PEN/DONE phases: show the drafted text as a normal letter paragraph (continuity — the words are already on the page).

### Ink Pot (left margin card)

- Title "The Ink Pot" + context hint ("Choose a word for this paragraph." during pick; "Each word serves one paragraph." otherwise).
- Words as full-width borderless list buttons, dotted separators.
  - PICK phase: enabled, wax-colored, weight 600 (this **is** the pick UI — no separate word grid).
  - Chosen this paragraph: "← chosen" small-caps suffix.
  - Used: struck-through `--ink-faint` with "→ superior" / "→ inferior" suffix.

### Marginalia (right margin, two cards)

Card 1 — the current step:
- Heading "Paragraph III of V" + a 5-step mini stepper: `Word · Flourish · Language · Write · Hand` (small caps; active = wax + underline, done = `--annotation`, future = faint). This is the flow map that fixes the "no flow" complaint.
- Phase content (one at a time):
  - **PICK**: instruction only ("Dip your quill: choose one word from the Ink Pot…").
  - **FLOURISH**: explanation, flourish text input (italic), buttons "Attempt it" (primary) / "Write plainly" (secondary).
  - **HEART/LANGUAGE/PENMANSHIP rolls**: previous roll's dice + verdict line (colored), a context sentence stating what's tested, the die count, and any modifiers ("re-roll the highest", "Inspiration applied"); optional dashed-gold skill button "Spend Inspiration — +1 die (once per letter)"; primary "Roll the dice" button → 380ms "The dice tumble…" disabled state, then results. Verdict copy: "The flourish “solemn” holds." / "The flourish is lost — and will cost you." / "Superior — write “X”." / "Inferior — “X” must serve." / "A fine hand — +1 point." / "A plain hand — no bonus."
  - **DONE**: penmanship dice + verdict, word line (colored), flourish line if attempted, points line in IM Fell ("+2 points this paragraph"), button "Next paragraph" / "Seal & finish the letter" (para 5).

Card 2 — reference: "The Correspondent" (character — skill), skill spent/unspent note, "Running Score" (big IM Fell numeral + "after N of 5"), and a "Recall the scenario…" link-toggle that expands profile + rules inline.

## 4. Score screen (`score.ts`)

- On the desk, centered: a **wax-seal medallion** (96px circle, radial highlight over `--wax`) containing the total score; below, "An excellent letter" (tier name) in IM Fell SC `--on-desk`; consequence text italic `--on-desk-soft`.
- The finished letter as one paper sheet: letterhead + date as in play, all five paragraphs, then a signature row: "— The Poet" italic + a small 40px wax-seal dot.
- Breakdown: paper card "The reckoning, paragraph by paragraph" — 4-col grid (No. / Word & flourish / Hand / Points), small-caps column heads. Word cell: "“Passing” (superior) + “solemn”" or "— flourish lost". Always visible (drop the `<details>`).
- Actions centered: "Download letter (.md)" (primary, unchanged behavior) + "Write another letter" (secondary, on-desk style).

## 5. Copy voice

Period-flavored, short, instructional: "Dip your quill…", "The dice tumble…", "must serve", "a fine hand". Never mechanical strings like "ROLL_HEART" or "flourish stuck". Points always signed (+1, −1).

## 6. Accessibility & misc

- Keep `button:focus-visible` outline (2px wax).
- Disabled ink-pot words: `disabled` attr + default cursor.
- Textarea/inputs inherit Garamond; min font-size 14px anywhere.
- All existing behaviors preserved: localStorage session restore, skill once per letter, reroll-highest policy, scoring tiers, .md export filename format.
