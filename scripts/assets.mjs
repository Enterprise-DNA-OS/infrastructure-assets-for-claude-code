#!/usr/bin/env node
// The one CLI. Every slash command in .claude/commands runs one of these.
//
//   npm run assets -- <command> [args] [--flags] [--json]
//   npm run assets -- help
//
// Records match by exact code or number, then id prefix, then part of the code or name
// (case-insensitive). More than one match lists the candidates and exits 1. Amounts are typed
// in dollars (--budget=1.2m, 450k or 2,400.50) and stored as cents in settings.currency.
// Financial years are typed as the year they end in (--fy=2027 is 2026/27 when the year starts in July).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table as textTable, money } from './lib/format.mjs';

export const usage = {
  help: 'Show every command',
  classes: 'Every asset class: useful life, inspection cycle, revaluation, replacement cost and depreciation',
  class: 'CLASS: one class with its assets, valuations and works',
  register: '[--class=CLASS] [--area=TEXT] [--grade=4] [--critical]: the asset register with cost, condition and life left',
  asset: 'ASSET: one asset with its inspections, defects, works and notes',
  condition: 'Share of each class\'s replacement cost in each condition grade',
  inspections: '[--days=30]: inspections overdue or due in the next N days, critical assets first',
  inspect: 'ASSET --grade=1-5 [--on=DATE] [--inspector=NAME] [--notes=TEXT]: record a condition inspection',
  defects: '[--all]: open defects with their response time',
  'add-defect': 'ASSET --description=TEXT [--risk=low|medium|high|extreme] [--on=DATE] [--by=NAME]',
  'make-safe': 'DEFECT [--on=DATE]: the hazard is made safe',
  'close-defect': 'DEFECT [--on=DATE]: repaired and closed',
  works: '[--fy=YEAR] [--status=STATUS] [--kind=renewal|upgrade|new|maintenance] [--class=CLASS]: the works programme',
  'add-work': '--name=TEXT --kind=renewal|upgrade|new|maintenance --fy=YEAR --budget=AMOUNT [--asset=ASSET | --class=CLASS] [--status=planned]',
  'update-work': 'WORK [--budget=AMOUNT] [--actual=AMOUNT] [--fy=YEAR] [--status=STATUS] [--reason=TEXT]',
  'complete-work': 'WORK [--on=DATE] [--actual=AMOUNT]: done; a renewal resets the asset\'s life and records it as condition 1',
  forecast: '[--years=30] [--class=CLASS]: renewal cost by financial year, from condition and useful life',
  renewals: '[--years=10] [--class=CLASS]: the assets due for renewal, year by year',
  'funding-gap': '[--years=30]: forecast renewals against the renewal budget, with the running gap',
  ratios: 'Renewals, essential services, maintenance and backlog ratios for last year, this year and the next two',
  backlog: 'Assets below a satisfactory condition and the cost to renew them',
  critical: '[--min=4]: critical assets with condition, life left and what is planned',
  depreciation: '[--class=CLASS]: replacement cost, accumulated depreciation, carrying amount and annual charge',
  revaluations: 'Each class: last revalued, next due',
  revalue: 'CLASS --valuer=NAME [--on=DATE] [--index=PCT] [--method=TEXT]: index unit rates and record the valuation',
  valuations: '[--class=CLASS]: every recorded valuation',
  compliance: 'Every legal, accounting and asset management plan check, with its source',
  attention: 'What needs a person this week',
  insights: 'Ten questions an asset system dashboard does not answer',
  week: 'The week in five numbers',
  history: 'ASSET, WORK or DEFECT: everything recorded against it',
  log: 'ASSET, WORK or DEFECT --note=TEXT [--actor=NAME]',
  settings: '[KEY VALUE]: show the settings, or change one',
  'add-class': '--code=CODE --name=TEXT --category=TEXT --life=YEARS [--unit=m] [--network=yes|no] [--inspect-months=24] [--revalue-years=3] [--intervention=4] [--maintenance=AMOUNT]',
  'add-asset': '--code=CODE --name=TEXT --class=CLASS --quantity=N --rate=AMOUNT [--installed=DATE] [--life=YEARS] [--area=TEXT] [--location=TEXT] [--criticality=3]',
  dispose: 'ASSET [--on=DATE]: take an asset out of the register',
  import: 'assetic --assets=FILE.csv [--map=FILE.json] [--create-classes] [--dry-run]: an Assetic asset export saved as CSV',
  imports: 'Import receipts',
  export: '[--out=FILE.json]: every record as JSON',
};

const WRITES = new Set(['inspect', 'add-defect', 'make-safe', 'close-defect', 'add-work', 'update-work', 'complete-work', 'revalue', 'log', 'settings',
  'add-class', 'add-asset', 'dispose', 'import']);

export class Ambiguous extends Error {}

const today = () => new Date().toISOString().slice(0, 10);
function need(v, label) {
  if (v === undefined || v === null || v === true || String(v).trim() === '') throw new Error(`${label} is required`);
  return String(v).trim();
}
export function date(v, label = 'date') {
  const s = need(v, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new Error(`${label} must be YYYY-MM-DD`);
  return s;
}
const optDate = (v, label) => (v === undefined ? today() : date(v, label));
// "2400", "2,400.50", "$1.2m", "250k" -> cents
export function cents(v, label = 'amount') {
  let s = need(v, label).replace(/[$,\s]/g, '').toLowerCase();
  let mult = 1;
  if (s.endsWith('m')) { mult = 1e6; s = s.slice(0, -1); } else if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1); }
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`${label} must be a number`);
  return Math.round(Number(s) * mult * 100);
}
const int = (v, label, min, max) => {
  const n = Number(need(v, label));
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}`);
  return n;
};
const oneOf = (v, list, label) => { const s = need(v, label); if (!list.includes(s)) throw new Error(`${label} must be one of ${list.join(', ')}`); return s; };
export const year = (v) => int(v, 'financial year', 1900, 2200);
const yes = (v, dflt) => (v === undefined ? dflt : ['yes', 'true', 'y', '1'].includes(String(v).toLowerCase()));

const KINDS = {
  asset_classes: { label: 'code', also: 'name', noun: 'class' },
  assets: { label: 'code', also: 'name', noun: 'asset' },
  works: { label: 'number', also: 'name', noun: 'works item' },
  defects: { label: 'number', also: 'description', noun: 'defect' },
};

// Exact code, then id prefix, then part of the code or name.
export async function resolve(db, kind, value) {
  const k = KINDS[kind];
  if (!k) throw new Error(`Unknown record kind ${kind}`);
  const v = need(value, k.noun);
  const tries = [
    [`lower(${k.label}) = lower($1)`, v],
    [`lower(${k.also}) = lower($1)`, v],
    ['starts_with(id::text, lower($1))', v],
    [`(${k.label} || ' ' || ${k.also}) ilike $1`, `%${v.replace(/[%_]/g, '')}%`],
  ];
  for (const [where, param] of tries) {
    const rows = await db.query(`select id, ${k.label} || ' ' || ${k.also} as label from ${kind} where ${where} order by ${k.label} limit 20`, [param]);
    if (rows.length === 1) return (await db.query(`select * from ${kind} where id = $1`, [rows[0].id]))[0];
    if (rows.length > 1) throw new Ambiguous(`More than one ${k.noun} matches "${v}":\n${rows.map((r) => `  ${r.id.slice(0, 8)}  ${r.label}`).join('\n')}`);
  }
  throw new Error(`No ${k.noun} matches "${v}"`);
}
async function anyRecord(db, value) {
  for (const kind of ['assets', 'works', 'defects']) {
    try { return { kind, record: await resolve(db, kind, value) }; } catch (e) { if (e instanceof Ambiguous) throw e; }
  }
  throw new Error(`No asset, works item or defect matches "${value}"`);
}
async function nextNumber(db, table, prefix, start) {
  const rows = await db.query(`select number from ${table} where number like $1`, [`${prefix}%`]);
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.number).slice(prefix.length)) || 0), start);
  return `${prefix}${max + 1}`;
}
const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function run(db, cmd, args = [], o = {}) {
  if (!Object.hasOwn(usage, cmd)) throw new Error(`Unknown command "${cmd}". Run: npm run assets -- help`);
  if (!WRITES.has(cmd) || (cmd === 'settings' && args.length === 0)) return execute(db, cmd, args, o);
  await db.exec('BEGIN');
  try {
    const result = await execute(db, cmd, args, o);
    await db.exec(o['dry-run'] ? 'ROLLBACK' : 'COMMIT');
    return result;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function execute(db, cmd, args, o) {
  const q = (sql, p = []) => db.query(sql, p);
  const fyNow = async () => (await q('select fy_of(current_date) as fy'))[0].fy;
  switch (cmd) {
    case 'help':
      return Object.entries(usage).map(([command, what]) => ({ command, what }));

    case 'classes':
      return q(`select c.code, c.name, c.category, c.network_service as network, c.unit, c.default_useful_life_years as life_years, c.inspection_months,
                       c.revaluation_years, c.last_revalued_on, count(r.id) as assets, coalesce(sum(r.grc_cents), 0)::bigint as grc_cents,
                       coalesce(sum(r.annual_depreciation_cents), 0)::bigint as annual_depreciation_cents, setting('currency', 'NZD') as currency
                from asset_classes c left join asset_register r on r.class_id = c.id
                group by c.id order by c.code`);

    case 'class': {
      const c = await resolve(db, 'asset_classes', args[0]);
      return {
        class: c,
        assets: await q(`select code, name, area, grc_cents, age_years, grade, remaining_life_years, criticality, currency from asset_register where class_id = $1 order by code`, [c.id]),
        valuations: await q(`select valued_on, valuer, method, index_pct, gross_replacement_cents, accumulated_depreciation_cents, annual_depreciation_cents, setting('currency', 'NZD') as currency
                             from valuations where class_id = $1 order by valued_on desc`, [c.id]),
        works: await q('select number, name, kind, financial_year, budget_cents, actual_cents, status, currency from works_list where class_id = $1 order by financial_year, number', [c.id]),
      };
    }

    case 'register': {
      const where = [];
      const p = [];
      if (o.class) { p.push((await resolve(db, 'asset_classes', o.class)).id); where.push(`class_id = $${p.length}`); }
      if (o.area) { p.push(`%${o.area}%`); where.push(`area ilike $${p.length}`); }
      if (o.grade) { p.push(int(o.grade, 'grade', 1, 5)); where.push(`grade >= $${p.length}`); }
      if (o.critical) where.push('criticality >= 4');
      return q(`select code, name, class_code as class, area, quantity, unit, grc_cents, age_years, useful_life_years as life, grade, remaining_life_years as life_left,
                       criticality, inspected_on, currency
                from asset_register ${where.length ? 'where ' + where.join(' and ') : ''} order by class_code, code`, p);
    }

    case 'asset': {
      const a = await resolve(db, 'assets', args[0]);
      const reg = (await q('select * from asset_register where id = $1', [a.id]))[0] || { ...a, note: 'disposed' };
      return {
        asset: reg,
        inspections: await q('select inspected_on, grade, inspector, notes from inspections where asset_id = $1 order by inspected_on desc', [a.id]),
        defects: await q('select number, reported_on, risk, status, description from defects where asset_id = $1 order by reported_on desc', [a.id]),
        works: await q('select number, name, kind, financial_year, budget_cents, actual_cents, status, currency from works_list where asset_id = $1 order by financial_year', [a.id]),
        forecast: await q('select financial_year, cost_cents, currency from renewal_forecast where asset_id = $1 order by financial_year limit 5', [a.id]),
        notes: await q('select created_at, actor, note from notes where record_id = $1 order by created_at', [a.id]),
      };
    }

    case 'condition':
      return q('select class_code as class, class as name, assets, grc_cents, grade_1_percent, grade_2_percent, grade_3_percent, grade_4_percent, grade_5_percent, not_graded_percent, currency from condition_profile order by class_code');

    case 'inspections': {
      const days = o.days === undefined ? 30 : int(o.days, 'days', 0, 3650);
      return q(`select code, name, class, area, criticality, inspected_on, grade, inspection_due_on as due_on, days_overdue
                from inspections_due where inspection_due_on <= current_date + $1::int
                order by criticality desc, inspection_due_on`, [days]);
    }

    case 'inspect': {
      const a = await resolve(db, 'assets', args[0]);
      const grade = int(o.grade, 'grade', 1, 5);
      const on = optDate(o.on, 'on');
      await q('insert into inspections (asset_id, inspected_on, grade, inspector, notes) values ($1, $2, $3, $4, $5)', [a.id, on, grade, o.inspector || null, o.notes || null]);
      return (await q('select code, name, grade, condition, remaining_life_years as life_left, inspection_due_on as next_inspection from asset_register where id = $1', [a.id]))[0];
    }

    case 'defects':
      return q(`select number, asset, asset_name, area, criticality, risk, status, reported_on, respond_by, days_open, description
                from defects_open ${o.all ? '' : "where status = 'open'"}
                order by case risk when 'extreme' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, reported_on`);

    case 'add-defect': {
      const a = await resolve(db, 'assets', args[0]);
      const number = await nextNumber(db, 'defects', 'DF-', 1000);
      await q('insert into defects (number, asset_id, reported_on, description, risk, reported_by) values ($1, $2, $3, $4, $5, $6)',
        [number, a.id, optDate(o.on, 'on'), need(o.description, '--description'), o.risk ? oneOf(o.risk, ['low', 'medium', 'high', 'extreme'], 'risk') : 'medium', o.by || null]);
      return (await q('select number, asset, risk, reported_on, respond_by, description from defects_open where number = $1', [number]))[0];
    }

    case 'make-safe': {
      const d = await resolve(db, 'defects', args[0]);
      if (d.status === 'closed') throw new Error(`${d.number} is already closed`);
      await q("update defects set status = 'made-safe', made_safe_on = $2 where id = $1", [d.id, optDate(o.on, 'on')]);
      return (await q('select number, status, made_safe_on, description from defects where id = $1', [d.id]))[0];
    }

    case 'close-defect': {
      const d = await resolve(db, 'defects', args[0]);
      const on = optDate(o.on, 'on');
      await q("update defects set status = 'closed', closed_on = $2, made_safe_on = coalesce(made_safe_on, $2) where id = $1", [d.id, on]);
      return (await q('select number, status, made_safe_on, closed_on, description from defects where id = $1', [d.id]))[0];
    }

    case 'works': {
      const where = [];
      const p = [];
      if (o.fy) { p.push(year(o.fy)); where.push(`financial_year = $${p.length}`); }
      if (o.status) { p.push(o.status); where.push(`status = $${p.length}`); }
      if (o.kind) { p.push(o.kind); where.push(`kind = $${p.length}`); }
      if (o.class) { p.push((await resolve(db, 'asset_classes', o.class)).id); where.push(`class_id = $${p.length}`); }
      return q(`select number, name, kind, financial_year, class_code as class, asset, grade, budget_cents, actual_cents, status, currency
                from works_list ${where.length ? 'where ' + where.join(' and ') : ''} order by financial_year, number`, p);
    }

    case 'add-work': {
      const kind = oneOf(o.kind, ['renewal', 'upgrade', 'new', 'maintenance'], 'kind');
      const asset = o.asset ? await resolve(db, 'assets', o.asset) : null;
      const classId = asset ? asset.class_id : o.class ? (await resolve(db, 'asset_classes', o.class)).id : null;
      if (!classId) throw new Error('--asset or --class is required');
      const fy = year(o.fy);
      const number = await nextNumber(db, 'works', 'W-', 2000);
      const status = o.status ? oneOf(o.status, ['planned', 'approved', 'in-progress'], 'status') : 'planned';
      await q('insert into works (number, name, asset_id, class_id, kind, financial_year, budget_cents, status) values ($1, $2, $3, $4, $5, $6, $7, $8)',
        [number, need(o.name, '--name'), asset?.id || null, classId, kind, fy, cents(o.budget, '--budget'), status]);
      return (await q('select number, name, kind, financial_year, class_code as class, asset, budget_cents, status, currency from works_list where number = $1', [number]))[0];
    }

    case 'update-work': {
      const w = await resolve(db, 'works', args[0]);
      const sets = [];
      const p = [w.id];
      const set = (col, v) => { p.push(v); sets.push(`${col} = $${p.length}`); };
      if (o.budget !== undefined) set('budget_cents', cents(o.budget, '--budget'));
      if (o.actual !== undefined) set('actual_cents', cents(o.actual, '--actual'));
      if (o.fy !== undefined) set('financial_year', year(o.fy));
      if (o.status !== undefined) {
        const s = oneOf(o.status, ['planned', 'approved', 'in-progress', 'deferred', 'cancelled'], 'status');
        if (s === 'deferred' && !o.reason) throw new Error('A deferral needs --reason');
        set('status', s);
      }
      if (o.reason !== undefined) set('deferred_reason', String(o.reason));
      if (!sets.length) throw new Error('Nothing to change: give --budget, --actual, --fy, --status or --reason');
      await q(`update works set ${sets.join(', ')} where id = $1`, p);
      return (await q('select number, name, kind, financial_year, budget_cents, actual_cents, status, deferred_reason, currency from works_list where id = $1', [w.id]))[0];
    }

    case 'complete-work': {
      const w = await resolve(db, 'works', args[0]);
      if (w.status === 'complete') throw new Error(`${w.number} is already complete`);
      const on = optDate(o.on, 'on');
      await q("update works set status = 'complete', completed_on = $2, actual_cents = coalesce($3, actual_cents) where id = $1",
        [w.id, on, o.actual === undefined ? null : cents(o.actual, '--actual')]);
      if (w.asset_id && w.kind === 'renewal') {
        await q('update assets set renewed_on = $2 where id = $1', [w.asset_id, on]);
        await q("insert into inspections (asset_id, inspected_on, grade, inspector, notes) values ($1, $2, 1, 'Works completion', $3)", [w.asset_id, on, `Renewed under ${w.number}`]);
      }
      return (await q('select number, name, kind, status, completed_on, budget_cents, actual_cents, asset, grade, currency from works_list where id = $1', [w.id]))[0];
    }

    case 'forecast': {
      const years = o.years === undefined ? 30 : int(o.years, 'years', 1, 30);
      const p = [years];
      let cls = '';
      if (o.class) { p.push((await resolve(db, 'asset_classes', o.class)).code); cls = `and f.class_code = $${p.length}`; }
      return q(`select y as financial_year, count(f.asset_id) as renewals, coalesce(sum(f.cost_cents), 0)::bigint as cost_cents,
                       coalesce(string_agg(distinct f.class_code, ', '), '') as classes, setting('currency', 'NZD') as currency
                from generate_series(fy_of(current_date), fy_of(current_date) + $1::int - 1) as y
                left join renewal_forecast f on f.financial_year = y ${cls}
                group by y order by y`, p);
    }

    case 'renewals': {
      const years = o.years === undefined ? 10 : int(o.years, 'years', 1, 30);
      const p = [years];
      let cls = '';
      if (o.class) { p.push((await resolve(db, 'asset_classes', o.class)).code); cls = `and f.class_code = $${p.length}`; }
      return q(`select f.financial_year, f.code, f.name, f.class_code as class, f.area, f.grade, f.criticality, f.cost_cents,
                       (select string_agg(w.number || ' ' || w.status, ', ') from works w where w.asset_id = f.asset_id and w.kind = 'renewal'
                          and w.status not in ('complete', 'cancelled')) as planned_work, f.currency
                from renewal_forecast f where f.financial_year < fy_of(current_date) + $1::int ${cls}
                order by f.financial_year, f.cost_cents desc`, p);
    }

    case 'funding-gap': {
      const years = o.years === undefined ? 30 : int(o.years, 'years', 1, 30);
      return q('select financial_year, forecast_cents, budget_cents, gap_cents, cumulative_gap_cents, currency from funding_gap order by financial_year limit $1', [years]);
    }

    case 'ratios':
      return q(`select financial_year, basis, renewals_cents, depreciation_cents, renewals_ratio_percent, network_capex_cents, network_depreciation_cents,
                       essential_services_percent, maintenance_ratio_percent, backlog_cents, backlog_ratio_percent, currency from ratios`);

    case 'backlog':
      return q('select code, name, class_code as class, area, grade, condition, criticality, inspected_on, cost_to_satisfactory_cents, planned_work, currency from backlog order by criticality desc, cost_to_satisfactory_cents desc');

    case 'critical': {
      const min = o.min === undefined ? 4 : int(o.min, 'min', 1, 5);
      return q(`select r.code, r.name, r.class_code as class, r.criticality, r.grade, r.remaining_life_years as life_left, r.inspected_on, r.inspection_due_on,
                       (select count(*) from defects d where d.asset_id = r.id and d.status = 'open') as open_defects,
                       (select string_agg(w.number || ' ' || fy_label(w.financial_year) || ' ' || w.status, ', ') from works w where w.asset_id = r.id
                          and w.status not in ('complete', 'cancelled')) as planned_work
                from asset_register r where r.criticality >= $1 order by r.criticality desc, r.grade desc nulls first, r.code`, [min]);
    }

    case 'depreciation': {
      const p = [];
      let where = '';
      if (o.class) { p.push((await resolve(db, 'asset_classes', o.class)).id); where = 'where class_id = $1'; }
      return q(`select class_code as class, class as name, count(*) as assets, sum(grc_cents)::bigint as grc_cents,
                       sum(accumulated_depreciation_cents)::bigint as accumulated_depreciation_cents, sum(carrying_cents)::bigint as carrying_cents,
                       sum(annual_depreciation_cents)::bigint as annual_depreciation_cents, max(currency) as currency
                from asset_register ${where} group by class_code, class order by class_code`, p);
    }

    case 'revaluations':
      return q(`select code, name, revaluation_years, last_revalued_on, due_on, due_on - current_date as days_to_due, assets from revaluations_due order by due_on`);

    case 'revalue': {
      const c = await resolve(db, 'asset_classes', args[0]);
      const on = optDate(o.on, 'on');
      const index = o.index === undefined ? 0 : Number(o.index);
      if (!Number.isFinite(index) || index < -50 || index > 100) throw new Error('--index is a percent change in unit rates, from -50 to 100');
      if (index) await q('update assets set unit_rate_cents = round(unit_rate_cents * (1 + $2::numeric / 100)) where class_id = $1 and unit_rate_cents is not null', [c.id, index]);
      const [t] = await q(`select coalesce(sum(grc_cents), 0)::bigint as grc, coalesce(sum(accumulated_depreciation_cents), 0)::bigint as acc,
                                  coalesce(sum(annual_depreciation_cents), 0)::bigint as dep from asset_register where class_id = $1`, [c.id]);
      await q(`insert into valuations (class_id, valued_on, valuer, method, index_pct, gross_replacement_cents, accumulated_depreciation_cents, annual_depreciation_cents)
               values ($1, $2, $3, $4, $5, $6, $7, $8)`, [c.id, on, need(o.valuer, '--valuer'), o.method || 'Depreciated replacement cost', index, t.grc, t.acc, t.dep]);
      await q('update asset_classes set last_revalued_on = $2 where id = $1', [c.id, on]);
      return { class: c.code, valued_on: on, index_pct: index, gross_replacement_cents: t.grc, accumulated_depreciation_cents: t.acc,
        carrying_cents: Number(t.grc) - Number(t.acc), annual_depreciation_cents: t.dep, currency: await currency(db) };
    }

    case 'valuations': {
      const p = [];
      let where = '';
      if (o.class) { p.push((await resolve(db, 'asset_classes', o.class)).id); where = 'where v.class_id = $1'; }
      return q(`select c.code as class, v.valued_on, v.valuer, v.method, v.index_pct, v.gross_replacement_cents, v.accumulated_depreciation_cents,
                       v.annual_depreciation_cents, setting('currency', 'NZD') as currency
                from valuations v join asset_classes c on c.id = v.class_id ${where} order by v.valued_on desc, c.code`, p);
    }

    case 'compliance':
      return q(`select rule, severity, record, issue, source, on_date from compliance
                order by case severity when 'breached' then 0 when 'overdue' then 1 when 'due soon' then 2 when 'benchmark' then 3 else 4 end, rule, on_date`);

    case 'attention':
      return q(`select level, what, record, issue, source from attention
                order by case level when 'breached' then 0 when 'overdue' then 1 when 'due soon' then 2 when 'benchmark' then 3 else 4 end, what, on_date`);

    case 'insights':
      return insights(db, await fyNow());

    case 'week':
      return q('select item, value from this_week');

    case 'history': {
      const { kind, record } = await anyRecord(db, args[0]);
      const label = record.code || record.number;
      const out = { record: `${kind.replace(/s$/, '')} ${label}`, notes: await q('select created_at, actor, note from notes where record_id = $1 order by created_at', [record.id]) };
      if (kind === 'assets') {
        out.inspections = await q('select inspected_on, grade, inspector, notes from inspections where asset_id = $1 order by inspected_on', [record.id]);
        out.defects = await q('select number, reported_on, risk, status, made_safe_on, closed_on, description from defects where asset_id = $1 order by reported_on', [record.id]);
        out.works = await q('select number, name, kind, financial_year, status, completed_on from works where asset_id = $1 order by financial_year', [record.id]);
      }
      return out;
    }

    case 'log': {
      const { kind, record } = await anyRecord(db, args[0]);
      await q('insert into notes (kind, record_id, note, actor) values ($1, $2, $3, $4)', [kind, record.id, need(o.note, '--note'), o.actor || null]);
      return { logged: `${kind.replace(/s$/, '')} ${record.code || record.number}`, note: o.note };
    }

    case 'settings': {
      if (args.length === 0) return q('select key, value from settings order by key');
      const [key, value] = [need(args[0], 'key'), need(args[1], 'value')];
      if (key === 'jurisdiction') oneOf(value, ['NZ', 'NSW'], 'jurisdiction');
      if (key === 'fy_start_month') int(value, 'fy_start_month', 1, 12);
      await q('insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [key, value]);
      return { key, value };
    }

    case 'add-class': {
      const code = need(o.code, '--code').toUpperCase();
      await q(`insert into asset_classes (code, name, category, network_service, unit, default_useful_life_years, inspection_months, revaluation_years, intervention_grade, required_maintenance_cents)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [code, need(o.name, '--name'), need(o.category, '--category'), yes(o.network, false), o.unit || 'each', int(o.life, '--life', 1, 300),
        o['inspect-months'] === undefined ? 24 : int(o['inspect-months'], '--inspect-months', 1, 240),
        o['revalue-years'] === undefined ? 3 : int(o['revalue-years'], '--revalue-years', 1, 20),
        o.intervention === undefined ? 4 : int(o.intervention, '--intervention', 1, 5),
        o.maintenance === undefined ? 0 : cents(o.maintenance, '--maintenance')]);
      return (await q('select code, name, category, network_service, unit, default_useful_life_years, inspection_months, revaluation_years from asset_classes where code = $1', [code]))[0];
    }

    case 'add-asset': {
      const c = await resolve(db, 'asset_classes', o.class);
      const code = need(o.code, '--code');
      await q(`insert into assets (code, name, class_id, area, location, quantity, unit_rate_cents, installed_on, useful_life_years, criticality)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [code, need(o.name, '--name'), c.id, o.area || null, o.location || null, Number(need(o.quantity, '--quantity')), cents(o.rate, '--rate'),
        o.installed === undefined ? null : date(o.installed, '--installed'), o.life === undefined ? null : int(o.life, '--life', 1, 300),
        o.criticality === undefined ? 3 : int(o.criticality, '--criticality', 1, 5)]);
      return (await q('select code, name, class, quantity, unit, grc_cents, useful_life_years, remaining_life_years, currency from asset_register where code = $1', [code]))[0];
    }

    case 'dispose': {
      const a = await resolve(db, 'assets', args[0]);
      await q("update assets set status = 'disposed', disposed_on = $2 where id = $1", [a.id, optDate(o.on, 'on')]);
      return (await q('select code, name, status, disposed_on from assets where id = $1', [a.id]))[0];
    }

    case 'import':
      if ((args[0] || '').toLowerCase() !== 'assetic') throw new Error('Only "import assetic --assets=FILE.csv" is supported');
      return importAssetic(db, o);

    case 'imports':
      return q('select created_at, source, file, inserted, unchanged, actor from imports order by created_at desc');

    case 'export': {
      const out = {};
      for (const t of ['settings', 'condition_grades', 'asset_classes', 'assets', 'inspections', 'defects', 'works', 'valuations', 'notes', 'imports']) out[t] = await q(`select * from ${t}`);
      if (o.out) {
        const file = path.resolve(process.cwd(), String(o.out));
        fs.writeFileSync(file, JSON.stringify(out, null, 2), { mode: 0o600 });
        return { written: file, records: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])) };
      }
      return out;
    }
  }
  throw new Error(`Unhandled command ${cmd}`);
}

async function currency(db) { return (await db.query("select setting('currency', 'NZD') as c"))[0].c; }

// ------------------------------------------------------------ the ten questions

export const QUESTIONS = [
  ['Which assets need renewing in the next 10 years, and what does each year cost?',
    `select financial_year, count(*) as renewals, sum(cost_cents)::bigint as cost_cents, string_agg(code, ', ' order by cost_cents desc) as assets, max(currency) as currency
     from renewal_forecast where financial_year < fy_of(current_date) + 10 group by financial_year order by financial_year`],
  ['How big is the gap between forecast renewals and the renewal budget, decade by decade?',
    `select (financial_year - fy_of(current_date)) / 10 * 10 + 1 || ' to ' || ((financial_year - fy_of(current_date)) / 10 * 10 + 10) as years_out,
            sum(forecast_cents)::bigint as forecast_cents, sum(budget_cents)::bigint as budget_cents, sum(gap_cents)::bigint as gap_cents, max(currency) as currency
     from funding_gap group by (financial_year - fy_of(current_date)) / 10 order by 1`],
  ['Which critical assets are below satisfactory with no renewal planned?',
    `select code, name, class, criticality, grade, condition, inspected_on, cost_to_satisfactory_cents, currency from backlog where criticality >= 4 and planned_work is null order by criticality desc, cost_to_satisfactory_cents desc`],
  ['What share of each class\'s replacement cost sits in each condition grade?',
    `select class_code as class, grc_cents, grade_1_percent, grade_2_percent, grade_3_percent, grade_4_percent, grade_5_percent, not_graded_percent, currency from condition_profile order by class_code`],
  ['Which assets are wearing out faster than their age says they should?',
    `select code, name, class_code as class, age_years, useful_life_years as life, round(age_consumed * 100) as age_says_percent_used, grade, round(consumed * 100) as condition_says_percent_used
     from asset_register where wearing_fast order by consumed - age_consumed desc`],
  ['Are we renewing as fast as each class depreciates?',
    `select r.class_code as class, sum(r.annual_depreciation_cents)::bigint as annual_depreciation_cents,
            coalesce((select sum(w.cost_cents) from works_list w where w.class_code = r.class_code and w.kind = 'renewal' and w.financial_year = fy_of(current_date) - 1 and w.status = 'complete'), 0)::bigint as renewed_last_year_cents,
            coalesce((select sum(w.cost_cents) from works_list w where w.class_code = r.class_code and w.kind = 'renewal' and w.financial_year = fy_of(current_date) and w.status not in ('deferred', 'cancelled')), 0)::bigint as renewal_budget_this_year_cents,
            max(r.currency) as currency
     from asset_register r group by r.class_code order by r.class_code`],
  ['Which classes are due for revaluation, and what would a 5% rise in unit rates add to depreciation?',
    `select d.code as class, d.last_revalued_on, d.due_on, sum(r.annual_depreciation_cents)::bigint as annual_depreciation_cents,
            round(sum(r.annual_depreciation_cents) * 0.05)::bigint as extra_depreciation_at_5_percent_cents, max(r.currency) as currency
     from revaluations_due d join asset_register r on r.class_code = d.code where d.due_on < current_date + 365 group by d.code, d.last_revalued_on, d.due_on order by d.due_on`],
  ['Which inspections are overdue, critical assets first?',
    `select code, name, class, criticality, inspected_on, inspection_due_on as due_on, days_overdue from inspections_due where inspection_due_on < current_date order by criticality desc, days_overdue desc`],
  ['Which area carries the most backlog for the value of assets it holds?',
    `select r.area, count(*) as assets, sum(r.grc_cents)::bigint as grc_cents, coalesce(sum(r.grc_cents) filter (where r.grade >= r.intervention_grade), 0)::bigint as backlog_cents,
            round(100.0 * coalesce(sum(r.grc_cents) filter (where r.grade >= r.intervention_grade), 0) / nullif(sum(r.grc_cents), 0), 1) as backlog_percent, max(r.currency) as currency
     from asset_register r group by r.area order by backlog_percent desc nulls last`],
  ['Which renewals were deferred, and how has each asset\'s condition moved since it was first graded?',
    `select w.number, w.name, w.financial_year, w.deferred_reason, w.asset,
            (select i.grade from inspections i where i.asset_id = w.asset_id order by i.inspected_on limit 1) as first_grade,
            (select min(i.inspected_on) from inspections i where i.asset_id = w.asset_id) as first_graded_on, w.grade as grade_now
     from works_list w where w.status = 'deferred' order by w.financial_year`],
];

async function insights(db) {
  const out = [];
  for (const [question, sql] of QUESTIONS) out.push({ question, rows: await db.query(sql) });
  return out;
}

// ------------------------------------------------------------ import from Assetic

const COLS = {
  code: ['Asset ID', 'AssetId', 'Asset Id', 'Component ID', 'Asset Code', 'Code'],
  name: ['Asset Name', 'Name', 'Component Name', 'Description'],
  class: ['Asset Class', 'Asset Sub Class', 'Asset Category', 'Class', 'Category'],
  area: ['Area', 'Suburb', 'Locality', 'Ward', 'Location Name'],
  location: ['Location', 'Address', 'Street'],
  quantity: ['Network Measure', 'Quantity', 'Measure', 'Length', 'Size'],
  unit: ['Unit', 'Network Measure Unit', 'Unit of Measure', 'UOM'],
  unit_rate: ['Unit Rate', 'Unit Cost', 'Replacement Unit Rate'],
  replacement: ['Replacement Cost', 'Gross Replacement Cost', 'Current Replacement Cost'],
  useful_life: ['Useful Life', 'Useful Life (Years)', 'Design Life', 'Total Useful Life'],
  installed: ['Install Date', 'Constructed Date', 'Construction Date', 'Commissioned Date', 'Date Acquired', 'Year Constructed'],
  condition: ['Condition', 'Condition Score', 'Condition Rating', 'Overall Condition'],
  condition_date: ['Condition Date', 'Assessment Date', 'Inspection Date'],
  criticality: ['Criticality', 'Criticality Rating'],
};

// 31/12/1968, 1968-12-31 or 1968 (a year alone is taken as 1 July).
export function csvDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return `${s}-07-01`;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  throw new Error(`Cannot read the date "${s}" (use DD/MM/YYYY or YYYY-MM-DD)`);
}
export function csvNumber(v) {
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Cannot read the number "${v}"`);
  return n;
}

async function importAssetic(db, o) {
  const file = path.resolve(process.cwd(), need(o.assets, '--assets'));
  const raw = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(raw);
  if (!rows.length) throw new Error('The file has no rows');
  const map = o.map ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), String(o.map)), 'utf8')) : {};
  const header = Object.keys(rows[0]);
  const cols = {};
  for (const [key, names] of Object.entries(COLS)) {
    const want = map[key] ? [map[key]] : names;
    cols[key] = header.find((h) => want.some((n) => n.toLowerCase() === h.toLowerCase())) || null;
  }
  for (const k of ['code', 'class', 'quantity']) if (!cols[k]) throw new Error(`No ${k} column found. Headers: ${header.join(', ')}. Map it with --map (for example {"${k}": "<their header>"})`);
  if (!cols.unit_rate && !cols.replacement) throw new Error('The file needs a unit rate or a replacement cost column');

  const counts = { classes: 0, assets: 0, inspections: 0, unchanged: 0, skipped: 0 };
  const unmatched = new Set();
  const badCondition = [];
  const classes = await db.query('select * from asset_classes');
  const findClass = (v) => classes.find((c) => c.code.toLowerCase() === v.toLowerCase() || c.name.toLowerCase() === v.toLowerCase());

  for (const row of rows) {
    const code = String(row[cols.code] || '').trim();
    if (!code) { counts.skipped++; continue; }
    const className = String(row[cols.class] || '').trim();
    let cls = findClass(className);
    const life = cols.useful_life ? csvNumber(row[cols.useful_life]) : null;
    if (!cls && o['create-classes'] && className) {
      const cc = className.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'CLASS';
      cls = (await db.query(`insert into asset_classes (code, name, category, unit, default_useful_life_years) values ($1, $2, $3, $4, $5)
                             on conflict (code) do update set name = asset_classes.name returning *`,
      [cc, className, className.toLowerCase(), cols.unit ? String(row[cols.unit] || 'each') : 'each', Math.round(life || 50)]))[0];
      classes.push(cls);
      counts.classes++;
    }
    if (!cls) { unmatched.add(className || '(blank)'); counts.skipped++; continue; }

    const quantity = csvNumber(row[cols.quantity]) ?? 1;
    const rate = cols.unit_rate && csvNumber(row[cols.unit_rate]) !== null ? csvNumber(row[cols.unit_rate])
      : cols.replacement && csvNumber(row[cols.replacement]) !== null && quantity ? csvNumber(row[cols.replacement]) / quantity : null;
    const existing = (await db.query('select * from assets where code = $1', [code]))[0];
    let asset = existing;
    if (!existing) {
      asset = (await db.query(`insert into assets (code, name, class_id, area, location, quantity, unit, unit_rate_cents, useful_life_years, installed_on, criticality, external_ref)
                               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
      [code, cols.name ? String(row[cols.name] || code).trim() : code, cls.id, cols.area ? row[cols.area] || null : null, cols.location ? row[cols.location] || null : null,
        quantity, cols.unit ? row[cols.unit] || null : null, rate === null ? null : Math.round(rate * 100),
        life ? Math.round(life) : null, cols.installed ? csvDate(row[cols.installed]) : null,
        cols.criticality && csvNumber(row[cols.criticality]) ? Math.min(5, Math.max(1, Math.round(csvNumber(row[cols.criticality])))) : 3, `assetic:${code}`]))[0];
      counts.assets++;
    } else counts.unchanged++;

    const grade = cols.condition ? csvNumber(row[cols.condition]) : null;
    if (grade !== null) {
      if (!Number.isInteger(grade) || grade < 1 || grade > 5) { badCondition.push(`${code}: ${row[cols.condition]}`); continue; }
      const on = (cols.condition_date && csvDate(row[cols.condition_date])) || today();
      const res = await db.query(`insert into inspections (asset_id, inspected_on, grade, inspector, notes, external_ref) values ($1, $2, $3, 'Imported from Assetic', null, $4)
                                  on conflict (external_ref) do nothing returning id`, [asset.id, on, grade, `assetic:${code}:${on}`]);
      if (res.length) counts.inspections++;
    }
  }

  if (!o['dry-run']) {
    await db.query('insert into imports (source, file, digest, inserted, unchanged, actor) values ($1, $2, $3, $4, $5, $6)',
      ['assetic', path.basename(file), createHash('sha256').update(raw).digest('hex'), counts.assets + counts.inspections + counts.classes, counts.unchanged, o.actor || '']);
  }
  return { ...counts, dry_run: !!o['dry-run'], classes_not_matched: [...unmatched], condition_not_1_to_5: badCondition };
}

// ------------------------------------------------------------ output

export function parseArgs(argv) {
  const args = [];
  const options = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const i = a.indexOf('=');
      options[a.slice(2, i < 0 ? undefined : i)] = i < 0 ? true : a.slice(i + 1);
    } else args.push(a);
  }
  return { cmd: args.shift() || 'help', args, options };
}

let FY_START = 7;
export const fyLabel = (y) => (FY_START > 1 ? `${Number(y) - 1}/${String(Number(y)).slice(2)}` : String(y));
const label = (k) => k.replace(/_cents$/, '').replace(/_percent$/, ' %').replace(/_/g, ' ');
function cell(v, key, row) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (key.endsWith('_cents')) return money(v, row.currency || 'NZD');
  if (key === 'financial_year') return fyLabel(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
const RIGHT = /_cents$|_percent$|^(quantity|age_years|life|life_left|life_years|grade|criticality|assets|renewals|days_overdue|days_open|days_to_due|inspection_months|revaluation_years|index_pct|open_defects|first_grade|grade_now|useful_life_years|remaining_life_years|age_says_percent_used|condition_says_percent_used)$/;
function rowsTable(rows) {
  if (!rows.length) return '  (none)';
  const keys = Object.keys(rows[0]).filter((k) => !/^(id|.*_id|currency)$/.test(k));
  return textTable(rows, keys.map((k) => ({ key: k, label: label(k), align: RIGHT.test(k) ? 'right' : 'left', width: 48, format: (v, r) => cell(v, k, r) })));
}
export function human(value) {
  if (Array.isArray(value)) {
    if (value.length && value[0]?.question) return value.map((x, i) => `\n${i + 1}. ${x.question}\n${rowsTable(x.rows)}`).join('\n');
    return rowsTable(value);
  }
  if (value && typeof value === 'object') {
    const flat = Object.entries(value).filter(([, v]) => !Array.isArray(v) && (v === null || typeof v !== 'object' || v instanceof Date));
    const lists = Object.entries(value).filter(([, v]) => Array.isArray(v) && (!v.length || typeof v[0] === 'object'));
    const objs = Object.entries(value).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date));
    const out = [];
    if (flat.length) out.push(flat.filter(([k]) => !/_id$|^id$|_at$|^currency$/.test(k)).map(([k, v]) => `  ${label(k).padEnd(30)} ${cell(v, k, value)}`).join('\n'));
    for (const [k, v] of objs) out.push(`\n${label(k)}\n` + Object.entries(v).filter(([kk]) => !/_id$|^id$|_at$|^currency$/.test(kk)).map(([kk, vv]) => `  ${label(kk).padEnd(30)} ${cell(vv, kk, v)}`).join('\n'));
    for (const [k, v] of lists) out.push(`\n${label(k)}\n${rowsTable(v)}`);
    return out.join('\n');
  }
  return String(value);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let db;
  try {
    const { cmd, args, options } = parseArgs(process.argv.slice(2));
    db = await getDb();
    try { FY_START = Number((await db.query("select setting('fy_start_month', '7') as m"))[0].m) || 7; } catch { /* not migrated yet */ }
    const result = await run(db, cmd, args, options);
    console.log(options.json ? JSON.stringify(result, null, 2) : human(result));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}

export { REPO_ROOT, iso };
