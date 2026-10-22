<h1 align="center">Infrastructure Assets for Claude Code</h1>

<p align="center">
  <strong>The open-source infrastructure asset register that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Assetic data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=assetic">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/assetic?utm_source=github&utm_medium=readme&utm_campaign=assetic">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-assetic">Instead of Assetic</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Infrastructure Assets for Claude Code does the job you pay Assetic for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Assetic dashboard cannot.

Assetic publishes no price. One Queensland council's published contract register lists "Assetic Enterprise Asset Management (EAM) Hosti/Sandbox/Cloud" with Brightly Software Australia at A$2,075,848.37 excluding GST, for a contract that ran from December 2018 to June 2026 ([Redland City Council, awarded tenders and contracts](https://www.redland.qld.gov.au/files/content/public/v/32/business-and-investment/doing-business-with-council/awarded-tenders-and-contracts/20260722-awarded_tenders_and_contracts-report-for-internet-002.pdf)).

Want the same thing with a web front end, a map, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=assetic).

It holds an infrastructure owner's whole asset register in one database: asset classes with their useful lives, inspection cycles and revaluation cycles; every asset with its quantity, unit rate, install date and criticality; condition inspections on a 1 to 5 scale; defects and their response times; the capital works and maintenance programme by financial year; and every valuation. From those it works out what an asset management system sells: replacement cost, straight-line depreciation, carrying amount, life left, a 30-year renewal forecast, the funding gap against the budget, and the sector ratios. It is for New Zealand and Australian councils, water organisations, ports, universities and the engineers who run asset management for them.

It checks the records against the rules you report under: the New Zealand essential services benchmark (Financial Reporting and Prudence Regulations 2014, reg 20), the 30-year infrastructure strategy (Local Government Act 2002 s101B), the NSW renewals, backlog and maintenance ratios, revaluation cycles under PBE IPSAS 17 and AASB 116, and your own asset management plan's inspection cycles and defect response times. Each finding cites its source ([docs/compliance.md](docs/compliance.md)).

### Ten questions Assetic's dashboard does not answer

Every one is a command that runs today (`/insights` runs all ten):

1. Which assets need renewing in the next 10 years, and what does each year cost?
2. How big is the gap between forecast renewals and the renewal budget, decade by decade?
3. Which critical assets are below satisfactory with no renewal planned?
4. What share of each class's replacement cost sits in each condition grade?
5. Which assets are wearing out faster than their age says they should?
6. Are we renewing as fast as each class depreciates?
7. Which classes are due for revaluation, and what would a 5% rise in unit rates add to depreciation?
8. Which inspections are overdue, critical assets first?
9. Which area carries the most backlog for the value of assets it holds?
10. Which renewals were deferred, and how has each asset's condition moved since it was first graded?

### Three real runs on the demo council

The demo is Waimere District Council (fictional): roads and footpaths, three bridges, water supply, wastewater and stormwater networks, four community buildings and two playgrounds, NZ$91.6m of replacement cost.

**"What needs my attention this week?"** (`/attention`, trimmed)

```
  level      what                record                                   issue
  breached   DEFECT              DF-1002 BRG-001 Waimere River bridge     High risk reported 2026-10-10, not made safe: Guardrail post loose...
  breached   DEFECT              DF-1001 WWM-001 Main Street trunk sewer  Extreme risk reported 2026-10-19, not made safe: Manhole MH114...
  breached   REVALUATION         RDP Sealed road pavement                 Last revalued 2023-08-24, due 2026-08-24
  overdue    CRITICAL-POOR       WWM-001 Main Street trunk sewer          Criticality 5, condition 5 (Very poor) since 2025-06-09, no renewal planned
  overdue    INSPECTION          BRG-001 Waimere River bridge             Last inspected 2024-08-13, due 2026-08-13 (criticality 5)
  benchmark  ESSENTIAL-SERVICES  2025/26 (actual)                         Capital spend on network services is 96.7% of their depreciation
  check      DEFERRED            W-2103 War Memorial Hall roof            Renewal deferred (Waiting on the detailed seismic assessment) while BLD-001 is condition 4
  check      OVER-BUDGET         W-2002 Water main renewals               Spent NZD 455,000 against a budget of 410,000 (111%)
```

**"Are we funding our renewals?"** (`/funding-gap`, first five years)

```
  financial year     forecast      budget          gap  cumulative gap
  2026/27         $13,578,100  $1,695,000  $11,883,100     $11,883,100
  2027/28                  $0  $4,010,000  -$4,010,000      $7,873,100
  2028/29                  $0  $3,520,000  -$3,520,000      $4,353,100
  2029/30                  $0          $0           $0      $4,353,100
  2030/31            $323,000          $0     $323,000      $4,676,100
```

**"What is below satisfactory, and is anything planned?"** (`/backlog`, trimmed)

```
  code     name                           class  grade  criticality  cost to satisfactory  planned work
  WSM-001  Trunk main, reservoir to town  WSM        4            5            $2,432,000  W-2203 planned 2027/28
  WWM-001  Main Street trunk sewer        WWM        5            5            $2,403,000
  BRG-002  Kauri Stream bridge            BRG        4            4            $1,350,000  W-2201 planned 2027/28
  SWM-002  Te Kupu outfall                SWM        4            4              $432,000
  BLD-001  War Memorial Hall              BLD        4            3            $2,900,000  W-2103 deferred 2026/27
```

Dates in the demo move with today, so there is always something to find.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them, including your GIS and your finance system. No export, no lock-in.
- No licence that grows with the size of your network. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/infrastructure-assets-for-claude-code.git
cd infrastructure-assets-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type a slash command. Start with `/attention`, then `/funding-gap` and `/backlog`.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that needs a person this week: defects, inspections, critical assets, revaluations, ratios |
| `/register` | The asset register, filtered by class, area, condition or criticality |
| `/asset` | One asset in full: cost, life, condition history, defects, works, forecast |
| `/condition` | Share of each class's replacement cost in each condition grade |
| `/inspections` | Inspections overdue or coming due, critical assets first |
| `/inspect` | Record a condition inspection |
| `/defects` | Open defects and response times; log, make safe, close |
| `/works` | The capital works and maintenance programme: add, change, defer, complete |
| `/forecast` | Renewal cost by financial year, 30 years out |
| `/renewals` | The assets due for renewal, year by year, and what is planned for each |
| `/funding-gap` | Forecast renewals against the renewal budget, with the running gap |
| `/ratios` | Renewals, essential services, maintenance and backlog ratios |
| `/backlog` | Assets below satisfactory and the cost to renew them |
| `/critical` | Critical assets: condition, life left, defects, planned work |
| `/depreciation` | Replacement cost, accumulated depreciation, carrying amount, annual charge |
| `/revaluation` | Classes due for revaluation; record one with an index on unit rates |
| `/compliance` | Every legal, accounting and plan check, with its source |
| `/insights` | The ten questions above |
| `/weekly-review` | A one-page Monday review, written to `drafts/` |
| `/year-end` | The year-end asset pack for finance and the auditor |
| `/draft-business-case` | A renewal business case for an asset |
| `/draft-council-report` | A committee report on the state of the assets |
| `/draft-inspection-round` | A run sheet for an inspection crew, by area |
| `/documents` | Render the infrastructure report, class summaries, renewal programme, revaluation schedules, defect instructions |
| `/log` | A note against an asset, works item or defect |
| `/history` | Everything recorded against a record |
| `/add` | Add a class or an asset, or change a setting |
| `/import` | Bring the register across from Assetic |
| `/export` | Every record as one JSON file |
| `/customise` | Add a field, a class, a rule or a check, in plain language |
| `/new-view` | Add a read-only page to `npm run view` |
| `/help` | The list |

`npm run docs` renders the paperwork (the report on infrastructure assets, a summary for each class, the ten-year renewal programme, revaluation schedules for the valuer, defect work instructions) as branded HTML from `brand.json`. `npm run view` renders read-only pages: the week, renewals and the funding gap, condition, finance, inspections and defects.

## Your first hour: ten things to ask for

1. "We are Harrow Plains District Council, our year starts in July, and our logo is in logo.png." (`/customise`)
2. "Import our water mains from this Assetic export." (`/import`)
3. "What needs my attention?" (`/attention`)
4. "Which critical assets have nothing planned?" (`/critical`)
5. "Show the funding gap for the next 30 years, by decade." (`/funding-gap`)
6. "Record the bridge inspection: Waimere River bridge, condition 4, bearings seized." (`/inspect`)
7. "Defer the hall roof to next year, waiting on the seismic assessment." (`/works`)
8. "Our playgrounds are inspected monthly, not quarterly." (`/customise`)
9. "Write a business case for the Main Street trunk sewer." (`/draft-business-case`)
10. "Write the Monday review." (`/weekly-review`)

## Instead of Assetic

Export your assets from Assetic as CSV (the full asset export, one category at a time is fine), load your classes, and run `/import` (or `npm run assets -- import assetic --assets=FILE.csv --dry-run`, then again without `--dry-run`). Assets, measures, unit rates, useful lives, install dates and the latest condition score come across; columns are matched by name and anything else is mapped with a small map file. The full guide, with the column mapping and what does not carry over: [docs/replace-assetic.md](docs/replace-assetic.md).

## Architecture

```
infrastructure-assets-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Infrastructure Assets for Claude Code for your business, migrates your Assetic data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=assetic)
- Read more: [enterprisedna.co/omni/instead-of/assetic](https://enterprisedna.co/omni/instead-of/assetic?utm_source=github&utm_medium=readme&utm_campaign=assetic)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
