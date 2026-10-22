---
description: Add an asset class or an asset, or change a setting.
---

1. A class: `npm run assets -- add-class --code=CODE --name=TEXT --category=TEXT --life=YEARS [--unit=m] [--network=yes] [--inspect-months=24] [--revalue-years=3] [--maintenance=AMOUNT]`. Network services (water supply, wastewater, stormwater, flood protection, roads and footpaths) need `--network=yes`.
2. An asset: `add-asset --code=CODE --name=TEXT --class=CLASS --quantity=N --rate=AMOUNT [--installed=DATE] [--life=YEARS] [--area=TEXT] [--criticality=1-5]`. The rate is the replacement cost per unit.
3. A setting: `settings <KEY> <VALUE>` (organisation, jurisdiction NZ or NSW, currency, fy_start_month, defect_days_<risk>).
4. Ask for anything missing. Never guess a unit rate or install date: leave it out and the compliance check will list the gap.
5. Taking an asset out of service: `dispose <ASSET>`, after a yes.
