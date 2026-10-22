---
description: Open defects and their response times; log, make safe and close them.
---

1. Run `npm run assets -- defects --json` (add `--all` to include made-safe ones).
2. Show extreme and high risk first with their respond-by date, then the rest.
3. To log one: `npm run assets -- add-defect <ASSET> --description=TEXT --risk=low|medium|high|extreme`. Made safe: `make-safe <DEFECT>`. Repaired: `close-defect <DEFECT>`.
4. Offer the work instruction for any open defect: `npm run docs -- defect-instruction`.
