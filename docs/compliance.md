# The rules a residential property management business lives under

This file is the rule book `/compliance` checks the database against. Each rule has a name, the
source it comes from, what a breach looks like in the data, the query that finds it and the
command that fixes it. `npm run property -- compliance` runs all of them, and
`npm run property -- compliance <key>` runs one.

Nothing here is legal advice. These are the rules the business has told this system to enforce.
Read them, change them to match your own jurisdiction and your own agency agreement, and keep the
sources current. When a rule changes, change the rule and the check together.

The sources are New Zealand first, because that is where the reference business is. The
Australian equivalents are noted at the bottom at a high level, with the sections to read.

## What this system does not do

**Rent trust accounting is not in here.** No trust account, no receipting of rent into a bank, no
disbursement to an owner, no reconciliation, no audit file. That stays in the system that holds it
today, under the Real Estate Agents Act 2008 and the Real Estate Agents (Audit) Regulations 2009 in
New Zealand, and the state agents acts in Australia. A trust account is a regulated obligation with
an auditor attached, not a table.

What this system records is the tenancy lifecycle: owners and properties, tenancies and tenants,
the rent schedule and what was charged and received against it, arrears and the notices that follow
them, bonds, inspections and their findings, maintenance and the contractor jobs under it,
compliance items per property, and the owner reporting layer that sits on top. The `rent_ledger`
table is a record so the arrears maths works. It never moves a cent.

---

## 1. Lodge the bond within 23 working days of taking it

**Source.** Residential Tenancies Act 1986, s 19(1)(a): the landlord must, within 23 working days
after receiving the bond, send it to the Bond Centre with a completed bond form. Tenancy Services
sets out the process at
[tenancy.govt.nz/rent-bond-and-bills/bond/lodging-a-bond](https://www.tenancy.govt.nz/rent-bond-and-bills/bond/lodging-a-bond/).
A top-up after a rent increase gets its own 23 working days.

**What it means for a property manager.** The clock starts the day the money lands, not the day the
tenancy starts, and it counts working days. Failing to lodge is an unlawful act with a penalty, and
it is the single easiest breach for a manager on leave to create.

**Breach in the data.** A bond with `received_on` set, `lodged_on` null, and more than 23 working
days since it was received.

```sql
select t.tenancy_ref, p.address_line, working_days_between(b.received_on, current_date) as working_days
from bonds b
join tenancies t on t.id = b.tenancy_id
join properties p on p.id = t.property_id
where b.lodged_on is null and b.received_on is not null and b.amount_cents > 0
  and working_days_between(b.received_on, current_date) > 23;
```

**Command.** `compliance bond-lodgement` lists them. `add bond <tenancy> --number=<bond number>`
records the lodgement once it is done.

---

## 2. A bond can be no more than four weeks rent

**Source.** Residential Tenancies Act 1986, s 18(1): a landlord must not require or receive a bond
exceeding the equivalent of four weeks rent.

**What it means for a property manager.** The cap is on the rent at the time the bond is taken. If
rent goes up and you want a top-up, the top-up is still capped at four weeks of the new rent, and
it gets its own lodgement deadline.

**Breach in the data.** A running tenancy where `bond_cents` is more than four weeks of the weekly
equivalent of `rent_cents`.

```sql
select t.tenancy_ref, p.address_line, t.bond_cents, t.rent_cents, t.rent_period
from tenancies t
join properties p on p.id = t.property_id
where t.status in ('active', 'notice given')
  and t.bond_cents > (t.rent_cents * 7 / case when t.rent_period = 'fortnightly' then 14 else 7 end) * 4;
```

**Command.** `compliance bond-cap`. `add tenancy` refuses to create a tenancy with a bond over the
cap in the first place, and says what the cap is.

---

## 3. Rent can only rise once every twelve months

**Source.** Residential Tenancies Act 1986, s 24(1A), as amended from 12 August 2020: rent must not
be increased within 12 months of the date the tenancy began or the date the last increase took
effect. Tenancy Services:
[tenancy.govt.nz/rent-bond-and-bills/rent/increasing-rent](https://www.tenancy.govt.nz/rent-bond-and-bills/rent/increasing-rent/).

**What it means for a property manager.** An increase served too soon is not just unenforceable, it
is an unlawful act. The date that matters is the date the increase takes effect, measured against
the last effective date, not the date you sent the letter.

**Breach in the data.** A `rent_schedule` row with `reason = 'rent review'` whose `effective_on` is
less than 365 days after the previous row for the same tenancy.

```sql
select t.tenancy_ref, rs.effective_on, prev.effective_on as previous, (rs.effective_on - prev.effective_on) as gap
from rent_schedule rs
join tenancies t on t.id = rs.tenancy_id
join lateral (select r2.effective_on from rent_schedule r2
              where r2.tenancy_id = rs.tenancy_id and r2.effective_on < rs.effective_on
              order by r2.effective_on desc limit 1) prev on true
where rs.reason = 'rent review' and (rs.effective_on - prev.effective_on) < 365;
```

**Command.** `compliance rent-increase-frequency`. `rent-review <tenancy>` shows the earliest date
an increase can take effect, and `rent-review serve` refuses anything earlier unless you pass
`--force`.

---

## 4. Sixty days written notice of a rent increase

**Source.** Residential Tenancies Act 1986, s 24(1)(b): at least 60 days written notice for a
standard tenancy (28 days for a boarding house).

**What it means for a property manager.** Sixty days is the floor, and the notice has to be in
writing and properly served. Serving the notice early is fine; the increase still cannot take
effect before the twelve month point in rule 3.

**Breach in the data.** A rent review row where the gap between `notice_served_on` and
`effective_on` is under 60 days.

```sql
select t.tenancy_ref, rs.notice_served_on, rs.effective_on, (rs.effective_on - rs.notice_served_on) as days
from rent_schedule rs
join tenancies t on t.id = rs.tenancy_id
where rs.reason = 'rent review' and rs.notice_served_on is not null
  and (rs.effective_on - rs.notice_served_on) < 60;
```

**Command.** `compliance rent-increase-notice`. `rent-review serve <tenancy> --new-rent=` defaults
the effective date to 60 days out and refuses anything shorter.

---

## 5. Follow the arrears steps in order

**Source.** Residential Tenancies Act 1986:

- **s 55AA.** Once rent has been unpaid for at least five working days, the landlord may give the
  tenant a notice of overdue rent. Three of those notices in a 90 day period opens s 55(1)(aa).
- **s 55(1)(a).** The Tenancy Tribunal may terminate a periodic tenancy where rent is at least 21
  days in arrears.
- **s 56.** A 14 day notice to remedy gives the tenant a fortnight to put a breach right.

Tenancy Services sets out the sequence at
[tenancy.govt.nz/rent-bond-and-bills/rent/overdue-rent](https://www.tenancy.govt.nz/rent-bond-and-bills/rent/overdue-rent/),
and publishes the notice of overdue rent form.

**What it means for a property manager.** The Tribunal will ask for the paper trail. A file with
arrears and no notices is a file that loses. The point of `/arrears` is that the next step is on the
screen before you have to remember what it is.

**Breach in the data.** A tenancy with arrears where the step for its stage has never been recorded
in `arrears_events`.

```sql
select a.tenancy_ref, a.property, a.days_behind, a.working_days_behind,
       a.last_overdue_notice_on, a.last_remedy_notice_on, a.tribunal_applied_on
from v_arrears a
where (a.days_behind >= 21 and a.tribunal_applied_on is null)
   or (a.days_behind >= 14 and a.last_remedy_notice_on is null)
   or (a.working_days_behind >= 5 and a.last_overdue_notice_on is null);
```

**Command.** `arrears` shows the next step for every tenancy behind.
`arrears-log <tenancy> "<action>"` records it, and writes the matching notice record.

---

## 6. At least 48 hours written notice before entering for an inspection

**Source.** Residential Tenancies Act 1986, s 48(2) and (3): a landlord may inspect no more than
once every four weeks, must give at least 48 hours and no more than 14 days written notice, and may
only enter between 8am and 7pm. Tenancy Services:
[tenancy.govt.nz/maintenance-and-inspections/inspections](https://www.tenancy.govt.nz/maintenance-and-inspections/inspections/).

**What it means for a property manager.** Most agencies inspect every three months, which is a
promise to the owner and to the insurer, not a legal requirement. The legal requirements are the
notice and the frequency ceiling. An inspection entered without notice is trespass and it will come
back at the Tribunal.

**Breach in the data.** An inspection with a future `scheduled_on`, and either no
`notice_served_on` or fewer than two days between them.

```sql
select p.ref, p.address_line, i.scheduled_on, i.notice_served_on
from inspections i
join properties p on p.id = i.property_id
where i.completed_on is null and i.scheduled_on >= current_date
  and (i.notice_served_on is null or (i.scheduled_on - i.notice_served_on) < 2);
```

**Command.** `compliance inspection-notice`. `inspection schedule` tells you the date the notice has
to be out by, and `inspection notice <id>` warns if you record it too late.

---

## 7. Every rental has had to meet the healthy homes standards since 1 July 2025

**Source.** Residential Tenancies (Healthy Homes Standards) Regulations 2019, made under the
Residential Tenancies Act 1986 ss 45(1)(bb) and 138A. Five standards:

| Standard | Regulations | What it requires |
|---|---|---|
| Heating | regs 8 to 12 | A fixed heater in the main living room sized by the heating assessment formula |
| Insulation | regs 13 to 18 | Ceiling and underfloor insulation to the 2008 standard, or a recorded exemption |
| Ventilation | regs 19 to 22 | Openable windows in every habitable room, extract in the kitchen and bathroom venting outside |
| Moisture and drainage | regs 23 to 26 | Guttering, downpipes, drains, and a ground moisture barrier where there is an enclosed subfloor |
| Draught stopping | regs 27 to 29 | Gaps and holes stopped, unused open fireplaces blocked |

The final deadline was **1 July 2025**: from that date every private rental must comply, with no
90 or 120 day grace period at the start of a new tenancy. Tenancy Services:
[tenancy.govt.nz/healthy-homes](https://www.tenancy.govt.nz/healthy-homes/healthy-homes-compliance/).

**What it means for a property manager.** This is the item that costs the owner money and the item
the owner will not answer emails about. Track it per property, per standard, with the date it was
assessed and the evidence. "The whole portfolio is compliant" is not an answer anybody can defend.

**Breach in the data.** A `compliance_items` row whose `kind` starts with "healthy homes" and whose
status is not `compliant` or `exempt`.

```sql
select p.ref, p.address_line, ci.kind, ci.status, ci.note
from compliance_items ci
join properties p on p.id = ci.property_id
where ci.kind like 'healthy homes%' and ci.status not in ('compliant', 'exempt');
```

**Command.** `compliance healthy-homes` and `compliance-items --property=<ref> --all`.
`compliance-item done <property> "<item>" --evidence=<ref>` closes one out.

---

## 8. A signed healthy homes compliance statement in every tenancy agreement

**Source.** Residential Tenancies Act 1986, s 13A(1A)(b)(ii) and the Healthy Homes Standards
Regulations 2019: every new or renewed tenancy agreement must include a statement of the current
level of compliance with the healthy homes standards. Leaving it out is an unlawful act with a
penalty of up to $500 per tenancy, and Tenancy Services publishes a template.

**What it means for a property manager.** It is a field on the agreement, so it is a field here.
The statement has to be specific: the actual position on each standard, not a promise.

**Breach in the data.** A running tenancy with `healthy_homes_statement` false.

```sql
select t.tenancy_ref, p.address_line, t.start_on
from tenancies t join properties p on p.id = t.property_id
where t.status in ('active', 'notice given') and not t.healthy_homes_statement;
```

**Command.** `compliance healthy-homes-statement`. The flag is set when the agreement is signed:
`add tenancy --healthy-homes`.

---

## 9. Working smoke alarms, and the insulation statement in the agreement

**Source.** Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, made under the
Residential Tenancies Act 1986 s 138A.

- **Regs 5 to 10.** Working smoke alarms in every rental. New alarms must be photoelectric and
  either hard-wired or have a long-life battery of at least eight years. At least one alarm within
  three metres of each bedroom door, or in every bedroom, and at least one on each level. The
  landlord installs and maintains them and must ensure they work at the start of every tenancy; the
  tenant replaces standard batteries and reports faults.
- **Reg 21 and RTA 1986 s 13A.** Every tenancy agreement must carry an insulation statement saying
  what insulation is in the property, where, what type and what condition.

**What it means for a property manager.** Most agencies fold the alarm check into the routine
inspection and keep the record. If you cannot produce a date, you cannot prove it.

**Breach in the data.** A smoke alarm or insulation statement item that is not compliant, or a smoke
alarm item last assessed more than twelve months ago.

```sql
select p.ref, p.address_line, ci.kind, ci.status, ci.assessed_on
from compliance_items ci
join properties p on p.id = ci.property_id
where ci.kind in ('smoke alarms', 'insulation statement')
  and (ci.status not in ('compliant', 'exempt')
       or (ci.kind = 'smoke alarms' and ci.assessed_on < current_date - 365));
```

**Command.** `compliance smoke-alarms`. Record the check with
`compliance-item done <property> "smoke alarms" --evidence=<invoice>`.

---

## 10. Termination notice periods

**Source.** Residential Tenancies Act 1986, s 51, as amended by the Residential Tenancies Amendment
Act 2024, in force from **30 January 2025**:

| Who ends it | Notice | When |
|---|---|---|
| Landlord, no reason needed | **90 days** | Periodic tenancy |
| Landlord, with a stated reason | **42 days** | Owner or a family member moving in, the property is sold with vacant possession, or it is needed for an employee |
| Tenant | **21 days** | Periodic tenancy |

A fixed term ending needs notice between 90 and 21 days before the end date, or it rolls into a
periodic tenancy on the same terms (s 60A).

**What it means for a property manager.** The notice period runs from the day the notice is
properly served, not the day you wrote it. Short notice is void, and the tenant can stay.

**Breach in the data.** A termination notice where the gap between `served_on` and `effective_on` is
less than the statutory period for that kind.

```sql
select t.tenancy_ref, n.kind, n.served_on, n.effective_on, (n.effective_on - n.served_on) as days
from notices n left join tenancies t on t.id = n.tenancy_id
where n.effective_on is not null
  and ((n.kind = 'termination 90 day' and (n.effective_on - n.served_on) < 90)
    or (n.kind = 'termination 42 day' and (n.effective_on - n.served_on) < 42)
    or (n.kind = 'tenant notice 21 day' and (n.effective_on - n.served_on) < 21));
```

**Command.** `compliance termination-notice`. `notice serve <tenancy> "<kind>"` defaults the
effective date to the statutory period and refuses anything shorter without `--force`.

---

## 11. Do not keep tenant records longer than you need them

**Source.** Privacy Act 2020, information privacy principle 9: an agency must not keep personal
information for longer than it is required for the purpose it may lawfully be used for. Principle 5
requires reasonable security safeguards. The Office of the Privacy Commissioner has published
specific guidance for landlords and property managers on what may be collected from applicants and
how long it may be held: [privacy.org.nz](https://www.privacy.org.nz/). The outer bound on the
financial side is the seven year record-keeping requirement in the Tax Administration Act 1994
s 22.

**What it means for a property manager.** Application forms, bank statements, identity documents
and references collected from people who did not get the property should not still be on file. Nor
should the full record of a tenant who left eight years ago.

**Breach in the data.** A tenant whose every tenancy ended more than seven years ago.

```sql
select tn.full_name, max(t.end_on) as last_tenancy_ended
from tenants tn
join tenancy_tenants tt on tt.tenant_id = tn.id
join tenancies t on t.id = tt.tenancy_id
group by tn.id, tn.full_name
having max(coalesce(t.end_on, current_date)) < current_date - 2555;
```

**Command.** `compliance tenant-records`. Nothing in this repo deletes a record: it tells you what
is old, and a person decides.

---

## Australia, at a high level

The same shapes with different numbers. If you run an Australian rent roll, change the numbers in
`scripts/property.mjs` (the `COMPLIANCE_RULES` array) and the notice periods in `NOTICE_MIN_DAYS`,
and rewrite this file. `/customise` will do it in plain language.

**New South Wales, Residential Tenancies Act 2010.**

- Bond lodged with NSW Fair Trading within **10 working days** of receipt (s 162).
- Rent increases in a periodic agreement: **60 days** written notice, and not more than once in any
  12 month period.
- Non-payment of rent: a termination notice may be given once the tenant is **14 days** in arrears,
  giving at least 14 days (ss 88 and 89).
- Routine inspections: **four** in any 12 month period, with **7 days** written notice (s 55).

**Victoria, Residential Tenancies Act 1997.**

- Bond paid to the Residential Tenancies Bond Authority within **10 business days** of receipt
  (s 406).
- Rent increases: not more than once every **12 months**, with **60 days** written notice.
- Non-payment of rent: a notice to vacate for rent arrears once rent is **14 days** overdue.
- Routine inspections: not more than once every **6 months**, with **7 days** written notice, and
  not in the first three months of the tenancy.
- Minimum standards under the Residential Tenancies Regulations 2021 are the Victorian equivalent of
  the healthy homes standards, and they map onto the same `compliance_items` table.

**Everywhere.** Trust accounting stays in the system that holds it, under the state agents act and
its audit regulations. That boundary does not move.

---

## Changing a rule

Change the rule and the check together, in one commit:

1. Edit the entry in this file: the source, what it means, the breach, the query.
2. Edit the matching entry in the `COMPLIANCE_RULES` array in `scripts/property.mjs`.
3. Add or change the assertion in `scripts/smoke.mjs` so the demo data proves it fires.
4. `npm test`.

Or say it in plain language and let `/customise` do all four.
