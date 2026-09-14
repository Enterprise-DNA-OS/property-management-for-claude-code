# Property Management for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR AGENCY], a residential property management business in [city, country]
- **Operator:** [YOUR NAME], [principal / portfolio manager / property manager / business owner]
- **The team:** [how many property managers, how many properties each, who runs maintenance, who runs the trust account]
- **Licence:** [the licensee number and the REA licence, or the state agents licence number]
- **The rent roll:** [how many properties, how many owners, roughly what weekly rent, which suburbs]
- **The inspection cycle:** [how often you promise the owner, and the insurer's requirement if there is one]
- **Where the trust account lives:** [the system that receipts rent and pays owners. It is not this one.]
- **What matters most:** [for example: arrears never getting past fourteen days without a notice, inspections never slipping, healthy homes closed out across the whole roll, owners hearing from us every month]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a tenancy, run `tenancy "<ref>"` and read the whole card, including the ledger and the notices. Before writing to an owner, run `owner "<name>"` and read the contact log.
3. **Plain language.** Short sentences. No filler. Numbers in tables. The industry words, not software words: a tenancy, a tenant, an owner, a bond, arrears, a notice to remedy, an entry notice, a vacate, a rent review, a routine inspection, the rent roll.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a tenant or an owner waits for a yes in this session.
6. **Never invent a number.** Rents, bonds, arrears, quotes and invoices come from the operator or from the database. If one is missing, say which one.
7. **Never state a legal position you have not checked.** Notice periods, arrears steps and the healthy homes standards are in `docs/compliance.md` with their sections. Quote the section. If the question is outside what is written there, say so.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| Who is behind on rent, what do we do about it | `/arrears` |
| I served a notice, they promised to pay, we applied to the Tribunal | `arrears-log <tenancy> "<action>"` |
| Everything about one property | `/property` |
| Everything about one owner, or what do I tell them | `/owner` |
| Everything about one tenancy, or a question about the agreement | `/tenancy` |
| Can we put the rent up, and by how much | `/rent-review` |
| What inspections are due, what is overdue | `/inspections-due` |
| Book an inspection, write one up, send the report | `/inspection` |
| A tenant rang about something broken | `/maintenance` |
| Send a contractor, book them, record the invoice | `/job` |
| Serve a notice | `/notice` |
| Who is leaving and what is not booked | `/vacates` |
| A fixed term is running out | `/renewals` |
| Healthy homes, smoke alarms, insulation statements | `/compliance-items` |
| Are we breaking any of the rules we run under | `/compliance` |
| What needs a decision this week | `/attention` |
| The Monday review | `/weekly-review` |
| The letter to the tenant about the rent | `/draft-arrears-letter` |
| The note to the owner | `/draft-owner-update` |
| I spoke to them, chase this, that is done, the rent came in | `/log` |
| Bring the rent roll over from the old system | `/import` |
| Change how this system works | `/customise` |
| A new page to look at | `/new-view` |
| The paperwork, in our brand | `npm run docs` |

If an ask fits nothing here, run the CLI directly (`npm run property -- help`) and then propose a new command for it.

## Hard rules

- **No client money, ever.** This system does not receipt rent into a bank, does not disburse to an owner and does not reconcile a trust account. The `rent_ledger` table is a record so the arrears maths works, and nothing more. Trust accounting stays in the system that holds it, audited under the Real Estate Agents Act 2008 and the Real Estate Agents (Audit) Regulations 2009. If asked to add it, say no and say why.
- Never send email or messages from here. Draft to `drafts/`, a person sends. That includes every notice: this system records that a notice was served, it does not serve one.
- Never tell a tenant or an owner a date a contractor has not given you.
- Never mark a maintenance job approved that the owner has not approved. An approval is evidence of a conversation.
- Never mark an inspection report sent until it has been sent.
- Never enter a property, or book an entry, without the notice on file. At least 48 hours and no more than 14 days (RTA 1986 s 48(3)). If the notice is short, move the visit, do not go anyway.
- Never serve a notice with less than the statutory period. The CLI refuses; do not talk it out of it with `--force` unless the operator says why and it goes in the detail.
- Never delete records without an explicit yes in this session. End a tenancy with `end_on`, do not delete it. Close an owner with `status = 'former'`. The file is a seven year record.
- Never invent a record. If a name or an address is ambiguous, list the candidates and ask. The CLI already does this.
- The database is the source of truth. If the answer is not in it, say so.

## Words this business uses

- **Owner**, not client or landlord, when talking to them. **Tenant**, not renter. **The rent roll** is the whole portfolio under management.
- A **tenancy** is one agreement over one property. **Periodic** runs until someone ends it; a **fixed term** ends on a date and rolls into periodic if nobody acts (RTA 1986 s 60A).
- **Arrears** is rent owing. It is counted in days and in working days, because the Act uses both.
- A **notice to remedy** is the 14 day notice under s 56. A **notice of overdue rent** is the s 55AA one. An **entry notice** is the 48 hours before an inspection. They are different documents and the words are not interchangeable.
- A **routine inspection** is the three monthly visit. An **entry inspection** is at the start, an **exit inspection** at the end. The exit one is what the bond is argued from.
- **Healthy homes** means the five standards in the 2019 regulations: heating, insulation, ventilation, moisture and drainage, draught stopping.
- **The bond** is the tenant's money held by Tenancy Services. It is not the agency's and it is not the owner's until the process says so.
- **The management fee** is a percentage of rent collected. The **letting fee** is charged once when a new tenant goes in.

## Where things live

- `scripts/property.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it. Never edit an applied migration; add the next one.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `brand.json`, `views.json`, `documents.json` the HTML output: whose name is on it, what pages, what paperwork.
- `docs/compliance.md` the rules `/compliance` checks, each with its source. `docs/replace-palace.md` moving off the incumbent. `docs/why-no-front-end.md` the honest trade-offs.
- `exports/` whole database dumps. `drafts/` anything written for a person to send.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/palace
