#!/usr/bin/env node
// property-management-for-claude-code: the one CLI. Claude Code slash commands
// call this; so can you.
//
//   node scripts/property.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system records the tenancy lifecycle, arrears, inspections, maintenance,
// compliance and the owner reporting layer. It never holds money. Rent trust
// accounting stays in the system that already holds it.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, price, isoDate, short, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set([
  'json', 'help', 'all', 'open', 'closed', 'dry-run', 'csv', 'detail', 'vacant',
  'mine', 'overdue', 'action', 'urgent', 'unsent', 'breaches', 'compliant',
]);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));

// ---------------------------------------------------------------------------
// Dates and money

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Working days, the way the Act counts them: Monday to Friday, no public holidays.
function addWorkingDays(iso, n) {
  let out = iso;
  let left = n;
  while (left > 0) {
    out = addDays(out, 1);
    const dow = new Date(`${out}T00:00:00`).getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return out;
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // New Zealand and Australian property exports write DD/MM/YYYY, so the first
  // number is the day unless the second one is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
  return isoDate(d);
}

function parseMoney(v) {
  if (v === undefined || v === null || v === '' || v === true) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) throw new CliError(`"${v}" is not an amount.`);
  return Math.round(n * 100);
}

function parsePeriod(v, dflt = 'weekly') {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || v === true) return dflt;
  if (/^w/.test(s)) return 'weekly';
  if (/^f/.test(s) || s === '2 weekly' || s === 'biweekly') return 'fortnightly';
  if (/^m/.test(s)) return 'monthly';
  return dflt;
}

const periodDays = (p) => (p === 'fortnightly' ? 14 : p === 'monthly' ? 30 : 7);
const rentText = (cents, period) => `${money(cents)} ${period || 'weekly'}`;
const weeklyOf = (cents, period) => Math.round((num(cents) * 7) / periodDays(period));

// ---------------------------------------------------------------------------
// Lookups: full id, first 4+ characters of an id, exact code, name or number,
// then contains. One hit wins. Several hits list the candidates and exit 1.

const RESOLVERS = {
  owner: {
    from: 'owners c left join managers m on m.id = c.manager_id',
    cols: 'c.*, m.full_name as manager_name',
    exact: 'lower(c.name) = lower($1) or lower(c.payment_reference) = lower($1) or lower(c.external_ref) = lower($1)',
    fuzzy: 'c.name ilike $1 or c.city ilike $1 or c.email ilike $1',
    label: (r) => `${r.name}${r.city ? ` (${r.city})` : ''}${r.status === 'active' ? '' : `, ${r.status}`}`,
    order: 'c.name',
    listing: 'owners --all',
  },
  property: {
    from: 'properties c join owners o on o.id = c.owner_id left join managers m on m.id = c.manager_id',
    cols: 'c.*, o.name as owner_name, o.email as owner_email, o.phone as owner_phone, m.full_name as manager_name',
    exact: 'lower(c.ref) = lower($1) or lower(c.address_line) = lower($1) or lower(c.external_ref) = lower($1)',
    fuzzy: 'c.ref ilike $1 or c.address_line ilike $1 or c.suburb ilike $1',
    label: (r) => `${r.ref}  ${r.address_line}, ${r.suburb || r.city || ''} (${r.status})`,
    order: 'c.ref',
    listing: 'properties --all',
  },
  tenancy: {
    from: `tenancies c join properties p on p.id = c.property_id join owners o on o.id = p.owner_id
           left join managers m on m.id = c.manager_id`,
    cols: `c.*, p.ref as property_ref, p.address_line, p.suburb, p.city as property_city, p.market_rent_cents,
           p.management_fee_pct, o.name as owner_name, o.id as owner_id2, m.full_name as manager_name`,
    exact: 'lower(c.tenancy_ref) = lower($1) or lower(p.ref) = lower($1) or lower(c.external_ref) = lower($1)',
    fuzzy: `c.tenancy_ref ilike $1 or p.address_line ilike $1 or p.suburb ilike $1
            or exists (select 1 from tenancy_tenants tt join tenants tn on tn.id = tt.tenant_id
                       where tt.tenancy_id = c.id and tn.full_name ilike $1)`,
    label: (r) => `${r.tenancy_ref}  ${r.address_line} (${r.status})`,
    order: "case c.status when 'active' then 1 when 'notice given' then 2 else 3 end, c.start_on desc",
    listing: 'tenancies --all',
  },
  tenant: {
    from: 'tenants c',
    cols: 'c.*',
    exact: 'lower(c.full_name) = lower($1) or lower(c.email) = lower($1) or lower(c.external_ref) = lower($1)',
    fuzzy: 'c.full_name ilike $1 or c.email ilike $1',
    label: (r) => `${r.full_name}${r.email ? ` (${r.email})` : ''}`,
    order: 'c.full_name',
    listing: 'tenants',
  },
  manager: {
    from: 'managers c',
    cols: 'c.*',
    exact: 'lower(c.full_name) = lower($1) or lower(c.code) = lower($1) or lower(c.email) = lower($1)',
    fuzzy: 'c.full_name ilike $1 or c.code ilike $1',
    label: (r) => `${r.full_name} (${r.role})`,
    order: 'c.full_name',
    listing: 'managers',
  },
  contractor: {
    from: 'contractors c',
    cols: 'c.*',
    exact: 'lower(c.name) = lower($1) or lower(c.external_ref) = lower($1)',
    fuzzy: 'c.name ilike $1 or c.trade ilike $1 or c.contact_name ilike $1',
    label: (r) => `${r.name} (${r.trade})`,
    order: 'c.name',
    listing: 'contractors --all',
  },
  maintenance: {
    from: 'maintenance_requests c join properties p on p.id = c.property_id',
    cols: 'c.*, p.ref as property_ref, p.address_line, p.owner_id',
    exact: 'lower(c.job_ref) = lower($1)',
    fuzzy: 'c.job_ref ilike $1 or c.summary ilike $1 or p.ref ilike $1 or p.address_line ilike $1',
    label: (r) => `${r.job_ref || short(r.id)}  ${r.address_line}: ${truncate(r.summary, 40)} (${r.status})`,
    order: 'c.reported_on desc',
    listing: 'maintenance --all',
  },
  job: {
    from: `contractor_jobs c join maintenance_requests mr on mr.id = c.maintenance_id
           join properties p on p.id = mr.property_id left join contractors ct on ct.id = c.contractor_id`,
    cols: 'c.*, mr.summary, mr.job_ref, p.ref as property_ref, p.address_line, ct.name as contractor_name',
    exact: 'lower(c.job_no) = lower($1) or lower(c.invoice_ref) = lower($1)',
    fuzzy: 'c.job_no ilike $1 or mr.summary ilike $1 or p.address_line ilike $1',
    label: (r) => `${r.job_no || short(r.id)}  ${r.address_line}: ${truncate(r.summary, 36)} (${r.status})`,
    order: 'c.issued_on desc nulls last',
    listing: 'jobs --all',
  },
  inspection: {
    from: 'inspections c join properties p on p.id = c.property_id',
    cols: 'c.*, p.ref as property_ref, p.address_line, p.suburb, p.owner_id',
    exact: "lower(p.ref) = lower($1)",
    fuzzy: 'p.ref ilike $1 or p.address_line ilike $1 or c.kind ilike $1',
    label: (r) =>
      `${short(r.id)}  ${r.address_line} ${r.kind} ${isoDate(r.completed_on || r.scheduled_on)} (${r.completed_on ? 'done' : 'booked'})`,
    order: 'coalesce(c.completed_on, c.scheduled_on) desc',
    listing: 'inspections --all',
  },
  task: {
    from: 'tasks c left join properties p on p.id = c.property_id',
    cols: 'c.*, p.ref as property_ref, p.address_line',
    exact: 'lower(c.title) = lower($1)',
    fuzzy: 'c.title ilike $1 or p.address_line ilike $1',
    label: (r) => `${short(r.id)}  ${truncate(r.title, 50)} (${r.status})`,
    order: 'c.due_on',
    listing: 'tasks --all',
  },
};

const ID_RE = /^[0-9a-f]{4,8}(-[0-9a-f-]*)?$/i;

async function resolve(db, kind, q, { optional = false } = {}) {
  const spec = RESOLVERS[kind];
  q = String(q ?? '').trim();
  if (!q || q === 'true') {
    if (optional) return null;
    throw new CliError(`Give me a ${kind} name, reference or id.`);
  }
  const select = `select ${spec.cols} from ${spec.from}`;
  let rows = [];
  if (ID_RE.test(q)) {
    rows = await db.query(`${select} where c.id::text like $1 order by ${spec.order}`, [q.toLowerCase() + '%']);
    if (rows.length === 1) return rows[0];
  }
  if (!rows.length) rows = await db.query(`${select} where ${spec.exact} order by ${spec.order}`, [q]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) rows = await db.query(`${select} where ${spec.fuzzy} order by ${spec.order}`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) {
    if (optional) return null;
    throw new CliError(`No ${kind} matches "${q}". Run \`${spec.listing}\` to see what exists.`);
  }
  throw new CliError(
    `"${q}" matches ${rows.length} ${kind} records. Use a reference, an id, or a longer name:\n` +
      rows.map((r) => `  ${short(r.id)}  ${spec.label(r)}`).join('\n'),
  );
}

// The person doing the work: --manager, PM_MANAGER, or the only active manager.
async function whoIs(db, flags, { optional = true } = {}) {
  const named = flags.manager || process.env.PM_MANAGER;
  if (named && named !== true) return resolve(db, 'manager', named);
  const rows = await db.query('select * from managers where active order by full_name');
  if (rows.length === 1) return rows[0];
  if (optional) return null;
  if (!rows.length) throw new CliError('No managers on file. Add one: add manager "<name>"');
  throw new CliError(
    'Several people work here. Pass --manager= (or set PM_MANAGER):\n' +
      rows.map((r) => `  ${r.code || short(r.id)}  ${r.full_name}`).join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Reads: the portfolio

async function cmdProperties(db, args, flags) {
  const q = args.join(' ').trim();
  const where = [];
  const params = [];
  if (!flags.all) where.push("r.status <> 'off management'");
  if (flags.vacant) where.push("r.tenants = 'VACANT'");
  if (flags.owner && flags.owner !== true) {
    const o = await resolve(db, 'owner', flags.owner);
    params.push(o.id);
    where.push(`r.owner_id = $${params.length}`);
  }
  if (flags.manager && flags.manager !== true) {
    const m = await resolve(db, 'manager', flags.manager);
    params.push(m.full_name);
    where.push(`r.manager = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(`(r.property ilike $${i} or r.suburb ilike $${i} or r.city ilike $${i} or r.property_ref ilike $${i} or r.owner ilike $${i})`);
  }
  const rows = await db.query(
    `select * from v_rent_roll r ${where.length ? 'where ' + where.join(' and ') : ''} order by r.property_ref`,
    params,
  );
  const rent = rows.reduce((a, r) => a + num(r.weekly_rent_cents), 0);
  const fees = rows.reduce((a, r) => a + num(r.weekly_fee_cents), 0);
  const vacant = rows.filter((r) => r.tenants === 'VACANT').length;
  const text =
    heading(`The rent roll (${rows.length} properties, ${money(rent)} a week, ${money(fees)} a week in fees, ${vacant} vacant)`) +
    '\n' +
    table(rows, [
      { key: 'property_ref', label: 'Ref' },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'suburb', label: 'Suburb', width: 14 },
      { key: 'owner', label: 'Owner', width: 22 },
      { key: 'tenants', label: 'Tenants', width: 26 },
      { key: 'weekly_rent_cents', label: 'Rent pw', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'arrears_cents', label: 'Arrears', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'last_inspection_on', label: 'Inspected', format: (v) => isoDate(v) },
      { key: 'open_maintenance', label: 'Jobs', align: 'right' },
      { key: 'compliance_gaps', label: 'Gaps', align: 'right' },
      { key: 'manager', label: 'Manager', width: 13 },
    ]);
  return { text, json: rows };
}

async function cmdProperty(db, args) {
  const p = await resolve(db, 'property', args.join(' '));
  const [roll] = await db.query('select * from v_rent_roll where property_id = $1', [p.id]);
  const tenancies = await db.query(
    `select t.*, (select string_agg(tn.full_name, ', ') from tenancy_tenants tt join tenants tn on tn.id = tt.tenant_id where tt.tenancy_id = t.id) as tenants
     from tenancies t where t.property_id = $1 order by t.start_on desc`,
    [p.id],
  );
  const inspections = await db.query(
    'select * from inspections where property_id = $1 order by coalesce(completed_on, scheduled_on) desc limit 6',
    [p.id],
  );
  const maintenance = await db.query(
    'select * from maintenance_requests where property_id = $1 order by reported_on desc limit 8',
    [p.id],
  );
  const compliance = await db.query('select * from compliance_items where property_id = $1 order by kind', [p.id]);
  const notes = await db.query('select * from contact_notes where property_id = $1 order by happened_on desc limit 6', [p.id]);
  const arrears = await db.query('select * from v_arrears where property_id = $1', [p.id]);

  const lines = [heading(`${p.ref}  ${p.address_line}, ${p.suburb || ''} ${p.city || ''}`)];
  lines.push(
    `  Owner        ${p.owner_name}  ${p.owner_email || ''} ${p.owner_phone || ''}`,
    `  Manager      ${p.manager_name || 'unassigned'}`,
    `  The house    ${p.property_type}, ${p.bedrooms || '?'} bed, ${p.bathrooms || '?'} bath, ${p.parking || 'no parking recorded'}${p.year_built ? `, built ${p.year_built}` : ''}`,
    `  Management   ${p.management_fee_pct}% of rent, letting fee ${p.letting_fee_weeks} week, ${p.keys_held || 0} keys held`,
    `  Market rent  ${money(p.market_rent_cents)} a week on file`,
    `  Insurance    ${p.insurer || 'not recorded'}${p.insurance_expires_on ? `, expires ${isoDate(p.insurance_expires_on)}` : ''}`,
    `  Chattels     ${p.chattels || 'none recorded'}`,
  );
  if (roll && num(roll.rent_cents)) {
    lines.push(`  Let at       ${money(roll.weekly_rent_cents)} a week to ${roll.tenants}`);
  } else {
    lines.push('  Let at       VACANT');
  }
  if (arrears.length) lines.push(`  Arrears      ${money(arrears[0].arrears_cents)}, ${arrears[0].days_behind} days behind`);
  if (p.notes) lines.push(`  Notes        ${p.notes}`);

  lines.push(heading('Tenancies'));
  lines.push(
    table(tenancies, [
      { key: 'tenancy_ref', label: 'Ref' },
      { key: 'tenants', label: 'Tenants', width: 30 },
      { key: 'kind', label: 'Kind', width: 11 },
      { key: 'status', label: 'Status', width: 12 },
      { key: 'start_on', label: 'From', format: (v) => isoDate(v) },
      { key: 'end_on', label: 'To', format: (v) => (v ? isoDate(v) : '') },
      { key: 'rent_cents', label: 'Rent', align: 'right', format: (v, r) => rentText(v, r.rent_period) },
      { key: 'bond_cents', label: 'Bond', align: 'right', format: (v) => money(v) },
    ]),
  );

  lines.push(heading('Inspections'));
  lines.push(
    table(inspections, [
      { key: 'kind', label: 'Kind', width: 14 },
      { key: 'scheduled_on', label: 'Booked', format: (v) => isoDate(v) },
      { key: 'notice_served_on', label: 'Notice', format: (v) => isoDate(v) },
      { key: 'completed_on', label: 'Done', format: (v) => isoDate(v) },
      { key: 'overall', label: 'Overall', width: 8 },
      { key: 'report_sent_on', label: 'Report sent', format: (v) => (v ? isoDate(v) : 'NOT SENT') },
      { key: 'summary', label: 'Summary', width: 56, format: (v) => truncate(v, 56) },
    ]),
  );

  lines.push(heading('Maintenance'));
  lines.push(
    table(maintenance, [
      { key: 'job_ref', label: 'Ref' },
      { key: 'reported_on', label: 'Reported', format: (v) => isoDate(v) },
      { key: 'priority', label: 'Priority', width: 8 },
      { key: 'category', label: 'Category', width: 11 },
      { key: 'summary', label: 'What', width: 50, format: (v) => truncate(v, 50) },
      { key: 'status', label: 'Status', width: 22 },
    ]),
  );

  lines.push(heading('Compliance'));
  lines.push(
    table(compliance, [
      { key: 'kind', label: 'Item', width: 34 },
      { key: 'status', label: 'Status', width: 14 },
      { key: 'assessed_on', label: 'Assessed', format: (v) => isoDate(v) },
      { key: 'due_on', label: 'Due', format: (v) => isoDate(v) },
      { key: 'note', label: 'Note', width: 62, format: (v) => truncate(v, 62) },
    ]),
  );

  if (notes.length) {
    lines.push(heading('Contact'));
    for (const n of notes) lines.push(`  ${isoDate(n.happened_on)}  ${String(n.kind).padEnd(6)} ${n.who || ''}: ${truncate(n.body, 96)}`);
  }
  return { text: lines.join('\n'), json: { property: p, roll, tenancies, inspections, maintenance, compliance, notes, arrears } };
}

async function cmdOwners(db, args, flags) {
  const q = args.join(' ').trim();
  const where = [];
  const params = [];
  if (!flags.all) where.push("s.status = 'active'");
  if (flags.manager && flags.manager !== true) {
    const m = await resolve(db, 'manager', flags.manager);
    params.push(m.full_name);
    where.push(`s.manager = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(s.owner ilike $${params.length} or s.city ilike $${params.length})`);
  }
  const rows = await db.query(
    `select * from v_owner_summary s ${where.length ? 'where ' + where.join(' and ') : ''} order by s.weekly_rent_cents desc`,
    params,
  );
  const text =
    heading(`Owners (${rows.length}, ${money(rows.reduce((a, r) => a + num(r.weekly_rent_cents), 0))} a week under management)`) +
    '\n' +
    table(rows, [
      { key: 'owner', label: 'Owner', width: 28 },
      { key: 'owner_type', label: 'Type', width: 10 },
      { key: 'manager', label: 'Manager', width: 13 },
      { key: 'properties', label: 'Props', align: 'right' },
      { key: 'tenanted', label: 'Let', align: 'right' },
      { key: 'weekly_rent_cents', label: 'Rent pw', align: 'right', format: (v) => money(v) },
      { key: 'arrears_cents', label: 'Arrears', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'open_maintenance', label: 'Jobs', align: 'right' },
      { key: 'compliance_gaps', label: 'Gaps', align: 'right' },
      { key: 'last_statement_month', label: 'Last stmt', format: (v) => (v ? isoDate(v).slice(0, 7) : 'NEVER') },
      { key: 'days_since_contact', label: 'Spoke', align: 'right', format: (v) => (v === null ? 'never' : `${v}d`) },
    ]);
  return { text, json: rows };
}

async function cmdOwner(db, args) {
  const o = await resolve(db, 'owner', args.join(' '));
  const [summary] = await db.query('select * from v_owner_summary where owner_id = $1', [o.id]);
  const properties = await db.query('select * from v_rent_roll where owner_id = $1 order by property_ref', [o.id]);
  const statements = await db.query(
    'select * from owner_statements where owner_id = $1 order by period_month desc limit 6',
    [o.id],
  );
  const maintenance = await db.query(
    `select v.* from v_maintenance_open v join properties p on p.id = v.property_id where p.owner_id = $1 order by v.days_open desc`,
    [o.id],
  );
  const compliance = await db.query(
    `select c.* from v_compliance_due c join properties p on p.id = c.property_id
     where p.owner_id = $1 and c.status <> 'compliant' order by c.property_ref`,
    [o.id],
  );
  const notes = await db.query('select * from contact_notes where owner_id = $1 order by happened_on desc limit 8', [o.id]);

  const lines = [heading(`${o.name}${o.owner_type === 'individual' ? '' : ` (${o.owner_type})`}`)];
  lines.push(
    `  Contact      ${o.email || 'no email'}  ${o.phone || ''}`,
    `  Post         ${o.postal_address || ''}${o.city ? `, ${o.city}` : ''}`,
    `  Manager      ${o.manager_name || 'unassigned'}`,
    `  With us      since ${isoDate(o.owner_since)}, statements on the ${o.statement_day}th, reference ${o.payment_reference || 'none'}`,
    `  Portfolio    ${summary.properties} properties, ${summary.tenanted} let, ${money(summary.weekly_rent_cents)} a week`,
    `  Owing        ${money(summary.arrears_cents)} in arrears across the portfolio`,
    `  Open         ${summary.open_maintenance} maintenance jobs, ${summary.compliance_gaps} compliance gaps`,
  );
  if (o.notes) lines.push(`  Notes        ${o.notes}`);

  lines.push(heading('Properties'));
  lines.push(
    table(properties, [
      { key: 'property_ref', label: 'Ref' },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'suburb', label: 'Suburb', width: 14 },
      { key: 'tenants', label: 'Tenants', width: 28 },
      { key: 'weekly_rent_cents', label: 'Rent pw', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'market_rent_cents', label: 'Market', align: 'right', format: (v) => money(v) },
      { key: 'arrears_cents', label: 'Arrears', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'last_inspection_on', label: 'Inspected', format: (v) => isoDate(v) },
      { key: 'compliance_gaps', label: 'Gaps', align: 'right' },
    ]),
  );

  lines.push(heading('Statements'));
  lines.push(
    table(statements, [
      { key: 'period_month', label: 'Month', format: (v) => String(isoDate(v)).slice(0, 7) },
      { key: 'rent_received_cents', label: 'Rent', align: 'right', format: (v) => money(v) },
      { key: 'management_fees_cents', label: 'Our fee', align: 'right', format: (v) => money(v) },
      { key: 'expenses_cents', label: 'Expenses', align: 'right', format: (v) => money(v) },
      { key: 'disbursed_cents', label: 'To owner', align: 'right', format: (v) => money(v) },
      { key: 'status', label: 'Status', width: 8 },
      { key: 'sent_on', label: 'Sent', format: (v) => (v ? isoDate(v) : 'NOT SENT') },
    ]),
  );

  if (maintenance.length) {
    lines.push(heading('Maintenance open'));
    lines.push(
      table(maintenance, [
        { key: 'job_ref', label: 'Ref' },
        { key: 'property', label: 'Property', width: 24 },
        { key: 'summary', label: 'What', width: 48, format: (v) => truncate(v, 48) },
        { key: 'status', label: 'Status', width: 22 },
        { key: 'days_open', label: 'Days', align: 'right' },
        { key: 'quoted_cents', label: 'Quoted', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      ]),
    );
  }
  if (compliance.length) {
    lines.push(heading('Compliance to close out'));
    for (const c of compliance) lines.push(`  ${String(c.property_ref).padEnd(9)} ${String(c.kind).padEnd(34)} ${c.status}: ${truncate(c.note, 70)}`);
  }
  if (notes.length) {
    lines.push(heading('Contact'));
    for (const n of notes) lines.push(`  ${isoDate(n.happened_on)}  ${String(n.kind).padEnd(6)} ${truncate(n.body, 100)}`);
  }
  return { text: lines.join('\n'), json: { owner: o, summary, properties, statements, maintenance, compliance, notes } };
}

// ---------------------------------------------------------------------------
// Reads: tenancies

async function cmdTenancies(db, args, flags) {
  const q = args.join(' ').trim();
  const where = [];
  const params = [];
  if (!flags.all) where.push("t.status in ('active', 'notice given')");
  if (flags.status && flags.status !== true) {
    params.push(String(flags.status));
    where.push(`t.status = $${params.length}`);
  }
  if (flags.manager && flags.manager !== true) {
    const m = await resolve(db, 'manager', flags.manager);
    params.push(m.id);
    where.push(`t.manager_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.address_line ilike $${params.length} or p.suburb ilike $${params.length} or t.tenancy_ref ilike $${params.length})`);
  }
  const rows = await db.query(
    `select t.tenancy_ref, t.kind, t.status, t.start_on, t.fixed_term_end_on, t.rent_cents, t.rent_period, t.bond_cents,
            t.last_increase_on, t.vacate_on, p.ref as property_ref, p.address_line as property, coalesce(p.suburb, '') as suburb,
            o.name as owner, coalesce(m.full_name, 'unassigned') as manager,
            coalesce((select string_agg(tn.full_name, ', ') from tenancy_tenants tt join tenants tn on tn.id = tt.tenant_id where tt.tenancy_id = t.id), '') as tenants
     from tenancies t
     join properties p on p.id = t.property_id
     join owners o on o.id = p.owner_id
     left join managers m on m.id = t.manager_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by p.ref`,
    params,
  );
  const text =
    heading(`Tenancies (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'tenancy_ref', label: 'Ref' },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'tenants', label: 'Tenants', width: 28 },
      { key: 'kind', label: 'Kind', width: 11 },
      { key: 'status', label: 'Status', width: 12 },
      { key: 'start_on', label: 'From', format: (v) => isoDate(v) },
      { key: 'fixed_term_end_on', label: 'Term ends', format: (v) => (v ? isoDate(v) : '') },
      { key: 'rent_cents', label: 'Rent', align: 'right', format: (v, r) => rentText(v, r.rent_period) },
      { key: 'last_increase_on', label: 'Last rise', format: (v) => (v ? isoDate(v) : 'never') },
      { key: 'manager', label: 'Manager', width: 13 },
    ]);
  return { text, json: rows };
}

async function cmdTenancy(db, args) {
  const t = await resolve(db, 'tenancy', args.join(' '));
  const tenants = await db.query(
    `select tn.*, tt.is_primary from tenancy_tenants tt join tenants tn on tn.id = tt.tenant_id
     where tt.tenancy_id = $1 order by tt.is_primary desc, tn.full_name`,
    [t.id],
  );
  const [arrears] = await db.query('select * from v_arrears where tenancy_id = $1', [t.id]);
  const [bond] = await db.query('select * from bonds where tenancy_id = $1', [t.id]);
  const schedule = await db.query('select * from rent_schedule where tenancy_id = $1 order by effective_on desc', [t.id]);
  const ledger = await db.query('select * from rent_ledger where tenancy_id = $1 order by entry_on desc limit 12', [t.id]);
  const noticesServed = await db.query('select * from notices where tenancy_id = $1 order by served_on desc limit 10', [t.id]);
  const arrearsEvents = await db.query('select * from arrears_events where tenancy_id = $1 order by noted_on desc', [t.id]);
  const maintenance = await db.query(
    'select * from maintenance_requests where tenancy_id = $1 order by reported_on desc limit 6',
    [t.id],
  );
  const inspections = await db.query(
    'select * from inspections where tenancy_id = $1 order by coalesce(completed_on, scheduled_on) desc limit 5',
    [t.id],
  );
  const notes = await db.query('select * from contact_notes where tenancy_id = $1 order by happened_on desc limit 6', [t.id]);

  const lines = [heading(`${t.tenancy_ref}  ${t.address_line}, ${t.suburb || ''}`)];
  lines.push(
    `  Tenants      ${tenants.map((x) => `${x.full_name}${x.is_primary ? ' (primary)' : ''}`).join(', ') || 'none on file'}`,
    `  Contact      ${tenants.map((x) => `${x.email || ''} ${x.phone || ''}`.trim()).filter(Boolean).join(' | ') || 'none on file'}`,
    `  Owner        ${t.owner_name}`,
    `  Manager      ${t.manager_name || 'unassigned'}`,
    `  Agreement    ${t.kind}, ${t.status}, from ${isoDate(t.start_on)}${t.fixed_term_end_on ? ` to ${isoDate(t.fixed_term_end_on)}` : ''}${t.agreement_signed_on ? `, signed ${isoDate(t.agreement_signed_on)}` : ''}`,
    `  Rent         ${rentText(t.rent_cents, t.rent_period)}, due ${t.rent_due_day || 'not recorded'}${t.last_increase_on ? `, last increased ${isoDate(t.last_increase_on)}` : ', never increased'}`,
    `  Market rent  ${money(t.market_rent_cents)} a week on file`,
    `  Bond         ${money(t.bond_cents)}${bond ? `, ${bond.status}${bond.lodged_on ? ` ${isoDate(bond.lodged_on)}` : ' NOT LODGED'}${bond.bond_number ? ` (${bond.bond_number})` : ''}` : ', no bond record'}`,
    `  Statements   healthy homes statement ${t.healthy_homes_statement ? 'signed' : 'MISSING'}, insulation statement ${t.insulation_statement ? 'signed' : 'MISSING'}`,
  );
  if (arrears) {
    lines.push(`  Arrears      ${money(arrears.arrears_cents)}, ${arrears.days_behind} days behind (${arrears.working_days_behind} working days). Last payment ${isoDate(arrears.last_payment_on) || 'never'}`);
  } else {
    lines.push('  Arrears      none, rent is up to date');
  }
  if (t.vacate_on) {
    lines.push(`  Vacate       ${isoDate(t.vacate_on)}, notice given ${isoDate(t.vacate_notice_on)} by the ${t.vacate_notice_by}${t.vacate_reason ? ` (${t.vacate_reason})` : ''}`);
  }
  if (t.kind === 'fixed term') lines.push(`  Renewal      ${t.renewal_stage}${t.renewal_note ? `: ${t.renewal_note}` : ''}`);
  if (t.notes) lines.push(`  Notes        ${t.notes}`);

  lines.push(heading('Rent history'));
  lines.push(
    table(schedule, [
      { key: 'effective_on', label: 'From', format: (v) => isoDate(v) },
      { key: 'amount_cents', label: 'Rent', align: 'right', format: (v, r) => rentText(v, r.period) },
      { key: 'reason', label: 'Why', width: 18 },
      { key: 'notice_served_on', label: 'Notice served', format: (v) => (v ? isoDate(v) : '') },
      {
        key: 'note',
        label: 'Notice period',
        width: 46,
        format: (v, r) => (r.notice_served_on ? `${Math.round((new Date(r.effective_on) - new Date(r.notice_served_on)) / 86400000)} days` : '') + (v ? `  ${v}` : ''),
      },
    ]),
  );

  lines.push(heading('Rent ledger, most recent first'));
  lines.push(
    table(ledger, [
      { key: 'entry_on', label: 'Date', format: (v) => isoDate(v) },
      { key: 'kind', label: 'Kind', width: 10 },
      { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => price(v) },
      { key: 'method', label: 'How', width: 20 },
      { key: 'note', label: 'Note', width: 54, format: (v) => truncate(v, 54) },
    ]),
  );
  lines.push('  The ledger is a record. The money itself sits in the trust account, in the system that holds it.');

  if (arrearsEvents.length) {
    lines.push(heading('Arrears process'));
    for (const a of arrearsEvents) {
      lines.push(`  ${isoDate(a.noted_on)}  ${String(a.action).padEnd(26)} ${money(a.amount_cents).padStart(9)}  ${truncate(a.note, 76)}`);
    }
  }
  if (noticesServed.length) {
    lines.push(heading('Notices'));
    lines.push(
      table(noticesServed, [
        { key: 'kind', label: 'Notice', width: 24 },
        { key: 'served_on', label: 'Served', format: (v) => isoDate(v) },
        { key: 'method', label: 'How', width: 8 },
        { key: 'effective_on', label: 'Effective', format: (v) => (v ? isoDate(v) : '') },
        {
          key: 'detail',
          label: 'Detail',
          width: 66,
          format: (v, r) => (r.effective_on ? `[${Math.round((new Date(r.effective_on) - new Date(r.served_on)) / 86400000)}d] ` : '') + truncate(v, 60),
        },
      ]),
    );
  }
  if (inspections.length) {
    lines.push(heading('Inspections'));
    for (const i of inspections) {
      lines.push(`  ${String(i.kind).padEnd(14)} ${isoDate(i.completed_on || i.scheduled_on)}  ${i.completed_on ? (i.overall || '') : 'booked'}  ${truncate(i.summary, 76)}`);
    }
  }
  if (maintenance.length) {
    lines.push(heading('Maintenance'));
    for (const m of maintenance) {
      lines.push(`  ${String(m.job_ref || short(m.id)).padEnd(10)} ${isoDate(m.reported_on)}  ${String(m.status).padEnd(24)} ${truncate(m.summary, 60)}`);
    }
  }
  if (notes.length) {
    lines.push(heading('Contact'));
    for (const n of notes) lines.push(`  ${isoDate(n.happened_on)}  ${String(n.kind).padEnd(6)} ${n.who || ''}: ${truncate(n.body, 92)}`);
  }
  return {
    text: lines.join('\n'),
    json: { tenancy: t, tenants, arrears, bond, schedule, ledger, notices: noticesServed, arrears_events: arrearsEvents, maintenance, inspections, notes },
  };
}

async function cmdTenants(db, args, flags) {
  const q = args.join(' ').trim();
  const params = [];
  let where = flags.all ? '' : "where t.status in ('active', 'notice given')";
  if (q) {
    params.push(`%${q}%`);
    where += `${where ? ' and' : 'where'} (tn.full_name ilike $1 or tn.email ilike $1 or p.address_line ilike $1)`;
  }
  const rows = await db.query(
    `select tn.full_name as tenant, tn.email, tn.phone, tn.employer, coalesce(t.tenancy_ref, '') as tenancy_ref,
            coalesce(p.address_line, '') as property, coalesce(p.suburb, '') as suburb, coalesce(t.status, '') as status,
            t.start_on, tt.is_primary
     from tenants tn
     left join tenancy_tenants tt on tt.tenant_id = tn.id
     left join tenancies t on t.id = tt.tenancy_id
     left join properties p on p.id = t.property_id
     ${where}
     order by tn.full_name`,
    params,
  );
  const text =
    heading(`Tenants (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'tenant', label: 'Tenant', width: 24 },
      { key: 'email', label: 'Email', width: 30 },
      { key: 'phone', label: 'Phone', width: 14 },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'tenancy_ref', label: 'Tenancy' },
      { key: 'status', label: 'Status', width: 12 },
      { key: 'start_on', label: 'Since', format: (v) => isoDate(v) },
    ]);
  return { text, json: rows };
}

// ---------------------------------------------------------------------------
// Arrears

const ARREARS_STEP = (r) => {
  if (num(r.days_behind) >= 21 && !r.tribunal_applied_on) return 'Apply to the Tenancy Tribunal (RTA 1986 s 55(1)(a))';
  if (num(r.days_behind) >= 14 && !r.last_remedy_notice_on) return 'Serve the 14 day notice to remedy (RTA 1986 s 56)';
  if (num(r.working_days_behind) >= 5 && !r.last_overdue_notice_on) return 'Serve the notice of overdue rent (RTA 1986 s 55AA)';
  if (num(r.days_behind) >= 21 && r.tribunal_applied_on) return 'At the Tribunal, wait for the hearing';
  if (num(r.days_behind) >= 14) return 'The 14 day notice is running, diary the expiry';
  if (num(r.working_days_behind) >= 5) return 'A notice is on file, ring them again';
  return 'Ring them today, before it becomes a notice';
};

async function cmdArrears(db, args, flags) {
  const where = [];
  const params = [];
  if (flags.manager && flags.manager !== true) {
    const m = await resolve(db, 'manager', flags.manager);
    params.push(m.full_name);
    where.push(`manager = $${params.length}`);
  }
  if (flags['min-days'] && flags['min-days'] !== true) {
    params.push(Number(flags['min-days']));
    where.push(`days_behind >= $${params.length}`);
  }
  const rows = await db.query(
    `select * from v_arrears ${where.length ? 'where ' + where.join(' and ') : ''} order by days_behind desc`,
    params,
  );
  for (const r of rows) r.next_step = ARREARS_STEP(r);
  const total = rows.reduce((a, r) => a + num(r.arrears_cents), 0);
  const serious = rows.filter((r) => num(r.days_behind) >= 14).length;
  const lines = [
    heading(`Arrears (${rows.length} tenancies, ${money(total)} owing, ${serious} past fourteen days)`),
    table(rows, [
      { key: 'tenancy_ref', label: 'Tenancy' },
      { key: 'property', label: 'Property', width: 24 },
      { key: 'tenants', label: 'Tenants', width: 24 },
      { key: 'arrears_cents', label: 'Owing', align: 'right', format: (v) => money(v) },
      { key: 'days_behind', label: 'Days', align: 'right' },
      { key: 'working_days_behind', label: 'Wk days', align: 'right' },
      { key: 'rent_cents', label: 'Rent', align: 'right', format: (v, r) => rentText(v, r.rent_period) },
      { key: 'last_payment_on', label: 'Last paid', format: (v) => isoDate(v) },
      { key: 'next_step', label: 'Next step', width: 52 },
    ]),
  ];
  if (rows.length) {
    lines.push('\n  Where each one has got to');
    for (const r of rows) {
      lines.push(
        `    ${String(r.tenancy_ref).padEnd(10)} ${String(r.property).slice(0, 26).padEnd(27)}` +
          ` overdue notice ${r.last_overdue_notice_on ? isoDate(r.last_overdue_notice_on) : 'NONE'.padEnd(10)}` +
          `  14 day notice ${r.last_remedy_notice_on ? isoDate(r.last_remedy_notice_on) : 'NONE'.padEnd(10)}` +
          `  Tribunal ${r.tribunal_applied_on ? isoDate(r.tribunal_applied_on) : 'no'}`,
      );
    }
    lines.push(
      '\n  Rent is overdue once it is five working days late (RTA 1986 s 55AA). Three of those notices inside ninety days,',
      '  or twenty one days of arrears, and the tenancy can be ended through the Tribunal (s 55(1)(a) and (aa)).',
    );
  }
  return { text: lines.join('\n'), json: rows };
}

async function cmdArrearsLog(db, args, flags) {
  const [ref, ...rest] = args;
  const t = await resolve(db, 'tenancy', ref);
  const action = str(flags.action) || rest.join(' ') || 'noted';
  const allowed = ['noted', 'notice of overdue rent', '14 day notice to remedy', 'payment plan', 'tribunal application', 'resolved'];
  if (!allowed.includes(action)) {
    throw new CliError(`Action must be one of: ${allowed.join(', ')}`);
  }
  const [a] = await db.query('select * from v_arrears where tenancy_id = $1', [t.id]);
  const manager = await whoIs(db, flags);
  const on = parseDate(flags.on) || today();
  const [row] = await db.query(
    `insert into arrears_events (tenancy_id, noted_on, action, days_behind, amount_cents, manager_id, note)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [t.id, on, action, a ? num(a.days_behind) : 0, a ? num(a.arrears_cents) : 0, manager?.id ?? null, str(flags.note)],
  );
  const kindMap = {
    'notice of overdue rent': 'notice of overdue rent',
    '14 day notice to remedy': '14 day notice to remedy',
  };
  if (kindMap[action]) {
    await db.query(
      `insert into notices (tenancy_id, property_id, kind, served_on, method, effective_on, detail, served_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        t.id,
        t.property_id,
        kindMap[action],
        on,
        str(flags.method) || 'email',
        action === '14 day notice to remedy' ? addDays(on, 14) : null,
        str(flags.note) || `Rent arrears of ${money(a ? a.arrears_cents : 0)}`,
        manager?.id ?? null,
      ],
    );
  }
  return {
    text:
      `Recorded on ${t.tenancy_ref} (${t.address_line}): ${action} on ${on}.` +
      (a ? `\n  ${money(a.arrears_cents)} owing, ${a.days_behind} days behind.\n  Next step: ${ARREARS_STEP(a)}` : '') +
      (kindMap[action] ? '\n  A notice record was written as well. Serve the paper copy the way the agreement says.' : ''),
    json: row,
  };
}

// ---------------------------------------------------------------------------
// Rent reviews and the ledger

async function cmdRentReview(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'serve') return cmdRentReviewServe(db, rest, flags);
  if (verb) {
    const t = await resolve(db, 'tenancy', args.join(' '));
    const schedule = await db.query('select * from rent_schedule where tenancy_id = $1 order by effective_on desc', [t.id]);
    const eligible = t.last_increase_on ? addDays(isoDate(t.last_increase_on), 365) : addDays(isoDate(t.start_on), 365);
    const lines = [
      heading(`Rent history for ${t.tenancy_ref}  ${t.address_line}`),
      `  Now on ${rentText(t.rent_cents, t.rent_period)}. Market rent on file is ${money(t.market_rent_cents)} a week.`,
      `  Next increase can take effect on or after ${eligible} (RTA 1986 s 24(1A): twelve months since the last one).`,
      `  A notice served today takes effect no earlier than ${addDays(today(), 60)} (s 24(1)(b): sixty days written notice).`,
      '',
      table(schedule, [
        { key: 'effective_on', label: 'From', format: (v) => isoDate(v) },
        { key: 'amount_cents', label: 'Rent', align: 'right', format: (v, r) => rentText(v, r.period) },
        { key: 'reason', label: 'Why', width: 18 },
        { key: 'notice_served_on', label: 'Notice served', format: (v) => (v ? isoDate(v) : '') },
        {
          key: 'note',
          label: 'Notice period',
          width: 42,
          format: (v, r) => (r.notice_served_on ? `${Math.round((new Date(r.effective_on) - new Date(r.notice_served_on)) / 86400000)} days` : '') + (v ? `  ${v}` : ''),
        },
      ]),
    ];
    return { text: lines.join('\n'), json: { tenancy: t, schedule, eligible_from: eligible } };
  }

  const rows = await db.query(
    `select * from v_lease_events where kind = 'rent review' order by days_away`,
  );
  for (const r of rows) {
    r.gap_to_market_cents = num(r.market_rent_cents) - weeklyOf(r.rent_cents, 'weekly');
    r.earliest_effective = addDays(today(), 60);
  }
  const lines = [
    heading(`Rent reviews available (${rows.length})`),
    table(rows, [
      { key: 'tenancy_ref', label: 'Tenancy' },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'tenants', label: 'Tenants', width: 24 },
      { key: 'rent_cents', label: 'Rent now', align: 'right', format: (v) => money(v) },
      { key: 'market_rent_cents', label: 'Market', align: 'right', format: (v) => money(v) },
      { key: 'gap_to_market_cents', label: 'Gap pw', align: 'right', format: (v) => (v > 0 ? money(v) : '') },
      { key: 'event_on', label: 'Eligible', format: (v) => isoDate(v) },
      { key: 'days_away', label: 'Days', align: 'right' },
      { key: 'manager', label: 'Manager', width: 13 },
    ]),
    '',
    `  A notice served today takes effect no earlier than ${addDays(today(), 60)}.`,
    '  Rent can only rise twelve months after the last increase, on sixty days written notice (RTA 1986 s 24).',
    '  Serve one with: rent-review serve <tenancy> --new-rent=720 [--effective=YYYY-MM-DD]',
  ];
  return { text: lines.join('\n'), json: rows };
}

async function cmdRentReviewServe(db, args, flags) {
  const t = await resolve(db, 'tenancy', args.join(' '));
  const newRent = parseMoney(flags['new-rent'] ?? flags.rent);
  if (!newRent) throw new CliError('Give me the new rent: rent-review serve <tenancy> --new-rent=720');
  const servedOn = parseDate(flags.on) || today();
  const effective = parseDate(flags.effective) || addDays(servedOn, 60);
  const noticeDays = Math.round((new Date(effective) - new Date(servedOn)) / 86400000);
  const lastIncrease = t.last_increase_on ? isoDate(t.last_increase_on) : isoDate(t.start_on);
  const monthsSince = Math.round((new Date(effective) - new Date(lastIncrease)) / 86400000);
  const problems = [];
  if (noticeDays < 60) problems.push(`Only ${noticeDays} days notice. The Act wants sixty (RTA 1986 s 24(1)(b)).`);
  if (monthsSince < 365) problems.push(`Only ${monthsSince} days since ${lastIncrease}. The Act wants twelve months (RTA 1986 s 24(1A)).`);
  if (problems.length && !flags.force) {
    throw new CliError(
      `This increase does not comply:\n  ${problems.join('\n  ')}\n` +
        `  The earliest compliant effective date is ${addDays(lastIncrease, 365) > addDays(servedOn, 60) ? addDays(lastIncrease, 365) : addDays(servedOn, 60)}.\n` +
        '  Re-run with --force only if you know why the rule does not apply here.',
    );
  }
  const manager = await whoIs(db, flags);
  await db.query('update rent_schedule set ends_on = $2 where tenancy_id = $1 and ends_on is null', [t.id, addDays(effective, -1)]);
  const [row] = await db.query(
    `insert into rent_schedule (tenancy_id, amount_cents, period, effective_on, reason, notice_served_on, note)
     values ($1, $2, $3, $4, 'rent review', $5, $6) returning *`,
    [t.id, newRent, t.rent_period, effective, servedOn, str(flags.note)],
  );
  await db.query(
    `insert into notices (tenancy_id, property_id, kind, served_on, method, effective_on, detail, served_by)
     values ($1, $2, 'rent increase', $3, $4, $5, $6, $7)`,
    [
      t.id,
      t.property_id,
      servedOn,
      str(flags.method) || 'email',
      effective,
      `Rent increased to ${rentText(newRent, t.rent_period)}, ${noticeDays} days notice given.`,
      manager?.id ?? null,
    ],
  );
  return {
    text:
      `Rent review recorded for ${t.tenancy_ref}  ${t.address_line}.\n` +
      `  ${rentText(t.rent_cents, t.rent_period)} becomes ${rentText(newRent, t.rent_period)} on ${effective}.\n` +
      `  Notice served ${servedOn}, ${noticeDays} days of notice.\n` +
      '  The rent on the tenancy changes when the increase takes effect. Run `rent-review <tenancy>` to see the history.' +
      (problems.length ? `\n  FORCED past: ${problems.join(' ')}` : ''),
    json: row,
  };
}

async function cmdRent(db, args, flags) {
  const [verb, ...rest] = args;
  if (!['charge', 'paid', 'credit'].includes(verb)) {
    throw new CliError('rent charge <tenancy> --amount= [--on=], rent paid <tenancy> [--amount=] [--on=], rent credit <tenancy> --amount=');
  }
  const t = await resolve(db, 'tenancy', rest.join(' '));
  const on = parseDate(flags.on) || today();
  const amount = parseMoney(flags.amount) || (verb === 'paid' ? num(t.rent_cents) : 0);
  if (!amount) throw new CliError('Give me an amount: --amount=680');
  const kind = verb === 'paid' ? 'payment' : verb === 'credit' ? 'credit' : 'charge';
  const [row] = await db.query(
    `insert into rent_ledger (tenancy_id, entry_on, kind, amount_cents, method, reference, note)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [t.id, on, kind, amount, str(flags.method) || (kind === 'payment' ? 'automatic payment' : null), str(flags.reference) || t.tenancy_ref, str(flags.note)],
  );
  const [a] = await db.query('select * from v_arrears where tenancy_id = $1', [t.id]);
  return {
    text:
      `${kind === 'payment' ? 'Receipt' : kind === 'credit' ? 'Credit' : 'Charge'} of ${price(amount)} recorded on ${t.tenancy_ref} for ${on}.\n` +
      (a ? `  ${money(a.arrears_cents)} still owing, ${a.days_behind} days behind.` : '  Rent is up to date.') +
      '\n  This is a record. The money itself moves in the trust account, in the system that holds it.',
    json: row,
  };
}

// ---------------------------------------------------------------------------
// Inspections

async function cmdInspectionsDue(db, args, flags) {
  const where = [];
  const params = [];
  if (flags.manager && flags.manager !== true) {
    const m = await resolve(db, 'manager', flags.manager);
    params.push(m.full_name);
    where.push(`manager = $${params.length}`);
  }
  if (flags.overdue) where.push('days_overdue > 0');
  const rows = await db.query(
    `select * from v_inspections_due ${where.length ? 'where ' + where.join(' and ') : ''} order by days_overdue desc`,
    params,
  );
  const overdue = rows.filter((r) => num(r.days_overdue) > 0);
  const lines = [
    heading(`Inspections due (${rows.length}, ${overdue.length} already overdue)`),
    table(rows, [
      { key: 'property_ref', label: 'Ref' },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'suburb', label: 'Suburb', width: 13 },
      { key: 'tenants', label: 'Tenants', width: 24 },
      { key: 'last_inspection_on', label: 'Last done', format: (v) => (v ? isoDate(v) : 'NEVER') },
      { key: 'due_on', label: 'Due', format: (v) => isoDate(v) },
      { key: 'days_overdue', label: 'Overdue', align: 'right', format: (v) => (num(v) > 0 ? `${v}d` : `in ${-num(v)}d`) },
      { key: 'scheduled_on', label: 'Booked', format: (v) => (v ? isoDate(v) : '') },
      { key: 'notice_days', label: 'Notice', align: 'right', format: (v, r) => (r.scheduled_on ? (v === null ? 'NONE' : `${v}d`) : '') },
      { key: 'manager', label: 'Manager', width: 13 },
    ]),
    '',
    '  Entry for a routine inspection needs at least 48 hours written notice and no more than 14 days, once every',
    '  four weeks at most, between 8am and 7pm (RTA 1986 s 48(2) and (3)). Anything showing NONE has no notice on file.',
    '  Book one with: inspection schedule <property> --on=YYYY-MM-DD',
  ];
  return { text: lines.join('\n'), json: rows };
}

async function cmdInspections(db, args, flags) {
  const params = [];
  const where = [];
  if (!flags.all) where.push('(i.completed_on is null or i.completed_on >= current_date - 180)');
  if (flags.property && flags.property !== true) {
    const p = await resolve(db, 'property', flags.property);
    params.push(p.id);
    where.push(`i.property_id = $${params.length}`);
  }
  if (flags.unsent) where.push('i.completed_on is not null and i.report_sent_on is null');
  const rows = await db.query(
    `select i.*, p.ref as property_ref, p.address_line as property, coalesce(p.suburb, '') as suburb,
            coalesce(m.full_name, 'unassigned') as manager,
            (select count(*) from inspection_items ii where ii.inspection_id = i.id) as items,
            (select count(*) from inspection_items ii where ii.inspection_id = i.id and ii.action_required) as actions
     from inspections i
     join properties p on p.id = i.property_id
     left join managers m on m.id = i.manager_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by coalesce(i.completed_on, i.scheduled_on) desc`,
    params,
  );
  const text =
    heading(`Inspections (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'property_ref', label: 'Ref' },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'kind', label: 'Kind', width: 14 },
      { key: 'scheduled_on', label: 'Booked', format: (v) => isoDate(v) },
      { key: 'completed_on', label: 'Done', format: (v) => isoDate(v) },
      { key: 'overall', label: 'Overall', width: 8 },
      { key: 'items', label: 'Items', align: 'right' },
      { key: 'actions', label: 'Actions', align: 'right' },
      { key: 'report_sent_on', label: 'Report', format: (v, r) => (v ? isoDate(v) : r.completed_on ? 'NOT SENT' : '') },
      { key: 'manager', label: 'Manager', width: 13 },
    ]);
  return { text, json: rows };
}

const INSPECTION_VERBS = new Set(['schedule', 'notice', 'complete', 'item', 'report']);

async function cmdInspection(db, args, flags) {
  const [verb, ...rest] = args;
  if (!verb) throw new CliError('inspection schedule|notice|complete|item|report <...>, or `inspections` for the list.');
  if (!INSPECTION_VERBS.has(verb)) return cmdInspectionShow(db, await resolve(db, 'inspection', args.join(' ')));

  if (verb === 'schedule') {
    const p = await resolve(db, 'property', rest.join(' '));
    const on = parseDate(flags.on);
    if (!on) throw new CliError('When: inspection schedule <property> --on=YYYY-MM-DD');
    const kind = str(flags.kind) || 'routine';
    const manager = await whoIs(db, flags);
    const [tenancy] = await db.query(
      "select id from tenancies where property_id = $1 and status in ('active', 'notice given') limit 1",
      [p.id],
    );
    const [row] = await db.query(
      `insert into inspections (property_id, tenancy_id, kind, scheduled_on, manager_id, next_due_on)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [p.id, tenancy?.id ?? null, kind, on, manager?.id ?? null, addDays(on, p.inspection_cycle_days)],
    );
    const noticeBy = addDays(on, -2);
    return {
      text:
        `${kind} inspection booked at ${p.ref} ${p.address_line} for ${on}.\n` +
        `  The entry notice has to be with the tenant by ${noticeBy} at the latest (48 hours, RTA 1986 s 48(3)).\n` +
        `  Record it with: inspection notice ${short(row.id)} --on=${today()}`,
      json: row,
    };
  }

  if (verb === 'notice') {
    const i = await resolve(db, 'inspection', rest.join(' '));
    const on = parseDate(flags.on) || today();
    const [row] = await db.query('update inspections set notice_served_on = $2 where id = $1 returning *', [i.id, on]);
    const days = i.scheduled_on ? Math.round((new Date(isoDate(i.scheduled_on)) - new Date(on)) / 86400000) : null;
    const manager = await whoIs(db, flags);
    await db.query(
      `insert into notices (tenancy_id, property_id, kind, served_on, method, effective_on, detail, served_by)
       values ($1, $2, 'entry notice', $3, $4, $5, $6, $7)`,
      [i.tenancy_id, i.property_id, on, str(flags.method) || 'email', i.scheduled_on, `Entry notice for the ${i.kind} inspection.`, manager?.id ?? null],
    );
    return {
      text:
        `Entry notice recorded for ${i.address_line} on ${on}.` +
        (days === null
          ? ''
          : days < 2
            ? `\n  WARNING: that is ${days} day of notice. The Act wants at least 48 hours (RTA 1986 s 48(3)). Move the inspection.`
            : `\n  ${days} days before the inspection. Inside the 48 hour floor and the 14 day ceiling.`),
      json: row,
    };
  }

  if (verb === 'complete') {
    const i = await resolve(db, 'inspection', rest.join(' '));
    const on = parseDate(flags.on) || today();
    const [p] = await db.query('select * from properties where id = $1', [i.property_id]);
    const [row] = await db.query(
      `update inspections set completed_on = $2, overall = coalesce($3, overall), summary = coalesce($4, summary),
              next_due_on = $5 where id = $1 returning *`,
      [i.id, on, str(flags.overall) || null, str(flags.summary) || null, addDays(on, p.inspection_cycle_days)],
    );
    const items = await db.query('select * from inspection_items where inspection_id = $1 order by area', [i.id]);
    const actions = items.filter((x) => x.action_required);
    return {
      text:
        `Inspection completed at ${i.address_line} on ${on}${row.overall ? `, overall ${row.overall}` : ''}.\n` +
        `  ${items.length} items recorded, ${actions.length} needing action.\n` +
        `  Next routine inspection due ${isoDate(row.next_due_on)}.\n` +
        '  The owner has not been sent anything yet. Run `npm run docs -- inspection-report` and then `inspection report ' +
        short(i.id) +
        '`.',
      json: { inspection: row, items },
    };
  }

  if (verb === 'report') {
    const i = await resolve(db, 'inspection', rest.join(' '));
    const on = parseDate(flags.on) || today();
    const [row] = await db.query('update inspections set report_sent_on = $2 where id = $1 returning *', [i.id, on]);
    return { text: `Inspection report for ${i.address_line} marked sent to the owner on ${on}.`, json: row };
  }

  // item
  const [ref, area, ...noteParts] = rest;
  const i = await resolve(db, 'inspection', ref);
  if (!area) throw new CliError('inspection item <inspection> "<area>" "<what you saw>" [--condition=good|fair|poor|"action required"] [--action]');
  const [row] = await db.query(
    `insert into inspection_items (inspection_id, area, condition, note, action_required)
     values ($1, $2, $3, $4, $5) returning *`,
    [i.id, area, str(flags.condition) || (flags.action ? 'action required' : 'good'), noteParts.join(' '), Boolean(flags.action)],
  );
  const actionNote = row.action_required && row.condition !== 'action required' ? ', action required' : '';
  return { text: `Recorded at ${i.address_line}: ${area}, ${row.condition}${actionNote}.`, json: row };
}

async function cmdInspectionShow(db, i) {
  const items = await db.query('select * from inspection_items where inspection_id = $1 order by area', [i.id]);
  const lines = [
    heading(`${i.kind} inspection  ${i.property_ref}  ${i.address_line}`),
    `  Booked       ${isoDate(i.scheduled_on) || 'not booked'}`,
    `  Entry notice ${isoDate(i.notice_served_on) || 'NOT SERVED'}`,
    `  Completed    ${isoDate(i.completed_on) || 'not yet'}`,
    `  Overall      ${i.overall || ''}`,
    `  Report sent  ${isoDate(i.report_sent_on) || 'NOT SENT'}`,
    `  Next due     ${isoDate(i.next_due_on) || ''}`,
    `  Summary      ${i.summary || ''}`,
    '',
    table(items, [
      { key: 'area', label: 'Area', width: 18 },
      { key: 'condition', label: 'Condition', width: 16 },
      { key: 'action_required', label: 'Action', format: (v) => (v ? 'yes' : '') },
      { key: 'note', label: 'What was seen', width: 84, format: (v) => truncate(v, 84) },
    ]),
  ];
  return { text: lines.join('\n'), json: { inspection: i, items } };
}

// ---------------------------------------------------------------------------
// Maintenance and contractor jobs

async function cmdMaintenance(db, args, flags) {
  const [verb, ...rest] = args;
  const VERBS = new Set(['new', 'ask', 'approve', 'decline', 'complete']);
  if (verb && VERBS.has(verb)) return cmdMaintenanceWrite(db, verb, rest, flags);
  if (verb) return cmdMaintenanceShow(db, await resolve(db, 'maintenance', args.join(' ')));

  const where = [];
  const params = [];
  if (flags.priority && flags.priority !== true) {
    params.push(String(flags.priority));
    where.push(`priority = $${params.length}`);
  }
  if (flags.manager && flags.manager !== true) {
    const m = await resolve(db, 'manager', flags.manager);
    params.push(m.full_name);
    where.push(`manager = $${params.length}`);
  }
  if (flags.urgent) where.push("(priority = 'urgent' or habitability)");
  const rows = flags.all
    ? await db.query(
        `select mr.id as maintenance_id, coalesce(mr.job_ref, '') as job_ref, p.ref as property_ref, p.address_line as property,
                mr.reported_on, (current_date - mr.reported_on) as days_open, mr.category, mr.priority, mr.summary, mr.status,
                mr.habitability, coalesce(m.full_name, 'unassigned') as manager
         from maintenance_requests mr join properties p on p.id = mr.property_id
         left join managers m on m.id = mr.manager_id order by mr.reported_on desc`,
      )
    : await db.query(
        `select * from v_maintenance_open ${where.length ? 'where ' + where.join(' and ') : ''}
         order by case priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end, days_open desc`,
        params,
      );
  const waiting = rows.filter((r) => num(r.days_waiting_on_owner) > 0).length;
  const text =
    heading(`Maintenance ${flags.all ? '(everything)' : 'open'} (${rows.length}${waiting ? `, ${waiting} waiting on an owner` : ''})`) +
    '\n' +
    table(rows, [
      { key: 'job_ref', label: 'Ref' },
      { key: 'property', label: 'Property', width: 24 },
      { key: 'priority', label: 'Priority', width: 8 },
      { key: 'category', label: 'Category', width: 11 },
      { key: 'summary', label: 'What', width: 46, format: (v) => truncate(v, 46) },
      { key: 'status', label: 'Status', width: 22 },
      { key: 'days_open', label: 'Days', align: 'right' },
      { key: 'days_waiting_on_owner', label: 'Owner', align: 'right', format: (v) => (v === null || v === undefined ? '' : `${v}d`) },
      { key: 'contractor', label: 'Contractor', width: 22 },
      { key: 'quoted_cents', label: 'Quoted', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    ]);
  return { text, json: rows };
}

async function cmdMaintenanceWrite(db, verb, args, flags) {
  const manager = await whoIs(db, flags);
  if (verb === 'new') {
    const [propertyRef, ...summaryParts] = args;
    const p = await resolve(db, 'property', propertyRef);
    const summary = summaryParts.join(' ');
    if (!summary) throw new CliError('maintenance new <property> "<what is wrong>" [--priority=urgent|high|normal|low] [--category=]');
    const [tenancy] = await db.query(
      "select id from tenancies where property_id = $1 and status in ('active', 'notice given') limit 1",
      [p.id],
    );
    const [{ next }] = await db.query(
      "select 'MNT-' || (3000 + count(*) + 1)::text as next from maintenance_requests",
    );
    const [row] = await db.query(
      `insert into maintenance_requests (job_ref, property_id, tenancy_id, reported_on, reported_by, category, priority,
                                         summary, detail, status, habitability, owner_approval_required, manager_id, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11, $12, $13) returning *`,
      [
        next, p.id, tenancy?.id ?? null, parseDate(flags.on) || today(), str(flags['reported-by']) || 'tenant',
        str(flags.category) || 'general', str(flags.priority) || 'normal', summary, str(flags.detail),
        Boolean(flags.habitability), flags['no-approval'] ? false : true, manager?.id ?? null, str(flags.note),
      ],
    );
    return {
      text:
        `${row.job_ref} raised at ${p.ref} ${p.address_line}: ${summary}\n` +
        `  Priority ${row.priority}${row.habitability ? ', habitability' : ''}. ${row.owner_approval_required ? `The owner (${p.owner_name}) has to approve it.` : 'No owner approval needed.'}\n` +
        `  Next: maintenance ask ${row.job_ref} --quote=  then  job issue ${row.job_ref} "<contractor>"`,
      json: row,
    };
  }

  const m = await resolve(db, 'maintenance', args.join(' '));
  const on = parseDate(flags.on) || today();
  if (verb === 'ask') {
    const quote = parseMoney(flags.quote);
    const [row] = await db.query(
      `update maintenance_requests set owner_asked_on = $2, status = 'awaiting owner approval',
              approval_limit_cents = case when $3 > 0 then $3 else approval_limit_cents end
       where id = $1 returning *`,
      [m.id, on, quote],
    );
    return { text: `${m.job_ref || short(m.id)} sent to the owner on ${on}${quote ? ` with a quote of ${money(quote)}` : ''}. Nothing has been sent by this system; write to them yourself.`, json: row };
  }
  if (verb === 'approve') {
    const [row] = await db.query(
      `update maintenance_requests set owner_approved_on = $2, status = 'approved',
              approval_limit_cents = case when $3 > 0 then $3 else approval_limit_cents end
       where id = $1 returning *`,
      [m.id, on, parseMoney(flags.limit)],
    );
    return { text: `${m.job_ref || short(m.id)} approved by the owner on ${on}. Send someone: job issue ${m.job_ref || short(m.id)} "<contractor>"`, json: row };
  }
  if (verb === 'decline') {
    const [row] = await db.query(
      "update maintenance_requests set status = 'declined', closed_on = $2, note = coalesce($3, note) where id = $1 returning *",
      [m.id, on, args.length > 1 ? args.slice(1).join(' ') : str(flags.note) || null],
    );
    return { text: `${m.job_ref || short(m.id)} declined by the owner on ${on}. Tell the tenant why.`, json: row };
  }
  // complete
  const [row] = await db.query(
    "update maintenance_requests set status = 'completed', completed_on = $2, closed_on = $2 where id = $1 returning *",
    [m.id, on],
  );
  return { text: `${m.job_ref || short(m.id)} completed on ${on} at ${m.address_line}.`, json: row };
}

async function cmdMaintenanceShow(db, m) {
  const jobs = await db.query(
    `select j.*, c.name as contractor_name, c.trade, c.phone from contractor_jobs j
     left join contractors c on c.id = j.contractor_id where j.maintenance_id = $1 order by j.issued_on`,
    [m.id],
  );
  const [p] = await db.query('select p.*, o.name as owner_name from properties p join owners o on o.id = p.owner_id where p.id = $1', [m.property_id]);
  const lines = [
    heading(`${m.job_ref || short(m.id)}  ${p.ref}  ${p.address_line}`),
    `  Reported     ${isoDate(m.reported_on)} by the ${m.reported_by}, ${Math.round((Date.now() - new Date(isoDate(m.reported_on))) / 86400000)} days ago`,
    `  What         ${m.summary}`,
    `  Detail       ${m.detail || ''}`,
    `  Category     ${m.category}, priority ${m.priority}${m.habitability ? ', HABITABILITY' : ''}`,
    `  Status       ${m.status}`,
    `  Owner        ${p.owner_name}${m.owner_approval_required ? '' : ' (no approval needed)'}`,
    `  Asked        ${isoDate(m.owner_asked_on) || 'not asked'}`,
    `  Approved     ${isoDate(m.owner_approved_on) || 'not approved'}${num(m.approval_limit_cents) ? ` up to ${money(m.approval_limit_cents)}` : ''}`,
    `  Completed    ${isoDate(m.completed_on) || 'not yet'}`,
    `  Note         ${m.note || ''}`,
    '',
    table(jobs, [
      { key: 'job_no', label: 'Job' },
      { key: 'contractor_name', label: 'Contractor', width: 24 },
      { key: 'trade', label: 'Trade', width: 11 },
      { key: 'issued_on', label: 'Issued', format: (v) => isoDate(v) },
      { key: 'scheduled_on', label: 'Booked', format: (v) => isoDate(v) },
      { key: 'completed_on', label: 'Done', format: (v) => isoDate(v) },
      { key: 'quoted_cents', label: 'Quoted', align: 'right', format: (v) => (num(v) ? price(v) : '') },
      { key: 'invoiced_cents', label: 'Invoiced', align: 'right', format: (v) => (num(v) ? price(v) : '') },
      { key: 'status', label: 'Status', width: 10 },
    ]),
  ];
  return { text: lines.join('\n'), json: { maintenance: m, jobs, property: p } };
}

async function cmdJobs(db, args, flags) {
  const where = flags.all ? '' : "where j.completed_on is null or j.invoiced_on is null";
  const rows = await db.query(
    `select j.job_no, coalesce(c.name, 'unassigned') as contractor, c.trade, p.ref as property_ref, p.address_line as property,
            mr.job_ref, mr.summary, j.issued_on, j.scheduled_on, j.completed_on, j.invoiced_on, j.quoted_cents, j.invoiced_cents, j.status
     from contractor_jobs j
     join maintenance_requests mr on mr.id = j.maintenance_id
     join properties p on p.id = mr.property_id
     left join contractors c on c.id = j.contractor_id
     ${where}
     order by j.issued_on desc nulls last`,
  );
  const text =
    heading(`Contractor jobs (${rows.length}${flags.all ? '' : ', open or not yet invoiced'})`) +
    '\n' +
    table(rows, [
      { key: 'job_no', label: 'Job' },
      { key: 'contractor', label: 'Contractor', width: 24 },
      { key: 'property', label: 'Property', width: 24 },
      { key: 'summary', label: 'What', width: 42, format: (v) => truncate(v, 42) },
      { key: 'issued_on', label: 'Issued', format: (v) => isoDate(v) },
      { key: 'scheduled_on', label: 'Booked', format: (v) => isoDate(v) },
      { key: 'completed_on', label: 'Done', format: (v) => isoDate(v) },
      { key: 'quoted_cents', label: 'Quoted', align: 'right', format: (v) => (num(v) ? price(v) : '') },
      { key: 'invoiced_cents', label: 'Invoiced', align: 'right', format: (v, r) => (num(v) ? price(v) : r.completed_on ? 'NO INVOICE' : '') },
      { key: 'status', label: 'Status', width: 10 },
    ]);
  return { text, json: rows };
}

const JOB_VERBS = new Set(['issue', 'book', 'done', 'invoice', 'cancel']);

async function cmdJob(db, args, flags) {
  const [verb, ...rest] = args;
  if (!verb) throw new CliError('job issue|book|done|invoice|cancel <...>, or `jobs` for the list.');
  if (!JOB_VERBS.has(verb)) {
    const j = await resolve(db, 'job', args.join(' '));
    const m = await resolve(db, 'maintenance', j.maintenance_id);
    return cmdMaintenanceShow(db, m);
  }

  if (verb === 'issue') {
    const [mref, ...who] = rest;
    const m = await resolve(db, 'maintenance', mref);
    const c = await resolve(db, 'contractor', who.join(' ') || flags.contractor);
    if (m.owner_approval_required && !m.owner_approved_on && !flags.force) {
      throw new CliError(
        `${m.job_ref || short(m.id)} has not been approved by the owner. Ask first (maintenance ask ${m.job_ref}),\n` +
          '  or pass --force if this is urgent work you are entitled to order without approval.',
      );
    }
    const [{ next }] = await db.query("select 'JOB-' || (4000 + count(*) + 1)::text as next from contractor_jobs");
    const [row] = await db.query(
      `insert into contractor_jobs (job_no, maintenance_id, contractor_id, issued_on, scheduled_on, quoted_cents, status, note)
       values ($1, $2, $3, $4, $5, $6, 'issued', $7) returning *`,
      [next, m.id, c.id, parseDate(flags.on) || today(), parseDate(flags.scheduled), parseMoney(flags.quote), str(flags.note)],
    );
    await db.query("update maintenance_requests set status = 'scheduled' where id = $1", [m.id]);
    return {
      text:
        `${row.job_no} issued to ${c.name} (${c.trade}${c.phone ? `, ${c.phone}` : ''}) for ${m.job_ref || short(m.id)} at ${m.address_line}.\n` +
        `  ${m.summary}\n` +
        (row.scheduled_on ? `  Booked for ${isoDate(row.scheduled_on)}.` : '  No date booked yet: job book ' + row.job_no + ' --on=YYYY-MM-DD') +
        '\n  Nothing has been emailed. Send the work order yourself.',
      json: row,
    };
  }

  const j = await resolve(db, 'job', rest.join(' '));
  const on = parseDate(flags.on) || today();
  if (verb === 'book') {
    const [row] = await db.query("update contractor_jobs set scheduled_on = $2, status = 'scheduled' where id = $1 returning *", [j.id, on]);
    return { text: `${j.job_no} booked for ${on} at ${j.address_line}. Tell the tenant: they need 24 hours notice for a repair visit.`, json: row };
  }
  if (verb === 'done') {
    const [row] = await db.query("update contractor_jobs set completed_on = $2, status = 'done' where id = $1 returning *", [j.id, on]);
    if (flags.complete) await db.query("update maintenance_requests set status = 'completed', completed_on = $2, closed_on = $2 where id = $1", [j.maintenance_id, on]);
    return { text: `${j.job_no} finished ${on}. Waiting on the invoice.${flags.complete ? ' The maintenance request is closed.' : ''}`, json: row };
  }
  if (verb === 'invoice') {
    const amount = parseMoney(flags.amount);
    if (!amount) throw new CliError('job invoice <job> --amount=385.50 [--ref=INV-1234]');
    const [row] = await db.query(
      "update contractor_jobs set invoiced_cents = $2, invoiced_on = $3, invoice_ref = $4, status = 'invoiced' where id = $1 returning *",
      [j.id, amount, on, str(flags.ref) || null],
    );
    const over = num(j.quoted_cents) && amount > num(j.quoted_cents) * 1.1;
    return {
      text:
        `${j.job_no} invoiced ${price(amount)} on ${on}${row.invoice_ref ? ` (${row.invoice_ref})` : ''}.` +
        (over ? `\n  That is more than ten percent over the ${price(j.quoted_cents)} quote. Check it before it goes on the owner statement.` : '') +
        '\n  This is a record. The invoice itself gets paid in the system that holds the trust account.',
      json: row,
    };
  }
  const [row] = await db.query("update contractor_jobs set status = 'cancelled' where id = $1 returning *", [j.id]);
  return { text: `${j.job_no} cancelled.`, json: row };
}

async function cmdContractors(db, args, flags) {
  const rows = await db.query(
    `select c.*, (select count(*) from contractor_jobs j where j.contractor_id = c.id) as jobs,
            (select count(*) from contractor_jobs j where j.contractor_id = c.id and j.completed_on is null) as open_jobs,
            (select coalesce(sum(j.invoiced_cents), 0) from contractor_jobs j where j.contractor_id = c.id and j.invoiced_on >= current_date - 365) as spend_12m
     from contractors c ${flags.all ? '' : 'where c.active'} order by c.trade, c.name`,
  );
  const text =
    heading(`Contractors (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'name', label: 'Contractor', width: 26 },
      { key: 'trade', label: 'Trade', width: 12 },
      { key: 'contact_name', label: 'Contact', width: 16 },
      { key: 'phone', label: 'Phone', width: 14 },
      { key: 'licence_ref', label: 'Licence', width: 14 },
      { key: 'insurance_expires_on', label: 'Insurance', format: (v) => (v && new Date(v) < new Date() ? `EXPIRED ${isoDate(v)}` : isoDate(v)) },
      { key: 'open_jobs', label: 'Open', align: 'right' },
      { key: 'spend_12m', label: 'Spend 12m', align: 'right', format: (v) => money(v) },
      { key: 'preferred', label: 'Preferred', format: (v) => (v ? 'yes' : '') },
    ]);
  return { text, json: rows };
}

// ---------------------------------------------------------------------------
// Notices, vacates, renewals

const NOTICE_KINDS = [
  'rent increase', 'notice of overdue rent', '14 day notice to remedy', 'termination 90 day',
  'termination 42 day', 'tenant notice 21 day', 'entry notice', 'breach notice', 'end of fixed term',
];

const NOTICE_MIN_DAYS = {
  'rent increase': 60,
  'termination 90 day': 90,
  'termination 42 day': 42,
  'tenant notice 21 day': 21,
  'entry notice': 2,
  '14 day notice to remedy': 14,
};

async function cmdNotices(db, args, flags) {
  const params = [];
  const where = [];
  if (!flags.all) where.push('n.served_on >= current_date - 365');
  if (flags.tenancy && flags.tenancy !== true) {
    const t = await resolve(db, 'tenancy', flags.tenancy);
    params.push(t.id);
    where.push(`n.tenancy_id = $${params.length}`);
  }
  if (flags.kind && flags.kind !== true) {
    params.push(String(flags.kind));
    where.push(`n.kind = $${params.length}`);
  }
  const rows = await db.query(
    `select n.*, t.tenancy_ref, p.ref as property_ref, p.address_line as property, coalesce(m.full_name, '') as served_by_name,
            case when n.effective_on is null then null else (n.effective_on - n.served_on) end as notice_days
     from notices n
     left join tenancies t on t.id = n.tenancy_id
     left join properties p on p.id = n.property_id
     left join managers m on m.id = n.served_by
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by n.served_on desc`,
    params,
  );
  for (const r of rows) {
    const min = NOTICE_MIN_DAYS[r.kind];
    r.short_notice = min !== undefined && r.notice_days !== null && num(r.notice_days) < min;
  }
  const short_ = rows.filter((r) => r.short_notice).length;
  const text =
    heading(`Notices (${rows.length}${short_ ? `, ${short_} served with less notice than the Act requires` : ''})`) +
    '\n' +
    table(rows, [
      { key: 'served_on', label: 'Served', format: (v) => isoDate(v) },
      { key: 'kind', label: 'Notice', width: 24 },
      { key: 'tenancy_ref', label: 'Tenancy' },
      { key: 'property', label: 'Property', width: 24 },
      { key: 'method', label: 'How', width: 7 },
      { key: 'effective_on', label: 'Effective', format: (v) => (v ? isoDate(v) : '') },
      { key: 'notice_days', label: 'Days', align: 'right', format: (v, r) => (v === null ? '' : `${v}${r.short_notice ? ' SHORT' : ''}`) },
      { key: 'detail', label: 'Detail', width: 52, format: (v) => truncate(v, 52) },
    ]);
  return { text, json: rows };
}

async function cmdNotice(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb !== 'serve') throw new CliError(`notice serve <tenancy> "<kind>" [--effective=] [--on=] [--method=]\n  Kinds: ${NOTICE_KINDS.join(', ')}`);
  const [ref, ...kindParts] = rest;
  const t = await resolve(db, 'tenancy', ref);
  const kind = (kindParts.join(' ') || str(flags.kind)).trim();
  if (!kind) throw new CliError(`Which notice? ${NOTICE_KINDS.join(', ')}`);
  if (!NOTICE_KINDS.includes(kind)) throw new CliError(`"${kind}" is not one of: ${NOTICE_KINDS.join(', ')}`);
  const on = parseDate(flags.on) || today();
  const min = NOTICE_MIN_DAYS[kind];
  const effective = parseDate(flags.effective) || (min ? addDays(on, min) : null);
  const days = effective ? Math.round((new Date(effective) - new Date(on)) / 86400000) : null;
  if (min !== undefined && days !== null && days < min && !flags.force) {
    throw new CliError(
      `A "${kind}" needs at least ${min} days. This one gives ${days}.\n` +
        `  The earliest compliant effective date is ${addDays(on, min)}.\n` +
        '  Re-run with --force only if you know why the rule does not apply here.',
    );
  }
  const manager = await whoIs(db, flags);
  const [row] = await db.query(
    `insert into notices (tenancy_id, property_id, kind, served_on, method, effective_on, detail, served_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [t.id, t.property_id, kind, on, str(flags.method) || 'email', effective, str(flags.detail), manager?.id ?? null],
  );
  if (kind === 'termination 90 day' || kind === 'termination 42 day' || kind === 'tenant notice 21 day') {
    await db.query(
      `update tenancies set status = 'notice given', vacate_notice_on = $2, vacate_on = $3,
              vacate_notice_by = $4, vacate_reason = coalesce($5, vacate_reason) where id = $1`,
      [t.id, on, effective, kind === 'tenant notice 21 day' ? 'tenant' : 'landlord', str(flags.reason) || null],
    );
  }
  return {
    text:
      `${kind} served on ${t.tenancy_ref} ${t.address_line} on ${on} by ${row.method}.\n` +
      (effective ? `  Takes effect ${effective}, ${days} days of notice.\n` : '') +
      (kind.startsWith('termination') || kind === 'tenant notice 21 day'
        ? `  The tenancy is now marked "notice given" with a vacate date of ${effective}. Book the exit inspection.\n`
        : '') +
      '  Nothing has been sent. Serve the notice the way the tenancy agreement allows and keep the proof.',
    json: row,
  };
}

async function cmdVacates(db) {
  const rows = await db.query("select * from v_lease_events where kind = 'vacate' order by days_away");
  const lines = [
    heading(`Vacates (${rows.length})`),
    table(rows, [
      { key: 'tenancy_ref', label: 'Tenancy' },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'tenants', label: 'Tenants', width: 26 },
      { key: 'owner', label: 'Owner', width: 22 },
      { key: 'event_on', label: 'Out on', format: (v) => isoDate(v) },
      { key: 'days_away', label: 'Days', align: 'right' },
      { key: 'rent_cents', label: 'Rent', align: 'right', format: (v) => money(v) },
      { key: 'detail', label: 'Where it is at', width: 70, format: (v) => truncate(v, 70) },
    ]),
  ];
  if (rows.length) {
    lines.push(
      '',
      '  For each one: book the exit inspection, tell the owner, get the property back on the market, and start the bond',
      '  refund. A bond refund needs both signatures or a Tribunal order (RTA 1986 s 22).',
    );
  }
  return { text: lines.join('\n'), json: rows };
}

async function cmdRenewals(db) {
  const rows = await db.query("select * from v_lease_events where kind = 'fixed term ending' order by days_away");
  const lines = [
    heading(`Fixed terms ending (${rows.length})`),
    table(rows, [
      { key: 'tenancy_ref', label: 'Tenancy' },
      { key: 'property', label: 'Property', width: 26 },
      { key: 'tenants', label: 'Tenants', width: 26 },
      { key: 'owner', label: 'Owner', width: 22 },
      { key: 'event_on', label: 'Ends', format: (v) => isoDate(v) },
      { key: 'days_away', label: 'Days', align: 'right' },
      { key: 'rent_cents', label: 'Rent', align: 'right', format: (v) => money(v) },
      { key: 'market_rent_cents', label: 'Market', align: 'right', format: (v) => money(v) },
      { key: 'detail', label: 'Where it is at', width: 60, format: (v) => truncate(v, 60) },
    ]),
  ];
  if (rows.length) {
    lines.push(
      '',
      '  A fixed term that nobody acts on rolls into a periodic tenancy on the same rent (RTA 1986 s 60A). If the owner',
      '  wants it to end, notice has to be given between 90 and 21 days before the end date. If they want a new term or',
      '  a new rent, ask the tenant now: a rent increase still needs sixty days notice and twelve months since the last one.',
      '  Record where the conversation got to: tenancy renewal <tenancy> --stage="agreed" --note="..."',
    );
  }
  return { text: lines.join('\n'), json: rows };
}

async function cmdRenewalStage(db, args, flags) {
  const t = await resolve(db, 'tenancy', args.join(' '));
  const stage = str(flags.stage);
  const allowed = ['not started', 'owner asked', 'tenant asked', 'agreed', 'documented', 'ending'];
  if (!allowed.includes(stage)) throw new CliError(`--stage must be one of: ${allowed.join(', ')}`);
  const [row] = await db.query(
    'update tenancies set renewal_stage = $2, renewal_note = coalesce($3, renewal_note) where id = $1 returning *',
    [t.id, stage, str(flags.note) || null],
  );
  return { text: `${t.tenancy_ref} renewal is now at "${stage}".${row.renewal_note ? ` ${row.renewal_note}` : ''}`, json: row };
}

// ---------------------------------------------------------------------------
// Compliance items and the rule check

async function cmdComplianceItems(db, args, flags) {
  const params = [];
  const where = [];
  if (flags.property && flags.property !== true) {
    const p = await resolve(db, 'property', flags.property);
    params.push(p.id);
    where.push(`property_id = $${params.length}`);
  }
  if (!flags.all) where.push("status <> 'compliant'");
  if (flags.kind && flags.kind !== true) {
    params.push(`%${flags.kind}%`);
    where.push(`kind ilike $${params.length}`);
  }
  const rows = await db.query(
    `select * from v_compliance_due ${where.length ? 'where ' + where.join(' and ') : ''}
     order by case status when 'not compliant' then 1 when 'unknown' then 2 when 'exempt' then 3 else 4 end, days_overdue desc nulls last`,
    params,
  );
  const bad = rows.filter((r) => r.status === 'not compliant').length;
  const lines = [
    heading(`Compliance items (${rows.length}${bad ? `, ${bad} not compliant` : ''})`),
    table(rows, [
      { key: 'property_ref', label: 'Ref' },
      { key: 'property', label: 'Property', width: 24 },
      { key: 'tenants', label: 'Tenants', width: 22 },
      { key: 'kind', label: 'Item', width: 34 },
      { key: 'status', label: 'Status', width: 14 },
      { key: 'assessed_on', label: 'Assessed', format: (v) => isoDate(v) },
      { key: 'due_on', label: 'Due', format: (v) => isoDate(v) },
      { key: 'days_overdue', label: 'Overdue', align: 'right', format: (v) => (num(v) > 0 ? `${v}d` : '') },
      { key: 'note', label: 'Note', width: 58, format: (v) => truncate(v, 58) },
    ]),
    '',
    '  Every private rental has had to meet the healthy homes standards since 1 July 2025',
    '  (Residential Tenancies (Healthy Homes Standards) Regulations 2019). Close one out with:',
    '  compliance-item done <property> "<item>" [--evidence=INV-1234]',
  ];
  return { text: lines.join('\n'), json: rows };
}

async function cmdComplianceItem(db, args, flags) {
  const [verb, propertyRef, ...kindParts] = args;
  if (verb !== 'done' && verb !== 'fail' && verb !== 'exempt') {
    throw new CliError('compliance-item done|fail|exempt <property> "<item>" [--on=] [--evidence=] [--note=]');
  }
  const p = await resolve(db, 'property', propertyRef);
  const kind = kindParts.join(' ').trim();
  if (!kind) throw new CliError('Which item? Run `compliance-items --property=<ref> --all` to see them.');
  const matches = await db.query('select * from compliance_items where property_id = $1 and kind ilike $2', [p.id, `%${kind}%`]);
  if (!matches.length) throw new CliError(`No compliance item on ${p.ref} matches "${kind}".`);
  if (matches.length > 1) {
    throw new CliError(`"${kind}" matches ${matches.length} items on ${p.ref}:\n` + matches.map((m) => `  ${m.kind} (${m.status})`).join('\n'));
  }
  const on = parseDate(flags.on) || today();
  const status = verb === 'done' ? 'compliant' : verb === 'exempt' ? 'exempt' : 'not compliant';
  const [row] = await db.query(
    `update compliance_items set status = $2, assessed_on = $3, done_on = $4,
            evidence_ref = coalesce($5, evidence_ref), note = coalesce($6, note)
     where id = $1 returning *`,
    [matches[0].id, status, on, verb === 'done' ? on : null, str(flags.evidence) || null, str(flags.note) || null],
  );
  return { text: `${p.ref} ${row.kind} is now "${status}" as at ${on}${row.evidence_ref ? ` (${row.evidence_ref})` : ''}.`, json: row };
}

// The rules in docs/compliance.md, run against the data.
const COMPLIANCE_RULES = [
  {
    key: 'bond-lodgement',
    title: 'Lodge the bond within 23 working days of taking it',
    source: 'Residential Tenancies Act 1986, s 19(1)(a); tenancy.govt.nz, lodging a bond',
    sql: `select t.tenancy_ref as record, p.address_line as subject,
                 working_days_between(b.received_on, current_date) as days,
                 'Bond of ' || to_char(b.amount_cents / 100.0, 'FM$999,990') || ' taken ' || to_char(b.received_on, 'DD Mon') ||
                 ' and never lodged' as detail
          from bonds b
          join tenancies t on t.id = b.tenancy_id
          join properties p on p.id = t.property_id
          where b.lodged_on is null and b.received_on is not null and b.amount_cents > 0
            and working_days_between(b.received_on, current_date) > 23
          order by days desc`,
  },
  {
    key: 'bond-cap',
    title: 'A bond can be no more than four weeks rent',
    source: 'Residential Tenancies Act 1986, s 18(1)',
    sql: `select t.tenancy_ref as record, p.address_line as subject,
                 0 as days,
                 'Bond is ' || to_char(t.bond_cents / 100.0, 'FM$999,990') || ' against a four week cap of ' ||
                 to_char((t.rent_cents * 7 / case when t.rent_period = 'fortnightly' then 14 else 7 end * 4) / 100.0, 'FM$999,990') as detail
          from tenancies t
          join properties p on p.id = t.property_id
          where t.status in ('active', 'notice given')
            and t.bond_cents > (t.rent_cents * 7 / case when t.rent_period = 'fortnightly' then 14 else 7 end) * 4
          order by t.bond_cents desc`,
  },
  {
    key: 'rent-increase-frequency',
    title: 'Rent can only rise once every twelve months',
    source: 'Residential Tenancies Act 1986, s 24(1A)',
    sql: `select t.tenancy_ref as record, p.address_line as subject,
                 (rs.effective_on - prev.effective_on) as days,
                 'Increase on ' || to_char(rs.effective_on, 'DD Mon YYYY') || ' came ' ||
                 (rs.effective_on - prev.effective_on) || ' days after the one on ' || to_char(prev.effective_on, 'DD Mon YYYY') as detail
          from rent_schedule rs
          join tenancies t on t.id = rs.tenancy_id
          join properties p on p.id = t.property_id
          join lateral (
            select r2.effective_on from rent_schedule r2
            where r2.tenancy_id = rs.tenancy_id and r2.effective_on < rs.effective_on
            order by r2.effective_on desc limit 1
          ) prev on true
          where rs.reason = 'rent review'
            and (rs.effective_on - prev.effective_on) < 365
          order by days`,
  },
  {
    key: 'rent-increase-notice',
    title: 'Sixty days written notice of a rent increase',
    source: 'Residential Tenancies Act 1986, s 24(1)(b)',
    sql: `select t.tenancy_ref as record, p.address_line as subject,
                 (rs.effective_on - rs.notice_served_on) as days,
                 'Notice served ' || to_char(rs.notice_served_on, 'DD Mon YYYY') || ' for an increase on ' ||
                 to_char(rs.effective_on, 'DD Mon YYYY') || ', ' || (rs.effective_on - rs.notice_served_on) || ' days' as detail
          from rent_schedule rs
          join tenancies t on t.id = rs.tenancy_id
          join properties p on p.id = t.property_id
          where rs.reason = 'rent review'
            and rs.notice_served_on is not null
            and (rs.effective_on - rs.notice_served_on) < 60
          order by days`,
  },
  {
    key: 'arrears-process',
    title: 'Follow the arrears steps: notice at five working days, remedy at fourteen, Tribunal at twenty one',
    source: 'Residential Tenancies Act 1986, ss 55(1)(a), 55AA and 56',
    sql: `select a.tenancy_ref as record, a.property as subject, a.days_behind as days,
                 case
                   when a.days_behind >= 21 and a.tribunal_applied_on is null
                     then a.days_behind || ' days behind and no Tribunal application on file'
                   when a.days_behind >= 14 and a.last_remedy_notice_on is null
                     then a.days_behind || ' days behind and no 14 day notice to remedy served'
                   else 'Rent overdue ' || a.working_days_behind || ' working days and no notice of overdue rent served'
                 end as detail
          from v_arrears a
          where (a.days_behind >= 21 and a.tribunal_applied_on is null)
             or (a.days_behind >= 14 and a.last_remedy_notice_on is null)
             or (a.working_days_behind >= 5 and a.last_overdue_notice_on is null)
          order by a.days_behind desc`,
  },
  {
    key: 'inspection-notice',
    title: 'At least 48 hours written notice before entering for an inspection',
    source: 'Residential Tenancies Act 1986, s 48(2) and (3)',
    sql: `select p.ref as record, p.address_line as subject,
                 coalesce(i.scheduled_on - i.notice_served_on, 0) as days,
                 case when i.notice_served_on is null
                      then 'Inspection booked for ' || to_char(i.scheduled_on, 'DD Mon') || ' with no entry notice recorded'
                      else 'Inspection booked for ' || to_char(i.scheduled_on, 'DD Mon') || ' with ' ||
                           (i.scheduled_on - i.notice_served_on) || ' days notice' end as detail
          from inspections i
          join properties p on p.id = i.property_id
          where i.completed_on is null
            and i.scheduled_on is not null
            and i.scheduled_on >= current_date
            and (i.notice_served_on is null or (i.scheduled_on - i.notice_served_on) < 2)
          order by i.scheduled_on`,
  },
  {
    key: 'healthy-homes',
    title: 'Every rental has had to meet the healthy homes standards since 1 July 2025',
    source: 'Residential Tenancies (Healthy Homes Standards) Regulations 2019; RTA 1986 ss 45(1)(bb) and 138A',
    sql: `select p.ref as record, p.address_line as subject,
                 (current_date - date '2025-07-01') as days,
                 ci.kind || ' is "' || ci.status || '": ' || coalesce(ci.note, 'no note on file') as detail
          from compliance_items ci
          join properties p on p.id = ci.property_id
          where ci.kind like 'healthy homes%'
            and ci.status not in ('compliant', 'exempt')
          order by p.ref, ci.kind`,
  },
  {
    key: 'healthy-homes-statement',
    title: 'A signed healthy homes compliance statement in every tenancy agreement',
    source: 'Residential Tenancies Act 1986, s 13A(1A)(b)(ii); Healthy Homes Standards Regulations 2019',
    sql: `select t.tenancy_ref as record, p.address_line as subject,
                 (current_date - t.start_on) as days,
                 'Tenancy started ' || to_char(t.start_on, 'DD Mon YYYY') || ' with no signed healthy homes statement on file' as detail
          from tenancies t
          join properties p on p.id = t.property_id
          where t.status in ('active', 'notice given')
            and not t.healthy_homes_statement
          order by t.start_on`,
  },
  {
    key: 'smoke-alarms',
    title: 'Working smoke alarms, and the insulation statement in the agreement',
    source: 'Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, regs 5 to 10 and reg 21',
    sql: `select p.ref as record, p.address_line as subject,
                 (current_date - coalesce(ci.assessed_on, current_date - 999)) as days,
                 case when ci.status <> 'compliant'
                      then ci.kind || ' is "' || ci.status || '": ' || coalesce(ci.note, '')
                      else 'Smoke alarms last checked ' || to_char(ci.assessed_on, 'DD Mon YYYY') || ', over twelve months ago' end as detail
          from compliance_items ci
          join properties p on p.id = ci.property_id
          where ci.kind in ('smoke alarms', 'insulation statement')
            and (ci.status not in ('compliant', 'exempt')
                 or (ci.kind = 'smoke alarms' and ci.assessed_on < current_date - 365))
          order by days desc`,
  },
  {
    key: 'termination-notice',
    title: 'Termination notice periods: 90 days, 42 days with a reason, 21 days from the tenant',
    source: 'Residential Tenancies Act 1986, s 51, as amended by the Residential Tenancies Amendment Act 2024 from 30 January 2025',
    sql: `select coalesce(t.tenancy_ref, '') as record, coalesce(p.address_line, '') as subject,
                 (n.effective_on - n.served_on) as days,
                 n.kind || ' served ' || to_char(n.served_on, 'DD Mon YYYY') || ' giving ' ||
                 (n.effective_on - n.served_on) || ' days' as detail
          from notices n
          left join tenancies t on t.id = n.tenancy_id
          left join properties p on p.id = n.property_id
          where n.effective_on is not null
            and ((n.kind = 'termination 90 day' and (n.effective_on - n.served_on) < 90)
              or (n.kind = 'termination 42 day' and (n.effective_on - n.served_on) < 42)
              or (n.kind = 'tenant notice 21 day' and (n.effective_on - n.served_on) < 21))
          order by days`,
  },
  {
    key: 'tenant-records',
    title: 'Do not keep tenant records longer than you need them',
    source: 'Privacy Act 2020, information privacy principle 9; Tax Administration Act 1994, s 22 sets the seven year floor',
    sql: `select tn.full_name as record, coalesce(p.address_line, '') as subject,
                 (current_date - max(t.end_on)) as days,
                 'Tenancy ended ' || to_char(max(t.end_on), 'DD Mon YYYY') || ' and the full tenant record is still held' as detail
          from tenants tn
          join tenancy_tenants tt on tt.tenant_id = tn.id
          join tenancies t on t.id = tt.tenancy_id
          left join properties p on p.id = t.property_id
          group by tn.id, tn.full_name, p.address_line
          having max(coalesce(t.end_on, current_date)) < current_date - 2555
          order by days desc`,
  },
];

async function cmdCompliance(db, args, flags) {
  const only = args[0];
  const results = [];
  for (const rule of COMPLIANCE_RULES) {
    if (only && rule.key !== only) continue;
    const rows = await db.query(rule.sql);
    results.push({ ...rule, breaches: rows.length, rows });
  }
  if (!results.length) throw new CliError(`No rule called "${only}". Rules: ${COMPLIANCE_RULES.map((r) => r.key).join(', ')}`);
  const [counts] = await db.query(
    `select (select count(*) from properties) as properties,
            (select count(*) from tenancies where status in ('active', 'notice given')) as tenancies,
            (select min(start_on) from tenancies) as oldest`,
  );
  const lines = [heading('Compliance check')];
  lines.push(
    table(
      results.map((r) => ({
        rule: r.title,
        breaches: r.breaches,
        worst: r.rows[0] ? `${r.rows[0].record} (${r.rows[0].days}d)` : '',
        source: r.source,
      })),
      [
        { key: 'rule', label: 'Rule', width: 62 },
        { key: 'breaches', label: 'Breaches', align: 'right' },
        { key: 'worst', label: 'Worst', width: 22 },
        { key: 'source', label: 'Source', width: 76 },
      ],
    ),
  );
  for (const r of results.filter((x) => x.breaches)) {
    lines.push(`\n  ${r.title}  (${r.source})`);
    for (const row of r.rows.slice(0, 12)) {
      lines.push(`    ${String(row.record).padEnd(12)} ${String(row.subject || '').slice(0, 26).padEnd(27)} ${row.detail}`);
    }
    if (r.rows.length > 12) lines.push(`    ... and ${r.rows.length - 12} more`);
  }
  lines.push(
    `\n  Records: ${counts.properties} properties, ${counts.tenancies} running tenancies, oldest tenancy from ${isoDate(counts.oldest)}.` +
      '\n  Keep the financial records seven years (Tax Administration Act 1994 s 22), and no longer than you need the rest' +
      '\n  (Privacy Act 2020, principle 9). Nothing in this repo deletes a record.' +
      '\n  Rent trust accounting is not in this system. It stays where it is.' +
      '\n  Nothing here is legal advice. The rules are the ones docs/compliance.md records, with their sources.',
  );
  return { text: lines.join('\n'), json: results.map(({ key, title, source, breaches, rows }) => ({ key, title, source, breaches, rows })) };
}

// ---------------------------------------------------------------------------
// The week

const ATTENTION_ORDER = [
  'arrears_tribunal', 'arrears_remedy_notice', 'arrears_overdue_notice', 'arrears_watch',
  'maintenance_habitability', 'inspection_short_notice', 'bond_not_lodged', 'compliance_overdue',
  'smoke_alarm_check_overdue', 'inspection_overdue', 'maintenance_owner_waiting', 'maintenance_no_contractor',
  'vacate_no_exit_inspection', 'fixed_term_ending', 'rent_review_due', 'inspection_report_unsent',
  'job_not_invoiced', 'statement_not_sent', 'task_overdue', 'owner_quiet',
];

const ATTENTION_LABEL = {
  arrears_tribunal: 'Arrears past twenty one days, no Tribunal application',
  arrears_remedy_notice: 'Arrears past fourteen days, no notice to remedy',
  arrears_overdue_notice: 'Rent overdue five working days, no notice served',
  arrears_watch: 'Behind, but inside the notice window',
  maintenance_habitability: 'Habitability jobs still open',
  inspection_short_notice: 'Inspection booked without proper entry notice',
  bond_not_lodged: 'Bond taken and not lodged',
  compliance_overdue: 'Compliance items not met',
  smoke_alarm_check_overdue: 'Smoke alarms not checked in twelve months',
  inspection_overdue: 'Routine inspections past the cycle',
  maintenance_owner_waiting: 'Maintenance waiting on an owner',
  maintenance_no_contractor: 'Approved and nobody sent',
  vacate_no_exit_inspection: 'Vacate with no exit inspection booked',
  fixed_term_ending: 'Fixed terms running out',
  rent_review_due: 'Rent reviews available',
  inspection_report_unsent: 'Inspection reports never sent to the owner',
  job_not_invoiced: 'Contractor work with no invoice',
  statement_not_sent: 'Owner statements never sent',
  task_overdue: 'Tasks overdue',
  owner_quiet: 'Owners nobody has spoken to',
};

async function cmdAttention(db, args, flags) {
  const where = [];
  const params = [];
  if (flags.manager && flags.manager !== true) {
    const m = await resolve(db, 'manager', flags.manager);
    params.push(m.full_name);
    where.push(`manager = $${params.length}`);
  }
  const rows = await db.query(`select * from v_attention_due ${where.length ? 'where ' + where.join(' and ') : ''}`, params);
  rows.sort((a, b) => {
    const d = ATTENTION_ORDER.indexOf(a.reason) - ATTENTION_ORDER.indexOf(b.reason);
    return d !== 0 ? d : num(b.days) - num(a.days);
  });
  const lines = [heading(`Needs a decision this week (${rows.length})`)];
  for (const reason of ATTENTION_ORDER) {
    const group = rows.filter((r) => r.reason === reason);
    if (!group.length) continue;
    lines.push(`\n  ${ATTENTION_LABEL[reason] || reason} (${group.length})`);
    lines.push(
      table(group, [
        { key: 'label', label: 'Record', width: 14 },
        { key: 'property', label: 'Property', width: 26 },
        { key: 'party', label: 'Who', width: 26 },
        { key: 'days', label: 'Days', align: 'right' },
        { key: 'amount_cents', label: 'Value', align: 'right', format: (v) => (num(v) ? money(v) : '') },
        { key: 'manager', label: 'Manager', width: 13 },
        { key: 'detail', label: 'Detail', width: 62, format: (v) => truncate(v, 62) },
      ]),
    );
  }
  return { text: lines.join('\n'), json: rows };
}

async function cmdStats(db) {
  const [s] = await db.query(`
    select (select count(*) from owners where status = 'active')                                   as owners,
           (select count(*) from properties where status <> 'off management')                      as properties,
           (select count(*) from v_rent_roll where tenants = 'VACANT' and status <> 'off management') as vacant,
           (select count(*) from tenancies where status in ('active', 'notice given'))             as tenancies,
           (select coalesce(sum(weekly_rent_cents), 0) from v_rent_roll)                           as rent_week_cents,
           (select coalesce(sum(weekly_fee_cents), 0) from v_rent_roll)                            as fee_week_cents,
           (select count(*) from v_arrears)                                                        as arrears,
           (select coalesce(sum(arrears_cents), 0) from v_arrears)                                 as arrears_cents,
           (select count(*) from v_arrears where days_behind >= 14)                                as arrears_serious,
           (select count(*) from v_inspections_due where days_overdue > 0)                         as inspections_overdue,
           (select count(*) from v_maintenance_open)                                               as maintenance_open,
           (select count(*) from v_maintenance_open where days_waiting_on_owner >= 5)              as maintenance_owner,
           (select count(*) from compliance_items where status not in ('compliant', 'exempt'))     as compliance_gaps,
           (select count(*) from v_lease_events where kind = 'fixed term ending' and days_away <= 60) as terms_ending,
           (select count(*) from v_lease_events where kind = 'vacate')                             as vacates,
           (select count(*) from v_lease_events where kind = 'rent review' and days_away <= 0)     as reviews_due,
           (select count(*) from tasks where status = 'open' and due_on < current_date)            as tasks_overdue,
           (select count(*) from v_attention_due)                                                  as attention
  `);
  const gap = await db.query(
    'select coalesce(sum(market_rent_cents - weekly_rent_cents), 0) as cents from v_rent_roll where weekly_rent_cents > 0 and market_rent_cents > weekly_rent_cents',
  );
  const text = [
    heading('The portfolio'),
    `  ${s.owners} owners, ${s.properties} properties under management, ${s.vacant} vacant`,
    `  ${money(s.rent_week_cents)} of rent a week, ${money(s.fee_week_cents)} a week in management fees`,
    `  ${money(gap[0].cents)} a week between what is being paid and the market rent on file`,
    heading('Rent'),
    `  ${s.arrears} tenancies behind, ${money(s.arrears_cents)} owing, ${s.arrears_serious} past fourteen days`,
    `  ${s.reviews_due} rent reviews the Act now allows`,
    heading('The properties'),
    `  ${s.inspections_overdue} routine inspections past the cycle`,
    `  ${s.maintenance_open} maintenance requests open, ${s.maintenance_owner} of them waiting on an owner`,
    `  ${s.compliance_gaps} compliance items not met`,
    heading('The lease calendar'),
    `  ${s.terms_ending} fixed terms ending inside sixty days, ${s.vacates} vacates booked`,
    heading('Housekeeping'),
    `  ${s.tasks_overdue} tasks overdue`,
    `  ${s.attention} items on the attention list`,
  ].join('\n');
  return { text, json: s };
}

// ---------------------------------------------------------------------------
// Owner statements

async function cmdStatements(db, args, flags) {
  const rows = await db.query(
    `select o.name as owner, s.period_month, s.rent_received_cents, s.management_fees_cents, s.expenses_cents,
            s.disbursed_cents, s.status, s.sent_on, s.generated_on
     from owner_statements s join owners o on o.id = s.owner_id
     ${flags.all ? '' : "where s.period_month >= date_trunc('month', current_date) - interval '3 month'"}
     order by s.period_month desc, o.name`,
  );
  const unsent = rows.filter((r) => r.status !== 'sent').length;
  const text =
    heading(`Owner statements (${rows.length}${unsent ? `, ${unsent} not sent` : ''})`) +
    '\n' +
    table(rows, [
      { key: 'period_month', label: 'Month', format: (v) => String(isoDate(v)).slice(0, 7) },
      { key: 'owner', label: 'Owner', width: 28 },
      { key: 'rent_received_cents', label: 'Rent', align: 'right', format: (v) => money(v) },
      { key: 'management_fees_cents', label: 'Our fee', align: 'right', format: (v) => money(v) },
      { key: 'expenses_cents', label: 'Expenses', align: 'right', format: (v) => money(v) },
      { key: 'disbursed_cents', label: 'To owner', align: 'right', format: (v) => money(v) },
      { key: 'status', label: 'Status', width: 8 },
      { key: 'sent_on', label: 'Sent', format: (v) => (v ? isoDate(v) : 'NOT SENT') },
    ]) +
    '\n\n  The figures are a record of what the trust account did. This system reports them, it does not move them.' +
    '\n  Render the paperwork with: npm run docs -- owner-monthly-summary';
  return { text, json: rows };
}

async function cmdStatement(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'sent') {
    const o = await resolve(db, 'owner', rest.join(' '));
    const month = parseDate(flags.month) || null;
    const rows = await db.query(
      `update owner_statements set status = 'sent', sent_on = $3
       where owner_id = $1 and ($2::date is null or period_month = date_trunc('month', $2::date)::date) and status <> 'sent'
       returning *`,
      [o.id, month, parseDate(flags.on) || today()],
    );
    return { text: `${rows.length} statement(s) for ${o.name} marked sent.`, json: rows };
  }
  const o = await resolve(db, 'owner', args.join(' '));
  const month = parseDate(flags.month) || `${today().slice(0, 8)}01`;
  const [existing] = await db.query(
    "select * from owner_statements where owner_id = $1 and period_month = date_trunc('month', $2::date)::date",
    [o.id, month],
  );
  const [figures] = await db.query(
    `select coalesce(sum(l.amount_cents) filter (where l.kind = 'payment'), 0) as rent
     from rent_ledger l
     join tenancies t on t.id = l.tenancy_id
     join properties p on p.id = t.property_id
     where p.owner_id = $1
       and l.entry_on >= date_trunc('month', $2::date)::date
       and l.entry_on < (date_trunc('month', $2::date) + interval '1 month')::date`,
    [o.id, month],
  );
  const [spend] = await db.query(
    `select coalesce(sum(j.invoiced_cents), 0) as spend
     from contractor_jobs j
     join maintenance_requests mr on mr.id = j.maintenance_id
     join properties p on p.id = mr.property_id
     where p.owner_id = $1
       and j.invoiced_on >= date_trunc('month', $2::date)::date
       and j.invoiced_on < (date_trunc('month', $2::date) + interval '1 month')::date`,
    [o.id, month],
  );
  const [feePct] = await db.query('select coalesce(avg(management_fee_pct), 8) as pct from properties where owner_id = $1', [o.id]);
  const rent = num(figures.rent);
  const fees = Math.round((rent * Number(feePct.pct)) / 100);
  const expenses = num(spend.spend);
  const disbursed = rent - fees - expenses;
  const [row] = existing
    ? await db.query(
        `update owner_statements set generated_on = $2, rent_received_cents = $3, management_fees_cents = $4,
                expenses_cents = $5, disbursed_cents = $6 where id = $1 returning *`,
        [existing.id, today(), rent, fees, expenses, disbursed],
      )
    : await db.query(
        `insert into owner_statements (owner_id, period_month, generated_on, rent_received_cents, management_fees_cents,
                                       expenses_cents, disbursed_cents, status)
         values ($1, date_trunc('month', $2::date)::date, $3, $4, $5, $6, $7, 'draft') returning *`,
        [o.id, month, today(), rent, fees, expenses, disbursed],
      );
  return {
    text:
      `Statement for ${o.name}, ${String(isoDate(row.period_month)).slice(0, 7)}:\n` +
      `  Rent received   ${money(rent)}\n` +
      `  Management fee  ${money(fees)} at ${Number(feePct.pct).toFixed(2)}%\n` +
      `  Expenses        ${money(expenses)}\n` +
      `  To the owner    ${money(disbursed)}\n` +
      `  Status ${row.status}. Render it with: npm run docs -- owner-monthly-summary\n` +
      '  These figures report what the trust account did. Nothing here moves money.',
    json: row,
  };
}

// ---------------------------------------------------------------------------
// Tasks and the contact log

async function cmdTasks(db, args, flags) {
  const rows = await db.query(
    `select t.*, coalesce(p.ref, '') as property_ref, coalesce(p.address_line, '') as property,
            coalesce(o.name, '') as owner, coalesce(m.full_name, 'unassigned') as manager
     from tasks t
     left join properties p on p.id = t.property_id
     left join owners o on o.id = t.owner_id
     left join managers m on m.id = t.manager_id
     ${flags.all ? '' : "where t.status = 'open'"}
     order by t.status, t.due_on nulls last`,
  );
  const overdue = rows.filter((r) => r.status === 'open' && r.due_on && new Date(r.due_on) < new Date(today())).length;
  const text =
    heading(`Tasks (${rows.length}${overdue ? `, ${overdue} overdue` : ''})`) +
    '\n' +
    table(rows, [
      { key: 'id', label: 'Id', format: (v) => short(v) },
      { key: 'due_on', label: 'Due', format: (v) => isoDate(v) },
      { key: 'kind', label: 'Kind', width: 12 },
      { key: 'title', label: 'What', width: 54, format: (v) => truncate(v, 54) },
      { key: 'property', label: 'Property', width: 24 },
      { key: 'manager', label: 'Who', width: 13 },
      { key: 'status', label: 'Status', width: 8 },
    ]);
  return { text, json: rows };
}

async function cmdTask(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'done') {
    const t = await resolve(db, 'task', rest.join(' '));
    const [row] = await db.query("update tasks set status = 'done', done_on = $2 where id = $1 returning *", [t.id, parseDate(flags.on) || today()]);
    return { text: `Done: ${row.title}`, json: row };
  }
  if (verb !== 'add') throw new CliError('task add "<what>" [--due=YYYY-MM-DD --property= --tenancy= --owner= --kind=]');
  const title = rest.join(' ');
  if (!title) throw new CliError('What is the task?');
  const manager = await whoIs(db, flags);
  const p = flags.property && flags.property !== true ? await resolve(db, 'property', flags.property) : null;
  const t = flags.tenancy && flags.tenancy !== true ? await resolve(db, 'tenancy', flags.tenancy) : null;
  const o = flags.owner && flags.owner !== true ? await resolve(db, 'owner', flags.owner) : null;
  const [row] = await db.query(
    `insert into tasks (title, kind, due_on, property_id, tenancy_id, owner_id, manager_id, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [title, str(flags.kind) || 'task', parseDate(flags.due) || addDays(today(), 7), p?.id ?? null, t?.id ?? null, o?.id ?? null, manager?.id ?? null, str(flags.note)],
  );
  return { text: `Task added, due ${isoDate(row.due_on)}: ${title}`, json: row };
}

async function cmdNote(db, args, flags) {
  const [subject, ...bodyParts] = args;
  const body = bodyParts.join(' ');
  if (!subject || !body) throw new CliError('note "<property, tenancy or owner>" "<what was said and what was agreed>" [--kind=call|email|text|visit] [--on=]');
  const property = await resolve(db, 'property', subject, { optional: true });
  const tenancy = property ? null : await resolve(db, 'tenancy', subject, { optional: true });
  const owner = property || tenancy ? null : await resolve(db, 'owner', subject, { optional: true });
  if (!property && !tenancy && !owner) throw new CliError(`"${subject}" is not a property, a tenancy or an owner I can find.`);
  const manager = await whoIs(db, flags);
  const [tenancyForProperty] = property
    ? await db.query("select id from tenancies where property_id = $1 and status in ('active', 'notice given') limit 1", [property.id])
    : [null];
  const [row] = await db.query(
    `insert into contact_notes (happened_on, kind, who, body, property_id, tenancy_id, owner_id, manager_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [
      parseDate(flags.on) || today(),
      str(flags.kind) || 'note',
      str(flags.who) || null,
      body,
      property?.id ?? tenancy?.property_id ?? null,
      tenancy?.id ?? tenancyForProperty?.id ?? null,
      owner?.id ?? null,
      manager?.id ?? null,
    ],
  );
  const label = property ? `${property.ref} ${property.address_line}` : tenancy ? `${tenancy.tenancy_ref} ${tenancy.address_line}` : owner.name;
  return { text: `Logged against ${label} on ${isoDate(row.happened_on)}: ${truncate(body, 90)}`, json: row };
}

// ---------------------------------------------------------------------------
// add

async function cmdAdd(db, args, flags) {
  const [what, ...rest] = args;
  const name = rest.join(' ');
  if (what === 'owner') {
    if (!name) throw new CliError('add owner "<name>" [--email= --phone= --city= --type=individual|couple|trust|company]');
    const manager = await whoIs(db, flags);
    const [row] = await db.query(
      `insert into owners (name, owner_type, email, phone, postal_address, city, manager_id, owner_since, statement_day, payment_reference)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [name, str(flags.type) || 'individual', str(flags.email), str(flags.phone), str(flags.address), str(flags.city), manager?.id ?? null, today(), Number(flags['statement-day']) || 20, str(flags.reference)],
    );
    return { text: `Owner added: ${row.name}`, json: row };
  }
  if (what === 'property') {
    if (!name) throw new CliError('add property "<address>" --owner="<owner>" [--ref= --suburb= --city= --rent= --fee=8 --beds=3]');
    const o = await resolve(db, 'owner', flags.owner);
    const manager = await whoIs(db, flags);
    const [{ next }] = await db.query("select 'PR-' || (1000 + count(*) + 1)::text as next from properties");
    const [row] = await db.query(
      `insert into properties (ref, address_line, suburb, city, property_type, bedrooms, bathrooms, owner_id, manager_id,
                               management_fee_pct, market_rent_cents)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [
        str(flags.ref) || next, name, str(flags.suburb), str(flags.city), str(flags.type) || 'house',
        Number(flags.beds) || null, Number(flags.baths) || null, o.id, manager?.id ?? null,
        Number(flags.fee) || 8, parseMoney(flags.rent),
      ],
    );
    const kinds = [
      ['healthy homes heating', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 8 to 12'],
      ['healthy homes insulation', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 13 to 18'],
      ['healthy homes ventilation', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 19 to 22'],
      ['healthy homes moisture and drainage', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 23 to 26'],
      ['healthy homes draught stopping', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 27 to 29'],
      ['smoke alarms', 'Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, regs 5 to 10'],
      ['insulation statement', 'Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, reg 21'],
    ];
    for (const [kind, standard] of kinds) {
      await db.query(
        'insert into compliance_items (property_id, kind, standard, status) values ($1, $2, $3, \'unknown\') on conflict do nothing',
        [row.id, kind, standard],
      );
    }
    return { text: `Property added: ${row.ref} ${row.address_line} for ${o.name}.\n  Seven compliance items created, all "unknown". Assess them: compliance-items --property=${row.ref} --all`, json: row };
  }
  if (what === 'tenant') {
    if (!name) throw new CliError('add tenant "<full name>" [--email= --phone= --tenancy=<ref>]');
    const [row] = await db.query(
      'insert into tenants (full_name, email, phone, emergency_contact, employer) values ($1, $2, $3, $4, $5) returning *',
      [name, str(flags.email), str(flags.phone), str(flags.emergency), str(flags.employer)],
    );
    if (flags.tenancy && flags.tenancy !== true) {
      const t = await resolve(db, 'tenancy', flags.tenancy);
      await db.query('insert into tenancy_tenants (tenancy_id, tenant_id, is_primary) values ($1, $2, $3) on conflict do nothing', [t.id, row.id, Boolean(flags.primary)]);
    }
    return { text: `Tenant added: ${row.full_name}`, json: row };
  }
  if (what === 'tenancy') {
    const p = await resolve(db, 'property', flags.property || name);
    const rent = parseMoney(flags.rent);
    if (!rent) throw new CliError('add tenancy --property=<ref> --rent=680 [--period=weekly --start=YYYY-MM-DD --bond= --fixed-until= --tenant="<name>"]');
    const manager = await whoIs(db, flags);
    const period = parsePeriod(flags.period);
    const start = parseDate(flags.start) || today();
    const [{ next }] = await db.query("select 'TEN-' || (2000 + count(*) + 1)::text as next from tenancies");
    const bond = parseMoney(flags.bond) || Math.round((rent * 7 * 4) / periodDays(period));
    const cap = Math.round((rent * 7 * 4) / periodDays(period));
    if (bond > cap) throw new CliError(`A bond of ${money(bond)} is more than four weeks rent (${money(cap)}). RTA 1986 s 18(1) caps it.`);
    const [row] = await db.query(
      `insert into tenancies (tenancy_ref, property_id, manager_id, kind, status, start_on, fixed_term_end_on, rent_cents,
                              rent_period, rent_due_day, bond_cents, agreement_signed_on, healthy_homes_statement, insulation_statement)
       values ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13) returning *`,
      [
        str(flags.ref) || next, p.id, manager?.id ?? null, flags['fixed-until'] ? 'fixed term' : 'periodic', start,
        parseDate(flags['fixed-until']), rent, period, str(flags['due-day']), bond, parseDate(flags.signed) || start,
        Boolean(flags['healthy-homes']), Boolean(flags['insulation-statement']),
      ],
    );
    await db.query('insert into rent_schedule (tenancy_id, amount_cents, period, effective_on, reason) values ($1, $2, $3, $4, \'new tenancy\')', [row.id, rent, period, start]);
    await db.query("insert into bonds (tenancy_id, amount_cents, received_on, status) values ($1, $2, $3, 'not lodged') on conflict do nothing", [row.id, bond, start]);
    if (flags.tenant && flags.tenant !== true) {
      const tn = await resolve(db, 'tenant', flags.tenant, { optional: true });
      if (tn) await db.query('insert into tenancy_tenants (tenancy_id, tenant_id, is_primary) values ($1, $2, true) on conflict do nothing', [row.id, tn.id]);
    }
    return {
      text:
        `Tenancy ${row.tenancy_ref} created at ${p.ref} ${p.address_line} from ${start} at ${rentText(rent, period)}.\n` +
        `  Bond of ${money(bond)} recorded as taken and NOT LODGED. Lodge it within 23 working days, by ${addWorkingDays(start, 23)} (RTA 1986 s 19).\n` +
        (row.healthy_homes_statement ? '' : '  The healthy homes compliance statement is not marked as signed. The agreement has to carry one.\n') +
        '  Add the tenants: add tenant "<name>" --tenancy=' + row.tenancy_ref,
      json: row,
    };
  }
  if (what === 'contractor') {
    if (!name) throw new CliError('add contractor "<name>" --trade=plumbing [--phone= --email= --licence=]');
    const [row] = await db.query(
      `insert into contractors (name, trade, contact_name, email, phone, licence_ref, licence_type, insurance_expires_on, preferred)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [name, str(flags.trade) || 'general', str(flags.contact), str(flags.email), str(flags.phone), str(flags.licence), str(flags['licence-type']), parseDate(flags['insurance-expires']), Boolean(flags.preferred)],
    );
    return { text: `Contractor added: ${row.name} (${row.trade})`, json: row };
  }
  if (what === 'bond') {
    const t = await resolve(db, 'tenancy', rest.join(' ') || flags.tenancy);
    const on = parseDate(flags.lodged) || today();
    const [row] = await db.query(
      `update bonds set lodged_on = $2, bond_number = coalesce($3, bond_number), status = 'held' where tenancy_id = $1 returning *`,
      [t.id, on, str(flags.number) || null],
    );
    if (!row) throw new CliError(`No bond record on ${t.tenancy_ref}.`);
    return { text: `Bond on ${t.tenancy_ref} lodged ${on}${row.bond_number ? ` as ${row.bond_number}` : ''}.`, json: row };
  }
  throw new CliError('add owner|property|tenant|tenancy|contractor|bond <...>');
}

// ---------------------------------------------------------------------------
// Import

const FORMATS = {
  palace: {
    label: 'Palace',
    owners: {
      ref: ['Owner Code', 'Owner ID', 'Code'],
      name: ['Owner Name', 'Name', 'Owner'],
      email: ['Email', 'Email Address'],
      phone: ['Phone', 'Mobile', 'Contact Phone'],
      address: ['Postal Address', 'Address'],
      city: ['City', 'Town'],
    },
    properties: {
      ref: ['Property Code', 'Property ID', 'Code'],
      address: ['Property Address', 'Address', 'Street Address'],
      suburb: ['Suburb'],
      city: ['City', 'Town'],
      owner: ['Owner Code', 'Owner Name', 'Owner'],
      fee: ['Management Fee', 'Fee %', 'Management Fee %'],
      beds: ['Bedrooms', 'Beds'],
      type: ['Property Type', 'Type'],
      rent: ['Market Rent', 'Rent'],
    },
    tenancies: {
      ref: ['Tenancy Code', 'Tenant Code', 'Tenancy ID'],
      property: ['Property Code', 'Property Address', 'Property'],
      start: ['Start Date', 'Tenancy Start', 'Lease Start'],
      end: ['End Date', 'Tenancy End'],
      rent: ['Rent', 'Rent Amount'],
      period: ['Rent Period', 'Frequency', 'Rent Frequency'],
      bond: ['Bond', 'Bond Amount', 'Bond Held'],
      paid_to: ['Paid To', 'Paid To Date', 'Rent Paid To'],
      tenant: ['Tenant Name', 'Tenant', 'Tenants'],
      email: ['Tenant Email', 'Email'],
      phone: ['Tenant Phone', 'Mobile', 'Phone'],
    },
  },
  propertyme: {
    label: 'PropertyMe',
    owners: {
      ref: ['Owner Reference', 'Reference'],
      name: ['Owner', 'Owner Name', 'Name'],
      email: ['Email Address', 'Email'],
      phone: ['Mobile', 'Phone'],
      address: ['Address', 'Postal Address'],
      city: ['Suburb', 'City'],
    },
    properties: {
      ref: ['Property Reference', 'Reference'],
      address: ['Property', 'Property Address', 'Address'],
      suburb: ['Suburb'],
      city: ['State', 'City'],
      owner: ['Owner', 'Owner Name'],
      fee: ['Management Fee %', 'Management Fee'],
      beds: ['Bedrooms'],
      type: ['Property Type', 'Type'],
      rent: ['Market Rent', 'Rent Amount'],
    },
    tenancies: {
      ref: ['Tenancy', 'Tenancy Reference'],
      property: ['Property', 'Property Address'],
      start: ['Lease Start', 'Start Date'],
      end: ['Lease End', 'End Date'],
      rent: ['Rent Amount', 'Rent'],
      period: ['Rent Period', 'Rent Frequency'],
      bond: ['Bond Amount', 'Bond'],
      paid_to: ['Paid To', 'Rent Paid To'],
      tenant: ['Tenant', 'Tenant Name', 'Tenants'],
      email: ['Tenant Email', 'Email Address'],
      phone: ['Tenant Mobile', 'Mobile'],
    },
  },
};
FORMATS.csv = {
  label: 'a plain CSV',
  owners: mergeMaps('owners'),
  properties: mergeMaps('properties'),
  tenancies: mergeMaps('tenancies'),
};
FORMATS['console-cloud'] = { ...FORMATS.propertyme, label: 'Console Cloud' };

function mergeMaps(section) {
  const out = {};
  for (const f of [FORMATS.palace, FORMATS.propertyme]) {
    for (const [k, names] of Object.entries(f[section])) out[k] = [...new Set([...(out[k] || []), ...names])];
  }
  return out;
}

function readCsvFile(file, what) {
  if (!file || file === true) return null;
  const p = path.resolve(String(file));
  if (!existsSync(p)) throw new CliError(`No ${what} file at ${p}`);
  return parseCsv(readFileSync(p, 'utf8'));
}

async function cmdImport(db, args, flags) {
  const format = (args[0] || 'csv').toLowerCase();
  const spec = FORMATS[format];
  if (!spec) throw new CliError(`Unknown format "${format}". Use: ${Object.keys(FORMATS).join(', ')}`);
  const owners = readCsvFile(flags.owners, 'owners');
  const properties = readCsvFile(flags.properties, 'properties');
  const tenancies = readCsvFile(flags.tenancies, 'tenancies');
  if (!owners && !properties && !tenancies) {
    throw new CliError(
      `import ${format} --owners=owners.csv --properties=properties.csv --tenancies=tenancies.csv [--dry-run]\n` +
        `  Export those three from ${spec.label} and point at the files. Run --dry-run first.`,
    );
  }
  const dry = Boolean(flags['dry-run']);
  const counts = { owners: 0, owners_updated: 0, properties: 0, properties_updated: 0, tenancies: 0, tenants: 0, bonds: 0, skipped: [] };
  const get = (row, map, key) => pick(row, ...(map[key] || []));
  // On a dry run nothing is written, so a property cannot find the owner that the
  // same run "would have" created. These two sets keep the dry run honest.
  const pendingOwners = new Set();
  const pendingProperties = new Set();
  const remember = (set, ...keys) => keys.filter(Boolean).forEach((k) => set.add(String(k).toLowerCase()));

  if (owners) {
    for (const row of owners) {
      const name = get(row, spec.owners, 'name');
      if (!name) { counts.skipped.push('owner with no name'); continue; }
      const [existing] = await db.query('select id from owners where lower(name) = lower($1)', [name]);
      if (existing) {
        counts.owners_updated++;
        if (!dry) {
          await db.query(
            `update owners set email = coalesce(nullif($2, ''), email), phone = coalesce(nullif($3, ''), phone),
                    external_ref = coalesce(external_ref, nullif($4, '')) where id = $1`,
            [existing.id, get(row, spec.owners, 'email'), get(row, spec.owners, 'phone'), get(row, spec.owners, 'ref')],
          );
        }
        continue;
      }
      counts.owners++;
      remember(pendingOwners, name, get(row, spec.owners, 'ref'));
      if (!dry) {
        await db.query(
          `insert into owners (name, email, phone, postal_address, city, external_ref, owner_since)
           values ($1, $2, $3, $4, $5, nullif($6, ''), current_date)`,
          [name, get(row, spec.owners, 'email'), get(row, spec.owners, 'phone'), get(row, spec.owners, 'address'), get(row, spec.owners, 'city'), get(row, spec.owners, 'ref')],
        );
      }
    }
  }

  if (properties) {
    for (const row of properties) {
      const address = get(row, spec.properties, 'address');
      if (!address) { counts.skipped.push('property with no address'); continue; }
      const ownerKey = get(row, spec.properties, 'owner');
      const [owner] = ownerKey
        ? await db.query('select id from owners where lower(name) = lower($1) or lower(external_ref) = lower($1)', [ownerKey])
        : [null];
      const ownerPending = !owner && ownerKey && pendingOwners.has(String(ownerKey).toLowerCase());
      if (!owner && !ownerPending) { counts.skipped.push(`${address}: owner "${ownerKey}" not found`); continue; }
      const [existing] = await db.query('select id from properties where lower(address_line) = lower($1)', [address]);
      if (existing) { counts.properties_updated++; continue; }
      counts.properties++;
      remember(pendingProperties, address, get(row, spec.properties, 'ref'));
      if (dry) continue;
      const [{ next }] = await db.query("select 'PR-' || (1000 + count(*) + 1)::text as next from properties");
      const [created] = await db.query(
        `insert into properties (ref, address_line, suburb, city, property_type, bedrooms, owner_id, management_fee_pct,
                                 market_rent_cents, external_ref)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, nullif($10, '')) returning id`,
        [
          get(row, spec.properties, 'ref') || next, address, get(row, spec.properties, 'suburb'), get(row, spec.properties, 'city'),
          (get(row, spec.properties, 'type') || 'house').toLowerCase(), Number(get(row, spec.properties, 'beds')) || null, owner.id,
          Number(String(get(row, spec.properties, 'fee')).replace(/[^0-9.]/g, '')) || 8,
          parseMoney(get(row, spec.properties, 'rent')), get(row, spec.properties, 'ref'),
        ],
      );
      for (const [kind, standard] of [
        ['healthy homes heating', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 8 to 12'],
        ['healthy homes insulation', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 13 to 18'],
        ['healthy homes ventilation', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 19 to 22'],
        ['healthy homes moisture and drainage', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 23 to 26'],
        ['healthy homes draught stopping', 'Residential Tenancies (Healthy Homes Standards) Regulations 2019, regs 27 to 29'],
        ['smoke alarms', 'Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, regs 5 to 10'],
        ['insulation statement', 'Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, reg 21'],
      ]) {
        await db.query('insert into compliance_items (property_id, kind, standard, status) values ($1, $2, $3, \'unknown\') on conflict do nothing', [created.id, kind, standard]);
      }
    }
  }

  if (tenancies) {
    for (const row of tenancies) {
      const propertyKey = get(row, spec.tenancies, 'property');
      const [property] = propertyKey
        ? await db.query(
            'select id, ref from properties where lower(address_line) = lower($1) or lower(ref) = lower($1) or lower(external_ref) = lower($1)',
            [propertyKey],
          )
        : [null];
      const propertyPending = !property && propertyKey && pendingProperties.has(String(propertyKey).toLowerCase());
      if (!property && !propertyPending) { counts.skipped.push(`tenancy for "${propertyKey}": property not found`); continue; }
      const rent = parseMoney(get(row, spec.tenancies, 'rent'));
      const period = parsePeriod(get(row, spec.tenancies, 'period'));
      const start = parseDate(get(row, spec.tenancies, 'start')) || today();
      const ref = get(row, spec.tenancies, 'ref');
      const [existing] = ref ? await db.query('select id from tenancies where lower(tenancy_ref) = lower($1) or lower(external_ref) = lower($1)', [ref]) : [null];
      if (existing) { counts.skipped.push(`tenancy ${ref} already here`); continue; }
      counts.tenancies++;
      if (dry) continue;
      const [{ next }] = await db.query("select 'TEN-' || (2000 + count(*) + 1)::text as next from tenancies");
      const bond = parseMoney(get(row, spec.tenancies, 'bond'));
      const [created] = await db.query(
        `insert into tenancies (tenancy_ref, property_id, kind, status, start_on, end_on, rent_cents, rent_period,
                                bond_cents, external_ref)
         values ($1, $2, 'periodic', $3, $4, $5, $6, $7, $8, nullif($9, '')) returning id, tenancy_ref`,
        [
          ref || next, property.id, parseDate(get(row, spec.tenancies, 'end')) ? 'ended' : 'active', start,
          parseDate(get(row, spec.tenancies, 'end')), rent, period, bond, ref,
        ],
      );
      await db.query('insert into rent_schedule (tenancy_id, amount_cents, period, effective_on, reason) values ($1, $2, $3, $4, \'new tenancy\')', [created.id, rent, period, start]);
      if (bond) {
        counts.bonds++;
        await db.query("insert into bonds (tenancy_id, amount_cents, received_on, lodged_on, status) values ($1, $2, $3, $3, 'held') on conflict do nothing", [created.id, bond, start]);
      }
      // Rent up to the paid-to date, so arrears carry across on day one.
      const paidTo = parseDate(get(row, spec.tenancies, 'paid_to'));
      if (paidTo && rent) {
        const days = Math.round((new Date(today()) - new Date(paidTo)) / 86400000);
        if (days > 0) {
          const owed = Math.round((rent / periodDays(period)) * days);
          await db.query(
            `insert into rent_ledger (tenancy_id, entry_on, kind, amount_cents, reference, note)
             values ($1, $2::date, 'charge', $3, 'OPENING', $4)`,
            [created.id, paidTo, owed, `Opening arrears carried over at import, rent paid to ${paidTo}`],
          );
        }
      }
      const tenantNames = String(get(row, spec.tenancies, 'tenant') || '')
        .split(/\s*(?:,|;|\band\b|&)\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      let first = true;
      for (const tn of tenantNames) {
        const [existingTenant] = await db.query('select id from tenants where lower(full_name) = lower($1)', [tn]);
        let id = existingTenant?.id;
        if (!id) {
          counts.tenants++;
          const [madeTenant] = await db.query(
            'insert into tenants (full_name, email, phone) values ($1, nullif($2, \'\'), nullif($3, \'\')) returning id',
            [tn, first ? get(row, spec.tenancies, 'email') : '', first ? get(row, spec.tenancies, 'phone') : ''],
          );
          id = madeTenant.id;
        }
        await db.query('insert into tenancy_tenants (tenancy_id, tenant_id, is_primary) values ($1, $2, $3) on conflict do nothing', [created.id, id, first]);
        first = false;
      }
    }
  }

  const lines = [
    heading(`${dry ? 'Dry run: what a' : 'A'}n import from ${spec.label} ${dry ? 'would do' : 'did'}`),
    `  Owners      ${counts.owners} new, ${counts.owners_updated} already here`,
    `  Properties  ${counts.properties} new, ${counts.properties_updated} already here`,
    `  Tenancies   ${counts.tenancies} new, ${counts.tenants} tenants, ${counts.bonds} bonds`,
  ];
  if (counts.skipped.length) {
    lines.push(`  Skipped     ${counts.skipped.length}`);
    for (const s of counts.skipped.slice(0, 15)) lines.push(`    ${s}`);
    if (counts.skipped.length > 15) lines.push(`    ... and ${counts.skipped.length - 15} more`);
  }
  lines.push(
    '',
    '  What does not come across: inspection history with photos, the trust account ledger, owner statements already',
    '  issued, and any document stored in the old system. Read docs/replace-palace.md before you switch.',
    '  Every property imported gets its seven compliance items as "unknown". Assess them before you rely on /compliance.',
  );
  return { text: lines.join('\n'), json: counts };
}

// ---------------------------------------------------------------------------
// Export

const EXPORT_TABLES = [
  'managers', 'owners', 'properties', 'tenants', 'tenancies', 'tenancy_tenants', 'rent_schedule', 'rent_ledger',
  'arrears_events', 'bonds', 'inspections', 'inspection_items', 'maintenance_requests', 'contractors',
  'contractor_jobs', 'notices', 'compliance_items', 'tasks', 'contact_notes', 'owner_statements',
];

async function cmdExport(db, args, flags) {
  const out = {};
  const counts = {};
  for (const t of EXPORT_TABLES) {
    const rows = await db.query(`select * from ${t}`);
    out[t] = rows;
    counts[t] = rows.length;
  }
  const file = str(flags.out) || path.join(REPO_ROOT, 'exports', `property-${today()}.json`);
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(path.resolve(file), JSON.stringify(out, null, 2));
  return {
    text:
      `Exported ${Object.values(counts).reduce((a, b) => a + b, 0)} rows across ${EXPORT_TABLES.length} tables to ${file}\n` +
      Object.entries(counts).map(([k, v]) => `  ${String(v).padStart(6)}  ${k}`).join('\n') +
      '\n  No trust account, no client money, no payments. There is nothing of that kind in this database to export.',
    json: { file, counts },
  };
}

// ---------------------------------------------------------------------------
// Help and dispatch

const HELP = `property-management-for-claude-code: a residential property management business as a database and a CLI.

  npm run property -- <command> [args] [--flags] [--json]

The week
  arrears [--min-days=] [--manager=]        who is behind, how far, and the next step the Act expects
  arrears-log <tenancy> "<action>"          noted | notice of overdue rent | 14 day notice to remedy | payment plan |
                                            tribunal application | resolved
  inspections-due [--overdue]               routine inspections against the cycle, with the entry notice position
  maintenance [--urgent] [--all]            everything open, worst first, and who it is waiting on
  attention [--manager=]                    everything that wants a decision this week
  weekly-review                             see .claude/commands/weekly-review.md

The portfolio
  properties [q] [--owner=] [--vacant]      the rent roll
  property <ref|address>                    one property in full
  owners [q] / owner <name>                 the owners and one owner's whole position
  tenancies [--all] / tenancy <ref>         the agreements, and one in full
  tenants [q]                               who lives where
  contractors [--all]                       the trades, their licences and what they have been paid

Rent
  rent-review                               every review the Act now allows, with the gap to market rent
  rent-review <tenancy>                     the rent history and the earliest compliant date
  rent-review serve <tenancy> --new-rent=   record the notice, with the sixty day and twelve month checks
  rent charge|paid|credit <tenancy>         record a charge or a receipt. A record, not a bank transaction

Property work
  inspection schedule <property> --on=      book it
  inspection notice <id> [--on=]            record the entry notice, with the 48 hour check
  inspection item <id> "<area>" "<note>"    what you saw, one row per area
  inspection complete <id> [--overall=]     close it and set the next due date
  inspection report <id>                    mark the report sent to the owner
  maintenance new <property> "<what>"       raise it
  maintenance ask|approve|decline|complete  move it through the owner
  job issue <maintenance> "<contractor>"    send someone
  job book|done|invoice|cancel <job>        move the job

The lease calendar
  notice serve <tenancy> "<kind>"           serve a notice, with the notice period checked before it saves
  notices [--all] [--kind=]                 everything served, and anything served short
  vacates                                   who is leaving and what is not booked
  renewals                                  fixed terms running out
  renewal <tenancy> --stage=                where the renewal conversation got to

Compliance and reporting
  compliance [<rule>]                       the Act and the regulations, run against your records
  compliance-items [--property=] [--all]    healthy homes, smoke alarms, insulation statements
  compliance-item done|fail|exempt          close one out
  statements [--all]                        the monthly owner reporting
  statement <owner> [--month=]              build one from the ledger
  statement sent <owner>                    mark it sent

Housekeeping
  tasks [--all] / task add|done             the list
  note "<property|tenancy|owner>" "<what>"  the contact log
  add owner|property|tenant|tenancy|contractor|bond
  import palace|propertyme|console-cloud|csv --owners= --properties= --tenancies= [--dry-run]
  export [--out=file.json]                  the whole database
  stats                                     the portfolio in numbers

Money in dollars: --rent=680 means $680.00. Any command takes --json. Ids shorten to their first 8 characters.
Names and addresses match case-insensitively; an ambiguous one lists the candidates rather than guessing.
No client money lives here. Rent trust accounting stays in the system that already holds it.
`;

const COMMANDS = {
  properties: cmdProperties,
  property: cmdProperty,
  owners: cmdOwners,
  owner: cmdOwner,
  tenancies: cmdTenancies,
  tenancy: cmdTenancy,
  tenants: cmdTenants,
  arrears: cmdArrears,
  'arrears-log': cmdArrearsLog,
  'rent-review': cmdRentReview,
  'rent-reviews': cmdRentReview,
  rent: cmdRent,
  inspections: cmdInspections,
  'inspections-due': cmdInspectionsDue,
  inspection: cmdInspection,
  maintenance: cmdMaintenance,
  jobs: cmdJobs,
  job: cmdJob,
  contractors: cmdContractors,
  notices: cmdNotices,
  notice: cmdNotice,
  vacates: cmdVacates,
  renewals: cmdRenewals,
  renewal: cmdRenewalStage,
  compliance: cmdCompliance,
  'compliance-items': cmdComplianceItems,
  'compliance-item': cmdComplianceItem,
  attention: cmdAttention,
  statements: cmdStatements,
  statement: cmdStatement,
  tasks: cmdTasks,
  task: cmdTask,
  note: cmdNote,
  add: cmdAdd,
  import: cmdImport,
  export: cmdExport,
  stats: cmdStats,
};

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const [command, ...rest] = args;
  if (!command || command === 'help' || flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const fn = COMMANDS[command];
  if (!fn) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 1;
  }
  const db = await getDb();
  try {
    const result = await fn(db, rest, flags);
    if (flags.json) process.stdout.write(JSON.stringify(result.json, null, 2) + '\n');
    else process.stdout.write(result.text.replace(/^\n/, '') + '\n');
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      process.stderr.write(`${e.message}\n`);
      return e.code;
    }
    if (/relation "?\w+"? does not exist/.test(e.message)) {
      process.stderr.write('The database has no tables yet. Run: npm run migrate\n');
      return 1;
    }
    throw e;
  } finally {
    await db.close();
  }
}

process.exitCode = await main();
