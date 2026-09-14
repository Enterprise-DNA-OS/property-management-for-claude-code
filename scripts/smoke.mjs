#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'property-smoke-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded
delete env.PM_MANAGER;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const iso = (v) => String(v ?? '').slice(0, 10);
// Local date, the same way the CLI computes "today". Never UTC: New Zealand is a day ahead of it.
const todayIso = (() => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the portfolio -------------------------------------------------------

  const properties = run('properties', ['property.mjs', 'properties']);
  assert(properties.length >= 27, `the rent roll has every property (${properties.length})`);
  assert(properties.some((p) => p.tenants === 'VACANT'), 'and the vacancies');
  assert(properties.some((p) => n(p.arrears_cents) > 0), 'and properties in arrears');
  assert(properties.every((p) => p.property_ref && p.owner), 'every property has a reference and an owner');

  const vacant = run('properties --vacant', ['property.mjs', 'properties', '--vacant']);
  assert(vacant.length === 2 && vacant.every((p) => p.tenants === 'VACANT'), 'two vacancies in the demo');

  const byOwner = run('properties for one owner', ['property.mjs', 'properties', '--owner=Nikau']);
  assert(byOwner.length === 3 && byOwner.every((p) => p.owner === 'Nikau Investments Ltd'), 'one owner, their own properties');

  const card = run('property card', ['property.mjs', 'property', 'PR-1007']);
  assert(card.property.address_line === '3/14 Coromandel Street', 'resolved by reference');
  assert(card.tenancies.length >= 1, 'the property has a tenancy');
  assert(card.compliance.length === 7, 'seven compliance items on every property');
  assert(card.compliance.some((c) => c.status === 'not compliant'), 'and this one has gaps');
  assert(card.inspections.length >= 2, 'and an inspection history');

  const byAddress = run('property resolved by address', ['property.mjs', 'property', 'Cleveland']);
  assert(byAddress.property.ref === 'PR-1021', 'partial address matching works');

  const ambiguous = run('an ambiguous address lists the candidates and exits 1', ['property.mjs', 'property', 'Street'], {
    json: false,
    expectFail: true,
  });
  assert(/matches \d+ property records/.test(ambiguous.stderr), 'it lists the candidates rather than guessing');

  const noSuch = run('an unknown property exits 1', ['property.mjs', 'property', 'nowhere at all'], { json: false, expectFail: true });
  assert(/No property matches/.test(noSuch.stderr), 'and says so plainly');

  // ---- owners --------------------------------------------------------------

  const owners = run('owners', ['property.mjs', 'owners']);
  assert(owners.length === 14, `every active owner (${owners.length})`);
  assert(owners.some((o) => o.owner_type === 'trust') && owners.some((o) => o.owner_type === 'company'), 'trusts and companies as well as people');
  assert(n(owners[0].weekly_rent_cents) >= n(owners[owners.length - 1].weekly_rent_cents), 'sorted by rent under management');
  assert(owners.some((o) => n(o.compliance_gaps) > 0), 'some owners have compliance to pay for');

  const owner = run('owner card', ['property.mjs', 'owner', 'Harbour Rise']);
  assert(owner.owner.name === 'Harbour Rise Holdings Ltd', 'resolved by partial name');
  assert(owner.properties.length === 4, 'with all four properties');
  assert(owner.statements.length >= 3, 'and three months of statements');
  assert(owner.compliance.length >= 1, 'and the compliance the owner has to fund');

  // ---- tenancies -----------------------------------------------------------

  const tenancies = run('tenancies', ['property.mjs', 'tenancies']);
  assert(tenancies.length === 25, `twenty five running tenancies (${tenancies.length})`);
  assert(tenancies.some((t) => t.kind === 'fixed term'), 'fixed terms as well as periodic');
  assert(tenancies.some((t) => t.rent_period === 'fortnightly'), 'and tenants who pay fortnightly');
  assert(tenancies.some((t) => t.status === 'notice given'), 'and tenancies under notice');

  const allTenancies = run('tenancies --all', ['property.mjs', 'tenancies', '--all']);
  assert(allTenancies.length === 27, 'including the two that have ended');

  const tenancy = run('tenancy card', ['property.mjs', 'tenancy', 'TEN-2007']);
  assert(tenancy.tenancy.tenancy_ref === 'TEN-2007', 'resolved by reference');
  assert(tenancy.tenants.length >= 1 && tenancy.tenants[0].is_primary, 'with a primary tenant');
  assert(tenancy.arrears && n(tenancy.arrears.days_behind) >= 21, 'this one is a long way behind');
  assert(tenancy.schedule.length === 2, 'a start rent and one increase');
  assert(tenancy.ledger.length === 12, 'and a rent ledger');
  assert(tenancy.arrears_events.length >= 4, 'and the arrears process on file');
  assert(tenancy.bond && tenancy.bond.lodged_on, 'the bond is lodged');
  assert(tenancy.tenancy.healthy_homes_statement === false, 'and the healthy homes statement is missing, on purpose');

  const byTenant = run('tenancy resolved by tenant name', ['property.mjs', 'tenancy', 'Marcus Vaeau']);
  assert(byTenant.tenancy.tenancy_ref === 'TEN-2007', 'you can look up a tenancy by who lives there');

  const tenants = run('tenants', ['property.mjs', 'tenants']);
  assert(tenants.length >= 34, `the tenants in running tenancies (${tenants.length})`);

  // ---- arrears -------------------------------------------------------------

  const arrears = run('arrears', ['property.mjs', 'arrears']);
  assert(arrears.length === 4, `four tenancies behind (${arrears.length})`);
  assert(arrears[0].tenancy_ref === 'TEN-2007' && n(arrears[0].days_behind) >= 21, 'worst first');
  assert(/Tenancy Tribunal/.test(arrears[0].next_step), 'and the next step is the Tribunal');
  assert(arrears.some((a) => /14 day notice to remedy/.test(a.next_step)), 'one needs the 14 day notice');
  assert(arrears.some((a) => /notice of overdue rent/.test(a.next_step)), 'one needs the first notice');
  assert(arrears.every((a) => n(a.arrears_cents) > 0), 'every row owes money');
  assert(arrears.some((a) => n(a.working_days_behind) < n(a.days_behind)), 'working days are counted separately from calendar days');

  const serious = run('arrears --min-days=14', ['property.mjs', 'arrears', '--min-days=14']);
  assert(serious.length === 2, 'two are past a fortnight');

  const logged = run('arrears-log', ['property.mjs', 'arrears-log', 'TEN-2013', '14 day notice to remedy']);
  assert(logged.action === '14 day notice to remedy', 'the step is recorded');
  const afterLog = run('the arrears step changes the next step', ['property.mjs', 'arrears']);
  const duncan = afterLog.find((a) => a.tenancy_ref === 'TEN-2013');
  assert(/14 day notice is running/.test(duncan.next_step), 'and the file moves on');
  const noticesAfter = run('serving a notice writes a notice record', ['property.mjs', 'notices', '--kind=14 day notice to remedy']);
  assert(noticesAfter.length >= 2, 'the notice register picked it up');

  // ---- rent reviews --------------------------------------------------------

  const reviews = run('rent-review', ['property.mjs', 'rent-review']);
  assert(reviews.length >= 4, `rent reviews the Act now allows (${reviews.length})`);
  assert(reviews.every((r) => n(r.days_away) <= 60), 'nothing beyond sixty days');
  assert(reviews.some((r) => n(r.gap_to_market_cents) > 0), 'and some are under market rent');

  const history = run('rent-review for one tenancy', ['property.mjs', 'rent-review', 'TEN-2001']);
  assert(history.schedule.length === 2, 'the rent history is there');
  assert(history.eligible_from < todayIso, 'and this one is already eligible');

  const badNotice = run('a rent increase with short notice is refused', [
    'property.mjs', 'rent-review', 'serve', 'TEN-2001', '--new-rent=700', `--effective=${todayIso}`,
  ], { json: false, expectFail: true });
  assert(/sixty/.test(badNotice.stderr) && /earliest compliant effective date/.test(badNotice.stderr), 'and it says why and when it would be legal');

  const tooSoon = run('a rent increase inside twelve months is refused', [
    'property.mjs', 'rent-review', 'serve', 'TEN-2020', '--new-rent=650',
  ], { json: false, expectFail: true });
  assert(/twelve months/.test(tooSoon.stderr), 'the frequency rule bites too');

  const served = run('rent-review serve', ['property.mjs', 'rent-review', 'serve', 'TEN-2001', '--new-rent=700']);
  assert(n(served.amount_cents) === 70000 && served.reason === 'rent review', 'the new rent is scheduled');
  assert(iso(served.notice_served_on) === todayIso, 'with today as the notice date');
  const rentNotices = run('and a rent increase notice is on the register', ['property.mjs', 'notices', '--kind=rent increase']);
  assert(rentNotices.some((x) => x.tenancy_ref === 'TEN-2001'), 'the notice was written');

  const receipt = run('rent paid', ['property.mjs', 'rent', 'paid', 'TEN-2004', '--amount=147.50']);
  assert(n(receipt.amount_cents) === 14750 && receipt.kind === 'payment', 'a receipt is a ledger row');
  const arrearsAfterPayment = run('the water recharge is cleared', ['property.mjs', 'arrears']);
  assert(!arrearsAfterPayment.some((a) => a.tenancy_ref === 'TEN-2004'), 'and the tenancy drops off the arrears list');

  // ---- inspections ---------------------------------------------------------

  const due = run('inspections-due', ['property.mjs', 'inspections-due']);
  assert(due.length >= 8, `inspections due inside thirty days (${due.length})`);
  assert(due.filter((d) => n(d.days_overdue) > 0).length >= 4, 'and several already overdue');
  assert(due.some((d) => d.last_inspection_on === null), 'including one nobody has ever inspected');
  assert(due.some((d) => d.scheduled_on && n(d.notice_days) < 2), 'and one booked without proper entry notice');

  const overdueOnly = run('inspections-due --overdue', ['property.mjs', 'inspections-due', '--overdue']);
  assert(overdueOnly.every((d) => n(d.days_overdue) > 0), 'the overdue filter works');

  const booked = run('inspection schedule', ['property.mjs', 'inspection', 'schedule', 'PR-1014', '--on=' + addDays(todayIso, 10)]);
  assert(booked.kind === 'routine' && iso(booked.scheduled_on) === addDays(todayIso, 10), 'the inspection is booked');
  const inspectionId = booked.id;

  const noticed = run('inspection notice', ['property.mjs', 'inspection', 'notice', inspectionId.slice(0, 8)]);
  assert(iso(noticed.notice_served_on) === todayIso, 'the entry notice is recorded');

  run('inspection item', ['property.mjs', 'inspection', 'item', inspectionId.slice(0, 8), 'Bathroom', 'Extractor still vents into the ceiling', '--action']);
  const done = run('inspection complete', ['property.mjs', 'inspection', 'complete', inspectionId.slice(0, 8), '--overall=fair', '--summary=Fan not fixed']);
  assert(done.inspection.overall === 'fair' && done.items.length === 1, 'the inspection closes with its findings');
  assert(iso(done.inspection.next_due_on) === addDays(todayIso, 91), 'and the next one is diarised on the cycle');

  const reported = run('inspection report', ['property.mjs', 'inspection', 'report', inspectionId.slice(0, 8)]);
  assert(iso(reported.report_sent_on) === todayIso, 'and the owner report is marked sent');

  const unsent = run('inspections --unsent', ['property.mjs', 'inspections', '--unsent']);
  assert(unsent.length >= 1 && unsent.every((i) => i.completed_on && !i.report_sent_on), 'reports nobody sent are findable');

  // ---- maintenance ---------------------------------------------------------

  const maintenance = run('maintenance', ['property.mjs', 'maintenance']);
  assert(maintenance.length >= 11, `open maintenance (${maintenance.length})`);
  assert(maintenance[0].priority === 'urgent', 'urgent first');
  assert(maintenance.some((m) => m.habitability), 'the demo has habitability work open');
  assert(maintenance.some((m) => n(m.days_waiting_on_owner) >= 12), 'and jobs sitting on an owner for a fortnight');
  assert(maintenance.some((m) => m.owner_approved_on && !m.job_id), 'and one approved that nobody has actioned');

  const urgent = run('maintenance --urgent', ['property.mjs', 'maintenance', '--urgent']);
  assert(urgent.length >= 2 && urgent.every((m) => m.priority === 'urgent' || m.habitability), 'the urgent filter works');

  const raised = run('maintenance new', ['property.mjs', 'maintenance', 'new', 'PR-1021', 'Gutter overflowing at the front', '--priority=high', '--category=roofing']);
  assert(raised.job_ref && raised.status === 'new' && raised.priority === 'high', 'a request gets a reference');
  const mref = raised.job_ref;

  const blocked = run('a job cannot be issued before the owner approves', [
    'property.mjs', 'job', 'issue', mref, 'Capital Roofing',
  ], { json: false, expectFail: true });
  assert(/has not been approved by the owner/.test(blocked.stderr), 'and it says so');

  run('maintenance ask', ['property.mjs', 'maintenance', 'ask', mref, '--quote=640']);
  const approved = run('maintenance approve', ['property.mjs', 'maintenance', 'approve', mref]);
  assert(iso(approved.owner_approved_on) === todayIso, 'the owner approval is dated');

  const job = run('job issue', ['property.mjs', 'job', 'issue', mref, 'Capital Roofing', '--quote=640']);
  assert(job.job_no && job.status === 'issued', 'the contractor has the job');
  const jobNo = job.job_no;

  run('job book', ['property.mjs', 'job', 'book', jobNo, '--on=' + addDays(todayIso, 4)]);
  run('job done', ['property.mjs', 'job', 'done', jobNo, '--complete']);
  const invoiced = run('job invoice', ['property.mjs', 'job', 'invoice', jobNo, '--amount=712.50', '--ref=INV-5511']);
  assert(n(invoiced.invoiced_cents) === 71250 && invoiced.invoice_ref === 'INV-5511', 'the invoice is recorded against the job');

  const jobs = run('jobs', ['property.mjs', 'jobs']);
  assert(jobs.some((j) => j.completed_on && !j.invoiced_on), 'the demo has finished work nobody has invoiced');

  const contractors = run('contractors', ['property.mjs', 'contractors']);
  assert(contractors.length === 8, 'the trade list');
  assert(contractors.some((c) => c.insurance_expires_on && iso(c.insurance_expires_on) < todayIso), 'and one whose insurance has lapsed');

  // ---- notices and the lease calendar ---------------------------------------

  const notices = run('notices', ['property.mjs', 'notices']);
  assert(notices.length >= 20, `the notice register (${notices.length})`);
  assert(notices.some((x) => x.short_notice), 'and it flags anything served short');

  const shortTermination = run('a short termination notice is refused', [
    'property.mjs', 'notice', 'serve', 'TEN-2005', 'termination 90 day', `--effective=${addDays(todayIso, 20)}`,
  ], { json: false, expectFail: true });
  assert(/needs at least 90 days/.test(shortTermination.stderr), 'with the number the Act wants');

  const termination = run('notice serve', ['property.mjs', 'notice', 'serve', 'TEN-2003', 'termination 90 day', '--reason=Owner moving in']);
  assert(termination.kind === 'termination 90 day', 'the notice is on the register');
  assert(iso(termination.effective_on) === addDays(todayIso, 90), 'and the effective date defaults to the statutory period');

  const vacates = run('vacates', ['property.mjs', 'vacates']);
  assert(vacates.length >= 3, `vacates booked (${vacates.length})`);
  assert(vacates.some((v) => /NO EXIT INSPECTION/.test(v.detail)), 'and one with no exit inspection booked');

  const renewals = run('renewals', ['property.mjs', 'renewals']);
  assert(renewals.length >= 2, 'fixed terms running out');
  assert(renewals.some((r) => /not started/.test(r.detail)), 'and one nobody has started');

  const stage = run('renewal stage', ['property.mjs', 'renewal', 'TEN-2004', '--stage=agreed', '--note=Twelve more months at 780']);
  assert(stage.renewal_stage === 'agreed', 'the renewal conversation is recorded');

  // ---- compliance ------------------------------------------------------------

  const items = run('compliance-items', ['property.mjs', 'compliance-items']);
  assert(items.length >= 6, `compliance items not met (${items.length})`);
  assert(items.some((c) => /healthy homes/.test(c.kind)), 'healthy homes standards among them');
  assert(items.some((c) => c.kind === 'smoke alarms'), 'and smoke alarms');

  const closed = run('compliance-item done', ['property.mjs', 'compliance-item', 'done', 'PR-1003', 'smoke alarms', '--evidence=INV-9910']);
  assert(closed.status === 'compliant' && closed.evidence_ref === 'INV-9910', 'an item closes out with its evidence');

  const compliance = run('compliance', ['property.mjs', 'compliance']);
  assert(compliance.length === 11, `eleven rules (${compliance.length})`);
  assert(compliance.every((r) => r.source && /Act|Regulations|Privacy/.test(r.source)), 'every rule cites its source');
  const byKey = Object.fromEntries(compliance.map((r) => [r.key, r]));
  assert(byKey['bond-lodgement'].breaches === 1, 'the bond nobody lodged is found');
  assert(byKey['bond-cap'].breaches === 1, 'and the bond of five weeks rent');
  assert(byKey['rent-increase-frequency'].breaches === 1, 'and the two increases inside a year');
  assert(byKey['rent-increase-notice'].breaches === 1, 'and the increase served with 32 days notice');
  assert(byKey['arrears-process'].breaches >= 1, 'and the arrears steps that were skipped');
  assert(byKey['healthy-homes'].breaches === 4, 'and the healthy homes items still open');
  assert(byKey['healthy-homes-statement'].breaches === 2, 'and the agreements with no compliance statement');
  assert(byKey['termination-notice'].breaches === 1, 'and the 42 day notice served with 35 days');
  assert(byKey['tenant-records'].breaches === 2, 'and the tenant records held eight years after the tenancy ended');
  assert(byKey['smoke-alarms'].breaches >= 2, 'and the smoke alarms nobody has checked');
  assert(byKey['inspection-notice'].rows.every((r) => /notice/.test(r.detail)), 'the detail says what is wrong');

  const oneRule = run('compliance <rule>', ['property.mjs', 'compliance', 'bond-lodgement']);
  assert(oneRule.length === 1 && oneRule[0].key === 'bond-lodgement', 'a single rule can be run on its own');

  const unknownRule = run('an unknown rule exits 1', ['property.mjs', 'compliance', 'not-a-rule'], { json: false, expectFail: true });
  assert(/No rule called/.test(unknownRule.stderr), 'and lists the ones that exist');

  const bondLodged = run('add bond lodges it', ['property.mjs', 'add', 'bond', 'TEN-2011', '--number=BN99887766']);
  assert(iso(bondLodged.lodged_on) === todayIso && bondLodged.status === 'held', 'the bond is lodged');
  const afterBond = run('and the compliance breach clears', ['property.mjs', 'compliance', 'bond-lodgement']);
  assert(afterBond[0].breaches === 0, 'the rule is clean once the bond is lodged');

  // ---- the week ---------------------------------------------------------------

  const attention = run('attention', ['property.mjs', 'attention']);
  assert(attention.length >= 30, `the attention list (${attention.length})`);
  const reasons = new Set(attention.map((a) => a.reason));
  for (const r of ['arrears_tribunal', 'maintenance_habitability', 'inspection_overdue', 'compliance_overdue', 'rent_review_due', 'statement_not_sent', 'owner_quiet']) {
    assert(reasons.has(r), `the attention list covers ${r}`);
  }
  assert(attention.every((a) => a.detail && a.detail.length > 10), 'every row says what is actually wrong');

  const mine = run('attention for one manager', ['property.mjs', 'attention', '--manager=Mere']);
  assert(mine.length && mine.every((a) => a.manager === 'Mere Tipene'), 'and it filters by manager');

  const stats = run('stats', ['property.mjs', 'stats']);
  assert(n(stats.properties) >= 27 && n(stats.owners) === 14, 'the portfolio adds up');
  assert(n(stats.rent_week_cents) > 1000000, 'the rent roll is real money');
  assert(n(stats.vacant) === 2, 'and it counts the vacancies');

  // ---- owner reporting ---------------------------------------------------------

  const statements = run('statements', ['property.mjs', 'statements']);
  assert(statements.length >= 14, `the last three months of statements (${statements.length})`);
  assert(statements.some((s) => s.status !== 'sent'), 'and the ones nobody sent');

  const built = run('statement', ['property.mjs', 'statement', 'Margaret Ellis']);
  assert(n(built.rent_received_cents) > 0 && n(built.management_fees_cents) > 0, 'a statement is built from the ledger');
  assert(n(built.disbursed_cents) === n(built.rent_received_cents) - n(built.management_fees_cents) - n(built.expenses_cents), 'and it balances');

  const sent = run('statement sent', ['property.mjs', 'statement', 'sent', 'Peter Voss']);
  assert(sent.length >= 1 && sent.every((s) => s.status === 'sent'), 'statements can be marked sent');

  // ---- housekeeping -------------------------------------------------------------

  const tasks = run('tasks', ['property.mjs', 'tasks']);
  assert(tasks.length >= 9, 'the task list');
  const added = run('task add', ['property.mjs', 'task', 'add', 'Chase the Whitby wasp nest', '--property=PR-1023', '--due=' + addDays(todayIso, 3)]);
  assert(added.title === 'Chase the Whitby wasp nest' && iso(added.due_on) === addDays(todayIso, 3), 'a task lands with its date');
  const taskDone = run('task done', ['property.mjs', 'task', 'done', added.id.slice(0, 8)]);
  assert(taskDone.status === 'done', 'and it closes');

  const note = run('note', ['property.mjs', 'note', 'PR-1013', 'Rang about the oven, electrician booked for Thursday', '--kind=call']);
  assert(note.property_id && note.tenancy_id, 'a note against a property attaches to the running tenancy too');

  const newOwner = run('add owner', ['property.mjs', 'add', 'owner', 'Test Holdings Ltd', '--type=company', '--email=t@example.com']);
  assert(newOwner.name === 'Test Holdings Ltd', 'an owner can be added');
  const newProperty = run('add property', ['property.mjs', 'add', 'property', '99 Test Street', '--owner=Test Holdings', '--suburb=Petone', '--rent=650']);
  assert(newProperty.ref && newProperty.address_line === '99 Test Street', 'a property can be added');
  const newItems = run('a new property gets its compliance items', ['property.mjs', 'compliance-items', `--property=${newProperty.ref}`, '--all']);
  assert(newItems.length === 7 && newItems.every((c) => c.status === 'unknown'), 'seven items, all unknown until somebody assesses them');

  const bigBond = run('a bond over four weeks rent is refused', [
    'property.mjs', 'add', 'tenancy', `--property=${newProperty.ref}`, '--rent=650', '--bond=3500',
  ], { json: false, expectFail: true });
  assert(/four weeks rent/.test(bigBond.stderr), 'the cap in RTA 1986 s 18(1) is enforced at the point of entry');

  const newTenancy = run('add tenancy', ['property.mjs', 'add', 'tenancy', `--property=${newProperty.ref}`, '--rent=650', '--healthy-homes', '--insulation-statement']);
  assert(newTenancy.tenancy_ref && n(newTenancy.bond_cents) === 260000, 'the bond defaults to four weeks');
  const newTenant = run('add tenant', ['property.mjs', 'add', 'tenant', 'Test Tenant', `--tenancy=${newTenancy.tenancy_ref}`, '--primary']);
  assert(newTenant.full_name === 'Test Tenant', 'a tenant can be added to a tenancy');
  const newTenancyCard = run('the new tenancy reads back', ['property.mjs', 'tenancy', newTenancy.tenancy_ref]);
  assert(newTenancyCard.tenants.length === 1 && newTenancyCard.bond && !newTenancyCard.bond.lodged_on, 'with the tenant, and a bond waiting to be lodged');

  run('add contractor', ['property.mjs', 'add', 'contractor', 'Test Trades Ltd', '--trade=building', '--phone=04 555 0000']);

  // ---- import ---------------------------------------------------------------------

  const ownersCsv = path.join(dataDir, 'owners.csv');
  const propertiesCsv = path.join(dataDir, 'properties.csv');
  const tenanciesCsv = path.join(dataDir, 'tenancies.csv');
  writeFileSync(
    ownersCsv,
    'Owner Code,Owner Name,Email,Phone,Postal Address,City\n' +
      'OWN-501,"Kereopa, Hine",hine.k@example.com,027 555 0900,"14 Rimu Street",Lower Hutt\n' +
      'OWN-502,Pacific Rentals Ltd,admin@example.com,04 555 0901,PO Box 12,Wellington\n',
  );
  writeFileSync(
    propertiesCsv,
    'Property Code,Property Address,Suburb,City,Owner Code,Management Fee,Bedrooms,Property Type,Market Rent\n' +
      'PRP-901,7 Totara Crescent,Naenae,Lower Hutt,OWN-501,8.5%,3,House,"$640.00"\n' +
      'PRP-902,12A Marine Parade,Eastbourne,Lower Hutt,OWN-502,7.5%,2,Unit,"$1,050.00"\n',
  );
  writeFileSync(
    tenanciesCsv,
    'Tenancy Code,Property Code,Start Date,Rent,Rent Period,Bond,Paid To,Tenant Name,Tenant Email,Tenant Phone\n' +
      'TCY-801,PRP-901,01/03/2025,"$620.00",Weekly,"$2,480.00",01/09/2026,"Ari Solomon and Kate Solomon",ari.s@example.com,027 555 0910\n' +
      'TCY-802,PRP-902,15/07/2024,"$1,020.00",Fortnightly,"$2,040.00",,Rebecca Tuilagi,r.tuilagi@example.com,027 555 0911\n',
  );

  const dry = run('import --dry-run', [
    'property.mjs', 'import', 'palace', `--owners=${ownersCsv}`, `--properties=${propertiesCsv}`, `--tenancies=${tenanciesCsv}`, '--dry-run',
  ]);
  assert(n(dry.owners) === 2 && n(dry.properties) === 2 && n(dry.tenancies) === 2, 'the dry run says what it would do');
  const stillMissing = run('and changes nothing', ['property.mjs', 'properties', '--all']);
  assert(!stillMissing.some((p) => p.property === '7 Totara Crescent'), 'the dry run really is dry');

  const imported = run('import', [
    'property.mjs', 'import', 'palace', `--owners=${ownersCsv}`, `--properties=${propertiesCsv}`, `--tenancies=${tenanciesCsv}`,
  ]);
  assert(n(imported.owners) === 2 && n(imported.properties) === 2 && n(imported.tenancies) === 2, 'everything came across');
  assert(n(imported.tenants) === 3, 'and three tenants, because one row had two names in it');

  const importedTenancy = run('the imported tenancy reads back', ['property.mjs', 'tenancy', 'TCY-801']);
  assert(iso(importedTenancy.tenancy.start_on) === '2025-03-01', 'DD/MM/YYYY dates parse');
  assert(n(importedTenancy.tenancy.rent_cents) === 62000, 'money with a dollar sign parses');
  assert(importedTenancy.tenants.length === 2, 'two names in one cell become two tenants');
  assert(importedTenancy.arrears && n(importedTenancy.arrears.arrears_cents) > 0, 'and the paid-to date carries the arrears across on day one');

  const importedFortnightly = run('a fortnightly tenancy imports', ['property.mjs', 'tenancy', 'TCY-802']);
  assert(importedFortnightly.tenancy.rent_period === 'fortnightly' && n(importedFortnightly.tenancy.rent_cents) === 102000, 'the period and the amount both come across');

  const importedComma = run('a quoted comma in an owner name survives', ['property.mjs', 'owner', 'Kereopa, Hine']);
  assert(importedComma.owner.name === 'Kereopa, Hine', 'the CSV parser handles quoted commas');
  assert(importedComma.properties.length === 1, 'and the property links to the owner by code');

  const reimport = run('re-importing updates rather than duplicating', [
    'property.mjs', 'import', 'propertyme', `--owners=${ownersCsv}`,
  ]);
  assert(n(reimport.owners) === 0 && n(reimport.owners_updated) === 2, 'the second run creates nothing new');

  const missingFile = run('a missing import file fails loudly', [
    'property.mjs', 'import', 'csv', `--owners=${path.join(dataDir, 'not-there.csv')}`,
  ], { json: false, expectFail: true });
  assert(/No owners file/.test(missingFile.stderr), 'it exits non zero rather than importing nothing quietly');

  // ---- export -------------------------------------------------------------------

  const outFile = path.join(dataDir, 'dump.json');
  const dump = run('export', ['property.mjs', 'export', `--out=${outFile}`]);
  assert(existsSync(outFile), 'the export file is on disk');
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
  assert(parsed.properties.length === n(dump.counts.properties), 'the counts match the file');
  assert(parsed.rent_ledger.length > 1000, 'the export carries the whole rent ledger');
  assert(parsed.compliance_items.length >= 189, 'and every compliance item');
  assert(!Object.keys(parsed).some((t) => /trust|receipt|disbursement|payment_run/.test(t)), 'there is no client money in the export');

  // ---- the branded HTML -----------------------------------------------------------

  const views = run('npm run view', ['view.mjs'], { json: false });
  assert(/views[\\/]week\.html/.test(views.stdout) && /views[\\/]portfolio\.html/.test(views.stdout), 'both views rendered');
  const weekHtml = readFileSync(path.join(root, 'views', 'week.html'), 'utf8');
  assert(weekHtml.includes('Needs a decision') && weekHtml.includes('Arrears'), 'the week view has its sections');
  assert(weekHtml.includes('Inspections due') && weekHtml.includes('Maintenance open') && weekHtml.includes('The lease calendar'), 'and the rest of the week');
  const portfolioHtml = readFileSync(path.join(root, 'views', 'portfolio.html'), 'utf8');
  assert(portfolioHtml.includes('The rent roll') && portfolioHtml.includes('Where the fee income comes from'), 'the portfolio view has its sections');

  const docs = run('npm run docs', ['docs.mjs'], { json: false });
  assert(/owner-monthly-summary/.test(docs.stdout), 'the owner summary rendered');
  assert(/inspection-report/.test(docs.stdout), 'the inspection report rendered');
  assert(/arrears-notice-draft/.test(docs.stdout), 'the arrears letter rendered');
  const summary = readFileSync(path.join(root, 'docs-out', 'owner-monthly-summary', 'harbour-rise-holdings-ltd.html'), 'utf8');
  assert(summary.includes('The month in figures') && summary.includes('Each property'), 'the owner summary has its sections');
  assert(summary.includes('Compliance') && summary.includes('Healthy Homes Standards'), 'and it names the rule the owner has to fund');

  // ---- the human readable side ------------------------------------------------------

  run('properties (text)', ['property.mjs', 'properties'], { json: false });
  run('property (text)', ['property.mjs', 'property', 'PR-1010'], { json: false });
  run('owners (text)', ['property.mjs', 'owners'], { json: false });
  run('owner (text)', ['property.mjs', 'owner', 'Ellis Family Trust'], { json: false });
  run('tenancies (text)', ['property.mjs', 'tenancies'], { json: false });
  run('tenancy (text)', ['property.mjs', 'tenancy', 'TEN-2013'], { json: false });
  run('tenants (text)', ['property.mjs', 'tenants'], { json: false });
  run('arrears (text)', ['property.mjs', 'arrears'], { json: false });
  run('rent-review (text)', ['property.mjs', 'rent-review'], { json: false });
  run('inspections-due (text)', ['property.mjs', 'inspections-due'], { json: false });
  run('inspections (text)', ['property.mjs', 'inspections'], { json: false });
  run('maintenance (text)', ['property.mjs', 'maintenance'], { json: false });
  run('maintenance card (text)', ['property.mjs', 'maintenance', 'MNT-3005'], { json: false });
  run('jobs (text)', ['property.mjs', 'jobs', '--all'], { json: false });
  run('contractors (text)', ['property.mjs', 'contractors'], { json: false });
  run('notices (text)', ['property.mjs', 'notices'], { json: false });
  run('vacates (text)', ['property.mjs', 'vacates'], { json: false });
  run('renewals (text)', ['property.mjs', 'renewals'], { json: false });
  run('compliance-items (text)', ['property.mjs', 'compliance-items'], { json: false });
  run('compliance (text)', ['property.mjs', 'compliance'], { json: false });
  run('attention (text)', ['property.mjs', 'attention'], { json: false });
  run('statements (text)', ['property.mjs', 'statements'], { json: false });
  run('tasks (text)', ['property.mjs', 'tasks', '--all'], { json: false });
  run('stats (text)', ['property.mjs', 'stats'], { json: false });
  run('help', ['property.mjs', 'help'], { json: false });
  run('an unknown command exits 1', ['property.mjs', 'nonsense'], { json: false, expectFail: true });

  console.log(`\n${step} checks, PASS`);
} finally {
  if (existsSync(dataDir)) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Windows can hold the handle briefly; a leftover temp dir is harmless.
    }
  }
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
