# Moving off Assetic

This takes an afternoon for one asset category, and the same again for each one after. Do a dry run first: nothing is written until you run it without `--dry-run`.

## 1. Export from Assetic

Assetic documents a full asset export to CSV (`assetic.FullAssetExport()` in its integration tools, configured with a file that lists the fields you want and the header label for each), and bulk export tools for large registers. Your Assetic administrator can run either. Export one asset category at a time: each category can carry different components and network measures.

Ask for these fields, with these header labels if you can choose them:

| Header | What it is | Needed |
|---|---|---|
| Asset ID | The asset or component ID | Yes |
| Asset Name | Its name | |
| Asset Class | The class or sub class (matched to your classes by code or name) | Yes |
| Network Measure | Length, area or count | Yes |
| Unit | m, m2, each | |
| Unit Rate | Replacement cost per unit | One of these two |
| Replacement Cost | Gross replacement cost (divided by the measure to get the rate) | |
| Useful Life | Years | |
| Install Date | DD/MM/YYYY, YYYY-MM-DD or just the year | |
| Condition | Score 1 to 5 | |
| Condition Date | When it was assessed | |
| Criticality | 1 to 5 | |
| Suburb | The area, for grouping | |

Other header names are recognised too (Asset Category, Constructed Date, Gross Replacement Cost, Condition Score, Ward and others: see `COLS` in `scripts/assets.mjs`). If yours differ, write a map file:

```json
{ "quantity": "Pipe Length (m)", "installed": "Year Laid" }
```

## 2. Load your classes

Add each class first with `/add` (code, name, category, useful life, unit, whether it is a network service, inspection and revaluation cycles). Or pass `--create-classes` to create one per class name in the file with a 50-year default life, and correct them afterwards.

## 3. Import

```bash
npm run assets -- import assetic --assets=water-mains.csv --dry-run
npm run assets -- import assetic --assets=water-mains.csv
```

The dry run shows the assets and inspections it would add, any class names it could not match, and any condition score outside 1 to 5. Running the same file twice adds nothing: assets match on their ID, and a condition score matches on its asset and date.

## What carries over

- Every asset with its ID, name, class, area, measure, unit rate (or replacement cost), useful life, install date and criticality.
- The latest condition score, as an inspection on its condition date.

## What does not, and what to do

- **Component structure.** Assetic holds an asset with components. Export at component level and each component becomes an asset here; set `parent_id` with `/customise` if you want them grouped.
- **Condition history.** Only the score in the export comes across. Older assessments can be added the same way, one export per date.
- **Work orders and requests.** Bring open defects across with `/defects`, and this year's programme with `/works`.
- **Predictor scenarios.** Assetic Predictor models treatments and budget scenarios. Here the forecast is one rule per class (renew at the intervention grade). More treatments (reseal before rehabilitation, relining before replacement) are added with `/customise`.
- **Maps.** There is no map. The register keeps an area and a location, and any GIS can read the database directly.
- **Condition scales other than 1 to 5.** Rows with another score are reported, not loaded. Convert them in the spreadsheet, or have `/customise` add your scale.
