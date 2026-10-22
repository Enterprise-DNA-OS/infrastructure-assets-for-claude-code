-- Demo data: Waimere District Council (fictional), a small New Zealand district with roads,
-- bridges, three waters networks, community buildings and playgrounds. Every name is invented.
-- Dates and financial years move with today, so there is always a revaluation overdue, an
-- inspection late, a defect past its response time and a critical asset with nothing planned.
-- Safe to run twice.

insert into settings (key, value) values
  ('organisation', 'Waimere District Council'),
  ('jurisdiction', 'NZ'),
  ('currency', 'NZD'),
  ('fy_start_month', '7'),
  ('defect_days_extreme', '1'),
  ('defect_days_high', '7'),
  ('defect_days_medium', '28'),
  ('defect_days_low', '90')
on conflict (key) do nothing;

insert into condition_grades (grade, label, consumed_pct, description) values
  (1, 'Excellent', 10, 'New or near new, no defects'),
  (2, 'Good', 30, 'Minor wear, routine maintenance only'),
  (3, 'Satisfactory', 50, 'Clear wear, still delivering the service; plan renewal'),
  (4, 'Poor', 75, 'Below satisfactory; renewal needed within a few years'),
  (5, 'Very poor', 95, 'Failed or about to; renew or replace now')
on conflict (grade) do nothing;

insert into asset_classes (code, name, category, network_service, unit, default_useful_life_years, inspection_months, revaluation_years,
                           last_revalued_on, required_maintenance_cents)
select v.code, v.name, v.category, v.net, v.unit, v.life, v.insp, v.reval, current_date - v.revalued_days, v.maint
from (values
  ('RDP', 'Sealed road pavement', 'roads', true, 'm2', 60, 36, 3, 1155, 38000000::bigint),
  ('RDS', 'Road surfacing', 'roads', true, 'm2', 14, 12, 3, 1155, 0::bigint),
  ('FTP', 'Footpaths', 'roads', true, 'm', 40, 24, 3, 1155, 5000000::bigint),
  ('BRG', 'Bridges', 'roads', true, 'each', 100, 24, 3, 980, 4500000::bigint),
  ('WSM', 'Water supply mains', 'water supply', true, 'm', 80, 60, 3, 400, 14000000::bigint),
  ('WWM', 'Wastewater mains', 'wastewater', true, 'm', 80, 60, 3, 400, 16000000::bigint),
  ('SWM', 'Stormwater mains', 'stormwater', true, 'm', 100, 60, 3, 400, 6000000::bigint),
  ('BLD', 'Community buildings', 'buildings', false, 'each', 50, 12, 5, 730, 9000000::bigint),
  ('PLY', 'Playgrounds', 'parks', false, 'each', 15, 3, 5, 730, 2500000::bigint)
) as v(code, name, category, net, unit, life, insp, reval, revalued_days, maint)
on conflict (code) do nothing;

-- code, name, class, area, location, quantity, unit rate (dollars), installed (years ago), criticality
insert into assets (code, name, class_id, area, location, quantity, unit_rate_cents, installed_on, criticality, external_ref)
select v.code, v.name, c.id, v.area, v.location, v.qty, round(v.rate * 100)::bigint,
       case when v.age is null then null else (current_date - make_interval(years => v.age))::date end, v.crit, 'seed:' || v.code
from (values
  ('RDP-001', 'Main Street pavement', 'RDP', 'Waimere town', 'Main St, SH to Station Rd', 6200, 78.0, 45, 5),
  ('RDP-002', 'Kauri Road pavement', 'RDP', 'Rural north', 'Kauri Rd 0.0 to 4.6 km', 18400, 78.0, 52, 3),
  ('RDP-003', 'Station Road pavement', 'RDP', 'Waimere town', 'Station Rd', 19000, 78.0, 30, 4),
  ('RDP-004', 'Hill Road pavement', 'RDP', 'Rural south', 'Hill Rd 0.0 to 5.2 km', 21000, 78.0, 58, 2),
  ('RDP-005', 'Coast Road pavement', 'RDP', 'Te Kupu', 'Coast Rd', 42000, 78.0, 12, 4),
  ('RDP-006', 'Mill Lane pavement', 'RDP', 'Waimere town', 'Mill Ln', 2900, 78.0, 40, 2),
  ('RDS-001', 'Main Street chipseal', 'RDS', 'Waimere town', 'Main St', 6200, 9.5, 11, 5),
  ('RDS-002', 'Kauri Road chipseal', 'RDS', 'Rural north', 'Kauri Rd', 18400, 9.5, 9, 3),
  ('RDS-003', 'Station Road asphalt', 'RDS', 'Waimere town', 'Station Rd', 7300, 9.5, 4, 4),
  ('RDS-004', 'Hill Road chipseal', 'RDS', 'Rural south', 'Hill Rd', 21000, 9.5, 15, 2),
  ('RDS-005', 'Coast Road chipseal', 'RDS', 'Te Kupu', 'Coast Rd', 15600, 9.5, 12, 4),
  ('FTP-001', 'Main Street footpaths', 'FTP', 'Waimere town', 'Main St both sides', 2400, 165.0, 35, 4),
  ('FTP-002', 'School Road footpath', 'FTP', 'Waimere town', 'School Rd west side', 900, 165.0, 8, 3),
  ('FTP-003', 'Te Kupu foreshore path', 'FTP', 'Te Kupu', 'Foreshore reserve', 1600, 165.0, 20, 2),
  ('BRG-001', 'Waimere River bridge', 'BRG', 'Waimere town', 'Main St over Waimere River', 1, 4800000.0, 62, 5),
  ('BRG-002', 'Kauri Stream bridge', 'BRG', 'Rural north', 'Kauri Rd 3.1 km', 1, 1350000.0, 48, 4),
  ('BRG-003', 'Mill Creek bridge', 'BRG', 'Waimere town', 'Mill Ln over Mill Creek', 1, 620000.0, 25, 3),
  ('WSM-001', 'Trunk main, reservoir to town', 'WSM', 'Waimere town', 'Reservoir Rd to Main St', 3800, 640.0, 68, 5),
  ('WSM-002', 'Town reticulation (asbestos cement)', 'WSM', 'Waimere town', 'Town grid', 14200, 640.0, 55, 4),
  ('WSM-003', 'Te Kupu reticulation (PVC)', 'WSM', 'Te Kupu', 'Te Kupu settlement', 18000, 640.0, 22, 3),
  ('WSM-004', 'Rural north water scheme', 'WSM', 'Rural north', 'Kauri Rd scheme', 9800, null, 40, 3),
  ('WWM-001', 'Main Street trunk sewer', 'WWM', 'Waimere town', 'Main St to treatment plant', 2700, 890.0, 70, 5),
  ('WWM-002', 'Town sewer reticulation (earthenware)', 'WWM', 'Waimere town', 'Town grid', 11800, 890.0, 64, 4),
  ('WWM-003', 'Te Kupu rising main', 'WWM', 'Te Kupu', 'Pump station to plant', 6500, 890.0, 18, 4),
  ('SWM-001', 'Town stormwater network', 'SWM', 'Waimere town', 'Town grid', 26000, 720.0, 50, 3),
  ('SWM-002', 'Te Kupu outfall', 'SWM', 'Te Kupu', 'Foreshore outfall', 600, 720.0, 30, 4),
  ('SWM-003', 'Industrial estate drains', 'SWM', 'Waimere town', 'Mill Ln estate', 2100, 720.0, null, 2),
  ('BLD-001', 'War Memorial Hall', 'BLD', 'Waimere town', 'Main St', 1, 2900000.0, 71, 3),
  ('BLD-002', 'Te Kupu community centre', 'BLD', 'Te Kupu', 'Beach Rd', 1, 1750000.0, 26, 3),
  ('BLD-003', 'District library', 'BLD', 'Waimere town', 'Station Rd', 1, 6400000.0, 34, 4),
  ('BLD-004', 'Council depot workshop', 'BLD', 'Waimere town', 'Mill Ln', 1, 980000.0, 41, 2),
  ('PLY-001', 'Domain playground', 'PLY', 'Waimere town', 'Waimere Domain', 1, 185000.0, 13, 3),
  ('PLY-002', 'Foreshore playground', 'PLY', 'Te Kupu', 'Foreshore reserve', 1, 240000.0, 3, 3)
) as v(code, name, class, area, location, qty, rate, age, crit)
join asset_classes c on c.code = v.class
on conflict (code) do nothing;

-- Condition inspections: code, days ago, grade, inspector, note
insert into inspections (asset_id, inspected_on, grade, inspector, notes, external_ref)
select a.id, current_date - v.days, v.grade, v.inspector, v.note, 'seed:' || v.code || ':' || v.days
from (values
  ('RDP-001', 400, 3, 'Roading team', 'Some rutting at the Station Rd end'),
  ('RDP-002', 1500, 3, 'Roading team', 'Edge break in places'),
  ('RDP-002', 500, 4, 'Roading team', 'Shear failures at 1.2 km and 3.8 km'),
  ('RDP-003', 400, 2, 'Roading team', null),
  ('RDP-004', 500, 5, 'Roading team', 'Pavement failing over most of its length'),
  ('RDP-005', 400, 1, 'Roading team', null),
  ('RDS-001', 60, 4, 'Roading team', 'Flushing and stripping, reseal due'),
  ('RDS-002', 60, 3, 'Roading team', null),
  ('RDS-003', 60, 2, 'Roading team', null),
  ('RDS-004', 60, 5, 'Roading team', 'Surface lost, potholes forming'),
  ('RDS-005', 60, 3, 'Roading team', null),
  ('FTP-001', 300, 4, 'Footpath survey', 'Lifts and cracking near the shops'),
  ('FTP-002', 300, 4, 'Footpath survey', 'Tree roots lifting slabs, poor base'),
  ('FTP-003', 300, 2, 'Footpath survey', null),
  ('BRG-001', 800, 3, 'Bridge engineer', 'Bearings and joints need attention'),
  ('BRG-002', 200, 4, 'Bridge engineer', 'Scour at the north abutment; 30 t posting recommended'),
  ('BRG-003', 200, 2, 'Bridge engineer', null),
  ('WSM-001', 900, 4, 'Three waters team', 'Breaks up from 1 a year to 4 a year'),
  ('WSM-002', 700, 3, 'Three waters team', 'AC pipe samples show early softening'),
  ('WSM-003', 700, 2, 'Three waters team', null),
  ('WSM-004', 700, 3, 'Three waters team', null),
  ('WWM-001', 1600, 4, 'CCTV contractor', 'Cracking and root intrusion'),
  ('WWM-001', 500, 5, 'CCTV contractor', 'Deformed in two sections, partial collapse risk'),
  ('WWM-002', 500, 3, 'CCTV contractor', 'Joint displacement and infiltration in places'),
  ('WWM-003', 500, 2, 'CCTV contractor', null),
  ('SWM-001', 1000, 3, 'CCTV contractor', null),
  ('SWM-002', 1000, 4, 'Three waters team', 'Outfall undermined by storm in March'),
  ('BLD-001', 200, 4, 'Facilities team', 'Roof at end of life, seismic rating 25% NBS'),
  ('BLD-002', 200, 2, 'Facilities team', null),
  ('BLD-003', 420, 3, 'Facilities team', 'HVAC near end of life'),
  ('BLD-004', 200, 3, 'Facilities team', 'Cladding tired, roof sound'),
  ('PLY-001', 120, 4, 'Parks team', 'Softfall worn, two items at end of life'),
  ('PLY-002', 40, 1, 'Parks team', null)
) as v(code, days, grade, inspector, note)
join assets a on a.code = v.code
on conflict (external_ref) do nothing;

insert into defects (number, asset_id, reported_on, description, risk, status, made_safe_on, reported_by)
select v.number, a.id, current_date - v.days, v.description, v.risk, v.status,
       case when v.safe_days is null then null else current_date - v.safe_days end, v.who
from (values
  ('DF-1001', 'WWM-001', 3, 'Manhole MH114 lid cracked and the surround sinking: sewer collapse risk under the traffic lane', 'extreme', 'open', null, 'Contractor'),
  ('DF-1002', 'BRG-001', 12, 'Guardrail post loose on the north approach', 'high', 'open', null, 'Public'),
  ('DF-1003', 'FTP-001', 35, 'Trip hazard, 30 mm slab lift outside the pharmacy', 'medium', 'open', null, 'Public'),
  ('DF-1004', 'PLY-001', 10, 'Swing chain worn through on the junior swing', 'high', 'made-safe', 9, 'Parks team'),
  ('DF-1005', 'RDP-004', 5, 'Pothole cluster at 2.4 km', 'medium', 'open', null, 'Roading team'),
  ('DF-1006', 'BLD-001', 40, 'Roof leak over the stage', 'low', 'open', null, 'Hall committee')
) as v(number, code, days, description, risk, status, safe_days, who)
join assets a on a.code = v.code
on conflict (number) do nothing;

-- number, name, asset code (or null), class, kind, year offset from this financial year, budget, actual, status, completed (days ago), deferred reason
insert into works (number, name, asset_id, class_id, kind, financial_year, budget_cents, actual_cents, status, completed_on, deferred_reason)
select v.number, v.name, a.id, c.id, v.kind, fy_of(current_date) + v.fy, round(v.budget * 100)::bigint, round(v.actual * 100)::bigint, v.status,
       case when v.done_days is null then null else current_date - v.done_days end, v.reason
from (values
  ('W-2001', 'Annual reseal programme', null, 'RDS', 'renewal', -1, 420000.0, 398400.0, 'complete', 150, null),
  ('W-2002', 'Water main renewals', null, 'WSM', 'renewal', -1, 410000.0, 455000.0, 'complete', 130, null),
  ('W-2003', 'Footpath renewals', null, 'FTP', 'renewal', -1, 120000.0, 118000.0, 'complete', 140, null),
  ('W-2004', 'Roading network maintenance', null, 'RDP', 'maintenance', -1, 380000.0, 372000.0, 'complete', 115, null),
  ('W-2005', 'Water and wastewater maintenance', null, 'WWM', 'maintenance', -1, 300000.0, 296000.0, 'complete', 115, null),
  ('W-2101', 'Annual reseal programme', null, 'RDS', 'renewal', 0, 640000.0, 0.0, 'approved', null, null),
  ('W-2102', 'Town sewer relining, stage 1', 'WWM-002', 'WWM', 'renewal', 0, 980000.0, 410000.0, 'in-progress', null, null),
  ('W-2103', 'War Memorial Hall roof and strengthening', 'BLD-001', 'BLD', 'renewal', 0, 1200000.0, 0.0, 'deferred', null, 'Waiting on the detailed seismic assessment'),
  ('W-2104', 'Te Kupu playground extension', null, 'PLY', 'upgrade', 0, 150000.0, 0.0, 'planned', null, null),
  ('W-2105', 'Roading network maintenance', null, 'RDP', 'maintenance', 0, 395000.0, 160000.0, 'in-progress', null, null),
  ('W-2106', 'Water and wastewater maintenance', null, 'WWM', 'maintenance', 0, 310000.0, 120000.0, 'in-progress', null, null),
  ('W-2107', 'Main Street reseal', 'RDS-001', 'RDS', 'renewal', 0, 75000.0, 0.0, 'planned', null, null),
  ('W-2201', 'Kauri Stream bridge replacement', 'BRG-002', 'BRG', 'renewal', 1, 1350000.0, 0.0, 'planned', null, null),
  ('W-2202', 'Annual reseal programme', null, 'RDS', 'renewal', 1, 660000.0, 0.0, 'planned', null, null),
  ('W-2203', 'Trunk main renewal, stage 1', 'WSM-001', 'WSM', 'renewal', 1, 900000.0, 0.0, 'planned', null, null),
  ('W-2204', 'Town sewer relining, stage 2', 'WWM-002', 'WWM', 'renewal', 1, 1100000.0, 0.0, 'planned', null, null),
  ('W-2205', 'Te Kupu cycleway', null, 'FTP', 'new', 1, 800000.0, 0.0, 'planned', null, null),
  ('W-2301', 'Annual reseal programme', null, 'RDS', 'renewal', 2, 680000.0, 0.0, 'planned', null, null),
  ('W-2302', 'Hill Road rehabilitation', 'RDP-004', 'RDP', 'renewal', 2, 1640000.0, 0.0, 'planned', null, null),
  ('W-2303', 'Town water reticulation renewals', 'WSM-002', 'WSM', 'renewal', 2, 1200000.0, 0.0, 'planned', null, null)
) as v(number, name, asset, class, kind, fy, budget, actual, status, done_days, reason)
join asset_classes c on c.code = v.class
left join assets a on a.code = v.asset
on conflict (number) do nothing;

-- The last valuation of each class, at today's register less the index applied since.
insert into valuations (class_id, valued_on, valuer, method, index_pct, gross_replacement_cents, accumulated_depreciation_cents, annual_depreciation_cents, notes)
select c.id, c.last_revalued_on, 'Harrow Valuation Partners (fictional)', 'Depreciated replacement cost', 0,
       round(sum(r.grc_cents) * 0.92)::bigint, round(sum(r.accumulated_depreciation_cents) * 0.9)::bigint, round(sum(r.annual_depreciation_cents) * 0.92)::bigint,
       'Seeded valuation'
from asset_classes c join asset_register r on r.class_id = c.id
where not exists (select 1 from valuations v where v.class_id = c.id)
group by c.id, c.last_revalued_on;

insert into notes (kind, record_id, note, actor)
select 'assets', a.id, v.note, v.actor
from (values
  ('WWM-001', 'Two sections deformed on the last CCTV run. Renewal not in the long-term plan yet: needs a business case.', 'Three waters manager'),
  ('BRG-002', 'Posted at 30 t after the scour inspection. Logging trucks rerouted via Hill Rd.', 'Roading manager')
) as v(code, note, actor)
join assets a on a.code = v.code
where not exists (select 1 from notes n where n.record_id = a.id and n.note = v.note);
