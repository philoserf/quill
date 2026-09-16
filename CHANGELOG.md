# Changelog

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
