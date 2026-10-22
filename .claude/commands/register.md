---
description: The asset register: replacement cost, age, condition and life left, filtered by class, area, grade or criticality.
---

1. Turn the ask into filters: `npm run assets -- register [--class=CLASS] [--area=TEXT] [--grade=4] [--critical] --json`.
2. Show a table: code, name, class, area, replacement cost, age, condition grade, life left, criticality.
3. Total the replacement cost at the bottom. If the list is long, show the 15 most important (criticality, then condition) and say how many more there are.
