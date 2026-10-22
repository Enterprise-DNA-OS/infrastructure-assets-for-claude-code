---
description: Every legal, accounting and asset management plan check, with the rule it comes from.
---

1. Run `npm run assets -- compliance --json`. Each row has the rule, severity, the record, the issue and the source. The rules and their sources are listed in `docs/compliance.md`.
2. Report as a table: rule, count, the worst example, the source. Breached first, then overdue, due soon, benchmark, check.
3. For anything breached, name the fix: DEFECT `/defects`; REVALUATION `/revaluation`; INSPECTION `/inspect`; CRITICAL-POOR `/works` or `/draft-business-case`; FORECAST-DATA `/add` or `/import` to fill the gap.
4. If a rule in `docs/compliance.md` is out of date, say so and stop. Do not guess at law or accounting standards. The operator confirms the rule, then you update the doc and the check together.

Nothing here is legal or accounting advice. The checks compare the records with the rules the operator has told the system to enforce, with sources.
