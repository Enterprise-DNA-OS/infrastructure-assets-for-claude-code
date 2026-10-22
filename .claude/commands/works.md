---
description: The capital works and maintenance programme: list, add, update, defer and complete works.
---

1. Read: `npm run assets -- works [--fy=YEAR] [--status=STATUS] [--kind=renewal|upgrade|new|maintenance] [--class=CLASS] --json`. Financial years are named by the year they end in: 2027 is 2026/27.
2. Add: `add-work --name=TEXT --kind=KIND --fy=YEAR --budget=AMOUNT --asset=ASSET` (or `--class=CLASS` for a programme line).
3. Change: `update-work <WORK> --actual=AMOUNT | --budget=AMOUNT | --fy=YEAR | --status=STATUS`. A deferral needs `--reason`.
4. Done: `complete-work <WORK> [--actual=AMOUNT] [--on=DATE]`. A renewal resets the asset's life and records it as condition 1. Confirm the final cost with the operator first.
5. Show the result as a table with budget, actual and status.
