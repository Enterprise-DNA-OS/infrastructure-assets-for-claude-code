---
description: A run sheet for an inspection crew: the assets due, grouped by area.
---

1. Run `npm run assets -- inspections --days=30 --json` and, for each asset, its last inspection notes (`asset <ASSET> --json`).
2. Write `drafts/inspection-round-YYYY-MM-DD.md`: by area, each asset with code, location, last grade and notes, what to look at, and a blank for the new grade.
3. When the crew comes back, record each result with `/inspect`.
