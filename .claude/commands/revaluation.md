---
description: Which classes are due for revaluation; record a revaluation with an index on unit rates.
---

1. Run `npm run assets -- revaluations --json` and say which classes are overdue or due in the next year.
2. Before the valuer starts, render the schedule: `npm run docs -- revaluation-schedule`.
3. To record the result: confirm the class, valuer, date and the change in unit rates, then run `npm run assets -- revalue <CLASS> --valuer=NAME [--index=PCT] [--on=DATE]`. The index changes every unit rate in the class; ask before running it.
4. Report the new replacement cost, carrying amount and annual depreciation against the last valuation (`valuations --class=CLASS`).
