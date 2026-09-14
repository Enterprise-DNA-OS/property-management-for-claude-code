<h1 align="center">Property Management for Claude Code</h1>

<p align="center">
  <strong>The open-source residential property management system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Or installed and run for you.
</p>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#compliance-checked-against-the-data">Compliance</a> &bull;
  <a href="#ten-questions-palace-cannot-answer">Ten questions</a> &bull;
  <a href="#instead-of-palace">Instead of Palace</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Property Management for Claude Code does the job you pay Palace for, as a Postgres database and a set of Claude Code commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) and ask for what you want in plain language. It runs the right query, and it can answer questions the Palace dashboard cannot.

It is built for a residential rent roll: owners and their properties, tenancies and tenants, the rent schedule and the rent ledger, arrears and the notices that follow them, bonds, routine inspections and their findings, maintenance requests and the contractor jobs under them, rent reviews, vacates and renewals, the compliance register every rental carries, and the monthly owner reporting. The words are the words a property manager already uses.

**Rent trust accounting is not in here.** No trust account, no receipting into a bank, no disbursement, no reconciliation, no audit file. That stays in the system that holds it today, under the Real Estate Agents Act 2008 and its audit regulations. This records the tenancy lifecycle, the arrears, the maintenance, the inspections, the compliance and the owner reporting layer. That boundary is deliberate.

```
/arrears                          who is behind, how far, and the step the Act expects next
/inspections-due                  routine inspections against the cycle, and whether notice went out
/maintenance                      everything open, worst first, and who it is waiting on
/compliance-items                 healthy homes, smoke alarms, insulation statements, per property
/rent-review                      every review the Act now allows, with the gap to market rent
/property "Cleveland Street"      one property in full, including the gaps
/owner "Ellis Family Trust"       one owner: their rent, their arrears, their decisions, their bills
/tenancy TEN-2007                 the agreement, the ledger, the bond, every notice served
/notice serve <tenancy> "<kind>"  a notice, with the notice period checked before it saves
/vacates                          who is leaving and what is not booked
/compliance                       the Act and the regulations, run against your own records
/attention                        everything that wants a decision this week
/weekly-review                    the Monday review, written from three commands
```

One tenancy is one row. One inspection finding is one row. One notice is one row with the day it was served and the day it takes effect, because the gap between those two is what the Residential Tenancies Act is mostly about.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No per-property fee, no minimum spend, no modules. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too, starting with the inspection app on the phone.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/property-management-for-claude-code.git
cd property-management-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database, loads Kowhai Property Management (a demo Wellington agency with four staff, fourteen owners, twenty seven properties, twenty five running tenancies, six months of rent, arrears at three stages, inspections overdue, maintenance waiting on owners and a deliberately imperfect compliance register), then prints the arrears list, the inspection run, the attention list and the compliance check.

Then open the folder in Claude Code and type:

```
/arrears
```

Try `/attention`, `/inspections-due`, `/property "Coromandel"`, `/compliance`, `/weekly-review`. When you are ready for real data, delete `.data/` and start with `/import`, or add properties one at a time with `add property`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md) so drafts come out in your voice, and put your agency name and colours in [brand.json](brand.json) so the documents and views come out with your name on them.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-property fee. A team shares one database: each person clones the repo, points at the same `DATABASE_URL`, sets `PM_MANAGER` to their own name, and works in their own Claude Code.

## The commands

| Command | What it does |
|---|---|
| `/arrears` | Who is behind, how far, and the step the Act expects next. The number a property manager is judged on. |
| `/property` | One property in full: owner, tenancy, rent, inspections, maintenance, compliance. |
| `/owner` | One owner: their rent, their arrears, the decisions waiting on them, the compliance they fund. |
| `/tenancy` | One agreement: tenants, rent history with notice periods, ledger, bond, every notice served. |
| `/rent-review` | Every review the Act now allows, with the gap to market rent, and the notice with both rules checked. |
| `/inspections-due` | Routine inspections against the cycle, and whether the 48 hour entry notice actually went out. |
| `/inspection` | One visit end to end: book, serve notice, record room by room, close, send the owner the report. |
| `/maintenance` | Everything open, worst first, and who it is waiting on. Raise, ask, approve, decline, close. |
| `/job` | The contractor job: issue, book, done, invoice. And the work nobody has invoiced. |
| `/notice` | Serve a notice with the notice period checked before it saves. The whole notice register. |
| `/vacates` | Who is leaving, and what has not been booked. |
| `/renewals` | Fixed terms running out, and the decision the owner has to make before they roll over. |
| `/compliance-items` | Healthy homes, smoke alarms and insulation statements, per property, with the regulation. |
| `/compliance` | Eleven rules from the Act and the regulations, run against your records, each with its source. |
| `/attention` | Everything that wants a decision this week, worst first. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/draft-arrears-letter` | The arrears letter, from the ledger and what has already been served. Into `drafts/`. |
| `/draft-owner-update` | The note that goes to an owner, from their own position. Into `drafts/`. |
| `/log` | A call, a task, a task done, a rent receipt. The small entries that keep it true. |
| `/import` | Bring the rent roll across from Palace, PropertyMe, Console Cloud or a plain CSV. |
| `/customise` | Add a field, rename a stage, change a rule, in plain language. Writes and applies the migration. |
| `/new-view` | Add a read-only HTML dashboard from a description. |

Everything the commands do, the CLI does: `npm run property -- help`. Any command takes `--json`.

### Documents and views, in your brand

```bash
npm run docs    # owner monthly summaries, inspection reports, arrears letters, as HTML
npm run view    # the week and the portfolio, as read-only HTML dashboards
```

Both read [brand.json](brand.json), so your agency name, logo and colours are one file away. Documents land in `docs-out/`, views in `views/`. Print either to PDF from the browser. `/new-view` adds a view, `documents.json` adds a document.

## Compliance, checked against the data

`/compliance` runs the rules in [docs/compliance.md](docs/compliance.md) against your records and reports what is breached. Each rule cites its source, with the section or regulation number.

1. Lodge the bond within 23 working days of taking it (Residential Tenancies Act 1986, s 19(1)(a)).
2. A bond can be no more than four weeks rent (RTA 1986, s 18(1)).
3. Rent can only rise once every twelve months (RTA 1986, s 24(1A)).
4. Sixty days written notice of a rent increase (RTA 1986, s 24(1)(b)).
5. Follow the arrears steps: notice at five working days, remedy at fourteen, Tribunal at twenty one (RTA 1986, ss 55(1)(a), 55AA and 56).
6. At least 48 hours written notice before entering for an inspection, no more than one every four weeks (RTA 1986, s 48(2) and (3)).
7. Every rental has had to meet the healthy homes standards since 1 July 2025 (Residential Tenancies (Healthy Homes Standards) Regulations 2019).
8. A signed healthy homes compliance statement in every tenancy agreement (RTA 1986, s 13A(1A)(b)(ii)).
9. Working smoke alarms, and the insulation statement in the agreement (Residential Tenancies (Smoke Alarms and Insulation) Regulations 2016, regs 5 to 10 and reg 21).
10. Termination notice periods: 90 days, 42 days with a reason, 21 days from the tenant (RTA 1986, s 51, as amended by the Residential Tenancies Amendment Act 2024 from 30 January 2025).
11. Do not keep tenant records longer than you need them (Privacy Act 2020, principle 9; Tax Administration Act 1994, s 22 sets the seven year floor).

The New South Wales and Victorian equivalents are in the same file, at a high level, with the sections to read. Nothing there is legal advice. It is the rule book you point the system at, and you change it to match your jurisdiction and your agency agreement. This is the feature the incumbent puts behind its top tier.

## Ten questions Palace cannot answer

Every one of these is answered by the demo data today. Yours will be different, and that is the point.

1. Which owners cost us more in maintenance coordination than they pay us in management fees?
2. What is the total weekly gap between what our tenants pay and the market rent on file, and which reviews are legally available right now?
3. Which properties have had the same maintenance category three times in two years, and what has the owner spent on it?
4. How many days pass between an inspection finding something and a contractor being sent, by property manager?
5. Which tenancies have gone into arrears more than twice in twelve months, and what is the pattern in the dates?
6. What would it cost this owner to bring their whole portfolio up to the healthy homes standards, itemised by standard?
7. Which contractors take longest between being issued a job and finishing it, by trade, and which ones invoice over their quote?
8. Which properties have never had a smoke alarm check recorded since the tenancy started?
9. If a property manager left tomorrow, which properties, owners and open arrears files move, and how many of those have a Tribunal step due?
10. Which owners have not been spoken to in six months and are sitting on a rent under market, an open compliance gap, or both?

## Your first hour: ten things to ask for

Open the folder in Claude Code and say these in your own words. Each one changes the system to fit your agency.

1. "We inspect every twelve weeks, not thirteen. Change the cycle and the reminders."
2. "Put our logo and colours on the documents, and change the business name to ours."
3. "Add a pet bond field and a pet clause flag on the tenancy, and show them on the tenancy card."
4. "Our owners are on a lower fee for the first year. Add an introductory rate and an end date, and use it in the owner summary."
5. "Track the water meter reading at every inspection, and put the last two on the inspection report."
6. "Add a rule to `/compliance`: no tenancy starts without the healthy homes statement signed."
7. "We are in New South Wales. Bonds go to Fair Trading in ten working days, inspections are four a year with seven days notice, and rent arrears notices start at fourteen days."
8. "Build me a page for Monday: each manager's arrears, their inspections due, and their jobs waiting on owners."
9. "Add a 'rent review declined by owner' stage so we stop asking the same owner every month."
10. "Write me a command that drafts the letter to a tenant when an inspection finds something they have to fix."

`/customise` writes the migration, applies it, updates every command that touches the change, and runs the tests.

## Instead of Palace

Export the rent roll, run one command, and the history comes with you. Step by step, with what maps and what does not: [docs/replace-palace.md](docs/replace-palace.md).

```bash
npm run property -- import palace --owners=owners.csv --properties=properties.csv --tenancies=tenancies.csv --dry-run
npm run property -- import palace --owners=owners.csv --properties=properties.csv --tenancies=tenancies.csv
```

PropertyMe and Console Cloud exports go through the same command with `propertyme` or `console-cloud` in place of `palace`. Anything else works with `csv`.

The paid-to date from the export becomes an opening charge in the rent ledger, so your arrears figure is right from the first minute. Every property that comes across gets its seven compliance items created as "unknown", because the system will not tell you a property is compliant just because the old one did not say otherwise.

## Architecture

```
property-management-for-claude-code/
  CLAUDE.md                              how the agency wants this run (routing table + house rules)
  brand.json                             your agency name, logo and colours on every document and view
  views.json                             the HTML dashboards npm run view renders
  documents.json                         the paperwork npm run docs renders
  .claude/commands/                      the slash commands
  scripts/property.mjs                   the CLI the commands drive
  scripts/view.mjs                       read-only HTML dashboards from the SQL views
  scripts/docs.mjs                       the documents, one HTML file per record
  scripts/lib/db.mjs                     one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/                   plain SQL schema, tables and views
  supabase/seed.sql                      demo data
  docs/compliance.md                     the rules /compliance checks, each with its source
  docs/replace-palace.md                 moving off the incumbent
  docs/why-no-front-end.md               the honest trade-offs
  exports/                               whole database dumps
  drafts/                                letters and updates written for a person to send
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end, and no client money.

## Want it installed and run for you?

Enterprise DNA installs Property Management for Claude Code for your agency, migrates your Palace data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: https://calendly.com/sam-mckay/discovery-call
- Read more: https://enterprisedna.co/omni/instead-of/palace

## License

MIT. Copyright (c) 2026 Enterprise DNA.
