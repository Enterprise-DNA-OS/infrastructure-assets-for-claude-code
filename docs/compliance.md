# Compliance: the rules this system checks

`npm run assets -- compliance` (or `/compliance`) runs every check below against the records and cites the source for each finding. This is a working tool against cited rules, not legal or accounting advice. When a rule changes, update this page and the matching part of the `compliance` view in `supabase/migrations/` together (use `/customise`).

Set where you report with `npm run assets -- settings jurisdiction NZ` or `NSW`. The New Zealand checks run for NZ, the NSW checks for NSW; the rest run for both.

## New Zealand

| Rule | What it checks | Source |
|---|---|---|
| `ESSENTIAL-SERVICES` | For last year (actual spend) and this year and the next two (budget): capital spend on network services (renewal, upgrade and new works on classes marked as network services) against depreciation on those classes. Flagged below 100%. | Local Government (Financial Reporting and Prudence) Regulations 2014, regulation 20, the essential services benchmark: a council meets it if its capital expenditure on network services equals or is greater than depreciation on network services. Network services are water supply, sewerage and the treatment and disposal of sewage, stormwater drainage, flood protection and control works, and roads and footpaths. |
| `FORECAST-DATA` | A network asset, or any asset of criticality 4 or 5, with no unit rate or install date: it cannot be valued or forecast. | Local Government Act 2002 s101B: a council's infrastructure strategy covers at least 30 consecutive financial years. The 30-year forecast here is only as complete as the register. |
| `REVALUATION` | A class not revalued within its revaluation cycle (breached), or due in the next 180 days. | PBE IPSAS 17 (Property, plant and equipment): revaluations are made with sufficient regularity that the carrying amount does not differ materially from fair value. The cycle per class is your revaluation policy (`revaluation_years`). |

## New South Wales

| Rule | What it checks | Source |
|---|---|---|
| `NSW-RENEWALS` | Renewal spend against depreciation, for each year shown. Flagged below 100%. | Office of Local Government, Code of Accounting Practice and Financial Reporting: buildings and infrastructure renewals ratio, benchmark 100% or more (Report on infrastructure assets). |
| `NSW-BACKLOG` | The cost to bring assets below satisfactory back to satisfactory, against the written down value of infrastructure. Flagged at 2% or more. | Code of Accounting Practice and Financial Reporting: infrastructure backlog ratio, benchmark under 2%. |
| `NSW-MAINTENANCE` | Maintenance spend against the required maintenance set on each class. Flagged below 100%. | Code of Accounting Practice and Financial Reporting: asset maintenance ratio, benchmark 100% or more. |
| `REVALUATION` | As above, with the NSW source. | The Office of Local Government requires each class of infrastructure, property, plant and equipment to be revalued at least every five years; AASB 116 paragraphs 31 and 34 (revaluations with sufficient regularity; every three or five years can be enough where fair value moves little). |
| `FORECAST-DATA` | As above. | Local Government Act 1993 (NSW) s403: the resourcing strategy includes long-term asset management planning. |

The Office of Local Government released a discussion paper on the performance ratios in August 2026, so the benchmarks may change. Check the current Code before you report.

## Your asset management plan (everywhere)

| Rule | What it checks | Source |
|---|---|---|
| `INSPECTION` | An asset past its class's inspection cycle (`inspection_months`). Overdue when criticality is 4 or 5, a check otherwise. | Your asset management plan's inspection programme. |
| `DEFECT` | An open defect not made safe within its response time: extreme 1 day, high 7, medium 28, low 90 by default (`settings defect_days_<risk>`). Breached for extreme and high risk. | Your levels of service. Set the days to match them. |
| `CRITICAL-POOR` | An asset of criticality 4 or 5 at or below its class's intervention grade (4 by default) with no renewal or upgrade planned. | Your asset management plan: critical assets below a satisfactory condition need a planned intervention. |
| `DEFERRED` | A renewal deferred while the asset is already at or below the intervention grade. | Your capital works programme. |

`/attention` adds two programme checks that are not rules: works budgeted for this year that have not started with under 270 days of the year left, and works more than 10% over budget.

## How the numbers are worked out

- **Gross replacement cost** is quantity times unit rate. **Depreciation** is straight line: replacement cost, less residual value, over the useful life, from the install date or the last renewal. **Carrying amount** is replacement cost less accumulated depreciation.
- **Life consumed** comes from the latest condition grade where there is one (grade 1 is 10% used, 2 is 30%, 3 is 50%, 4 is 75%, 5 is 95%: edit `condition_grades` to match your plan), from age where there is not.
- **The renewal forecast** renews an asset when its life consumed reaches its class's intervention grade, then repeats the cycle. Assets already at or below that grade fall in this year: that is the backlog.
- **The backlog** is the replacement cost of assets at or below the intervention grade. If your council estimates the cost to bring an asset to satisfactory differently (a partial treatment rather than a full renewal), change the `backlog` view with `/customise`.

## Not checked here

- The infrastructure strategy's narrative content, levels of service performance measures, and the Department of Internal Affairs' mandatory performance measures for water and roads.
- Fair value itself. The valuer sets unit rates and lives; this records them and the result.
- Seismic, dam safety and drinking water compliance. Track them as assets, defects and works if you want them in the same place.
