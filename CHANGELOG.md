# Changelog

## 0.3.2

### Changed

- No change to the app. This release updates the development toolchain only: markdown is formatted by `bun fmt` instead of prettier, `task check` runs the full check, `task setup` no longer needs a Homebrew workaround on macOS 27, and Biome is updated to 2.6.

## 0.3.1

### Changed

- Browsers now cache the app's script and stylesheet, so a return visit loads faster. Each deploy gives these files new names, so a cached copy is never stale.
- The downloaded letter's frontmatter now quotes the character and skill names, as it already quoted the scenario title. A name containing a colon can no longer produce invalid YAML, and YAML readers get the same values as before.

## 0.3.0

### Changed

- The app is hosted on Cloudflare instead of GitHub Pages, at the same address, so saved letters carry over. Only the built app is published; `/CNAME` and stale bundles are no longer served.

### Fixed

- A saved letter whose paragraphs are malformed is now quarantined to the `.corrupt` backup on load, instead of crashing the page.
- _Start a new letter_ on the error screen now sets the letter aside as a backup instead of deleting it, so a crash the app did not anticipate no longer erases the player's only copy.
- A flourish containing `\|` no longer splits a cell in the exported game-record table.
- A saved letter whose scenario, character or skill no longer exists is set aside as a backup instead of being deleted.
- A paragraph of only spaces or line breaks now shows _(empty paragraph)_ on screen, as it already did in the export.
- A flourish typed with a leading or trailing space no longer stops the write step from recognising the phrase, and the space no longer reaches the Score screen or the export.

## 0.2.0

### Added

- The app is served from its own domain at `quill.philoserf.com`.

### Changed

- Restyled the app as a candlelit writing desk.

### Fixed

- A corrupt or unreadable saved session no longer bricks the app on reload. The bad payload is quarantined to a `.corrupt` backup key rather than destroyed, so the letter stays recoverable.
- Player text is escaped in the exported letter, so a flourish containing `|` or a newline no longer breaks the game-record table.
- The export table reports a flourish only when it actually held, agreeing with the score and the play screen.
- Setup selection groups expose radio semantics and a single roving tab stop, so assistive technology announces one choice of six rather than six independent toggles.
- Character and scenario cards render as conforming HTML, with their descriptions restored.
