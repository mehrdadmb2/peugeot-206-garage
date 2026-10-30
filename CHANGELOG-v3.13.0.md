# v3.13.0 — Private Vehicle Documents

- Added a dedicated token-gated Documents dashboard tab with stylized plate, registration, driving licence, technical-inspection and insurance cards.
- Added secure document storage through Cloudflare KV; seed data is supplied separately as a Worker secret and must not be committed to this public repository.
- Added Telegram `/documents` and `/insurance` commands; sensitive document responses are restricted to private one-to-one chats and the configured allowlisted account.
- Added private insurance editing and scheduled expiry reminders for insurance, technical inspection and driving licence.
- Added the driving-licence categories visible on the reverse of the card.
- Preserved the historical plate printed on the technical-inspection report as a separate field; it is not silently treated as the current registration plate.
- No original identity-document photographs or national identifiers are published in GitHub Pages.
