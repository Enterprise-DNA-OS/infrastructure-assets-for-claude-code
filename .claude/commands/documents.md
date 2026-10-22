---
description: Render the paperwork: infrastructure report, class summaries, renewal programme, revaluation schedules, defect instructions.
---

1. Run `npm run docs` for everything, or `npm run docs -- <name>` for one type: `infrastructure-report`, `class-summary`, `renewal-programme`, `revaluation-schedule`, `defect-instruction`.
2. Files land in `docs-out/`, branded from `brand.json`. Tell the operator the paths. Print to PDF from the browser.
3. To change a document, edit `documents.json` (a section is a title and a query) with `/customise`.
