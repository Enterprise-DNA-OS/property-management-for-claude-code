-- Demo data for property-management-for-claude-code.
-- Kowhai Property Management, a fictional Wellington residential agency:
-- 4 staff, 14 owners, 27 properties, 25 running tenancies, two vacancies,
-- a rent ledger going back six months, arrears at three stages of the process,
-- inspections due and overdue, maintenance waiting on owners, bonds, notices,
-- healthy homes items and three months of owner statements.
--
-- Deliberately messy, so the attention list has something to say:
--   a tenancy 28 days behind with no Tenancy Tribunal application on file
--   a tenancy 14 days behind with no 14 day notice to remedy served
--   a tenancy a week behind with no notice of overdue rent at all
--   a water rates recharge nobody chased
--   four routine inspections past the three month cycle, one never done at all
--   an inspection booked for tomorrow with the entry notice served today
--   an inspection completed three weeks ago and never sent to the owner
--   two maintenance requests sitting on an owner's desk for two and three weeks
--   an approved job nobody has sent a contractor to
--   a completed job the contractor has never invoiced
--   a bond taken six weeks ago and never lodged, and a bond of five weeks rent
--   a rent increase served with 32 days notice, and two increases inside a year
--   healthy homes items still not compliant after the 1 July 2025 deadline
--   smoke alarms not checked in over a year
--   a vacate with no exit inspection booked
--   owner statements never sent, owners nobody has rung in six months
--   tenant records still on file eight years after the tenancy ended
--
-- Dates are relative to current_date. Ids are derived from names with seed_uuid,
-- and every insert is ON CONFLICT DO NOTHING, so running it twice changes nothing.
--
-- No client money anywhere. The rent ledger is a record of what was charged and
-- what came in. The trust account that holds the money stays where it is.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- Staff ------------------------------------------------------------------------

insert into managers (id, full_name, code, email, phone, role, active, started_on)
select seed_uuid('manager:' || v.full_name), v.full_name, v.code, v.email, v.phone, v.role, true, current_date - v.days
from (values
  ('Ana Whitiora',    'AWH', 'ana@kowhaipm.co.nz',    '027 555 0301', 'portfolio manager',       1400),
  ('Daniel Souter',   'DSO', 'daniel@kowhaipm.co.nz', '027 555 0302', 'principal',               4200),
  ('Mere Tipene',     'MTI', 'mere@kowhaipm.co.nz',   '027 555 0303', 'property manager',         800),
  ('Josh Callaghan',  'JCA', 'josh@kowhaipm.co.nz',   '027 555 0304', 'maintenance coordinator',  500)
) as v(full_name, code, email, phone, role, days)
on conflict do nothing;

-- Owners -----------------------------------------------------------------------

insert into owners (id, name, owner_type, email, phone, postal_address, city, status, manager_id, owner_since, statement_day, payment_reference, gst_registered, notes)
select seed_uuid('owner:' || v.name), v.name, v.kind, v.email, v.phone, v.postal, v.city, 'active',
       seed_uuid('manager:' || v.manager), current_date - v.days, v.stmt_day, v.payref, v.gst, v.notes
from (values
  ('Margaret Ellis',            'individual', 'margaret.ellis@example.com', '027 555 0401', '14 Hobson Crescent',      'Wellington', 'Ana Whitiora',  2600, 20, 'ELLIS-M',   false, 'Retired. Prefers a phone call before anything over $500.'),
  ('Ellis Family Trust',        'trust',      'trustee@example.com',        '027 555 0402', 'C/- Hartley Accountants', 'Wellington', 'Ana Whitiora',  3100, 20, 'ELLISTR',   true,  'Three properties. Two trustees sign, but Margaret speaks for both.'),
  ('Harbour Rise Holdings Ltd', 'company',    'admin@example.com',          '04 555 0403',  'PO Box 38-114',           'Wellington', 'Ana Whitiora',  1900, 25, 'HARBOUR',   true,  'Four flats around Newtown and Island Bay. Approvals up to $800 delegated.'),
  ('Rangi and Tui Wharekura',   'couple',     'rangi.w@example.com',        '027 555 0404', '9 Sefton Street',         'Wellington', 'Ana Whitiora',  1450, 20, 'WHAREKURA', false, 'Live in Karori. Happy to be rung on the weekend.'),
  ('Peter Voss',                'individual', 'peter.voss@example.com',     '021 555 0405', '22 Bay Road',             'Nelson',     'Mere Tipene',    980, 20, 'VOSS-P',    false, 'Out of town. Email only.'),
  ('Sunita Raman',              'individual', 'sunita.raman@example.com',   '027 555 0406', '5 Kereru Grove',          'Tawa',       'Mere Tipene',   1700, 20, 'RAMAN-S',   false, 'Two townhouses in Tawa. Wants the inspection photos every time.'),
  ('Whitmore Trust',            'trust',      'whitmore@example.com',       '04 555 0407',  'C/- Ballinger Law',       'Upper Hutt', 'Ana Whitiora',  2200, 20, 'WHITMORE',  true,  'Selling one of the two. Notice is out.'),
  ('Craig and Deb Lawson',      'couple',     'lawsons@example.com',        '027 555 0408', '31 Awa Road',             'Wellington', 'Mere Tipene',   1250, 20, 'LAWSON',    false, 'First time landlords. Ring before spending anything.'),
  ('Nikau Investments Ltd',     'company',    'accounts@example.com',       '04 555 0409',  'Level 3, 120 Willis St',  'Wellington', 'Ana Whitiora',  2800, 25, 'NIKAU',     true,  'Three properties. Approvals to $1,500 delegated to us.'),
  ('Helen Boyd',                'individual', 'helen.boyd@example.com',     '027 555 0410', '8 Motuhara Road',         'Porirua',    'Mere Tipene',    640, 20, 'BOYD-H',    false, 'One rental, it was her mother''s house.'),
  ('Ferndale Estate Trust',     'trust',      'ferndale@example.com',       '04 555 0411',  'C/- Sutton Trustees',     'Porirua',    'Ana Whitiora',  2050, 20, 'FERNDALE',  true,  'Two in Porirua. Statements go to the accountant as well.'),
  ('Anton Kereru',              'individual', 'anton.kereru@example.com',   '027 555 0412', '3 Ngaio Gorge Road',      'Wellington', 'Mere Tipene',    520, 20, 'KERERU-A',  false, 'Moved to Australia last year. Timezone is two hours behind.'),
  ('Palmer Bros Ltd',           'company',    'palmerbros@example.com',     '04 555 0413',  '77 Onslow Road',          'Wellington', 'Ana Whitiora',  1120, 25, 'PALMER',    true,  'Khandallah house, between tenants.'),
  ('Yvonne Chen',               'individual', 'yvonne.chen@example.com',    '027 555 0414', '12 Bassett Road',         'Wellington', 'Mere Tipene',    380, 20, 'CHEN-Y',    false, 'Bought the unit as a first investment.')
) as v(name, kind, email, phone, postal, city, manager, days, stmt_day, payref, gst, notes)
on conflict do nothing;

-- Properties -------------------------------------------------------------------

insert into properties (id, ref, address_line, suburb, city, region, property_type, bedrooms, bathrooms, parking,
                        year_built, owner_id, manager_id, status, management_fee_pct, letting_fee_weeks,
                        market_rent_cents, inspection_cycle_days, insurer, insurance_expires_on, keys_held, chattels, notes)
select seed_uuid('property:' || v.ref), v.ref, v.address, v.suburb, v.city, 'Wellington', v.ptype, v.beds, v.baths, v.parking,
       v.built, seed_uuid('owner:' || v.owner), seed_uuid('manager:' || v.manager), v.status, v.fee, 1.00,
       v.market, 91, v.insurer, current_date + v.ins_days, v.keys, v.chattels, v.notes
from (values
  ('PR-1001', '12 Bracken Street',      'Petone',       'Lower Hutt', 'house',     3, 1, 'single garage', 1948, 'Margaret Ellis',            'Ana Whitiora',  'managed', 8.00, 68000, 'Vero',   210, 3, 'Fridge, range, heat pump',              'Original villa, timber joinery.'),
  ('PR-1002', '4/19 Jackson Street',    'Petone',       'Lower Hutt', 'unit',      2, 1, 'off street',    1975, 'Margaret Ellis',            'Ana Whitiora',  'managed', 8.00, 55000, 'Vero',   210, 2, 'Range, heat pump',                      'Body corporate handles the roof.'),
  ('PR-1003', '88 Wilford Street',      'Naenae',       'Lower Hutt', 'house',     3, 1, 'carport',       1962, 'Ellis Family Trust',        'Ana Whitiora',  'managed', 7.50, 62000, 'AMI',    130, 3, 'Range, heat pump, dishwasher',          ''),
  ('PR-1004', '22 Rata Grove',          'Stokes Valley','Lower Hutt', 'house',     4, 2, 'double garage', 1998, 'Ellis Family Trust',        'Mere Tipene',   'managed', 7.50, 78000, 'AMI',    130, 4, 'Range, dishwasher, two heat pumps',     ''),
  ('PR-1005', '6 Kowhai Lane',          'Wainuiomata',  'Lower Hutt', 'house',     3, 1, 'off street',    1971, 'Ellis Family Trust',        'Mere Tipene',   'managed', 7.50, 59000, 'AMI',    130, 2, 'Range, heat pump',                      ''),
  ('PR-1006', '101 Adelaide Road',      'Newtown',      'Wellington', 'flat',      2, 1, 'none',          1930, 'Harbour Rise Holdings Ltd', 'Ana Whitiora',  'managed', 8.50, 63000, 'NZI',     75, 2, 'Range, panel heaters, heat pump',       'Street parking only.'),
  ('PR-1007', '3/14 Coromandel Street', 'Newtown',      'Wellington', 'flat',      1, 1, 'none',          1968, 'Harbour Rise Holdings Ltd', 'Ana Whitiora',  'managed', 8.50, 45000, 'NZI',     75, 2, 'Range, heat pump',                      'Cold in winter, south facing.'),
  ('PR-1008', '57 The Parade',          'Island Bay',   'Wellington', 'house',     3, 1, 'single garage', 1955, 'Harbour Rise Holdings Ltd', 'Mere Tipene',   'managed', 8.50, 82000, 'NZI',     75, 3, 'Range, dishwasher, heat pump',          ''),
  ('PR-1009', '9 Rhine Street',         'Island Bay',   'Wellington', 'townhouse', 3, 2, 'single garage', 2016, 'Harbour Rise Holdings Ltd', 'Mere Tipene',   'vacant',  8.50, 88000, 'NZI',     75, 3, 'Range, dishwasher, two heat pumps',     'Vacant since the last tenancy ended.'),
  ('PR-1010', '41 Karori Road',         'Karori',       'Wellington', 'house',     4, 2, 'double garage', 1985, 'Rangi and Tui Wharekura',   'Ana Whitiora',  'managed', 8.00, 95000, 'Tower',  300, 4, 'Range, dishwasher, heat pump, dryer',   ''),
  ('PR-1011', '2/8 Donald Street',      'Karori',       'Wellington', 'unit',      2, 1, 'off street',    1979, 'Rangi and Tui Wharekura',   'Ana Whitiora',  'managed', 8.00, 56000, 'Tower',  300, 2, 'Range, heat pump',                      ''),
  ('PR-1012', '15 Broderick Road',      'Johnsonville', 'Wellington', 'house',     3, 1, 'carport',       1966, 'Peter Voss',                'Mere Tipene',   'managed', 8.00, 70000, 'Vero',   160, 3, 'Range, dishwasher, heat pump',          'Owner is in Nelson, email only.'),
  ('PR-1013', '33 Main Road',           'Tawa',         'Wellington', 'house',     3, 1, 'single garage', 1974, 'Sunita Raman',              'Mere Tipene',   'managed', 8.00, 66000, 'AA',     240, 3, 'Range, heat pump',                      ''),
  ('PR-1014', '7 Duncan Street',        'Tawa',         'Wellington', 'townhouse', 2, 1, 'off street',    2004, 'Sunita Raman',              'Mere Tipene',   'managed', 8.00, 58000, 'AA',     240, 2, 'Range, dishwasher, heat pump',          ''),
  ('PR-1015', '120 Fergusson Drive',    'Upper Hutt',   'Upper Hutt', 'house',     4, 2, 'double garage', 1992, 'Whitmore Trust',            'Ana Whitiora',  'managed', 7.50, 74000, 'Vero',   190, 4, 'Range, dishwasher, heat pump',          ''),
  ('PR-1016', '5 Blenheim Street',      'Upper Hutt',   'Upper Hutt', 'house',     3, 1, 'carport',       1958, 'Whitmore Trust',            'Ana Whitiora',  'managed', 7.50, 60000, 'Vero',   190, 3, 'Range, heat pump',                      'Trust is selling. Notice served.'),
  ('PR-1017', '18 Darlington Road',     'Miramar',      'Wellington', 'house',     3, 1, 'single garage', 1940, 'Craig and Deb Lawson',      'Mere Tipene',   'managed', 8.00, 79000, 'AMI',    115, 3, 'Range, dishwasher, heat pump',          ''),
  ('PR-1018', '44 Coutts Street',       'Kilbirnie',    'Wellington', 'flat',      2, 1, 'off street',    1969, 'Craig and Deb Lawson',      'Mere Tipene',   'managed', 8.00, 57000, 'AMI',    115, 2, 'Range, heat pump',                      ''),
  ('PR-1019', '9 Owen Street',          'Newtown',      'Wellington', 'house',     4, 2, 'off street',    1928, 'Nikau Investments Ltd',     'Ana Whitiora',  'managed', 8.50, 90000, 'NZI',     95, 4, 'Range, dishwasher, two heat pumps',     'Let by the room in the past, now one tenancy.'),
  ('PR-1020', '62 Britomart Street',    'Berhampore',   'Wellington', 'house',     3, 1, 'off street',    1951, 'Nikau Investments Ltd',     'Ana Whitiora',  'managed', 8.50, 72000, 'NZI',     95, 3, 'Range, heat pump',                      ''),
  ('PR-1021', '11 Cleveland Street',    'Brooklyn',     'Wellington', 'house',     2, 1, 'none',          1922, 'Nikau Investments Ltd',     'Mere Tipene',   'managed', 8.50, 64000, 'NZI',     95, 2, 'Range, heat pump',                      'Piles were relevelled in 2023.'),
  ('PR-1022', '26 Titahi Bay Road',     'Titahi Bay',   'Porirua',    'house',     3, 1, 'carport',       1963, 'Helen Boyd',                'Mere Tipene',   'managed', 8.00, 61000, 'Tower',  145, 3, 'Range, heat pump',                      ''),
  ('PR-1023', '5 Discovery Drive',      'Whitby',       'Porirua',    'house',     4, 2, 'double garage', 2001, 'Ferndale Estate Trust',     'Ana Whitiora',  'managed', 7.50, 76000, 'Tower',  270, 4, 'Range, dishwasher, heat pump',          ''),
  ('PR-1024', '38 Warspite Avenue',     'Ascot Park',   'Porirua',    'house',     3, 1, 'off street',    1965, 'Ferndale Estate Trust',     'Ana Whitiora',  'managed', 7.50, 58000, 'Tower',  270, 3, 'Range, heat pump',                      'Lean-to at the back has no ceiling access.'),
  ('PR-1025', '14 Ngaio Gorge Road',    'Ngaio',        'Wellington', 'house',     3, 2, 'single garage', 1988, 'Anton Kereru',              'Mere Tipene',   'managed', 8.00, 85000, 'AA',     205, 3, 'Range, dishwasher, heat pump',          ''),
  ('PR-1026', '21 Box Hill',            'Khandallah',   'Wellington', 'house',     4, 2, 'double garage', 1995, 'Palmer Bros Ltd',           'Ana Whitiora',  'vacant',  8.00, 98000, 'Vero',   150, 4, 'Range, dishwasher, two heat pumps',     'Owner used it himself for two years.'),
  ('PR-1027', '3 Truscott Avenue',      'Johnsonville', 'Wellington', 'unit',      2, 1, 'off street',    1982, 'Yvonne Chen',               'Mere Tipene',   'managed', 8.00, 54000, 'AA',     185, 2, 'Range, heat pump',                      '')
) as v(ref, address, suburb, city, ptype, beds, baths, parking, built, owner, manager, status, fee, market, insurer, ins_days, keys, chattels, notes)
on conflict do nothing;

-- Tenancies --------------------------------------------------------------------

insert into tenancies (id, tenancy_ref, property_id, manager_id, kind, status, start_on, fixed_term_end_on, end_on,
                       rent_cents, rent_period, rent_due_day, bond_cents, agreement_signed_on,
                       healthy_homes_statement, insulation_statement, last_increase_on, renewal_stage, renewal_note,
                       vacate_notice_on, vacate_on, vacate_notice_by, vacate_reason, notes)
select seed_uuid('tenancy:' || v.ref), v.ref, seed_uuid('property:' || v.property), seed_uuid('manager:' || v.manager),
       v.kind, v.status, current_date - v.start_days,
       case when v.fixed_end_days is null then null else current_date + v.fixed_end_days end,
       case when v.end_days is null then null else current_date - v.end_days end,
       v.rent, v.period, v.due_day, v.bond, current_date - v.start_days - 3,
       v.hh, v.ins,
       case when v.increase_days is null then null else current_date - v.increase_days end,
       v.renewal, v.renewal_note,
       case when v.vac_notice_days is null then null else current_date - v.vac_notice_days end,
       case when v.vac_in_days is null then null else current_date + v.vac_in_days end,
       v.vac_by, v.vac_reason, v.notes
from (values
  ('TEN-2001', 'PR-1001', 'Ana Whitiora', 'periodic',   'active',       900,  null, null,  68000, 'weekly',      'Monday',    272000, true,  true,   400, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2002', 'PR-1002', 'Ana Whitiora', 'periodic',   'active',       420,  null, null,  54000, 'weekly',      'Friday',    216000, true,  true,    50, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2003', 'PR-1003', 'Ana Whitiora', 'periodic',   'active',      1500,  null, null,  60000, 'weekly',      'Monday',    216000, true,  true,   500, 'not started', '',                                    null, null, null, null, 'Long standing tenants, never late.'),
  ('TEN-2004', 'PR-1004', 'Mere Tipene',  'fixed term', 'active',       260,    25, null,  76000, 'weekly',      'Wednesday', 304000, true,  true,  null, 'not started', 'Nobody has asked them what they want', null, null, null, null, ''),
  ('TEN-2005', 'PR-1005', 'Mere Tipene',  'periodic',   'active',       700,  null, null,  57000, 'weekly',      'Monday',    228000, true,  true,    90, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2006', 'PR-1006', 'Ana Whitiora', 'periodic',   'active',       190,  null, null,  62000, 'weekly',      'Thursday',  248000, true,  true,  null, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2007', 'PR-1007', 'Ana Whitiora', 'periodic',   'active',      1100,  null, null,  44000, 'weekly',      'Monday',    176000, false, false,  200, 'not started', '',                                    null, null, null, null, 'Behind before, caught up last winter.'),
  ('TEN-2008', 'PR-1008', 'Mere Tipene',  'periodic',   'active',       520,  null, null,  80000, 'weekly',      'Monday',    320000, true,  true,  null, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2009', 'PR-1010', 'Ana Whitiora', 'periodic',   'active',      2000,  null, null,  92000, 'weekly',      'Friday',    368000, true,  true,   380, 'not started', '',                                    null, null, null, null, 'Six years in the house.'),
  ('TEN-2010', 'PR-1011', 'Ana Whitiora', 'periodic',   'active',       380,  null, null,  55000, 'weekly',      'Monday',    220000, true,  true,    10, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2011', 'PR-1012', 'Mere Tipene',  'periodic',   'active',        45,  null, null,  69000, 'weekly',      'Tuesday',   276000, true,  true,  null, 'not started', '',                                    null, null, null, null, 'New tenancy. Bond still sitting here.'),
  ('TEN-2012', 'PR-1013', 'Mere Tipene',  'periodic',   'active',       640,  null, null,  64000, 'weekly',      'Monday',    256000, true,  true,   150, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2013', 'PR-1014', 'Mere Tipene',  'periodic',   'active',      1300,  null, null,  56000, 'weekly',      'Wednesday', 224000, false, true,   420, 'not started', '',                                    null, null, null, null, 'Hours were cut at work in July.'),
  ('TEN-2014', 'PR-1015', 'Ana Whitiora', 'periodic',   'active',       300,  null, null, 144000, 'fortnightly', 'Friday',    288000, true,  true,  null, 'not started', '',                                    null, null, null, null, 'Pays fortnightly to line up with payday.'),
  ('TEN-2015', 'PR-1016', 'Ana Whitiora', 'periodic',   'notice given', 810,  null, null,  59000, 'weekly',      'Monday',    236000, true,  true,   200, 'not started', '',                                      45,   45, 'landlord', 'Owner is selling', ''),
  ('TEN-2016', 'PR-1017', 'Mere Tipene',  'fixed term', 'active',       150,    55, null,  77000, 'weekly',      'Monday',    308000, true,  true,  null, 'owner asked', 'Owner happy to renew at market',      null, null, null, null, ''),
  ('TEN-2017', 'PR-1018', 'Mere Tipene',  'periodic',   'active',      1050,  null, null,  56000, 'weekly',      'Thursday',  224000, true,  true,   340, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2018', 'PR-1019', 'Ana Whitiora', 'fixed term', 'active',        60,   305, null,  88000, 'weekly',      'Monday',    440000, true,  true,  null, 'not started', '',                                    null, null, null, null, 'Five weeks bond was taken at signing.'),
  ('TEN-2019', 'PR-1020', 'Ana Whitiora', 'periodic',   'active',       470,  null, null,  70000, 'weekly',      'Monday',    280000, true,  true,   100, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2020', 'PR-1021', 'Mere Tipene',  'periodic',   'active',       980,  null, null,  62000, 'weekly',      'Friday',    248000, true,  true,    30, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2021', 'PR-1022', 'Mere Tipene',  'periodic',   'notice given', 220,  null, null,  60000, 'weekly',      'Monday',    240000, true,  true,  null, 'not started', '',                                       6,   15, 'tenant',   'Moving to Christchurch', ''),
  ('TEN-2022', 'PR-1023', 'Ana Whitiora', 'periodic',   'active',      1400,  null, null,  74000, 'weekly',      'Monday',    296000, true,  true,   200, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2023', 'PR-1024', 'Ana Whitiora', 'periodic',   'active',       730,  null, null,  57000, 'weekly',      'Monday',    228000, true,  true,   250, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2024', 'PR-1025', 'Mere Tipene',  'fixed term', 'active',        95,   270, null,  83000, 'weekly',      'Wednesday', 332000, true,  true,  null, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-2025', 'PR-1027', 'Mere Tipene',  'periodic',   'active',       560,  null, null, 106000, 'fortnightly', 'Friday',    212000, true,  true,   170, 'not started', '',                                    null, null, null, null, ''),
  ('TEN-1990', 'PR-1009', 'Mere Tipene',  'periodic',   'ended',        980,  null,   25,  84000, 'weekly',      'Monday',    336000, true,  true,   390, 'not started', '',                                      70,  -25, 'tenant',   'Bought their own place', 'Ended cleanly, bond refunded in full.'),
  ('TEN-1975', 'PR-1026', 'Ana Whitiora', 'periodic',   'ended',       3600,  null, 2950,  52000, 'weekly',      'Monday',    208000, false, false, null, 'not started', '',                                    null, null, null, null, 'Owner took the house back to live in.')
) as v(ref, property, manager, kind, status, start_days, fixed_end_days, end_days, rent, period, due_day, bond, hh, ins, increase_days, renewal, renewal_note, vac_notice_days, vac_in_days, vac_by, vac_reason, notes)
on conflict do nothing;

-- Tenants ----------------------------------------------------------------------

insert into tenants (id, full_name, email, phone, emergency_contact, employer, notes)
select seed_uuid('tenant:' || v.full_name), v.full_name, v.email, v.phone, v.emergency, v.employer, v.notes
from (values
  ('Jade Ferrier',        'jade.ferrier@example.com',   '027 555 0501', 'Nan Ferrier 027 555 0601',   'Hutt Valley DHB',          ''),
  ('Sam Ferrier',         'sam.ferrier@example.com',    '027 555 0502', 'Nan Ferrier 027 555 0601',   'Placemakers',              ''),
  ('Aroha Ngatai',        'aroha.ngatai@example.com',   '027 555 0503', 'Hemi Ngatai 027 555 0602',   'Te Whatu Ora',             ''),
  ('Callum Deere',        'callum.deere@example.com',   '027 555 0504', 'Jill Deere 027 555 0603',    'Wellington City Council',  ''),
  ('Priya Nadarajah',     'priya.n@example.com',        '027 555 0505', 'Sanjay N 027 555 0604',      'Datacom',                  ''),
  ('Tom Nadarajah',       'tom.n@example.com',          '027 555 0506', 'Sanjay N 027 555 0604',      'Self employed',            ''),
  ('Bree Halloran',       'bree.h@example.com',         '027 555 0507', 'Kate Halloran 027 555 0605', 'Victoria University',      ''),
  ('Nikau Paine',         'nikau.paine@example.com',    '027 555 0508', 'Moana Paine 027 555 0606',   'Fulton Hogan',             ''),
  ('Erin Paine',          'erin.paine@example.com',     '027 555 0509', 'Moana Paine 027 555 0606',   'Countdown',                ''),
  ('Marcus Vaeau',        'marcus.v@example.com',       '027 555 0510', 'Lupe Vaeau 027 555 0607',    'Wellington Free Ambulance',''),
  ('Holly Redmond',       'holly.r@example.com',        '027 555 0511', 'Ray Redmond 027 555 0608',   'Trade Me',                 'Hours were cut in July.'),
  ('Isaac Redmond',       'isaac.r@example.com',        '027 555 0512', 'Ray Redmond 027 555 0608',   'Student',                  ''),
  ('Grace Whittaker',     'grace.w@example.com',        '027 555 0513', 'Bev Whittaker 027 555 0609', 'Ministry of Education',    ''),
  ('Leon Whittaker',      'leon.w@example.com',         '027 555 0514', 'Bev Whittaker 027 555 0609', 'Kiwirail',                 ''),
  ('Tania Rewiti',        'tania.rewiti@example.com',   '027 555 0515', 'Pare Rewiti 027 555 0610',   'Hutt City Council',        ''),
  ('Ben Kitchener',       'ben.k@example.com',          '027 555 0516', 'Sue Kitchener 027 555 0611', 'Xero',                     ''),
  ('Mia Kitchener',       'mia.k@example.com',          '027 555 0517', 'Sue Kitchener 027 555 0611', 'Te Papa',                  ''),
  ('Rangi Toitoi',        'rangi.t@example.com',        '027 555 0518', 'Wiremu Toitoi 027 555 0612', 'Ministry of Social Dev',   ''),
  ('Fiona Blackwood',     'fiona.b@example.com',        '027 555 0519', 'Ian Blackwood 027 555 0613', 'Wellington Water',         ''),
  ('Alistair Blackwood',  'alistair.b@example.com',     '027 555 0520', 'Ian Blackwood 027 555 0613', 'Retired',                  ''),
  ('Sione Latu',          'sione.latu@example.com',     '027 555 0521', 'Ana Latu 027 555 0614',      'Downer',                   ''),
  ('Maree Latu',          'maree.latu@example.com',     '027 555 0522', 'Ana Latu 027 555 0614',      'Bunnings',                 ''),
  ('Chelsea Barrow',      'chelsea.b@example.com',      '027 555 0523', 'Dot Barrow 027 555 0615',    'Weta Workshop',            ''),
  ('Josh Meldrum',        'josh.meldrum@example.com',   '027 555 0524', 'Pam Meldrum 027 555 0616',   'NZ Post',                  ''),
  ('Kiri Manaia',         'kiri.manaia@example.com',    '027 555 0525', 'Hone Manaia 027 555 0617',   'Capital and Coast',        ''),
  ('Dan Fowler',          'dan.fowler@example.com',     '027 555 0526', 'Rob Fowler 027 555 0618',    'Aurecon',                  ''),
  ('Steph Fowler',        'steph.fowler@example.com',   '027 555 0527', 'Rob Fowler 027 555 0618',    'Wellington Zoo',           ''),
  ('Omar Haddad',         'omar.haddad@example.com',    '027 555 0528', 'Layla Haddad 027 555 0619',  'Beca',                     ''),
  ('Ruby Sinclair',       'ruby.s@example.com',         '027 555 0529', 'Jane Sinclair 027 555 0620', 'Massey University',        ''),
  ('Cameron Ellery',      'cam.ellery@example.com',     '027 555 0530', 'Pat Ellery 027 555 0621',    'Contact Energy',           ''),
  ('Anahera Rewi',        'anahera.rewi@example.com',   '027 555 0531', 'Tui Rewi 027 555 0622',      'Porirua City Council',     ''),
  ('Blake Corrigan',      'blake.c@example.com',        '027 555 0532', 'Jo Corrigan 027 555 0623',   'Fire and Emergency NZ',    ''),
  ('Jess Corrigan',       'jess.c@example.com',         '027 555 0533', 'Jo Corrigan 027 555 0623',   'Ministry of Health',       ''),
  ('Peter Aiono',         'peter.aiono@example.com',    '027 555 0534', 'Faith Aiono 027 555 0624',   'Wellington Airport',       ''),
  ('Lucy Tremain',        'lucy.tremain@example.com',   '027 555 0535', 'Meg Tremain 027 555 0625',   'Deloitte',                 ''),
  ('Harry Ngawaka',       'harry.n@example.com',        '027 555 0536', 'Rewa Ngawaka 027 555 0626',  'Transpower',               ''),
  ('Simone Vukona',       'simone.v@example.com',       '027 555 0537', 'Ella Vukona 027 555 0627',   'Kainga Ora',               ''),
  ('Gareth Pinny',        'gareth.p@example.com',       '027 555 0538', 'Ann Pinny 027 555 0628',     'Moved to Australia',       'Tenancy ended eight years ago.'),
  ('Denise Pinny',        'denise.p@example.com',       '027 555 0539', 'Ann Pinny 027 555 0628',     'Moved to Australia',       'Tenancy ended eight years ago.')
) as v(full_name, email, phone, emergency, employer, notes)
on conflict do nothing;

insert into tenancy_tenants (id, tenancy_id, tenant_id, is_primary)
select seed_uuid('tt:' || v.ref || ':' || v.tenant), seed_uuid('tenancy:' || v.ref), seed_uuid('tenant:' || v.tenant), v.primary_
from (values
  ('TEN-2001', 'Jade Ferrier',       true),
  ('TEN-2001', 'Sam Ferrier',        false),
  ('TEN-2002', 'Aroha Ngatai',       true),
  ('TEN-2003', 'Callum Deere',       true),
  ('TEN-2004', 'Priya Nadarajah',    true),
  ('TEN-2004', 'Tom Nadarajah',      false),
  ('TEN-2005', 'Bree Halloran',      true),
  ('TEN-2006', 'Nikau Paine',        true),
  ('TEN-2006', 'Erin Paine',         false),
  ('TEN-2007', 'Marcus Vaeau',       true),
  ('TEN-2008', 'Grace Whittaker',    true),
  ('TEN-2008', 'Leon Whittaker',     false),
  ('TEN-2009', 'Tania Rewiti',       true),
  ('TEN-2010', 'Ben Kitchener',      true),
  ('TEN-2010', 'Mia Kitchener',      false),
  ('TEN-2011', 'Rangi Toitoi',       true),
  ('TEN-2012', 'Fiona Blackwood',    true),
  ('TEN-2012', 'Alistair Blackwood', false),
  ('TEN-2013', 'Holly Redmond',      true),
  ('TEN-2013', 'Isaac Redmond',      false),
  ('TEN-2014', 'Sione Latu',         true),
  ('TEN-2014', 'Maree Latu',         false),
  ('TEN-2015', 'Chelsea Barrow',     true),
  ('TEN-2016', 'Josh Meldrum',       true),
  ('TEN-2017', 'Kiri Manaia',        true),
  ('TEN-2018', 'Dan Fowler',         true),
  ('TEN-2018', 'Steph Fowler',       false),
  ('TEN-2019', 'Omar Haddad',        true),
  ('TEN-2020', 'Ruby Sinclair',      true),
  ('TEN-2021', 'Cameron Ellery',     true),
  ('TEN-2022', 'Anahera Rewi',       true),
  ('TEN-2023', 'Blake Corrigan',     true),
  ('TEN-2023', 'Jess Corrigan',      false),
  ('TEN-2024', 'Peter Aiono',        true),
  ('TEN-2025', 'Lucy Tremain',       true),
  ('TEN-1990', 'Harry Ngawaka',      true),
  ('TEN-1990', 'Simone Vukona',      false),
  ('TEN-1975', 'Gareth Pinny',       true),
  ('TEN-1975', 'Denise Pinny',       false)
) as v(ref, tenant, primary_)
on conflict do nothing;

-- The rent schedule ------------------------------------------------------------
-- Every tenancy starts on a rent. Increases carry the notice date, because the
-- Act cares about the gap between the notice and the day it takes effect.

insert into rent_schedule (id, tenancy_id, amount_cents, period, effective_on, reason, notice_served_on, note)
select seed_uuid('rent:start:' || t.tenancy_ref), t.id,
       case when t.last_increase_on is null then t.rent_cents else t.rent_cents - (case when t.rent_period = 'fortnightly' then 8000 else 4000 end) end,
       t.rent_period, t.start_on, 'new tenancy', null, 'Rent at the start of the tenancy'
from tenancies t
on conflict do nothing;

insert into rent_schedule (id, tenancy_id, amount_cents, period, effective_on, reason, notice_served_on, note)
select seed_uuid('rent:increase:' || t.tenancy_ref), t.id, t.rent_cents, t.rent_period, t.last_increase_on,
       'rent review', t.last_increase_on - v.notice_days, v.note
from tenancies t
join (values
  ('TEN-2001', 63, 'Market review, agreed on the phone first'),
  ('TEN-2002', 63, ''),
  ('TEN-2003', 65, ''),
  ('TEN-2005', 62, ''),
  ('TEN-2007', 32, 'Notice went out late, the tenant did not query it'),
  ('TEN-2009', 70, ''),
  ('TEN-2010', 61, ''),
  ('TEN-2012', 64, ''),
  ('TEN-2013', 63, ''),
  ('TEN-2015', 66, ''),
  ('TEN-2017', 62, ''),
  ('TEN-2019', 63, ''),
  ('TEN-2020', 68, ''),
  ('TEN-2022', 61, ''),
  ('TEN-2023', 62, ''),
  ('TEN-2025', 64, ''),
  ('TEN-1990', 63, '')
) as v(ref, notice_days, note) on v.ref = t.tenancy_ref
where t.last_increase_on is not null
on conflict do nothing;

-- Whitby has had two increases inside twelve months. That is the breach the
-- compliance check finds (RTA 1986 s 24(1A)).
insert into rent_schedule (id, tenancy_id, amount_cents, period, effective_on, reason, notice_served_on, note)
select seed_uuid('rent:extra:TEN-2022'), t.id, t.rent_cents - 3500, t.rent_period, current_date - 520,
       'rent review', current_date - 583, 'The first of two increases inside a year'
from tenancies t where t.tenancy_ref = 'TEN-2022'
on conflict do nothing;

-- The rent ledger ---------------------------------------------------------------
-- Twenty six periods of charges for every running tenancy, and the receipts
-- against them. A RECORD of what was charged and what came in. The money itself
-- sits in the trust account, in the system that already holds it.

insert into rent_ledger (id, tenancy_id, entry_on, kind, amount_cents, method, reference, note)
select seed_uuid('charge:' || t.tenancy_ref || ':' || g), t.id,
       current_date - (g * (case when t.rent_period = 'fortnightly' then 14 else 7 end)),
       'charge', t.rent_cents, null, t.tenancy_ref, 'Rent for the period'
from tenancies t
cross join generate_series(0, 25) as g
where t.status in ('active', 'notice given')
  and current_date - (g * (case when t.rent_period = 'fortnightly' then 14 else 7 end)) >= t.start_on
on conflict do nothing;

insert into rent_ledger (id, tenancy_id, entry_on, kind, amount_cents, method, reference, note)
select seed_uuid('payment:' || t.tenancy_ref || ':' || g), t.id,
       current_date - (g * (case when t.rent_period = 'fortnightly' then 14 else 7 end)),
       'payment', t.rent_cents, 'automatic payment', t.tenancy_ref, 'Rent received'
from tenancies t
join (values
  ('TEN-2001', 0), ('TEN-2002', 0), ('TEN-2003', 0), ('TEN-2004', 0), ('TEN-2005', 0),
  ('TEN-2006', 0), ('TEN-2007', 4), ('TEN-2008', 0), ('TEN-2009', 0), ('TEN-2010', 0),
  ('TEN-2011', 0), ('TEN-2012', 0), ('TEN-2013', 2), ('TEN-2014', 0), ('TEN-2015', 0),
  ('TEN-2016', 0), ('TEN-2017', 0), ('TEN-2018', 0), ('TEN-2019', 1), ('TEN-2020', 0),
  ('TEN-2021', 0), ('TEN-2022', 0), ('TEN-2023', 0), ('TEN-2024', 0), ('TEN-2025', 0)
) as v(ref, unpaid) on v.ref = t.tenancy_ref
cross join generate_series(0, 25) as g
where t.status in ('active', 'notice given')
  and g >= v.unpaid
  and current_date - (g * (case when t.rent_period = 'fortnightly' then 14 else 7 end)) >= t.start_on
on conflict do nothing;

-- Stokes Valley had a water rates recharge in August that nobody chased.
insert into rent_ledger (id, tenancy_id, entry_on, kind, amount_cents, method, reference, note)
select seed_uuid('charge:water:TEN-2004'), t.id, current_date - 26, 'charge', 14750, null, 'WATER-AUG',
       'Water rates recharged to the tenant, invoice from Wellington Water'
from tenancies t where t.tenancy_ref = 'TEN-2004'
on conflict do nothing;

-- Arrears ------------------------------------------------------------------------

insert into arrears_events (id, tenancy_id, noted_on, action, days_behind, amount_cents, manager_id, note)
select seed_uuid('arr:' || v.ref || ':' || v.action || ':' || v.days_ago), seed_uuid('tenancy:' || v.ref),
       current_date - v.days_ago, v.action, v.behind, v.amount, seed_uuid('manager:' || v.manager), v.note
from (values
  ('TEN-2007', 26, 'noted',                      5,  44000, 'Ana Whitiora', 'Rent missed on Monday, no contact from the tenant'),
  ('TEN-2007', 24, 'notice of overdue rent',     7,  44000, 'Ana Whitiora', 'First notice of overdue rent served by email and text'),
  ('TEN-2007', 16, 'notice of overdue rent',    15,  88000, 'Ana Whitiora', 'Second notice. Tenant answered and said work has dried up'),
  ('TEN-2007', 16, '14 day notice to remedy',   15,  88000, 'Ana Whitiora', '14 day notice to remedy served, expired two days ago'),
  ('TEN-2013', 12, 'noted',                      6,  56000, 'Mere Tipene',  'Payment did not come through on the Wednesday'),
  ('TEN-2013', 10, 'notice of overdue rent',     8,  56000, 'Mere Tipene',  'Notice of overdue rent served. Tenant says hours were cut'),
  ('TEN-2013',  9, 'payment plan',               9,  56000, 'Mere Tipene',  'Offered $80 a week on top of the rent. Owner has not been asked yet')
) as v(ref, days_ago, action, behind, amount, manager, note)
on conflict do nothing;

-- Bonds ---------------------------------------------------------------------------
-- Received from the tenant, lodged with Tenancy Services. The Act gives 23
-- working days (RTA 1986 s 19).

insert into bonds (id, tenancy_id, amount_cents, received_on, lodged_on, bond_number, status, note)
select seed_uuid('bond:' || t.tenancy_ref), t.id, t.bond_cents, t.start_on - 2,
       case when t.tenancy_ref = 'TEN-2011' then null else t.start_on + 12 end,
       case when t.tenancy_ref = 'TEN-2011' then null else 'BN' || substr(md5(t.tenancy_ref), 1, 8) end,
       case when t.tenancy_ref = 'TEN-2011' then 'not lodged'
            when t.status = 'ended' then 'refunded'
            else 'held' end,
       case when t.tenancy_ref = 'TEN-2011' then 'Sat in the drawer while the manager was on leave'
            when t.tenancy_ref = 'TEN-2018' then 'Five weeks was taken at signing'
            else '' end
from tenancies t
where t.bond_cents > 0
on conflict do nothing;

update bonds set refunded_on = current_date - 10, refund_to_tenant_cents = amount_cents
where tenancy_id = (select id from tenancies where tenancy_ref = 'TEN-1990') and refunded_on is null;

-- Contractors ----------------------------------------------------------------------

insert into contractors (id, name, trade, contact_name, email, phone, licence_ref, licence_type, insurance_expires_on, preferred, active, notes)
select seed_uuid('contractor:' || v.name), v.name, v.trade, v.contact, v.email, v.phone, v.licence, v.ltype,
       current_date + v.ins_days, v.preferred, true, v.notes
from (values
  ('Hutt Valley Plumbing Ltd',  'plumbing',   'Dave Kearns',    'dave@example.com',    '04 555 0701', 'PGDB 118422', 'Plumbers, Gasfitters and Drainlayers Board', 180, true,  'Same day for anything without hot water.'),
  ('Sparks Electrical',         'electrical', 'Wiremu Tane',    'wiremu@example.com',  '04 555 0702', 'EWRB 91230',  'Electrical Workers Registration Board',      95,  true,  'Does the annual smoke alarm checks as well.'),
  ('Capital Roofing Co',        'roofing',    'Nathan Pell',    'nathan@example.com',  '04 555 0703', '',            '',                                          -20, false, 'Public liability certificate has expired, chase it.'),
  ('Southern Cross Builders',   'building',   'Tama Rewa',      'tama@example.com',    '04 555 0704', 'LBP 104882',  'Licensed Building Practitioner',            240, true,  'Decks, fences, general carpentry.'),
  ('Whiteware Doctor',          'appliance',  'Glen Petersen',  'glen@example.com',    '04 555 0705', '',            '',                                          120, true,  'Ovens, ranges, dishwashers.'),
  ('Kapiti Grounds Care',       'grounds',    'Sina Fifita',    'sina@example.com',    '04 555 0706', '',            '',                                          300, false, 'Hedges and lawns on the Porirua run.'),
  ('Lockwise Wellington',       'locks',      'Andrew Pole',    'andrew@example.com',  '04 555 0707', '',            '',                                          150, true,  'Twenty four hour callout.'),
  ('Kill and Cure Pest',        'pest',       'Rae Southgate',  'rae@example.com',     '04 555 0708', '',            '',                                          210, false, 'Wasps, rats, borer.')
) as v(name, trade, contact, email, phone, licence, ltype, ins_days, preferred, notes)
on conflict do nothing;

-- Maintenance ------------------------------------------------------------------------

insert into maintenance_requests (id, job_ref, property_id, tenancy_id, reported_on, reported_by, category, priority,
                                  summary, detail, status, habitability, owner_approval_required, owner_asked_on,
                                  owner_approved_on, approval_limit_cents, completed_on, closed_on, manager_id, note)
select seed_uuid('mnt:' || v.ref), v.ref, seed_uuid('property:' || v.property),
       (select t.id from tenancies t where t.property_id = seed_uuid('property:' || v.property) and t.status in ('active', 'notice given') limit 1),
       current_date - v.reported_days, v.by, v.category, v.priority, v.summary, v.detail, v.status, v.hab, v.approval,
       case when v.asked_days is null then null else current_date - v.asked_days end,
       case when v.approved_days is null then null else current_date - v.approved_days end,
       v.limit_cents,
       case when v.completed_days is null then null else current_date - v.completed_days end,
       case when v.completed_days is null then null else current_date - v.completed_days end,
       seed_uuid('manager:' || v.manager), v.note
from (values
  ('MNT-3001', 'PR-1001', 12, 'tenant',     'plumbing',   'normal', 'Kitchen mixer dripping and the washer has gone',                'Constant drip into the sink, the tenant has a towel under it.',                     'completed',               false, true,   11,   10,  40000,    4, 'Josh Callaghan', ''),
  ('MNT-3002', 'PR-1004', 21, 'tenant',     'electrical', 'high',   'Hallway smoke alarm chirping and the light flickers',           'Alarm chirps every two minutes. Electrician found a loose neutral as well.',         'completed',               false, true,   20,   19,  60000,   12, 'Josh Callaghan', 'Alarm replaced, ten year photoelectric.'),
  ('MNT-3003', 'PR-1006',  6, 'tenant',     'heating',    'urgent', 'No hot water, the cylinder has failed',                         'Element and thermostat gone. Two adults in the flat with no hot water since Tuesday.','in progress',             true,  false, null, null, 250000, null, 'Josh Callaghan', 'Owner has standing approval to $800 for anything urgent.'),
  ('MNT-3004', 'PR-1008', 14, 'inspection', 'general',    'normal', 'Deck boards lifting at the back door, trip hazard',             'Three boards have cupped and the fixings have pulled. Quoted $1,240.',              'awaiting owner approval', false, true,   12, null, 124000, null, 'Josh Callaghan', ''),
  ('MNT-3005', 'PR-1010', 26, 'tenant',     'roofing',    'high',   'Water staining on the ceiling in the back bedroom',             'Appears after heavy rain. Roofer says two cracked tiles and a flashing. $980.',      'awaiting owner approval', false, true,   21, null,  98000, null, 'Josh Callaghan', 'Second reminder sent to the owner last Tuesday.'),
  ('MNT-3006', 'PR-1013',  9, 'tenant',     'appliance',  'normal', 'Oven element not heating',                                      'Bottom element dead, top grill fine.',                                              'approved',                false, true,    8,    6,  35000, null, 'Josh Callaghan', 'Approved and then nothing has happened.'),
  ('MNT-3007', 'PR-1015', 40, 'tenant',     'plumbing',   'normal', 'Toilet cistern running constantly',                             'Inlet valve replaced.',                                                             'completed',               false, true,   39,   38,  28000,   30, 'Josh Callaghan', ''),
  ('MNT-3008', 'PR-1017',  4, 'tenant',     'locks',      'high',   'Front door lock sticking, tenant was locked out on Sunday',     'Barrel is worn. Replacing the cylinder and cutting three keys.',                    'scheduled',               false, false, null, null,  32000, null, 'Josh Callaghan', ''),
  ('MNT-3009', 'PR-1019', 18, 'owner',      'grounds',    'low',    'Hedge along the driveway needs cutting back',                   'Owner asked for it before the tenants complain about the car doors.',                'scheduled',               false, true,   18,   17,  45000, null, 'Josh Callaghan', ''),
  ('MNT-3010', 'PR-1020', 55, 'tenant',     'general',    'normal', 'Fence panel down between 62 and 64',                            'Two palings and a rail. Neighbour paid half.',                                      'completed',               false, true,   54,   53,  38000,   46, 'Josh Callaghan', ''),
  ('MNT-3011', 'PR-1023',  3, 'tenant',     'pest',       'normal', 'Wasp nest under the eaves by the front door',                   'Tenant has small children, wants it gone this week.',                               'new',                     false, true, null, null,      0, null, 'Josh Callaghan', ''),
  ('MNT-3012', 'PR-1025', 33, 'inspection', 'general',    'normal', 'Bathroom extractor fan not venting outside',                    'Ducted into the ceiling space, which is why the ceiling is staining.',              'in progress',             false, true,   30,   28,  72000, null, 'Josh Callaghan', 'This is also the healthy homes ventilation item.'),
  ('MNT-3013', 'PR-1002', 70, 'tenant',     'appliance',  'low',    'Rangehood filter clogged and the fan is noisy',                 'Filter replaced and the motor cleaned.',                                            'completed',               false, true,   69,   68,  14000,   62, 'Josh Callaghan', ''),
  ('MNT-3014', 'PR-1012', 11, 'tenant',     'plumbing',   'high',   'Shower mixer leaking into the wall cavity',                     'Wall is damp on the far side. Needs the mixer out and the lining opened up.',        'in progress',             false, true,   10,    9, 140000, null, 'Josh Callaghan', ''),
  ('MNT-3015', 'PR-1005',  2, 'tenant',     'electrical', 'urgent', 'No power to half the house, tenant is running extension leads', 'One circuit dead at the board. Electrician booked for today.',                       'in progress',             true,  false, null, null,  80000, null, 'Josh Callaghan', ''),
  ('MNT-3016', 'PR-1024', 90, 'tenant',     'general',    'low',    'Gate latch broken',                                             'New latch fitted.',                                                                 'completed',               false, true,   89,   88,   9000,   84, 'Josh Callaghan', ''),
  ('MNT-3017', 'PR-1003', 30, 'tenant',     'heating',    'normal', 'Heat pump not reaching temperature',                            'Filters cleaned, still short. Technician thinks it is low on gas. $420 to regas.',   'awaiting owner approval', false, true,    5, null,  42000, null, 'Josh Callaghan', ''),
  ('MNT-3018', 'PR-1011', 45, 'owner',      'general',    'low',    'Repaint the front porch before winter',                         'Owner asked, then decided to wait until the tenancy turns over.',                   'declined',                false, true,   44, null, 180000, null, 'Josh Callaghan', 'Owner declined for now.')
) as v(ref, property, reported_days, by, category, priority, summary, detail, status, hab, approval, asked_days, approved_days, limit_cents, completed_days, manager, note)
on conflict do nothing;

insert into contractor_jobs (id, job_no, maintenance_id, contractor_id, issued_on, scheduled_on, completed_on,
                             quoted_cents, invoiced_cents, invoiced_on, invoice_ref, status, note)
select seed_uuid('job:' || v.job_no), v.job_no, seed_uuid('mnt:' || v.mnt), seed_uuid('contractor:' || v.contractor),
       current_date - v.issued_days,
       case when v.scheduled_days is null then null else current_date - v.scheduled_days end,
       case when v.completed_days is null then null else current_date - v.completed_days end,
       v.quoted,
       case when v.invoiced_days is null then 0 else v.invoiced end,
       case when v.invoiced_days is null then null else current_date - v.invoiced_days end,
       case when v.invoiced_days is null then null else 'INV-' || substr(md5(v.job_no), 1, 6) end,
       v.status, v.note
from (values
  ('JOB-4001', 'MNT-3001', 'Hutt Valley Plumbing Ltd', 10,    6,    4,  40000,  38500,    2, 'invoiced', ''),
  ('JOB-4002', 'MNT-3002', 'Sparks Electrical',        19,   14,   12,  60000,  62400,    9, 'invoiced', 'Alarm plus the loose neutral.'),
  ('JOB-4003', 'MNT-3003', 'Hutt Valley Plumbing Ltd',  5,   -1, null, 250000,      0, null, 'scheduled','New cylinder on order, fitting tomorrow.'),
  ('JOB-4004', 'MNT-3007', 'Hutt Valley Plumbing Ltd', 38,   32,   30,  28000,      0, null, 'done',     'Work finished and no invoice has ever arrived.'),
  ('JOB-4005', 'MNT-3008', 'Lockwise Wellington',       3,   -2, null,  32000,      0, null, 'scheduled',''),
  ('JOB-4006', 'MNT-3009', 'Kapiti Grounds Care',      17,   -5, null,  45000,      0, null, 'accepted', ''),
  ('JOB-4007', 'MNT-3010', 'Southern Cross Builders',  53,   48,   46,  38000,  39100,   40, 'invoiced', ''),
  ('JOB-4008', 'MNT-3012', 'Sparks Electrical',        28,   -3, null,  72000,      0, null, 'scheduled','Ducting the fan through the soffit.'),
  ('JOB-4009', 'MNT-3013', 'Whiteware Doctor',         68,   64,   62,  14000,  14000,   58, 'invoiced', ''),
  ('JOB-4010', 'MNT-3014', 'Hutt Valley Plumbing Ltd',  9,    2, null, 140000,      0, null, 'accepted', 'Lining out on Thursday.'),
  ('JOB-4011', 'MNT-3015', 'Sparks Electrical',         2,    0, null,  80000,      0, null, 'scheduled','On site this afternoon.'),
  ('JOB-4012', 'MNT-3016', 'Southern Cross Builders',  88,   85,   84,   9000,   9200,   80, 'invoiced', '')
) as v(job_no, mnt, contractor, issued_days, scheduled_days, completed_days, quoted, invoiced, invoiced_days, status, note)
on conflict do nothing;

-- Inspections --------------------------------------------------------------------------
-- Completed routine inspections on the three month cycle, oldest first, with the
-- last one on each property offset so some properties are well past due.

insert into inspections (id, property_id, tenancy_id, kind, scheduled_on, notice_served_on, completed_on,
                         manager_id, overall, summary, report_sent_on, next_due_on)
select seed_uuid('insp:' || v.ref || ':' || g), p.id,
       (select t.id from tenancies t where t.property_id = p.id and t.status in ('active', 'notice given') limit 1),
       'routine',
       current_date - (v.last_days + g * 91), current_date - (v.last_days + g * 91) - 5, current_date - (v.last_days + g * 91),
       p.manager_id,
       case when g = 0 then v.overall else 'good' end,
       case when g = 0 then v.summary else 'Presented well, nothing outstanding.' end,
       case when g = 0 and not v.sent then null else current_date - (v.last_days + g * 91) + 2 end,
       current_date - (v.last_days + g * 91) + 91
from (values
  ('PR-1001',  35, 2, 'good', 'Tidy. Garden a bit long, tenant said they would get to it.',                        true),
  ('PR-1002',  60, 2, 'good', 'No issues. Rangehood filter had been replaced.',                                    true),
  ('PR-1003',  48, 2, 'fair', 'Heat pump was struggling, logged as maintenance.',                                  true),
  ('PR-1004',  25, 2, 'good', 'Very well kept.',                                                                   true),
  ('PR-1005',  70, 2, 'fair', 'Mould starting in the bathroom corner, tenant advised on ventilation.',             true),
  ('PR-1006',  55, 1, 'good', 'New tenancy, first inspection went fine.',                                          true),
  ('PR-1007', 210, 2, 'poor', 'Cold and damp. Single small heat pump in the lounge, condensation on every window.', true),
  ('PR-1008',  30, 2, 'fair', 'Deck boards lifting at the back door, raised with the owner.',                       true),
  ('PR-1010',  20, 2, 'fair', 'Ceiling stain in the back bedroom, roofer quoted.',                                 false),
  ('PR-1011',  62, 2, 'good', 'Fine. Porch paint is tired but not urgent.',                                        true),
  ('PR-1012',  40, 2, 'fair', 'Damp patch on the wall behind the shower, plumber called.',                         true),
  ('PR-1013',  78, 2, 'good', 'Clean and tidy. Oven element failed the week after.',                               true),
  ('PR-1014', 190, 2, 'fair', 'Bathroom fan vents into the ceiling space. Nothing done since.',                    true),
  ('PR-1015',  44, 2, 'good', 'No issues.',                                                                        true),
  ('PR-1016',  50, 2, 'good', 'Presented well, owner is selling.',                                                 true),
  ('PR-1017',  33, 2, 'good', 'Front door lock sticking, noted.',                                                  true),
  ('PR-1018', 140, 3, 'fair', 'Long standing tenant, the flat is tired but sound.',                               true),
  ('PR-1020',  58, 2, 'good', 'Fence repaired since the last visit.',                                              true),
  ('PR-1021', 150, 3, 'poor', 'Musty under the front rooms. No ground moisture barrier.',                          true),
  ('PR-1022',  36, 2, 'good', 'Tenant is moving out, place is in good order.',                                     true),
  ('PR-1023',  22, 2, 'good', 'Excellent condition.',                                                              true),
  ('PR-1024',  67, 2, 'fair', 'Lean-to is cold, no ceiling access to insulate.',                                   true),
  ('PR-1025',  41, 2, 'fair', 'Bathroom ceiling staining from the extractor fan.',                                 true),
  ('PR-1027',  53, 2, 'good', 'Nothing outstanding.',                                                              true)
) as v(ref, last_days, n, overall, summary, sent)
join properties p on p.ref = v.ref
cross join generate_series(0, 2) as g
where g < v.n
  and current_date - (v.last_days + g * 91) >= (select t.start_on from tenancies t where t.property_id = p.id and t.status in ('active', 'notice given') limit 1)
on conflict do nothing;

-- Inspections booked but not done yet.
insert into inspections (id, property_id, tenancy_id, kind, scheduled_on, notice_served_on, manager_id, next_due_on)
select seed_uuid('insp:booked:' || v.ref), p.id,
       (select t.id from tenancies t where t.property_id = p.id and t.status in ('active', 'notice given') limit 1),
       v.kind, current_date + v.in_days,
       case when v.notice_days_ago is null then null else current_date - v.notice_days_ago end,
       p.manager_id, current_date + v.in_days + 91
from (values
  ('PR-1013', 'routine', 1,  0),
  ('PR-1005', 'routine', 9,  2),
  ('PR-1016', 'exit',   44, 12),
  ('PR-1007', 'healthy homes', 6, 3)
) as v(ref, kind, in_days, notice_days_ago)
join properties p on p.ref = v.ref
on conflict do nothing;

insert into inspection_items (id, inspection_id, area, condition, note, action_required)
select seed_uuid('ii:' || v.property || ':' || v.area), seed_uuid('insp:' || v.property || ':0'),
       v.area, v.cond, v.note, v.action
from (values
  ('PR-1007', 'Lounge',       'poor',            'Condensation on the windows every morning. One 2.4 kW heat pump for the whole flat.', true),
  ('PR-1007', 'Bedroom',      'poor',            'Mould on the south wall behind the bed. No extract, no fixed heater.',                true),
  ('PR-1007', 'Bathroom',     'fair',            'Extractor works but the tenant says it is loud so they do not run it.',               false),
  ('PR-1007', 'Kitchen',      'good',            'Clean, rangehood vents outside.',                                                     false),
  ('PR-1007', 'Exterior',     'fair',            'Gutter over the front door is blocked with leaves.',                                  true),
  ('PR-1021', 'Subfloor',     'poor',            'Musty smell, bare earth under the front rooms, no moisture barrier.',                 true),
  ('PR-1021', 'Lounge',       'fair',            'Carpet is cold underfoot. Heat pump works.',                                          false),
  ('PR-1021', 'Bathroom',     'good',            'Fan vents outside, no mould.',                                                        false),
  ('PR-1021', 'Kitchen',      'good',            'Nothing outstanding.',                                                                false),
  ('PR-1014', 'Bathroom',     'action required', 'Extractor discharges into the ceiling space. Ceiling is staining above the shower.',   true),
  ('PR-1014', 'Lounge',       'good',            'Tidy.',                                                                               false),
  ('PR-1014', 'Bedroom',      'good',            'No issues.',                                                                          false),
  ('PR-1010', 'Bedroom',      'action required', 'Water stain on the ceiling in the back bedroom, roughly 400mm across.',                true),
  ('PR-1010', 'Roof exterior', 'fair',           'Two cracked tiles visible from the ground on the north side.',                        true),
  ('PR-1010', 'Kitchen',      'good',            'Well kept.',                                                                          false),
  ('PR-1008', 'Deck',         'action required', 'Three boards cupped and the fixings have pulled. Trip hazard at the back door.',       true),
  ('PR-1008', 'Lounge',       'good',            'Nothing outstanding.',                                                                false),
  ('PR-1025', 'Bathroom',     'action required', 'Ceiling staining above the shower, extractor is not ducted outside.',                  true),
  ('PR-1025', 'Garage',       'good',            'Dry and tidy.',                                                                       false),
  ('PR-1024', 'Lean-to',      'fair',            'Cold room, no ceiling access to insulate. Exemption recorded.',                       false)
) as v(property, area, cond, note, action)
on conflict do nothing;

-- Notices -----------------------------------------------------------------------------

insert into notices (id, tenancy_id, property_id, kind, served_on, method, effective_on, detail, served_by)
select seed_uuid('notice:' || v.ref || ':' || v.kind || ':' || v.served_days), seed_uuid('tenancy:' || v.ref),
       (select t.property_id from tenancies t where t.tenancy_ref = v.ref),
       v.kind, current_date - v.served_days, v.method,
       case when v.effective_days is null then null else current_date - v.effective_days end,
       v.detail, seed_uuid('manager:' || v.manager)
from (values
  ('TEN-2007', 'notice of overdue rent',   24, 'email', null, 'Rent overdue five working days. First of three under s 55AA.',                      'Ana Whitiora'),
  ('TEN-2007', 'notice of overdue rent',   16, 'email', null, 'Second notice of overdue rent.',                                                    'Ana Whitiora'),
  ('TEN-2007', '14 day notice to remedy',  16, 'post',     2, '14 day notice to remedy rent arrears of $880. Expired two days ago.',               'Ana Whitiora'),
  ('TEN-2013', 'notice of overdue rent',   10, 'email', null, 'Rent overdue. Tenant rang back the same day.',                                      'Mere Tipene'),
  ('TEN-2015', 'termination 90 day',       45, 'post',   -45, 'Owner is selling with vacant possession. 90 days notice under RTA 1986 s 51(1).',   'Ana Whitiora'),
  ('TEN-2021', 'tenant notice 21 day',      6, 'email',  -15, 'Tenant is moving to Christchurch. 21 days notice under RTA 1986 s 51(3).',          'Mere Tipene'),
  ('TEN-2018', 'breach notice',            30, 'email', null, 'Dog at the property with no pet clause in the agreement. Tenant has rehomed it.',   'Ana Whitiora'),
  ('TEN-2013', 'entry notice',              4, 'email',   -3, 'Entry notice for the routine inspection.',                                          'Mere Tipene'),
  ('TEN-2005', 'entry notice',              2, 'email',   -9, 'Entry notice for the routine inspection.',                                          'Mere Tipene'),
  ('TEN-1990', 'termination 42 day',       60, 'post',    25, 'Owner moving a family member in. Served with 35 days, which is short.',             'Mere Tipene')
) as v(ref, kind, served_days, method, effective_days, detail, manager)
on conflict do nothing;

-- Rent increase notices mirror the rent schedule.
insert into notices (id, tenancy_id, property_id, kind, served_on, method, effective_on, detail, served_by)
select seed_uuid('notice:increase:' || t.tenancy_ref), t.id, t.property_id, 'rent increase',
       rs.notice_served_on, 'email', rs.effective_on,
       'Rent increased to ' || to_char(rs.amount_cents / 100.0, 'FM$999,990') || ' ' || rs.period ||
       ', ' || (rs.effective_on - rs.notice_served_on) || ' days notice given.',
       t.manager_id
from tenancies t
join rent_schedule rs on rs.tenancy_id = t.id and rs.reason = 'rent review' and rs.notice_served_on is not null
where rs.effective_on = t.last_increase_on
on conflict do nothing;

-- Compliance items ------------------------------------------------------------------------
-- Every property carries the same rule set. The exceptions are the ones that
-- have not been closed out.

insert into compliance_items (id, property_id, kind, standard, status, assessed_on, due_on, done_on, evidence_ref, note)
select seed_uuid('ci:' || p.ref || ':' || k.kind), p.id, k.kind, k.standard,
       coalesce(x.status, 'compliant'),
       current_date - coalesce(x.assessed_days, k.assessed_days),
       case when k.kind like 'healthy homes%' then date '2025-07-01'
            else current_date - coalesce(x.assessed_days, k.assessed_days) + k.cycle_days end,
       case when coalesce(x.status, 'compliant') = 'compliant'
            then current_date - coalesce(x.assessed_days, k.assessed_days) else null end,
       case when coalesce(x.status, 'compliant') = 'compliant' then 'HH-' || substr(md5(p.ref || k.kind), 1, 6) else '' end,
       coalesce(x.note, k.note)
from properties p
cross join (values
  ('healthy homes heating',              'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 8 to 12',   400, 1825, 'Heating capacity calculated for the main living room.'),
  ('healthy homes insulation',           'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 13 to 18',  400, 1825, 'Ceiling and underfloor insulation to the 2008 standard.'),
  ('healthy homes ventilation',          'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 19 to 22',  400, 1825, 'Extract in the kitchen and bathroom, openable windows in every room.'),
  ('healthy homes moisture and drainage','Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 23 to 26',  400, 1825, 'Guttering, downpipes, drains and a ground moisture barrier where there is a subfloor.'),
  ('healthy homes draught stopping',     'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 27 to 29',  400, 1825, 'Gaps and holes stopped, unused chimneys blocked.'),
  ('smoke alarms',                       'Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, regs 5 to 10', 120,  365, 'Photoelectric long life alarms within 3 metres of every bedroom door, one per level.'),
  ('insulation statement',               'Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, reg 21',       700,  3650, 'Signed insulation statement in the tenancy agreement.')
) as k(kind, standard, assessed_days, cycle_days, note)
left join (values
  ('PR-1007', 'healthy homes heating',               'not compliant', 400, 'Living room heat pump is 2.4 kW. The calculation needs 4.6 kW. Owner has been quoted twice.'),
  ('PR-1007', 'healthy homes draught stopping',      'not compliant', 400, 'Unused chimney in the lounge is open and the sash windows do not seal.'),
  ('PR-1014', 'healthy homes ventilation',           'not compliant', 190, 'Bathroom extractor discharges into the ceiling space, not outside.'),
  ('PR-1021', 'healthy homes moisture and drainage', 'not compliant', 150, 'No ground moisture barrier under the front half of the house.'),
  ('PR-1024', 'healthy homes insulation',            'exempt',        420, 'Lean-to has no ceiling access. Exemption recorded under reg 16 with photographs.'),
  ('PR-1003', 'smoke alarms',                        'not compliant',  95, 'One alarm missing from the hallway outside the back bedroom.'),
  ('PR-1013', 'smoke alarms',                        'compliant',     400, 'Checked at the inspection last year and not since.'),
  ('PR-1021', 'smoke alarms',                        'compliant',     395, 'Overdue for the annual check.'),
  ('PR-1007', 'insulation statement',                'not compliant', 700, 'No signed insulation statement in the agreement for this tenancy.')
) as x(ref, kind, status, assessed_days, note) on x.ref = p.ref and x.kind = k.kind
on conflict do nothing;

-- Tasks -------------------------------------------------------------------------------------

insert into tasks (id, title, kind, due_on, status, done_on, property_id, tenancy_id, owner_id, manager_id, note)
select seed_uuid('task:' || v.title), v.title, v.kind, current_date + v.due_days, v.status,
       case when v.status = 'done' then current_date + v.due_days else null end,
       case when v.property is null then null else seed_uuid('property:' || v.property) end,
       case when v.tenancy is null then null else seed_uuid('tenancy:' || v.tenancy) end,
       case when v.owner is null then null else seed_uuid('owner:' || v.owner) end,
       seed_uuid('manager:' || v.manager), v.note
from (values
  ('Lodge the Broderick Road bond with Tenancy Services',       'compliance',  -18, 'open', 'PR-1012', 'TEN-2011', null,                       'Mere Tipene',  'Six weeks since it was taken.'),
  ('Apply to the Tenancy Tribunal for Coromandel Street',       'arrears',      -2, 'open', 'PR-1007', 'TEN-2007', null,                       'Ana Whitiora', 'The 14 day notice expired.'),
  ('Ring the Lawsons about the deck quote',                     'maintenance',  -4, 'open', 'PR-1008', null,       'Craig and Deb Lawson',     'Josh Callaghan', 'Second attempt.'),
  ('Chase Capital Roofing for their liability certificate',     'compliance',   -9, 'open', null,      null,       null,                       'Josh Callaghan', 'Expired three weeks ago.'),
  ('Book the exit inspection for Titahi Bay Road',              'inspection',    3, 'open', 'PR-1022', 'TEN-2021', null,                       'Mere Tipene',  'Tenant is out in a fortnight.'),
  ('Serve the rent increase notice for Bracken Street',         'rent review',   5, 'open', 'PR-1001', 'TEN-2001', null,                       'Ana Whitiora', 'Market is $700, they are on $680.'),
  ('Send the Whitmore Trust the sale marketing schedule',       'owner',         7, 'open', 'PR-1016', 'TEN-2015', 'Whitmore Trust',           'Ana Whitiora', ''),
  ('Get the healthy homes heating quote to Harbour Rise',       'compliance',    2, 'open', 'PR-1007', null,       'Harbour Rise Holdings Ltd','Ana Whitiora', 'Third time of asking.'),
  ('Follow up the Nikau hedge job',                             'maintenance',   4, 'open', 'PR-1019', null,       'Nikau Investments Ltd',    'Josh Callaghan', ''),
  ('Confirm the Rata Grove fixed term renewal',                 'renewal',       6, 'open', 'PR-1004', 'TEN-2004', 'Ellis Family Trust',       'Mere Tipene',  'Ends in under a month.'),
  ('Send the August statements',                                'owner',       -12, 'done', null,      null,       null,                       'Daniel Souter','')
) as v(title, kind, due_days, status, property, tenancy, owner, manager, note)
on conflict do nothing;

-- The contact log ----------------------------------------------------------------------------

insert into contact_notes (id, happened_on, kind, who, body, property_id, tenancy_id, owner_id, manager_id)
select seed_uuid('note:' || v.key), current_date - v.days_ago, v.kind, v.who, v.body,
       case when v.property is null then null else seed_uuid('property:' || v.property) end,
       case when v.tenancy is null then null else seed_uuid('tenancy:' || v.tenancy) end,
       case when v.owner is null then null else seed_uuid('owner:' || v.owner) end,
       seed_uuid('manager:' || v.manager)
from (values
  ('n01',  2, 'call',  'Marcus Vaeau',         'Rang about the arrears. Says work has dried up, offered $200 next Friday. Told him the 14 day notice has expired and the next step is the Tribunal.', 'PR-1007', 'TEN-2007', null, 'Ana Whitiora'),
  ('n02',  9, 'email', 'Holly Redmond',        'Hours cut at Trade Me. Offered $80 a week on top until she is square. Waiting on the owner to agree.',                                               'PR-1014', 'TEN-2013', null, 'Mere Tipene'),
  ('n03',  1, 'call',  'Nikau Paine',          'No hot water since Tuesday. Plumber booked, cylinder arrives tomorrow. Told him to use the shower at his sister''s tonight.',                        'PR-1006', 'TEN-2006', null, 'Josh Callaghan'),
  ('n04',  3, 'email', 'Rangi Wharekura',      'Sent the roofing quote for Karori Road. No answer yet.',                                                                                            'PR-1010', null, 'Rangi and Tui Wharekura', 'Ana Whitiora'),
  ('n05', 12, 'call',  'Craig Lawson',         'Talked through the deck quote. Wants a second price before he decides.',                                                                            'PR-1008', null, 'Craig and Deb Lawson', 'Josh Callaghan'),
  ('n06',  6, 'email', 'Cameron Ellery',       'Gave 21 days notice, moving to Christchurch for work. Confirmed the last day and the exit process.',                                                'PR-1022', 'TEN-2021', null, 'Mere Tipene'),
  ('n07', 45, 'call',  'Whitmore Trust',       'Trust has decided to sell 5 Blenheim Street. 90 day notice served the same day.',                                                                    'PR-1016', 'TEN-2015', 'Whitmore Trust', 'Ana Whitiora'),
  ('n08',  4, 'visit', 'Kiri Manaia',          'Dropped the keys back after the lock change. Place is spotless.',                                                                                   'PR-1018', 'TEN-2017', null, 'Mere Tipene'),
  ('n09', 15, 'email', 'Margaret Ellis',       'August statement went out. She rang to say the fee looked right.',                                                                                  null,      null, 'Margaret Ellis', 'Ana Whitiora'),
  ('n10', 22, 'call',  'Sunita Raman',         'Wants inspection photos every time. Told her they come with the report.',                                                                           'PR-1013', null, 'Sunita Raman', 'Mere Tipene'),
  ('n11',  8, 'email', 'Nikau Investments',    'Approved the hedge cut on Owen Street up to $450.',                                                                                                 'PR-1019', null, 'Nikau Investments Ltd', 'Josh Callaghan'),
  ('n12', 30, 'call',  'Ellis Family Trust',   'Heat pump at Wilford Street is short of gas. Quote sent, no decision yet.',                                                                         'PR-1003', 'TEN-2003', 'Ellis Family Trust', 'Ana Whitiora'),
  ('n13', 18, 'email', 'Helen Boyd',           'Told her the Titahi Bay tenants may move. She is happy to re-let.',                                                                                 'PR-1022', null, 'Helen Boyd', 'Mere Tipene'),
  ('n14',  5, 'call',  'Jade Ferrier',         'Asked when the rent review is. Told her a notice would come with 60 days.',                                                                         'PR-1001', 'TEN-2001', null, 'Ana Whitiora'),
  ('n15', 40, 'email', 'Ferndale Estate Trust','Statements go to the accountant as well from now on.',                                                                                              null,      null, 'Ferndale Estate Trust', 'Ana Whitiora'),
  ('n16', 60, 'call',  'Yvonne Chen',          'First inspection report explained. She was happy.',                                                                                                 'PR-1027', 'TEN-2025', 'Yvonne Chen', 'Mere Tipene'),
  ('n17',  7, 'email', 'Dan Fowler',           'Confirmed the dog has been rehomed. Breach notice closed off.',                                                                                     'PR-1019', 'TEN-2018', null, 'Ana Whitiora'),
  ('n18', 11, 'call',  'Fiona Blackwood',      'Shower leak. Plumber is opening the wall on Thursday.',                                                                                             'PR-1012', 'TEN-2012', null, 'Josh Callaghan'),
  ('n19', 26, 'email', 'Harbour Rise Holdings','Third email about the Coromandel Street heating quote. No reply.',                                                                                  'PR-1007', null, 'Harbour Rise Holdings Ltd', 'Ana Whitiora'),
  ('n20', 90, 'call',  'Anton Kereru',         'Rang about the bathroom fan. Approved $720 for ducting it outside.',                                                                                'PR-1025', null, 'Anton Kereru', 'Mere Tipene'),
  ('n21', 33, 'email', 'Priya Nadarajah',      'Asked about the fixed term. Told her we would come back before it ends.',                                                                           'PR-1004', 'TEN-2004', null, 'Mere Tipene'),
  ('n22', 14, 'visit', 'Bree Halloran',        'Dropped in about the power. Told her the electrician is booked.',                                                                                   'PR-1005', 'TEN-2005', null, 'Josh Callaghan'),
  ('n23', 55, 'email', 'Peter Voss',           'August statement, plus a note that the shower may need work.',                                                                                      'PR-1012', null, 'Peter Voss', 'Mere Tipene'),
  ('n24', 20, 'call',  'Tania Rewiti',         'Six years in the house. Asked whether the rent was going up. Told her a review is due.',                                                            'PR-1010', 'TEN-2009', null, 'Ana Whitiora'),
  ('n25', 16, 'email', 'Grace Whittaker',      'Deck at the back door is a trip hazard. Owner is deciding.',                                                                                        'PR-1008', 'TEN-2008', null, 'Josh Callaghan'),
  ('n26',210, 'call',  'Palmer Bros Ltd',      'Told us he was moving back in himself. Nothing since.',                                                                                             'PR-1026', null, 'Palmer Bros Ltd', 'Ana Whitiora'),
  ('n27',260, 'email', 'Whitmore Trust',       'Annual insurance certificates received.',                                                                                                           null,      null, 'Whitmore Trust', 'Ana Whitiora')
) as v(key, days_ago, kind, who, body, property, tenancy, owner, manager)
on conflict do nothing;

-- Owner statements ----------------------------------------------------------------------------
-- Three months of monthly reporting. The figures are derived from the rent roll:
-- rent received, the management fee, what the contractors invoiced, and what was
-- disbursed. This system reports them. It does not move them.

insert into owner_statements (id, owner_id, period_month, generated_on, rent_received_cents,
                              management_fees_cents, expenses_cents, disbursed_cents, status, sent_on, note)
select seed_uuid('stmt:' || o.name || ':' || m.n), o.id,
       (date_trunc('month', current_date) - (m.n || ' month')::interval)::date,
       (date_trunc('month', current_date) - (m.n || ' month')::interval)::date + 20,
       coalesce(rr.rent, 0),
       round(coalesce(rr.fee, 0)),
       coalesce(ex.spend, 0),
       coalesce(rr.rent, 0) - round(coalesce(rr.fee, 0)) - coalesce(ex.spend, 0),
       case when m.n = 1 and o.name in ('Peter Voss', 'Anton Kereru') then 'draft' else 'sent' end,
       case when m.n = 1 and o.name in ('Peter Voss', 'Anton Kereru') then null
            else (date_trunc('month', current_date) - (m.n || ' month')::interval)::date + 21 end,
       ''
from owners o
cross join (values (1), (2), (3)) as m(n)
left join lateral (
  select sum(r.weekly_rent_cents) * 30 / 7 as rent,
         sum(r.weekly_fee_cents) * 30 / 7  as fee
  from v_rent_roll r where r.owner_id = o.id and r.rent_cents > 0
) rr on true
left join lateral (
  select coalesce(sum(j.invoiced_cents), 0) as spend
  from contractor_jobs j
  join maintenance_requests mr on mr.id = j.maintenance_id
  join properties p on p.id = mr.property_id
  where p.owner_id = o.id
    and j.invoiced_on >= (date_trunc('month', current_date) - (m.n || ' month')::interval)::date
    and j.invoiced_on <  (date_trunc('month', current_date) - ((m.n - 1) || ' month')::interval)::date
) ex on true
on conflict do nothing;
