#!/usr/bin/env node
// npm test. A temp database, the migration, the demo council, every command, and the paperwork.
// Runs on Windows and Linux with nothing installed but Node. Set TEST_DATABASE_URL to a disposable
// local database named rebuild_test to run the same checks on real Postgres.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, usage, human, cents, date, year, csvDate, csvNumber, parseArgs, QUESTIONS } from './assets.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'infrastructure-assets-test-'));
process.env.DATA_DIR = path.join(temp, 'db');
process.env.OUTPUT_DIR = temp;
process.env.DATABASE_URL = '';
if (process.env.TEST_DATABASE_URL) {
  const u = new URL(process.env.TEST_DATABASE_URL);
  assert(['localhost', '127.0.0.1'].includes(u.hostname) && u.pathname === '/rebuild_test', 'TEST_DATABASE_URL must be a disposable local database named rebuild_test');
  process.env.DATABASE_URL = u.href;
}

const seen = new Set();
let db;
const call = (cmd, args = [], o = {}) => { seen.add(cmd); return run(db, cmd, args, o); };
const rules = async () => (await call('compliance')).map((x) => x.rule);
const count = (list, rule) => list.filter((r) => r === rule).length;
const n = (v) => Number(v);

try {
  db = await getDb();
  if (db.mode === 'postgres') await db.exec('drop schema public cascade; create schema public;');
  assert.equal((await migrate(db)).ran.length, 1);
  assert.equal((await migrate(db)).ran.length, 0, 'migrate twice is a no-op');
  await seed(db);
  await seed(db);
  const fy = (await db.query('select fy_of(current_date) as fy'))[0].fy;

  // Units
  assert.equal(cents('2,400.50'), 240050);
  assert.equal(cents('$1.2m'), 120000000);
  assert.equal(cents('450k'), 45000000);
  assert.throws(() => date('2026-02-30'), /YYYY-MM-DD/);
  assert.equal(year('2027'), 2027);
  assert.throws(() => year('27.5'), /whole number/);
  assert.equal(csvDate('14/03/1971'), '1971-03-14');
  assert.equal(csvDate('1984'), '1984-07-01');
  assert.equal(csvNumber('$1,250.50'), 1250.5);
  assert.deepEqual(parseArgs(['inspect', 'brg-001', '--grade=3', '--json']).options, { grade: '3', json: true });
  assert.equal((await db.query("select fy_of('2026-06-30') as a, fy_of('2026-07-01') as b, fy_label(2027) as c, fy_end(2027) as d"))[0].c, '2026/27');
  const [fyRow] = await db.query("select fy_of('2026-06-30') as a, fy_of('2026-07-01') as b, fy_end(2027)::text as d");
  assert.deepEqual([fyRow.a, fyRow.b, fyRow.d], [2026, 2027, '2027-06-30']);

  // Reads on the demo council
  assert.equal((await call('help')).length, Object.keys(usage).length);
  const classes = await call('classes');
  assert.equal(classes.length, 9);
  assert.equal(n(classes.find((c) => c.code === 'WSM').grc_cents), 2304000000, 'water mains with a unit rate: 3,800 + 14,200 + 18,000 m at $640');
  const brg = await call('class', ['bridges']);
  assert.equal(brg.assets.length, 3);
  assert.equal(brg.valuations.length, 1);
  assert.equal((await call('register')).length, 33);
  assert.equal((await call('register', [], { class: 'wsm' })).length, 4);
  assert.equal((await call('register', [], { area: 'te kupu' })).length, 8);
  assert.equal((await call('register', [], { grade: '4' })).length, 12);
  assert.equal((await call('register', [], { critical: true })).length, 16);

  const bridge = await call('asset', ['BRG-001']);
  assert.equal(n(bridge.asset.grc_cents), 480000000);
  assert.equal(n(bridge.asset.annual_depreciation_cents), 4800000, '$4.8m over 100 years');
  assert.equal(bridge.asset.grade, 3);
  assert.equal(bridge.defects.length, 1);
  const sewer = await call('asset', ['main street trunk']);
  assert.equal(sewer.asset.code, 'WWM-001');
  assert.equal(sewer.inspections.length, 2);
  assert.equal(sewer.notes.length, 1);
  await assert.rejects(call('asset', ['main street']), /More than one asset/);
  await assert.rejects(call('asset', ['nowhere road']), /No asset matches/);

  const cond = await call('condition');
  assert.equal(cond.length, 9);
  assert.equal(String(cond.find((c) => c.class === 'WWM').grade_5_percent), '12.9');

  const due = await call('inspections');
  assert.deepEqual(due.slice(0, 2).map((r) => r.code), ['BRG-001', 'BLD-003'], 'critical first');
  assert.equal((await call('inspections', [], { days: '0' })).length, 4);

  const defects = await call('defects');
  assert.equal(defects.length, 5);
  assert.equal(defects[0].number, 'DF-1001', 'extreme first');
  assert.equal((await call('defects', [], { all: true })).length, 6);

  assert.equal((await call('works')).length, 20);
  assert.equal((await call('works', [], { fy: String(fy) })).length, 7);
  assert.equal((await call('works', [], { kind: 'maintenance' })).length, 4);
  assert.equal((await call('works', [], { status: 'deferred' })).length, 1);
  assert.equal((await call('works', [], { class: 'RDS' })).length, 5);

  // The forecast: everything below satisfactory lands this year (the backlog), the rest by condition and life.
  const forecast = await call('forecast');
  assert.equal(forecast.length, 30);
  assert.equal(forecast[0].renewals, 12);
  assert.equal(n(forecast[0].cost_cents), 1357810000);
  assert.equal((await call('forecast', [], { years: '5', class: 'RDS' })).length, 5);
  const renewals = await call('renewals', [], { years: '3' });
  assert.equal(renewals.length, 12);
  assert(renewals.find((r) => r.code === 'BRG-002').planned_work.startsWith('W-2201'));
  const gap = await call('funding-gap');
  assert.equal(gap.length, 30);
  assert.equal(n(gap[0].gap_cents), 1357810000 - 169500000);
  assert.equal(n(gap[1].cumulative_gap_cents), n(gap[0].gap_cents) + n(gap[1].gap_cents));
  assert.equal((await call('funding-gap', [], { years: '10' })).length, 10);

  const ratios = await call('ratios');
  assert.equal(ratios.length, 4);
  assert.equal(ratios[0].basis, 'actual');
  assert.equal(n(ratios[0].renewals_cents), 97140000, 'last year: reseals, water mains and footpaths, actual spend');
  assert.equal(String(ratios[0].essential_services_percent), '96.7');
  assert.equal(String(ratios[1].backlog_ratio_percent), '33.8');

  const backlog = await call('backlog');
  assert.equal(backlog.length, 12);
  assert.equal(backlog.reduce((s, r) => s + n(r.cost_to_satisfactory_cents), 0), 1357810000);
  const critical = await call('critical');
  assert.equal(critical.length, 16);
  assert.equal(critical[0].criticality, 5);
  assert.equal((await call('critical', [], { min: '5' })).length, 5);
  const dep = await call('depreciation');
  assert.equal(dep.length, 9);
  assert.equal(n((await call('depreciation', [], { class: 'BRG' }))[0].annual_depreciation_cents), 6770000);

  const revs = await call('revaluations');
  assert.equal(revs.length, 9);
  assert(['RDP', 'RDS', 'FTP'].includes(revs[0].code), 'the overdue road classes first');
  assert.equal((await call('valuations')).length, 9);

  // The checks
  const r0 = await rules();
  assert.equal(count(r0, 'REVALUATION'), 4, 'roads, surfacing and footpaths overdue; bridges due soon');
  assert.equal(count(r0, 'ESSENTIAL-SERVICES'), 1, 'last year under 100%');
  assert.equal(count(r0, 'FORECAST-DATA'), 2);
  assert.equal(count(r0, 'INSPECTION'), 4);
  assert.equal(count(r0, 'DEFECT'), 3);
  assert.equal(count(r0, 'CRITICAL-POOR'), 3);
  assert.equal(count(r0, 'DEFERRED'), 1);
  assert.equal(count(r0, 'NSW-RENEWALS'), 0, 'NSW checks only run for NSW');
  const comp = await call('compliance');
  assert(comp.every((c) => c.source && c.severity), 'every finding cites a source');
  assert.equal(comp[0].severity, 'breached');
  const attention = await call('attention');
  assert(attention.some((a) => a.what === 'OVER-BUDGET' && a.record.startsWith('W-2002')));
  assert(attention.length >= comp.length);
  const week = await call('week');
  assert.equal(week.length, 5);
  assert.equal(week[0].value, '33');

  const insights = await call('insights');
  assert.equal(insights.length, 10);
  assert.equal(QUESTIONS.length, 10);
  assert(insights.every((x) => x.rows.length > 0), 'every question has an answer on the demo data');
  assert.equal(insights[2].rows.length, 3, 'three critical assets below satisfactory with nothing planned');
  assert.deepEqual(insights[4].rows.map((r) => r.code).sort(), ['BRG-002', 'FTP-002', 'SWM-002']);
  assert.equal(insights[9].rows[0].number, 'W-2103');

  // Writes
  const insp = await call('inspect', ['BRG-001'], { grade: '4', inspector: 'Bridge engineer', notes: 'Bearings seized' });
  assert.equal(insp.grade, 4);
  assert.equal(count(await rules(), 'INSPECTION'), 3, 'the bridge is no longer overdue');
  assert.equal((await call('backlog')).length, 13, 'and is now below satisfactory');
  await assert.rejects(call('inspect', ['BRG-001'], { grade: '6' }), /from 1 to 5/);

  const df = await call('add-defect', ['RDP-005'], { description: 'Slip on the seaward edge', risk: 'high' });
  assert.equal(df.number, 'DF-1007');
  await call('make-safe', ['DF-1002']);
  await call('close-defect', ['DF-1001']);
  assert.equal(count(await rules(), 'DEFECT'), 1, 'only the footpath trip hazard is still past its time');
  await assert.rejects(call('make-safe', ['DF-1001']), /already closed/);

  const w = await call('add-work', [], { name: 'Main Street trunk sewer renewal', kind: 'renewal', fy: String(fy + 1), budget: '2.6m', asset: 'WWM-001' });
  assert.equal(w.number, 'W-2304');
  assert.equal(n(w.budget_cents), 260000000);
  assert(!(await call('compliance')).some((c) => c.rule === 'CRITICAL-POOR' && c.record.startsWith('WWM-001')), 'planned now');
  await assert.rejects(call('add-work', [], { name: 'x', kind: 'renewal', fy: String(fy), budget: '1' }), /--asset or --class/);
  await assert.rejects(call('update-work', ['W-2104'], { status: 'deferred' }), /needs --reason/);
  const upd = await call('update-work', ['W-2102'], { actual: '640k' });
  assert.equal(n(upd.actual_cents), 64000000);
  const done = await call('complete-work', ['W-2107'], { actual: '72,500' });
  assert.equal(done.status, 'complete');
  assert.equal(done.grade, 1, 'a renewal resets the asset to condition 1');
  assert.equal((await call('asset', ['RDS-001'])).asset.remaining_life_years !== null, true);
  await assert.rejects(call('complete-work', ['W-2107']), /already complete/);

  const before = n((await call('depreciation', [], { class: 'RDP' }))[0].grc_cents);
  const rv = await call('revalue', ['RDP'], { valuer: 'Harrow Valuation Partners', index: '6' });
  assert.equal(n(rv.gross_replacement_cents), Math.round(before * 1.06));
  assert.equal(count(await rules(), 'REVALUATION'), 3);
  assert.equal((await call('valuations', [], { class: 'RDP' })).length, 2);

  await call('log', ['W-2103'], { note: 'Seismic assessment booked for next month', actor: 'Facilities manager' });
  const hist = await call('history', ['BLD-001']);
  assert.equal(hist.works.length, 1);
  assert.equal((await call('history', ['W-2103'])).notes.length, 1);

  assert.equal((await call('settings')).find((s) => s.key === 'jurisdiction').value, 'NZ');
  await assert.rejects(call('settings', ['jurisdiction', 'VIC']), /must be one of/);

  // Import from Assetic, dry run first: the kerb and channel class is not in the demo yet.
  const file = path.join(REPO_ROOT, 'examples', 'assetic-assets.csv');
  const dry = await call('import', ['assetic'], { assets: file, 'dry-run': true });
  assert.equal(dry.assets, 4);
  assert.deepEqual(dry.classes_not_matched, ['Kerb and channel']);
  assert.equal((await call('register', [], { class: 'WSM' })).length, 4, 'a dry run adds nothing');
  const dry2 = await call('import', ['assetic'], { assets: file, 'dry-run': true, 'create-classes': true });
  assert.equal(dry2.classes, 1);
  assert.equal(dry2.assets, 5);

  const cls = await call('add-class', [], { code: 'kc', name: 'Kerb and channel', category: 'roads', life: '60', unit: 'm', network: 'yes' });
  assert.equal(cls.code, 'KC');
  const added = await call('add-asset', [], { code: 'KC-001', name: 'Main Street kerb', class: 'KC', quantity: '2400', rate: '145', installed: '1979-07-01', criticality: '3' });
  assert.equal(n(added.grc_cents), 34800000);
  await call('dispose', ['KC-001']);
  assert.equal((await call('register', [], { class: 'KC' })).length, 0);

  // Then for real, once the class exists, then again (nothing new).
  const imp = await call('import', ['assetic'], { assets: file });
  assert.equal(imp.assets, 5, 'the kerb and channel class now exists, so all five land');
  assert.equal(imp.inspections, 4);
  assert.deepEqual(imp.condition_not_1_to_5, ['WM-10023: 7']);
  const again = await call('import', ['assetic'], { assets: file });
  assert.equal(again.assets, 0);
  assert.equal(again.inspections, 0);
  assert.equal(again.unchanged, 5);
  assert.equal((await call('imports')).length, 2);
  const kowhai = await call('asset', ['WM-10021']);
  assert.equal(kowhai.asset.installed_on, '1971-03-14');
  assert.equal(kowhai.asset.grade, 4);
  await assert.rejects(call('import', ['insly'], {}), /Only "import assetic/);

  // NSW: the same records against the NSW benchmarks.
  await call('settings', ['jurisdiction', 'NSW']);
  const nsw = await rules();
  assert.equal(count(nsw, 'ESSENTIAL-SERVICES'), 0);
  assert(count(nsw, 'NSW-RENEWALS') >= 1);
  assert.equal(count(nsw, 'NSW-BACKLOG'), 1);
  assert(count(nsw, 'NSW-MAINTENANCE') >= 1);
  assert((await call('compliance')).find((c) => c.rule === 'REVALUATION').source.includes('every 5 years'));
  await call('settings', ['jurisdiction', 'NZ']);

  const exp = await call('export', [], { out: path.join(temp, 'export.json') });
  assert(exp.records.assets >= 38);
  assert(/\d{4}\/\d{2}/.test(human(await call('ratios'))), 'financial years read as 2026/27');
  assert(human(insights).includes('10. Which renewals were deferred'));

  // Every command ran
  const missing = Object.keys(usage).filter((c) => !seen.has(c));
  assert.deepEqual(missing, [], `commands not exercised: ${missing.join(', ')}`);
} finally {
  if (db) await db.close();
}

// The CLI, the views and the documents, as separate processes against the same temp database.
const env = { ...process.env, DATA_DIR: path.join(temp, 'db'), DATABASE_URL: process.env.DATABASE_URL || '' };
const node = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: temp, env, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
};
const cliOut = node([path.join(REPO_ROOT, 'scripts', 'assets.mjs'), 'attention']);
assert(cliOut.includes('REVALUATION'));
assert(JSON.parse(node([path.join(REPO_ROOT, 'scripts', 'assets.mjs'), 'week', '--json'])).length === 5);
const bad = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'assets.mjs'), 'asset', 'main street'], { cwd: temp, env, encoding: 'utf8', windowsHide: true });
assert.equal(bad.status, 1, 'ambiguous match exits 1');

// Views and documents write under OUTPUT_DIR (the temp folder), so the repo stays clean.
const viewOut = node([path.join(REPO_ROOT, 'scripts', 'view.mjs')]);
const docsOut = node([path.join(REPO_ROOT, 'scripts', 'docs.mjs')]);
assert(viewOut.split('\n').filter((l) => l.startsWith('view:')).length >= 4, viewOut);
assert(/\d+ document\(s\) rendered/.test(docsOut) && !/^0 document/m.test(docsOut), docsOut);

fs.rmSync(temp, { recursive: true, force: true });
console.log(`PASS: ${Object.keys(usage).length} commands, ${QUESTIONS.length} questions, views and documents rendered`);
