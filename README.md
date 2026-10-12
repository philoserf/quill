# Quill

![Status: Stable](https://img.shields.io/badge/Status-Stable-brightgreen.svg)

A local web app for playing Scott Malthouse's [Quill](https://www.drivethrurpg.com/) — a single-player letter-writing roleplaying game. Pick a character, scenario, and skill; write a five-paragraph letter under the dice mechanics; export the finished letter as Markdown.

Play it at <https://quill.philoserf.com>.

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

## Deploy

```sh
task deploy
```

Checks, builds `dist/`, and publishes it to a Cloudflare Worker with static assets (`wrangler.jsonc`), served at `quill.philoserf.com`. Pushing deploys nothing; there is no CI. The first run on a machine needs `bunx wrangler login` from a real terminal.

The rest of the configuration lives outside the repository:

- Cloudflare: the Worker `quill`, with `quill.philoserf.com` as its custom domain. Cloudflare creates the DNS record and certificate for it.
- Analytics: if any, Cloudflare Web Analytics injected at the edge. Do not put the beacon snippet in `public/index.html` — a second copy double-counts every page view.

## Manual smoke test

1. `bun run dev`, open the URL.
2. Pick a character, a skill, and a scenario; click _Begin letter_.
3. Write all five paragraphs through to the Score screen.
4. Click _Download letter (.md)_; confirm the file lands in Downloads.
5. Reload during play; confirm the in-progress letter restores.
6. Click _Write another letter_ on the Score screen; confirm Setup re-appears.

## Credits

Quill — A Letter-Writing Roleplaying Game for a Single Player is designed by **Scott Malthouse** and published by **Trollish Delver Games**. Buy or download the original rulebook on [DriveThruRPG](https://www.drivethrurpg.com/product/199128/Quill-A-LetterWriting-Roleplaying-Game-for-a-Single-Player). This implementation reuses the rulebook's character archetypes, scenario text, and dice mechanics under the original CC BY-SA 4.0 license; all errors of transcription or interpretation are mine.

## License

This implementation is released under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), matching the original rulebook's license. See [`LICENSE`](./LICENSE).
