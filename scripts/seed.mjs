#!/usr/bin/env node
// Loads supabase/seed.sql: Kowhai Property Management, a demo Wellington
// residential agency with four staff, fourteen owners, twenty seven properties,
// twenty five running tenancies, six months of rent, arrears at three stages,
// inspections due, maintenance waiting on owners and healthy homes items open.
// Every row has a derived id and inserts with ON CONFLICT DO NOTHING, so
// re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from owners)               as owners,
           (select count(*) from properties)           as properties,
           (select count(*) from tenancies)            as tenancies,
           (select count(*) from tenants)              as tenants,
           (select count(*) from rent_ledger)          as ledger,
           (select count(*) from rent_schedule)        as rent_schedule,
           (select count(*) from arrears_events)       as arrears_events,
           (select count(*) from bonds)                as bonds,
           (select count(*) from inspections)          as inspections,
           (select count(*) from inspection_items)     as inspection_items,
           (select count(*) from maintenance_requests) as maintenance,
           (select count(*) from contractors)          as contractors,
           (select count(*) from contractor_jobs)      as jobs,
           (select count(*) from notices)              as notices,
           (select count(*) from compliance_items)     as compliance_items,
           (select count(*) from tasks)                as tasks,
           (select count(*) from contact_notes)        as notes,
           (select count(*) from owner_statements)     as statements
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(
      `seed: ${n.owners} owners, ${n.properties} properties, ${n.tenancies} tenancies (${n.tenants} tenants), ` +
        `${n.ledger} rent ledger entries, ${n.rent_schedule} rent schedule rows, ${n.arrears_events} arrears events, ` +
        `${n.bonds} bonds, ${n.inspections} inspections (${n.inspection_items} findings), ` +
        `${n.maintenance} maintenance requests, ${n.contractors} contractors, ${n.jobs} jobs, ${n.notices} notices, ` +
        `${n.compliance_items} compliance items, ${n.tasks} tasks, ${n.notes} notes, ${n.statements} owner statements`,
    );
  } finally {
    await db.close();
  }
}
