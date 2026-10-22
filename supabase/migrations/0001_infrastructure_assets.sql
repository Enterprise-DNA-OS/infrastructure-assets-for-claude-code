-- Infrastructure Assets for Claude Code: the schema.
-- A council, water entity, port or campus owns networks of long-lived assets: roads, pipes,
-- bridges, buildings, parks. This holds the asset register (classes, assets, quantities, unit
-- rates, useful lives), condition inspections, defects, the capital works programme and the
-- valuations, and derives what an asset management system sells: replacement cost,
-- depreciation, remaining life, the renewal forecast, the funding gap and the sector ratios.
-- Plain Postgres: runs on any Postgres, Supabase or PGlite.
-- Money is integer cents in the organisation's currency (settings.currency).
-- Financial years are named by the calendar year they end in: 2027 is 1 July 2026 to 30 June 2027
-- when settings.fy_start_month is 7.

create table settings (
  key text primary key,
  value text not null
);

create or replace function setting(k text, dflt text) returns text language sql stable as $$
  select coalesce((select value from settings where key = k), dflt)
$$;

-- The financial year a date falls in, named by the year it ends.
create or replace function fy_of(d date) returns integer language sql stable as $$
  select extract(year from d)::int
       + case when setting('fy_start_month', '7')::int > 1 and extract(month from d)::int >= setting('fy_start_month', '7')::int then 1 else 0 end
$$;

-- How people say a financial year: 2026/27 when it starts mid-year, 2027 when it is the calendar year.
create or replace function fy_label(y integer) returns text language sql stable as $$
  select case when setting('fy_start_month', '7')::int > 1 then (y - 1)::text || '/' || right(y::text, 2) else y::text end
$$;

-- The last day of a financial year.
create or replace function fy_end(y integer) returns date language sql stable as $$
  select case when setting('fy_start_month', '7')::int > 1
              then make_date(y, setting('fy_start_month', '7')::int, 1) - 1
              else make_date(y, 12, 31) end
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- The condition scale. 1 is new, 5 is failed. consumed_pct is how much of an asset's life a grade
-- means is gone; the renewal forecast reads it. Change the labels or the percentages to match your
-- asset management plan with /customise.
create table condition_grades (
  grade integer primary key check (grade between 1 and 5),
  label text not null,
  consumed_pct numeric(5, 2) not null check (consumed_pct between 0 and 100),
  description text not null
);

create table asset_classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  -- Water supply, wastewater, stormwater, flood protection, roads and footpaths: the network
  -- services in the New Zealand essential services benchmark.
  network_service boolean not null default false,
  unit text not null default 'each',
  default_useful_life_years integer not null check (default_useful_life_years > 0),
  inspection_months integer not null default 24 check (inspection_months > 0),
  revaluation_years integer not null default 3 check (revaluation_years > 0),
  last_revalued_on date,
  intervention_grade integer not null default 4 references condition_grades(grade),
  required_maintenance_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  class_id uuid not null references asset_classes(id),
  parent_id uuid references assets(id),
  area text,
  location text,
  quantity numeric(14, 2) not null default 1 check (quantity >= 0),
  unit text,
  unit_rate_cents bigint check (unit_rate_cents >= 0),
  useful_life_years integer check (useful_life_years > 0),
  residual_pct numeric(5, 2) not null default 0 check (residual_pct between 0 and 100),
  installed_on date,
  renewed_on date,
  criticality integer not null default 3 check (criticality between 1 and 5),
  status text not null default 'active' check (status in ('active', 'disposed')),
  disposed_on date,
  external_ref text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assets_class_idx on assets (class_id);

create table inspections (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  inspected_on date not null,
  grade integer not null references condition_grades(grade),
  inspector text,
  notes text,
  external_ref text unique,
  created_at timestamptz not null default now()
);
create index inspections_asset_idx on inspections (asset_id, inspected_on desc);

create table defects (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  asset_id uuid not null references assets(id),
  reported_on date not null default current_date,
  description text not null,
  risk text not null default 'medium' check (risk in ('low', 'medium', 'high', 'extreme')),
  status text not null default 'open' check (status in ('open', 'made-safe', 'closed')),
  made_safe_on date,
  closed_on date,
  reported_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The capital works programme and the maintenance budget, by financial year.
create table works (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  name text not null,
  asset_id uuid references assets(id),
  class_id uuid not null references asset_classes(id),
  kind text not null check (kind in ('renewal', 'upgrade', 'new', 'maintenance')),
  financial_year integer not null,
  budget_cents bigint not null default 0,
  actual_cents bigint not null default 0,
  status text not null default 'planned' check (status in ('planned', 'approved', 'in-progress', 'complete', 'deferred', 'cancelled')),
  completed_on date,
  deferred_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table valuations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references asset_classes(id),
  valued_on date not null,
  valuer text not null,
  method text not null default 'Depreciated replacement cost',
  index_pct numeric(6, 2) not null default 0,
  gross_replacement_cents bigint not null,
  accumulated_depreciation_cents bigint not null,
  annual_depreciation_cents bigint not null,
  notes text,
  created_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  record_id uuid not null,
  note text not null,
  actor text,
  created_at timestamptz not null default now()
);
create index notes_record_idx on notes (record_id, created_at);

create table imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  file text not null,
  digest text not null,
  inserted integer not null default 0,
  unchanged integer not null default 0,
  actor text,
  created_at timestamptz not null default now()
);

create trigger asset_classes_touch before update on asset_classes for each row execute function touch_updated_at();
create trigger assets_touch before update on assets for each row execute function touch_updated_at();
create trigger defects_touch before update on defects for each row execute function touch_updated_at();
create trigger works_touch before update on works for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ views

create view latest_inspection as
select distinct on (asset_id) asset_id, inspected_on, grade, inspector, notes
from inspections order by asset_id, inspected_on desc, created_at desc;

-- The register with everything derived: replacement cost, age, condition, life consumed,
-- straight-line depreciation, carrying amount and when the next inspection is due.
-- Life consumed comes from the latest condition grade where there is one, from age where not.
create view asset_register as
with b as (
  select a.id, a.code, a.name, c.id as class_id, c.code as class_code, c.name as class, c.category, c.network_service,
         a.area, a.location, a.quantity, coalesce(a.unit, c.unit) as unit, a.unit_rate_cents,
         round(a.quantity * coalesce(a.unit_rate_cents, 0))::bigint as grc_cents,
         coalesce(a.useful_life_years, c.default_useful_life_years) as useful_life_years,
         a.residual_pct, a.installed_on, a.renewed_on, coalesce(a.renewed_on, a.installed_on) as life_from,
         a.criticality, li.inspected_on, li.grade, g.label as condition, g.consumed_pct as grade_consumed_pct,
         c.intervention_grade, ig.consumed_pct as intervention_consumed_pct, c.inspection_months,
         a.external_ref, a.unit_rate_cents is null or a.installed_on is null as data_gap,
         setting('currency', 'NZD') as currency
  from assets a
  join asset_classes c on c.id = a.class_id
  join condition_grades ig on ig.grade = c.intervention_grade
  left join latest_inspection li on li.asset_id = a.id
  left join condition_grades g on g.grade = li.grade
  where a.status = 'active'
), aged as (
  select b.*,
         case when life_from is null then null else round(((current_date - life_from) / 365.25)::numeric, 1) end as age_years
  from b
), used as (
  select aged.*,
         case when age_years is null then null else least(age_years / useful_life_years, 1) end as age_consumed,
         coalesce(grade_consumed_pct / 100.0, case when age_years is null then null else least(age_years / useful_life_years, 1) end) as consumed
  from aged
)
select used.*,
       round(useful_life_years * (1 - consumed), 1) as remaining_life_years,
       round(grc_cents * (1 - residual_pct / 100.0) / useful_life_years)::bigint as annual_depreciation_cents,
       round(grc_cents * (1 - residual_pct / 100.0) * coalesce(age_consumed, 0))::bigint as accumulated_depreciation_cents,
       grc_cents - round(grc_cents * (1 - residual_pct / 100.0) * coalesce(age_consumed, 0))::bigint as carrying_cents,
       (coalesce(inspected_on, life_from, current_date) + make_interval(months => inspection_months))::date as inspection_due_on,
       grade is not null and age_consumed is not null and grade_consumed_pct / 100.0 - age_consumed >= 0.25 as wearing_fast
from used;

-- Each asset's renewals across the next 30 financial years. An asset renews when its life consumed
-- reaches its class's intervention grade; one already at or past that grade renews this year
-- (that is the backlog). After a renewal the cycle repeats.
create view renewal_forecast as
with a as (
  select r.*,
         greatest(0, r.useful_life_years * (r.intervention_consumed_pct / 100.0 - r.consumed)) as years_to_intervention,
         greatest(1, round(r.useful_life_years * r.intervention_consumed_pct / 100.0))::int as cycle_years
  from asset_register r
  where r.consumed is not null and r.grc_cents > 0
), f as (
  select a.*, fy_of(current_date) + case when a.grade >= a.intervention_grade then 0 else ceil(a.years_to_intervention)::int end as first_fy
  from a
)
select f.id as asset_id, f.code, f.name, f.class_code, f.class, f.category, f.network_service, f.area, f.criticality, f.grade,
       f.first_fy + k * f.cycle_years as financial_year, f.grc_cents as cost_cents, k = 0 as first_renewal, f.currency
from f cross join generate_series(0, 30) as k
where f.first_fy + k * f.cycle_years < fy_of(current_date) + 30;

-- What a works item costs in its year: the actual once complete, the budget until then.
create view works_list as
select w.id, w.number, w.name, w.kind, w.financial_year, c.code as class_code, c.name as class, c.network_service,
       a.code as asset, a.name as asset_name, li.grade, w.budget_cents, w.actual_cents,
       case when w.status = 'complete' then w.actual_cents else greatest(w.budget_cents, w.actual_cents) end as cost_cents,
       w.status, w.completed_on, w.deferred_reason, w.asset_id, w.class_id, setting('currency', 'NZD') as currency
from works w
join asset_classes c on c.id = w.class_id
left join assets a on a.id = w.asset_id
left join latest_inspection li on li.asset_id = w.asset_id;

-- Forecast renewals against the renewal budget, year by year, 30 years out, with the running gap.
create view funding_gap as
with y as (
  select y as financial_year,
         coalesce((select sum(cost_cents) from renewal_forecast f where f.financial_year = y), 0)::bigint as forecast_cents,
         coalesce((select sum(cost_cents) from works_list w where w.financial_year = y and w.kind = 'renewal' and w.status not in ('deferred', 'cancelled')), 0)::bigint as budget_cents
  from generate_series(fy_of(current_date), fy_of(current_date) + 29) as y
)
select financial_year, forecast_cents, budget_cents, (forecast_cents - budget_cents)::bigint as gap_cents,
       (sum(forecast_cents - budget_cents) over (order by financial_year))::bigint as cumulative_gap_cents,
       setting('currency', 'NZD') as currency
from y;

-- Share of each class's replacement cost in each condition grade (the NSW Report on infrastructure assets layout).
create view condition_profile as
select r.class_code, r.class, count(*) as assets, sum(r.grc_cents)::bigint as grc_cents,
       round(100.0 * sum(r.grc_cents) filter (where r.grade = 1) / nullif(sum(r.grc_cents), 0), 1) as grade_1_percent,
       round(100.0 * sum(r.grc_cents) filter (where r.grade = 2) / nullif(sum(r.grc_cents), 0), 1) as grade_2_percent,
       round(100.0 * sum(r.grc_cents) filter (where r.grade = 3) / nullif(sum(r.grc_cents), 0), 1) as grade_3_percent,
       round(100.0 * sum(r.grc_cents) filter (where r.grade = 4) / nullif(sum(r.grc_cents), 0), 1) as grade_4_percent,
       round(100.0 * sum(r.grc_cents) filter (where r.grade = 5) / nullif(sum(r.grc_cents), 0), 1) as grade_5_percent,
       round(100.0 * sum(r.grc_cents) filter (where r.grade is null) / nullif(sum(r.grc_cents), 0), 1) as not_graded_percent,
       max(r.currency) as currency
from asset_register r group by r.class_code, r.class;

-- Assets below a satisfactory condition: the cost to renew them is the backlog.
create view backlog as
select r.code, r.name, r.class_code, r.class, r.area, r.grade, r.condition, r.criticality, r.inspected_on,
       r.grc_cents as cost_to_satisfactory_cents,
       (select string_agg(w.number || ' ' || w.status || ' ' || fy_label(w.financial_year), ', ') from works w
         where w.asset_id = r.id and w.kind in ('renewal', 'upgrade') and w.status not in ('complete', 'cancelled')) as planned_work,
       r.currency
from asset_register r where r.grade >= r.intervention_grade;

-- The sector ratios for last year, this year and the next two. Past years use actual spend,
-- this year and later use the budget. Depreciation is today's register for every year.
create view ratios as
with y as (select generate_series(fy_of(current_date) - 1, fy_of(current_date) + 2) as financial_year),
reg as (select coalesce(sum(annual_depreciation_cents), 0) as dep, coalesce(sum(annual_depreciation_cents) filter (where network_service), 0) as net_dep,
               coalesce(sum(carrying_cents), 0) as carrying from asset_register),
bl as (select coalesce(sum(cost_to_satisfactory_cents), 0) as backlog from backlog),
req as (select coalesce(sum(required_maintenance_cents), 0) as required from asset_classes),
s as (select y.financial_year,
             coalesce(sum(w.cost_cents) filter (where w.kind = 'renewal'), 0) as renewals,
             coalesce(sum(w.cost_cents) filter (where w.kind in ('renewal', 'upgrade', 'new') and w.network_service), 0) as net_capex,
             coalesce(sum(w.cost_cents) filter (where w.kind = 'maintenance'), 0) as maintenance
      from y left join works_list w on w.financial_year = y.financial_year and w.status not in ('deferred', 'cancelled')
      group by y.financial_year)
select s.financial_year,
       case when s.financial_year < fy_of(current_date) then 'actual' else 'budget' end as basis,
       s.renewals::bigint as renewals_cents, reg.dep::bigint as depreciation_cents,
       round(100.0 * s.renewals / nullif(reg.dep, 0), 1) as renewals_ratio_percent,
       s.net_capex::bigint as network_capex_cents, reg.net_dep::bigint as network_depreciation_cents,
       round(100.0 * s.net_capex / nullif(reg.net_dep, 0), 1) as essential_services_percent,
       s.maintenance::bigint as maintenance_cents, req.required::bigint as required_maintenance_cents,
       round(100.0 * nullif(s.maintenance, 0) / nullif(req.required, 0), 1) as maintenance_ratio_percent,
       case when s.financial_year = fy_of(current_date) then bl.backlog::bigint end as backlog_cents,
       case when s.financial_year = fy_of(current_date) then round(100.0 * bl.backlog / nullif(reg.carrying, 0), 1) end as backlog_ratio_percent,
       setting('currency', 'NZD') as currency
from s cross join reg cross join bl cross join req
order by s.financial_year;

create view inspections_due as
select r.code, r.name, r.class, r.area, r.criticality, r.inspected_on, r.grade, r.inspection_months, r.inspection_due_on,
       current_date - r.inspection_due_on as days_overdue
from asset_register r;

create view revaluations_due as
select c.code, c.name, c.revaluation_years, c.last_revalued_on,
       case when c.last_revalued_on is null then current_date else (c.last_revalued_on + make_interval(years => c.revaluation_years))::date end as due_on,
       (select count(*) from assets a where a.class_id = c.id and a.status = 'active') as assets
from asset_classes c;

create view defects_open as
select d.id, d.number, a.code as asset, a.name as asset_name, c.name as class, a.area, a.criticality, d.risk, d.description, d.reported_on, d.status, d.made_safe_on,
       d.reported_on + setting('defect_days_' || d.risk, case d.risk when 'extreme' then '1' when 'high' then '7' when 'medium' then '28' else '90' end)::int as respond_by,
       current_date - d.reported_on as days_open
from defects d join assets a on a.id = d.asset_id join asset_classes c on c.id = a.class_id
where d.status <> 'closed';

-- Every legal, accounting and asset management plan check, with its source.
-- Severity: breached, overdue, due soon, benchmark (a sector ratio below its benchmark), check.
create view compliance as
-- Revaluation of each class.
select 'REVALUATION' as rule,
       case when rd.due_on < current_date then 'breached' else 'due soon' end as severity,
       rd.code || ' ' || rd.name as record,
       case when rd.last_revalued_on is null then 'Never revalued' else 'Last revalued ' || rd.last_revalued_on || ', due ' || rd.due_on end as issue,
       case when setting('jurisdiction', 'NZ') = 'NSW'
            then 'NSW Code of Accounting Practice and Financial Reporting: each class revalued at least every 5 years; AASB 116 paragraphs 31 and 34'
            else 'PBE IPSAS 17: revaluations made with sufficient regularity; revaluation policy every ' || rd.revaluation_years || ' years' end as source,
       rd.due_on as on_date
from revaluations_due rd where rd.assets > 0 and rd.due_on < current_date + 180
union all
-- New Zealand essential services benchmark.
select 'ESSENTIAL-SERVICES', 'benchmark', fy_label(r.financial_year) || ' (' || r.basis || ')',
       'Capital spend on network services is ' || coalesce(r.essential_services_percent::text, '0') || '% of their depreciation',
       'Local Government (Financial Reporting and Prudence) Regulations 2014, reg 20: capital expenditure on network services at least equal to depreciation on them',
       fy_end(r.financial_year)
from ratios r where setting('jurisdiction', 'NZ') = 'NZ' and r.financial_year >= fy_of(current_date) - 1 and coalesce(r.essential_services_percent, 0) < 100
union all
select 'NSW-RENEWALS', 'benchmark', fy_label(r.financial_year) || ' (' || r.basis || ')',
       'Renewals are ' || coalesce(r.renewals_ratio_percent::text, '0') || '% of depreciation',
       'NSW Code of Accounting Practice and Financial Reporting: buildings and infrastructure renewals ratio benchmark 100% or more',
       fy_end(r.financial_year)
from ratios r where setting('jurisdiction', 'NZ') = 'NSW' and coalesce(r.renewals_ratio_percent, 0) < 100
union all
select 'NSW-BACKLOG', 'benchmark', fy_label(r.financial_year),
       'Backlog is ' || r.backlog_ratio_percent || '% of the written down value of infrastructure',
       'NSW Code of Accounting Practice and Financial Reporting: infrastructure backlog ratio benchmark under 2%',
       fy_end(r.financial_year)
from ratios r where setting('jurisdiction', 'NZ') = 'NSW' and r.backlog_ratio_percent >= 2
union all
select 'NSW-MAINTENANCE', 'benchmark', fy_label(r.financial_year) || ' (' || r.basis || ')',
       'Maintenance is ' || r.maintenance_ratio_percent || '% of the required maintenance',
       'NSW Code of Accounting Practice and Financial Reporting: asset maintenance ratio benchmark 100% or more',
       fy_end(r.financial_year)
from ratios r where setting('jurisdiction', 'NZ') = 'NSW' and r.maintenance_ratio_percent < 100
union all
-- An asset the long-term forecast cannot see.
select 'FORECAST-DATA', 'check', r.code || ' ' || r.name,
       'No ' || case when r.unit_rate_cents is null and r.installed_on is null then 'unit rate or install date' when r.unit_rate_cents is null then 'unit rate' else 'install date' end
         || case when r.grade is null then ' and no condition grade' else '' end || ': left out of the 30-year forecast and the valuation',
       case when setting('jurisdiction', 'NZ') = 'NSW'
            then 'Local Government Act 1993 (NSW) s403: resourcing strategy, including asset management planning'
            else 'Local Government Act 2002 s101B: infrastructure strategy covering at least 30 years' end,
       current_date
from asset_register r where r.data_gap and (r.network_service or r.criticality >= 4)
union all
-- Inspections past their cycle.
select 'INSPECTION', case when i.criticality >= 4 then 'overdue' else 'check' end, i.code || ' ' || i.name,
       case when i.inspected_on is null then 'Never inspected' else 'Last inspected ' || i.inspected_on || ', due ' || i.inspection_due_on end || ' (criticality ' || i.criticality || ')',
       'Asset management plan: inspect ' || i.class || ' every ' || i.inspection_months || ' months',
       i.inspection_due_on
from inspections_due i where i.inspection_due_on < current_date
union all
-- Defects past their response time.
select 'DEFECT', case when d.risk in ('extreme', 'high') then 'breached' else 'overdue' end, d.number || ' ' || d.asset || ' ' || d.asset_name,
       initcap(d.risk) || ' risk reported ' || d.reported_on || ', not made safe: ' || left(d.description, 60),
       'Levels of service: ' || d.risk || ' risk defects made safe within ' || (d.respond_by - d.reported_on) || ' days',
       d.respond_by
from defects_open d where d.status = 'open' and d.respond_by < current_date
union all
-- Critical assets in poor condition with nothing planned.
select 'CRITICAL-POOR', 'overdue', b.code || ' ' || b.name,
       'Criticality ' || b.criticality || ', condition ' || b.grade || ' (' || b.condition || ') since ' || b.inspected_on || ', no renewal planned',
       'Asset management plan: critical assets below satisfactory condition need a planned intervention',
       b.inspected_on
from backlog b where b.criticality >= 4 and b.planned_work is null
union all
-- Renewals pushed back on assets already below satisfactory.
select 'DEFERRED', 'check', w.number || ' ' || w.name,
       'Renewal deferred (' || coalesce(w.deferred_reason, 'no reason recorded') || ') while ' || w.asset || ' is condition ' || w.grade,
       'Capital works programme',
       fy_end(w.financial_year)
from works_list w where w.status = 'deferred' and w.kind = 'renewal' and w.grade >= 4;

-- What needs a person: the checks, then works slipping or over budget.
create view attention as
select severity as level, rule as what, record, issue, source, on_date from compliance
union all
select 'due soon', 'WORKS-NOT-STARTED', w.number || ' ' || w.name,
       'Budgeted for ' || fy_label(w.financial_year) || ', still ' || w.status || ' with ' || (fy_end(w.financial_year) - current_date) || ' days of the year left',
       'Capital works programme', fy_end(w.financial_year)
from works_list w where w.financial_year = fy_of(current_date) and w.status in ('planned', 'approved') and fy_end(w.financial_year) - current_date < 250
union all
select 'check', 'OVER-BUDGET', w.number || ' ' || w.name,
       'Spent ' || w.currency || ' ' || to_char(w.actual_cents / 100.0, 'FM999,999,990') || ' against a budget of ' || to_char(w.budget_cents / 100.0, 'FM999,999,990')
         || ' (' || round(100.0 * w.actual_cents / nullif(w.budget_cents, 0)) || '%)',
       'Capital works programme', coalesce(w.completed_on, current_date)
from works_list w where w.budget_cents > 0 and w.actual_cents > w.budget_cents * 1.1 and w.status not in ('cancelled');

create view this_week as
select 'Assets in the register' as item, count(*)::text as value from asset_register
union all select 'Replacement cost', setting('currency', 'NZD') || ' ' || to_char(coalesce((select sum(grc_cents) from asset_register), 0) / 100.0, 'FM999,999,999,990')
union all select 'Backlog (below satisfactory)', setting('currency', 'NZD') || ' ' || to_char(coalesce((select sum(cost_to_satisfactory_cents) from backlog), 0) / 100.0, 'FM999,999,999,990')
       || ' (' || (select count(*) from backlog)::text || ' assets)'
union all select 'Inspections overdue', (select count(*) from inspections_due where inspection_due_on < current_date)::text
union all select 'Defects open (not made safe)', (select count(*) from defects_open)::text || ' (' || (select count(*) from defects_open where status = 'open')::text || ')';
