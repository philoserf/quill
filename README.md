# Quill

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

Pushes to `main` build `dist/` and publish it to GitHub Pages via `.github/workflows/deploy.yml`. The site is served from `quill.philoserf.com`; `public/CNAME` holds that hostname and `bun run build` copies it into `dist/` so every deploy re-asserts the custom domain.

The rest of the configuration lives outside the repository:

- DNS (Cloudflare): a `CNAME` record for `quill` pointing at `philoserf.github.io`, proxied.
- Cloudflare SSL/TLS: Full (strict). Flexible loops against the HTTPS redirect Pages issues on its own.
- Repository settings → Pages: custom domain `quill.philoserf.com`. GitHub verifies the domain by checking that it resolves to Pages, and through the proxy it sees Cloudflare addresses instead — so _Enforce HTTPS_ may be unavailable, and the same check gates certificate renewal. Cloudflare terminates TLS either way; if a renewal fails, set the record to DNS-only long enough for GitHub to verify, then proxy it again.
- Analytics: Cloudflare Web Analytics, injected at the edge. Do not put the beacon snippet in `public/index.html` — the edge adds it, and a second copy double-counts every page view.

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
