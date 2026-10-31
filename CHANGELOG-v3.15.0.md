# Peugeot 206 Garage · v3.15.0

## Experience refresh

- Added a modern glass/neon visual layer with Blue, Neon Mint and Volt Orange accent palettes.
- Added a persisted appearance panel for accent, compact density and reduced motion preferences.
- Added a global command palette (`Ctrl+K` / `/`) that searches dashboard sections, bot guide cards and existing vehicle events.
- Selecting a matching event opens the journal, filters to its ID and highlights the matching row.
- Added keyboard navigation (`↑`, `↓`, `Enter`, `Esc`) and `Alt+1…9` section shortcuts.
- Added live Tehran clock, reading progress indicator, back-to-top control and optional browser install prompt.
- Added six focused regression tests, included the new browser script in the GitHub Actions syntax checks, and introduced a dedicated verification workflow for UI/core changes.

## Compatibility and data safety

- No data schema migration.
- No changes to `data/config.json`, `data/index.json`, monthly logs or the computed dashboard snapshot.
- No changes to Cloudflare Worker routes, Telegram commands, KV bindings or secrets.
- No private vehicle-document values were added to public HTML or the global search API.
- Existing 3.14.0 Worker/API version remains intentional; this is a dashboard experience release.
