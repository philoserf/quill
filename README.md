# Quill

A local web app for playing Scott Malthouse's [Quill](https://www.drivethrurpg.com/) — a single-player letter-writing roleplaying game. Pick a character, scenario, and skill; write a five-paragraph letter under the dice mechanics; export the finished letter as Markdown.

## Run

```sh
bun install
bun run dev # http://localhost:3000
```

## Test

```sh
bun test
bun run check
```

## Build

```sh
bun run build
```

## Manual smoke test

1. `bun run dev`, open the URL.
2. Pick a character, a skill, and a scenario; click _Begin letter_.
3. Write all five paragraphs through to the Score screen.
4. Click _Download letter (.md)_; confirm the file lands in Downloads.
5. Reload during play; confirm the in-progress letter restores.
6. Click _Write another letter_ on the Score screen; confirm Setup re-appears.
