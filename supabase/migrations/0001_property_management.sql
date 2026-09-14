-- property-management-for-claude-code: core schema.
-- A residential property management business: owners and their properties,
-- tenancies and tenants, the rent schedule and the rent ledger, arrears and the
-- notices that follow them, bonds, routine inspections and their findings,
-- maintenance requests and the contractor jobs under them, notices served,
-- vacates and renewals, the compliance items every rental carries, tasks, the
-- contact log and the owner statements the business sends every month.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
--
-- Money is stored in cents and it is a RECORD, not a bank balance. Rent trust
-- accounting stays in the system that holds it today: this database never moves
-- money, never reconciles a trust account and never pays an owner. It records
-- what was charged, what was received, what is owed and what the business must
-- report. That boundary is deliberate and it is written into every command.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Working days, because the Residential Tenancies Act counts in them: a bond
-- has 23 working days to reach Tenancy Services, and rent is overdue after five.
create or replace function working_days_between(d1 date, d2 date) returns integer
language plpgsql immutable as $$
declare n integer := 0; i integer;
begin
  if d1 is null or d2 is null or d2 <= d1 then return 0; end if;
  for i in 0 .. (d2 - d1) - 1 loop
    if extract(isodow from (d1 + i)) < 6 then n := n + 1; end if;
  end loop;
  return n;
end
$$;

-- People --------------------------------------------------------------------
-- The property managers. A portfolio manager runs a rent roll, the principal
-- signs off, the maintenance coordinator runs the jobs, admin runs the bonds.

create table if not exists managers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  code          text,
  email         text,
  phone         text,
  role          text not null default 'property manager',
  active        boolean not null default true,
  started_on    date,
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists managers_name_lower_idx on managers (lower(full_name));

-- Owners --------------------------------------------------------------------
-- The landlord. Individuals, couples, family trusts and companies. statement_day
-- is the day of the month the owner is used to being paid and reported to.

create table if not exists owners (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  owner_type        text not null default 'individual',
  email             text,
  phone             text,
  postal_address    text,
  city              text,
  country           text not null default 'NZ',
  status            text not null default 'active',
  manager_id        uuid references managers(id) on delete set null,
  owner_since       date,
  statement_day     integer not null default 20,
  payment_reference text,
  gst_registered    boolean not null default false,
  external_ref      text unique,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists owners_name_lower_idx on owners (lower(name));
create index if not exists owners_manager_idx on owners (manager_id);

-- Properties ----------------------------------------------------------------
-- The managed property. inspection_cycle_days is the business's own routine
-- inspection promise to the owner, usually every three months. The Act caps
-- inspections at one every four weeks (s 48(2)); the cycle is the plan.

create table if not exists properties (
  id                     uuid primary key default gen_random_uuid(),
  ref                    text not null unique,
  address_line           text not null,
  suburb                 text,
  city                   text,
  region                 text,
  country                text not null default 'NZ',
  property_type          text not null default 'house',
  bedrooms               integer,
  bathrooms              integer,
  parking                text,
  floor_area_m2          integer,
  year_built             integer,
  owner_id               uuid not null references owners(id) on delete cascade,
  manager_id             uuid references managers(id) on delete set null,
  status                 text not null default 'managed',
  management_fee_pct     numeric(5,2) not null default 8.00,
  letting_fee_weeks      numeric(4,2) not null default 1.00,
  market_rent_cents      bigint not null default 0,
  inspection_cycle_days  integer not null default 91,
  insurer                text,
  insurance_expires_on   date,
  keys_held              integer,
  chattels               text,
  external_ref           text unique,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists properties_owner_idx on properties (owner_id);
create index if not exists properties_manager_idx on properties (manager_id);
create unique index if not exists properties_address_lower_idx on properties (lower(address_line));

-- Tenants -------------------------------------------------------------------

create table if not exists tenants (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  email              text,
  phone              text,
  emergency_contact  text,
  employer           text,
  notes              text,
  external_ref       text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists tenants_name_idx on tenants (lower(full_name));

-- Tenancies -----------------------------------------------------------------
-- One tenancy is one agreement over one property. A fixed term that rolls over
-- becomes periodic; a new agreement is a new tenancy. healthy_homes_statement
-- and insulation_statement are the signed statements the agreement must carry.

create table if not exists tenancies (
  id                       uuid primary key default gen_random_uuid(),
  tenancy_ref              text not null unique,
  property_id              uuid not null references properties(id) on delete cascade,
  manager_id               uuid references managers(id) on delete set null,
  kind                     text not null default 'periodic',
  status                   text not null default 'active',
  start_on                 date not null,
  fixed_term_end_on        date,
  end_on                   date,
  rent_cents               bigint not null default 0,
  rent_period              text not null default 'weekly',
  rent_due_day             text,
  bond_cents               bigint not null default 0,
  agreement_signed_on      date,
  healthy_homes_statement  boolean not null default false,
  insulation_statement     boolean not null default false,
  last_increase_on         date,
  renewal_stage            text not null default 'not started',
  renewal_note             text,
  vacate_notice_on         date,
  vacate_on                date,
  vacate_notice_by         text,
  vacate_reason            text,
  external_ref             text unique,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists tenancies_property_idx on tenancies (property_id);
create index if not exists tenancies_status_idx on tenancies (status);

create table if not exists tenancy_tenants (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid not null references tenancies(id) on delete cascade,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists tenancy_tenants_pair_idx on tenancy_tenants (tenancy_id, tenant_id);

-- The rent schedule ---------------------------------------------------------
-- Every rent this tenancy has ever been on, with the notice that put it there.
-- The Act allows one increase every twelve months on 60 days written notice
-- (RTA 1986 s 24), and this table is what proves it.

create table if not exists rent_schedule (
  id                uuid primary key default gen_random_uuid(),
  tenancy_id        uuid not null references tenancies(id) on delete cascade,
  amount_cents      bigint not null,
  period            text not null default 'weekly',
  effective_on      date not null,
  ends_on           date,
  reason            text not null default 'new tenancy',
  notice_served_on  date,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists rent_schedule_tenancy_idx on rent_schedule (tenancy_id, effective_on desc);

-- The rent ledger -----------------------------------------------------------
-- Charges and receipts as a RECORD. Nothing here is a bank transaction. The
-- trust account that actually holds the money stays where it is.

create table if not exists rent_ledger (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references tenancies(id) on delete cascade,
  entry_on      date not null,
  kind          text not null default 'charge',
  amount_cents  bigint not null,
  method        text,
  reference     text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists rent_ledger_tenancy_idx on rent_ledger (tenancy_id, entry_on desc);

-- Arrears -------------------------------------------------------------------
-- Every step of the arrears process, in order, so the file stands up at the
-- Tenancy Tribunal: noted, notice of overdue rent, 14 day notice to remedy,
-- payment plan, application, resolved.

create table if not exists arrears_events (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references tenancies(id) on delete cascade,
  noted_on      date not null,
  action        text not null default 'noted',
  days_behind   integer,
  amount_cents  bigint not null default 0,
  manager_id    uuid references managers(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists arrears_events_tenancy_idx on arrears_events (tenancy_id, noted_on desc);

-- Bonds ---------------------------------------------------------------------
-- Received from the tenant, lodged with Tenancy Services within 23 working days
-- (RTA 1986 s 19), capped at four weeks rent (s 18(1)).

create table if not exists bonds (
  id                       uuid primary key default gen_random_uuid(),
  tenancy_id               uuid not null references tenancies(id) on delete cascade,
  amount_cents             bigint not null default 0,
  received_on              date,
  lodged_on                date,
  bond_number              text,
  status                   text not null default 'not lodged',
  refunded_on              date,
  refund_to_tenant_cents   bigint not null default 0,
  refund_to_owner_cents    bigint not null default 0,
  note                     text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists bonds_tenancy_idx on bonds (tenancy_id);

-- Inspections ---------------------------------------------------------------
-- Entry, routine, exit and healthy homes. notice_served_on is the 48 hour
-- notice the Act requires (RTA 1986 s 48(3)); report_sent_on is the promise to
-- the owner, and it is the one that quietly gets missed.

create table if not exists inspections (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references properties(id) on delete cascade,
  tenancy_id        uuid references tenancies(id) on delete set null,
  kind              text not null default 'routine',
  scheduled_on      date,
  notice_served_on  date,
  completed_on      date,
  manager_id        uuid references managers(id) on delete set null,
  overall           text,
  summary           text,
  report_sent_on    date,
  next_due_on       date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists inspections_property_idx on inspections (property_id, scheduled_on desc);

create table if not exists inspection_items (
  id               uuid primary key default gen_random_uuid(),
  inspection_id    uuid not null references inspections(id) on delete cascade,
  area             text not null,
  condition        text not null default 'good',
  note             text,
  action_required  boolean not null default false,
  photo_ref        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists inspection_items_inspection_idx on inspection_items (inspection_id);

-- Maintenance ---------------------------------------------------------------
-- The request, from whoever raised it, and where it has got to. habitability
-- marks the ones that are not a nice to have: no hot water, no heat, no lock.

create table if not exists maintenance_requests (
  id                       uuid primary key default gen_random_uuid(),
  job_ref                  text unique,
  property_id              uuid not null references properties(id) on delete cascade,
  tenancy_id               uuid references tenancies(id) on delete set null,
  reported_on              date not null,
  reported_by              text not null default 'tenant',
  category                 text not null default 'general',
  priority                 text not null default 'normal',
  summary                  text not null,
  detail                   text,
  status                   text not null default 'new',
  habitability             boolean not null default false,
  owner_approval_required  boolean not null default true,
  owner_asked_on           date,
  owner_approved_on        date,
  approval_limit_cents     bigint not null default 0,
  completed_on             date,
  closed_on                date,
  manager_id               uuid references managers(id) on delete set null,
  note                     text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists maintenance_property_idx on maintenance_requests (property_id, reported_on desc);
create index if not exists maintenance_status_idx on maintenance_requests (status);

create table if not exists contractors (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  trade                 text not null default 'general',
  contact_name          text,
  email                 text,
  phone                 text,
  licence_ref           text,
  licence_type          text,
  insurance_expires_on  date,
  preferred             boolean not null default false,
  active                boolean not null default true,
  external_ref          text unique,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists contractors_name_lower_idx on contractors (lower(name));

create table if not exists contractor_jobs (
  id              uuid primary key default gen_random_uuid(),
  job_no          text unique,
  maintenance_id  uuid not null references maintenance_requests(id) on delete cascade,
  contractor_id   uuid references contractors(id) on delete set null,
  issued_on       date,
  scheduled_on    date,
  completed_on    date,
  quoted_cents    bigint not null default 0,
  invoiced_cents  bigint not null default 0,
  invoiced_on     date,
  invoice_ref     text,
  status          text not null default 'issued',
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists contractor_jobs_maintenance_idx on contractor_jobs (maintenance_id);

-- Notices -------------------------------------------------------------------
-- Everything served on a tenant or received from one, with the date it was
-- served and the date it takes effect. The gap between the two is the notice
-- period, and the notice period is what the Act is mostly about.

create table if not exists notices (
  id               uuid primary key default gen_random_uuid(),
  tenancy_id       uuid references tenancies(id) on delete cascade,
  property_id      uuid references properties(id) on delete cascade,
  kind             text not null,
  served_on        date not null,
  method           text not null default 'email',
  effective_on     date,
  detail           text,
  served_by        uuid references managers(id) on delete set null,
  acknowledged_on  date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists notices_tenancy_idx on notices (tenancy_id, served_on desc);

-- Compliance items ----------------------------------------------------------
-- One row per rule per property: the five healthy homes standards, the smoke
-- alarms, the insulation statement, and anything else the business tracks.

create table if not exists compliance_items (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete cascade,
  kind          text not null,
  standard      text,
  status        text not null default 'unknown',
  assessed_on   date,
  due_on        date,
  done_on       date,
  evidence_ref  text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists compliance_items_property_kind_idx on compliance_items (property_id, kind);

-- Tasks and the contact log -------------------------------------------------

create table if not exists tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  kind            text not null default 'task',
  due_on          date,
  status          text not null default 'open',
  done_on         date,
  property_id     uuid references properties(id) on delete cascade,
  tenancy_id      uuid references tenancies(id) on delete cascade,
  owner_id        uuid references owners(id) on delete cascade,
  maintenance_id  uuid references maintenance_requests(id) on delete cascade,
  manager_id      uuid references managers(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists tasks_status_idx on tasks (status, due_on);

create table if not exists contact_notes (
  id           uuid primary key default gen_random_uuid(),
  happened_on  date not null,
  kind         text not null default 'note',
  who          text,
  body         text not null,
  property_id  uuid references properties(id) on delete cascade,
  tenancy_id   uuid references tenancies(id) on delete cascade,
  owner_id     uuid references owners(id) on delete cascade,
  tenant_id    uuid references tenants(id) on delete set null,
  manager_id   uuid references managers(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists contact_notes_property_idx on contact_notes (property_id, happened_on desc);
create index if not exists contact_notes_owner_idx on contact_notes (owner_id, happened_on desc);

-- Owner statements ----------------------------------------------------------
-- The monthly report to the owner. The figures are a record of what the trust
-- account did, copied here so the reporting layer can be built on them. This
-- system does not disburse and does not reconcile.

create table if not exists owner_statements (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references owners(id) on delete cascade,
  period_month           date not null,
  generated_on           date,
  rent_received_cents    bigint not null default 0,
  management_fees_cents  bigint not null default 0,
  expenses_cents         bigint not null default 0,
  disbursed_cents        bigint not null default 0,
  status                 text not null default 'draft',
  sent_on                date,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists owner_statements_period_idx on owner_statements (owner_id, period_month);

-- updated_at triggers -------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'managers', 'owners', 'properties', 'tenants', 'tenancies', 'tenancy_tenants',
    'rent_schedule', 'rent_ledger', 'arrears_events', 'bonds', 'inspections',
    'inspection_items', 'maintenance_requests', 'contractors', 'contractor_jobs',
    'notices', 'compliance_items', 'tasks', 'contact_notes', 'owner_statements'
  ] loop
    execute format('drop trigger if exists set_updated_at_%1$s on %1$s', t);
    execute format('create trigger set_updated_at_%1$s before update on %1$s for each row execute function set_updated_at()', t);
  end loop;
end
$$;

-- Views ---------------------------------------------------------------------

-- One row per tenancy that is still running, with everything the week needs:
-- who lives there, what they pay, what they owe, and who manages it.
create or replace view v_tenancy_current as
select
  t.id                                            as tenancy_id,
  t.tenancy_ref,
  p.id                                            as property_id,
  p.ref                                           as property_ref,
  p.address_line                                  as property,
  coalesce(p.suburb, '')                          as suburb,
  coalesce(p.city, '')                            as city,
  o.id                                            as owner_id,
  o.name                                          as owner,
  coalesce(m.full_name, 'unassigned')             as manager,
  m.id                                            as manager_id,
  t.kind,
  t.status,
  t.start_on,
  t.fixed_term_end_on,
  t.end_on,
  t.rent_cents,
  t.rent_period,
  case when t.rent_period = 'fortnightly' then 14 else 7 end as period_days,
  round(t.rent_cents::numeric / case when t.rent_period = 'fortnightly' then 14 else 7 end) as daily_rent_cents,
  p.market_rent_cents,
  t.bond_cents,
  t.healthy_homes_statement,
  t.insulation_statement,
  t.last_increase_on,
  t.renewal_stage,
  t.vacate_notice_on,
  t.vacate_on,
  t.vacate_notice_by,
  coalesce((select string_agg(tn.full_name, ', ' order by tt.is_primary desc, tn.full_name)
            from tenancy_tenants tt join tenants tn on tn.id = tt.tenant_id
            where tt.tenancy_id = t.id), 'no tenant on file') as tenants,
  coalesce((select sum(case when l.kind = 'charge' then l.amount_cents else 0 end) from rent_ledger l where l.tenancy_id = t.id), 0) as charged_cents,
  coalesce((select sum(case when l.kind in ('payment', 'credit') then l.amount_cents else 0 end) from rent_ledger l where l.tenancy_id = t.id), 0) as paid_cents,
  (select max(l.entry_on) from rent_ledger l where l.tenancy_id = t.id and l.kind = 'payment') as last_payment_on,
  (select max(n.happened_on) from contact_notes n where n.tenancy_id = t.id) as last_contact_on,
  (select count(*) from maintenance_requests mr where mr.tenancy_id = t.id and mr.status not in ('completed', 'declined')) as open_maintenance,
  (select max(i.completed_on) from inspections i where i.property_id = p.id and i.kind = 'routine' and i.completed_on is not null) as last_inspection_on,
  p.inspection_cycle_days
from tenancies t
join properties p on p.id = t.property_id
join owners o on o.id = p.owner_id
left join managers m on m.id = t.manager_id
where t.status in ('active', 'notice given');

-- Arrears, the number a property manager is judged on. days_behind is calendar
-- days of rent owing; working_days_behind is what the Act counts (RTA 1986
-- ss 55, 55AA, 56), and next_step is the step the file is missing.
create or replace view v_arrears as
select
  c.tenancy_id,
  c.tenancy_ref,
  c.property_id,
  c.property,
  c.suburb,
  c.owner,
  c.tenants,
  c.manager,
  c.manager_id,
  c.rent_cents,
  c.rent_period,
  (c.charged_cents - c.paid_cents)                                     as arrears_cents,
  case when c.daily_rent_cents = 0 then 0
       else floor((c.charged_cents - c.paid_cents)::numeric / c.daily_rent_cents)::int end as days_behind,
  case when c.daily_rent_cents = 0 then null
       else current_date - floor((c.charged_cents - c.paid_cents)::numeric / c.daily_rent_cents)::int end as arrears_since,
  case when c.daily_rent_cents = 0 then 0
       else working_days_between(current_date - floor((c.charged_cents - c.paid_cents)::numeric / c.daily_rent_cents)::int, current_date) end as working_days_behind,
  c.last_payment_on,
  case when c.last_payment_on is null then null else current_date - c.last_payment_on end as days_since_payment,
  (select max(a.noted_on) from arrears_events a where a.tenancy_id = c.tenancy_id and a.action = 'notice of overdue rent') as last_overdue_notice_on,
  (select max(a.noted_on) from arrears_events a where a.tenancy_id = c.tenancy_id and a.action = '14 day notice to remedy') as last_remedy_notice_on,
  (select max(a.noted_on) from arrears_events a where a.tenancy_id = c.tenancy_id and a.action = 'tribunal application') as tribunal_applied_on,
  (select count(*) from arrears_events a where a.tenancy_id = c.tenancy_id and a.action = 'notice of overdue rent' and a.noted_on >= current_date - 90) as overdue_notices_90d,
  (select max(a.noted_on) from arrears_events a where a.tenancy_id = c.tenancy_id and a.action = 'payment plan') as payment_plan_on
from v_tenancy_current c
where (c.charged_cents - c.paid_cents) > 0;

-- Routine inspections: when the last one happened, when the next one is due by
-- the business's own cycle, and whether the 48 hour notice has gone out.
create or replace view v_inspections_due as
select
  c.property_id,
  c.property_ref,
  c.property,
  c.suburb,
  c.owner,
  c.tenancy_id,
  c.tenancy_ref,
  c.tenants,
  c.manager,
  c.last_inspection_on,
  coalesce(c.last_inspection_on + c.inspection_cycle_days, c.start_on + 42) as due_on,
  (current_date - coalesce(c.last_inspection_on + c.inspection_cycle_days, c.start_on + 42)) as days_overdue,
  i.id            as scheduled_id,
  i.scheduled_on,
  i.notice_served_on,
  case when i.scheduled_on is null or i.notice_served_on is null then null
       else (i.scheduled_on - i.notice_served_on) end as notice_days,
  i.kind          as scheduled_kind
from v_tenancy_current c
left join inspections i
  on i.id = (select i2.id from inspections i2
             where i2.property_id = c.property_id and i2.completed_on is null and i2.scheduled_on is not null
             order by i2.scheduled_on limit 1)
where coalesce(c.last_inspection_on + c.inspection_cycle_days, c.start_on + 42) <= current_date + 30;

-- Every maintenance request that is not finished, with who it is waiting on.
create or replace view v_maintenance_open as
select
  mr.id                                  as maintenance_id,
  coalesce(mr.job_ref, '')               as job_ref,
  p.id                                   as property_id,
  p.ref                                  as property_ref,
  p.address_line                         as property,
  coalesce(p.suburb, '')                 as suburb,
  o.name                                 as owner,
  coalesce(tc.tenants, 'vacant')         as tenants,
  coalesce(m.full_name, 'unassigned')    as manager,
  mr.reported_on,
  (current_date - mr.reported_on)        as days_open,
  mr.reported_by,
  mr.category,
  mr.priority,
  mr.habitability,
  mr.summary,
  mr.status,
  mr.owner_approval_required,
  mr.owner_asked_on,
  mr.owner_approved_on,
  case when mr.owner_asked_on is not null and mr.owner_approved_on is null
       then (current_date - mr.owner_asked_on) else null end as days_waiting_on_owner,
  j.id                                   as job_id,
  coalesce(j.job_no, '')                 as job_no,
  coalesce(ct.name, '')                  as contractor,
  j.scheduled_on                         as job_scheduled_on,
  j.completed_on                         as job_completed_on,
  coalesce(j.quoted_cents, 0)            as quoted_cents,
  coalesce(j.invoiced_cents, 0)          as invoiced_cents,
  coalesce(j.status, 'no contractor')    as job_status
from maintenance_requests mr
join properties p on p.id = mr.property_id
join owners o on o.id = p.owner_id
left join managers m on m.id = mr.manager_id
left join v_tenancy_current tc on tc.tenancy_id = mr.tenancy_id
left join contractor_jobs j on j.id = (select j2.id from contractor_jobs j2 where j2.maintenance_id = mr.id order by j2.issued_on desc nulls last limit 1)
left join contractors ct on ct.id = j.contractor_id
where mr.status not in ('completed', 'declined');

-- The lease calendar: rent reviews that are legally available, fixed terms
-- running out, vacates booked and tenancies with no renewal conversation.
create or replace view v_lease_events as
select 'rent review' as kind,
       c.tenancy_id, c.tenancy_ref, c.property_id, c.property, c.suburb, c.owner, c.tenants, c.manager,
       coalesce(c.last_increase_on, c.start_on) + 365 as event_on,
       (coalesce(c.last_increase_on, c.start_on) + 365 - current_date) as days_away,
       c.rent_cents, c.market_rent_cents,
       'Rent has been ' || to_char(c.rent_cents / 100.0, 'FM$999,990') || ' ' || c.rent_period ||
       ' since ' || to_char(coalesce(c.last_increase_on, c.start_on), 'DD Mon YYYY') ||
       case when c.market_rent_cents > c.rent_cents
            then '. Market rent on file is ' || to_char(c.market_rent_cents / 100.0, 'FM$999,990') else '' end as detail
from v_tenancy_current c
where coalesce(c.last_increase_on, c.start_on) + 365 <= current_date + 60
  and c.vacate_on is null

union all
select 'fixed term ending',
       c.tenancy_id, c.tenancy_ref, c.property_id, c.property, c.suburb, c.owner, c.tenants, c.manager,
       c.fixed_term_end_on,
       (c.fixed_term_end_on - current_date),
       c.rent_cents, c.market_rent_cents,
       'Fixed term ends ' || to_char(c.fixed_term_end_on, 'DD Mon') || ', renewal is at "' || c.renewal_stage || '"'
from v_tenancy_current c
where c.kind = 'fixed term'
  and c.fixed_term_end_on is not null
  and c.fixed_term_end_on <= current_date + 90
  and c.vacate_on is null

union all
select 'vacate',
       c.tenancy_id, c.tenancy_ref, c.property_id, c.property, c.suburb, c.owner, c.tenants, c.manager,
       c.vacate_on,
       (c.vacate_on - current_date),
       c.rent_cents, c.market_rent_cents,
       'Notice given ' || to_char(c.vacate_notice_on, 'DD Mon') || ' by the ' || coalesce(c.vacate_notice_by, 'tenant') ||
       case when exists (select 1 from inspections i where i.tenancy_id = c.tenancy_id and i.kind = 'exit')
            then '. Exit inspection booked' else '. NO EXIT INSPECTION BOOKED' end
from v_tenancy_current c
where c.vacate_on is not null;

-- Every compliance item that is not compliant, or falls due inside sixty days.
create or replace view v_compliance_due as
select
  ci.id            as item_id,
  p.id             as property_id,
  p.ref            as property_ref,
  p.address_line   as property,
  coalesce(p.suburb, '') as suburb,
  o.name           as owner,
  coalesce(tc.tenancy_ref, '') as tenancy_ref,
  coalesce(tc.tenants, 'vacant') as tenants,
  coalesce(m.full_name, 'unassigned') as manager,
  ci.kind,
  coalesce(ci.standard, '') as standard,
  ci.status,
  ci.assessed_on,
  ci.due_on,
  ci.done_on,
  coalesce(ci.evidence_ref, '') as evidence_ref,
  case when ci.due_on is null then null else (current_date - ci.due_on) end as days_overdue,
  coalesce(ci.note, '') as note
from compliance_items ci
join properties p on p.id = ci.property_id
join owners o on o.id = p.owner_id
left join managers m on m.id = p.manager_id
left join v_tenancy_current tc on tc.property_id = p.id
where ci.status <> 'compliant'
   or ci.due_on is null
   or ci.due_on <= current_date + 60;

-- Everything that wants a decision this week, worst first.
create or replace view v_attention_due as
select 'arrears_tribunal' as reason,
       a.tenancy_ref as label,
       a.property,
       a.tenants as party,
       a.manager,
       a.days_behind as days,
       a.arrears_cents as amount_cents,
       'Twenty one days behind and no Tenancy Tribunal application on file (RTA 1986 s 55(1)(a))' as detail
from v_arrears a
where a.days_behind >= 21 and a.tribunal_applied_on is null

union all
select 'arrears_remedy_notice',
       a.tenancy_ref, a.property, a.tenants, a.manager, a.days_behind, a.arrears_cents,
       'Fourteen days behind and no 14 day notice to remedy served (RTA 1986 s 56)'
from v_arrears a
where a.days_behind >= 14 and a.days_behind < 21 and a.last_remedy_notice_on is null

union all
select 'arrears_overdue_notice',
       a.tenancy_ref, a.property, a.tenants, a.manager, a.days_behind, a.arrears_cents,
       'Rent overdue ' || a.working_days_behind || ' working days and no notice of overdue rent served (RTA 1986 s 55AA)'
from v_arrears a
where a.working_days_behind >= 5 and a.days_behind < 14
  and (a.last_overdue_notice_on is null or a.last_overdue_notice_on < current_date - 21)

union all
select 'arrears_watch',
       a.tenancy_ref, a.property, a.tenants, a.manager, a.days_behind, a.arrears_cents,
       'Behind but inside the notice window. Ring them today.'
from v_arrears a
where a.working_days_behind < 5 and a.arrears_cents > 0

union all
select 'inspection_overdue',
       d.property_ref, d.property, d.tenants, d.manager, d.days_overdue, 0::bigint,
       'Routine inspection was due ' || to_char(d.due_on, 'DD Mon') ||
       coalesce(', last done ' || to_char(d.last_inspection_on, 'DD Mon YYYY'), ', never inspected')
from v_inspections_due d
where d.days_overdue > 0 and d.scheduled_on is null

union all
select 'inspection_short_notice',
       d.property_ref, d.property, d.tenants, d.manager, coalesce(d.notice_days, 0), 0::bigint,
       'Inspection booked for ' || to_char(d.scheduled_on, 'DD Mon') ||
       case when d.notice_served_on is null then ' with no entry notice served'
            else ' with only ' || d.notice_days || ' days notice (RTA 1986 s 48(3) wants 48 hours)' end
from v_inspections_due d
where d.scheduled_on is not null
  and d.scheduled_on >= current_date
  and (d.notice_served_on is null or d.notice_days < 2)

union all
select 'inspection_report_unsent',
       p.ref, p.address_line, coalesce(o.name, ''), coalesce(m.full_name, 'unassigned'),
       (current_date - i.completed_on), 0::bigint,
       'Inspection completed ' || to_char(i.completed_on, 'DD Mon') || ' and the owner has never been sent the report'
from inspections i
join properties p on p.id = i.property_id
join owners o on o.id = p.owner_id
left join managers m on m.id = i.manager_id
where i.completed_on is not null
  and i.report_sent_on is null
  and i.completed_on < current_date - 5

union all
select 'maintenance_habitability',
       coalesce(v.job_ref, v.property_ref), v.property, v.tenants, v.manager, v.days_open, v.quoted_cents,
       'Habitability job open ' || v.days_open || ' days: ' || v.summary
from v_maintenance_open v
where v.habitability and v.job_completed_on is null

union all
select 'maintenance_owner_waiting',
       coalesce(v.job_ref, v.property_ref), v.property, v.owner, v.manager, v.days_waiting_on_owner, v.quoted_cents,
       'Waiting on the owner since ' || to_char(v.owner_asked_on, 'DD Mon') || ': ' || v.summary
from v_maintenance_open v
where v.days_waiting_on_owner >= 5

union all
select 'maintenance_no_contractor',
       coalesce(v.job_ref, v.property_ref), v.property, v.tenants, v.manager, v.days_open, 0::bigint,
       'Approved ' || to_char(v.owner_approved_on, 'DD Mon') || ' and nobody has been sent to do it: ' || v.summary
from v_maintenance_open v
where v.owner_approved_on is not null and v.job_id is null

union all
select 'job_not_invoiced',
       coalesce(j.job_no, ''), p.address_line, coalesce(ct.name, 'unknown contractor'), coalesce(m.full_name, 'unassigned'),
       (current_date - j.completed_on), j.quoted_cents,
       'Work finished ' || to_char(j.completed_on, 'DD Mon') || ' and no invoice has come in'
from contractor_jobs j
join maintenance_requests mr on mr.id = j.maintenance_id
join properties p on p.id = mr.property_id
left join contractors ct on ct.id = j.contractor_id
left join managers m on m.id = mr.manager_id
where j.completed_on is not null and j.invoiced_on is null and j.completed_on < current_date - 14

union all
select 'bond_not_lodged',
       t.tenancy_ref, p.address_line, coalesce(tc.tenants, ''), coalesce(m.full_name, 'unassigned'),
       working_days_between(b.received_on, current_date), b.amount_cents,
       'Bond taken ' || to_char(b.received_on, 'DD Mon') || ' and not lodged. The Act allows 23 working days (RTA 1986 s 19)'
from bonds b
join tenancies t on t.id = b.tenancy_id
join properties p on p.id = t.property_id
left join v_tenancy_current tc on tc.tenancy_id = t.id
left join managers m on m.id = t.manager_id
where b.lodged_on is null and b.received_on is not null and b.amount_cents > 0

union all
select 'rent_review_due',
       e.tenancy_ref, e.property, e.tenants, e.manager, (-e.days_away), e.rent_cents,
       e.detail
from v_lease_events e
where e.kind = 'rent review' and e.days_away <= 0

union all
select 'fixed_term_ending',
       e.tenancy_ref, e.property, e.tenants, e.manager, e.days_away, e.rent_cents,
       e.detail
from v_lease_events e
where e.kind = 'fixed term ending' and e.days_away <= 60

union all
select 'vacate_no_exit_inspection',
       e.tenancy_ref, e.property, e.tenants, e.manager, e.days_away, e.rent_cents,
       e.detail
from v_lease_events e
where e.kind = 'vacate' and e.detail like '%NO EXIT INSPECTION%'

union all
select 'compliance_overdue',
       c.property_ref, c.property, c.kind, c.manager,
       coalesce(c.days_overdue, 0), 0::bigint,
       c.kind || ' is "' || c.status || '"' || coalesce(', due ' || to_char(c.due_on, 'DD Mon YYYY'), ', no date on file')
from v_compliance_due c
where c.status not in ('compliant', 'exempt')

union all
select 'smoke_alarm_check_overdue',
       p.ref, p.address_line, coalesce(tc.tenants, 'vacant'), coalesce(m.full_name, 'unassigned'),
       (current_date - ci.assessed_on), 0::bigint,
       'Smoke alarms last checked ' || to_char(ci.assessed_on, 'DD Mon YYYY') || '. The business checks them every twelve months'
from compliance_items ci
join properties p on p.id = ci.property_id
left join managers m on m.id = p.manager_id
left join v_tenancy_current tc on tc.property_id = p.id
where ci.kind = 'smoke alarms'
  and ci.status = 'compliant'
  and ci.assessed_on < current_date - 365

union all
select 'statement_not_sent',
       to_char(s.period_month, 'Mon YYYY'), o.name, o.name, coalesce(m.full_name, 'unassigned'),
       (current_date - s.period_month), s.disbursed_cents,
       'Owner statement for ' || to_char(s.period_month, 'Mon YYYY') || ' has never been sent'
from owner_statements s
join owners o on o.id = s.owner_id
left join managers m on m.id = o.manager_id
where s.status <> 'sent' and s.period_month < date_trunc('month', current_date)::date

union all
select 'task_overdue',
       coalesce(p.ref, 'task'), coalesce(p.address_line, t.title), t.title, coalesce(m.full_name, 'unassigned'),
       (current_date - t.due_on), 0::bigint,
       t.title
from tasks t
left join properties p on p.id = t.property_id
left join managers m on m.id = t.manager_id
where t.status = 'open' and t.due_on is not null and t.due_on < current_date

union all
select 'owner_quiet',
       coalesce(o.payment_reference, ''), o.name, o.name, coalesce(m.full_name, 'unassigned'),
       (current_date - coalesce((select max(n.happened_on) from contact_notes n where n.owner_id = o.id), o.owner_since)), 0::bigint,
       'Nobody has spoken to this owner since ' ||
       coalesce(to_char((select max(n.happened_on) from contact_notes n where n.owner_id = o.id), 'DD Mon YYYY'), 'they came on')
from owners o
left join managers m on m.id = o.manager_id
where o.status = 'active'
  and coalesce((select max(n.happened_on) from contact_notes n where n.owner_id = o.id), o.owner_since) < current_date - 180;

-- One row per owner: the portfolio, the rent roll, what is owed and what is open.
create or replace view v_owner_summary as
select
  o.id                                as owner_id,
  o.name                              as owner,
  o.owner_type,
  o.status,
  coalesce(m.full_name, 'unassigned') as manager,
  coalesce(o.city, '')                as city,
  o.statement_day,
  (select count(*) from properties p where p.owner_id = o.id)                                    as properties,
  (select count(*) from properties p join v_tenancy_current c on c.property_id = p.id where p.owner_id = o.id) as tenanted,
  coalesce((select sum(c.rent_cents * 7 / c.period_days) from properties p join v_tenancy_current c on c.property_id = p.id where p.owner_id = o.id), 0) as weekly_rent_cents,
  coalesce((select sum(a.arrears_cents) from properties p join v_arrears a on a.property_id = p.id where p.owner_id = o.id), 0) as arrears_cents,
  coalesce((select count(*) from properties p join v_maintenance_open v on v.property_id = p.id where p.owner_id = o.id), 0) as open_maintenance,
  coalesce((select count(*) from properties p join v_compliance_due c on c.property_id = p.id where p.owner_id = o.id and c.status <> 'compliant'), 0) as compliance_gaps,
  (select max(s.period_month) from owner_statements s where s.owner_id = o.id and s.status = 'sent') as last_statement_month,
  (select max(n.happened_on) from contact_notes n where n.owner_id = o.id) as last_contact_on,
  (select current_date - max(n.happened_on) from contact_notes n where n.owner_id = o.id) as days_since_contact
from owners o
left join managers m on m.id = o.manager_id;

-- The rent roll: one row per property, tenanted or not.
create or replace view v_rent_roll as
select
  p.id                                as property_id,
  p.ref                               as property_ref,
  p.address_line                      as property,
  coalesce(p.suburb, '')              as suburb,
  coalesce(p.city, '')                as city,
  p.property_type,
  p.bedrooms,
  o.name                              as owner,
  o.id                                as owner_id,
  coalesce(m.full_name, 'unassigned') as manager,
  p.status,
  p.management_fee_pct,
  p.market_rent_cents,
  coalesce(c.tenancy_ref, '')         as tenancy_ref,
  coalesce(c.tenants, 'VACANT')       as tenants,
  coalesce(c.rent_cents, 0)           as rent_cents,
  coalesce(c.rent_period, '')         as rent_period,
  coalesce(c.rent_cents * 7 / nullif(c.period_days, 0), 0) as weekly_rent_cents,
  round(coalesce(c.rent_cents * 7 / nullif(c.period_days, 0), 0) * p.management_fee_pct / 100.0) as weekly_fee_cents,
  c.start_on                          as tenancy_start_on,
  c.fixed_term_end_on,
  c.vacate_on,
  coalesce(a.arrears_cents, 0)        as arrears_cents,
  coalesce(a.days_behind, 0)          as days_behind,
  c.last_inspection_on,
  coalesce((select count(*) from v_maintenance_open v where v.property_id = p.id), 0) as open_maintenance,
  coalesce((select count(*) from compliance_items ci where ci.property_id = p.id and ci.status <> 'compliant'), 0) as compliance_gaps
from properties p
join owners o on o.id = p.owner_id
left join managers m on m.id = p.manager_id
left join v_tenancy_current c on c.property_id = p.id
left join v_arrears a on a.tenancy_id = c.tenancy_id;
