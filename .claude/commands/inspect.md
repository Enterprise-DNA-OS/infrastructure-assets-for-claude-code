---
description: Record a condition inspection.
---

1. Get the asset, the grade (1 excellent to 5 very poor), the date and who inspected it. Ask for the grade if it was not given: never guess it.
2. Run `npm run assets -- inspect <ASSET> --grade=<1-5> [--on=YYYY-MM-DD] [--inspector=NAME] [--notes=TEXT]`.
3. Report the new grade, life left and next inspection date. If the grade is 4 or 5, say it is now in the backlog and suggest `/draft-business-case` or a works item.
