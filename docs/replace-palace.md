# Moving off Palace

Palace is MRI's residential property management platform, and it is what most New Zealand agencies
run. PropertyMe and Console Cloud are the Australian equivalents and the process is the same. This
page is the switch, step by step: what to export, what one command does with it, what maps, and
what does not come across.

Read the last section before you commit to anything. The honest answer is that a rent roll cannot
leave its trust account behind, and this system is not trying to take it.

## Before you start

**The trust account stays where it is.** This is the one thing to be clear about. Rent receipting,
owner disbursements, the audit file and the reconciliation stay in Palace, or in whatever you move
them to. Property Management for Claude Code holds the tenancy lifecycle, the arrears position, the
inspections, the maintenance, the compliance and the owner reporting layer. Run the two side by side
for a full month before you decide anything.

**Take a copy of everything first.** Export every report Palace will give you, not just the three
below. Once you are off the platform you cannot go back for the ones you forgot.

## Step 1: export from Palace

Palace exports through its reporting module. The three that matter:

| What | Where | Save as |
|---|---|---|
| Owners | Reports, Owner list, export to CSV | `owners.csv` |
| Properties | Reports, Property list, export to CSV | `properties.csv` |
| Tenancies | Reports, Tenancy list or Rent roll, export to CSV | `tenancies.csv` |

If a report only prints, print it to CSV or Excel and save the sheet as CSV. If your Palace has been
configured with different report names, any export with the columns below works. The importer
matches column names case-insensitively and accepts several names for the same field, so you do not
have to rename anything first.

**Owners.** Owner Code, Owner Name, Email, Phone, Postal Address, City.

**Properties.** Property Code, Property Address, Suburb, City, Owner Code, Management Fee,
Bedrooms, Property Type, Market Rent.

**Tenancies.** Tenancy Code, Property Code, Start Date, End Date, Rent, Rent Period, Bond, Paid To,
Tenant Name, Tenant Email, Tenant Phone.

The three files link on Owner Code and Property Code. If your export uses names instead of codes,
that works too: the importer matches an owner by name and a property by address.

## Step 2: dry run

```bash
npm run property -- import palace --owners=owners.csv --properties=properties.csv --tenancies=tenancies.csv --dry-run
```

Nothing is written. You get a count of what would be created, what is already here, and every row it
would skip with the reason. Read the skip list. The usual causes are an owner code in the property
file that is not in the owner file, and a property address that does not match.

## Step 3: import

```bash
npm run property -- import palace --owners=owners.csv --properties=properties.csv --tenancies=tenancies.csv
```

Then check it:

```bash
npm run property -- stats
npm run property -- properties
npm run property -- arrears
```

The property count and the weekly rent roll should match the Palace rent roll report to the dollar.
If they do not, the difference is almost always a property with no current tenancy or a rent stored
fortnightly in one system and weekly in the other.

PropertyMe and Console Cloud exports go through the same command with `propertyme` or
`console-cloud` in place of `palace`. Anything else works with `csv`, which accepts every column
name the other three use.

## What maps

| Palace | Here | Notes |
|---|---|---|
| Owner | `owners` | Name, email, phone, postal address, city, owner code as `external_ref` |
| Property | `properties` | Address, suburb, city, type, bedrooms, management fee percentage, market rent |
| Owner to property link | `properties.owner_id` | Matched on Owner Code, then on owner name |
| Tenancy | `tenancies` | Reference, property, start, end, rent, rent period, bond amount |
| Rent | `rent_schedule` | One opening row per tenancy at the imported rent |
| Bond | `bonds` | Marked as lodged, because Palace only holds bonds that were lodged |
| Paid to date | `rent_ledger` | Becomes one opening charge, so arrears are right from the first minute |
| Tenant names | `tenants` and `tenancy_tenants` | "Ari and Kate Solomon" becomes two tenants, the first primary |

Every property that comes across gets its seven compliance items created with status `unknown`:
five healthy homes standards, smoke alarms and the insulation statement. That is deliberate. The
system will not tell you a property is compliant because the old one did not say otherwise.

## What does not come across

Be honest with yourself about this list before you switch.

- **The trust account.** Receipts, disbursements, the audit trail and the reconciliation. It stays in
  Palace. Nothing in this repo replaces it, and nothing here should.
- **Inspection history with photographs.** Palace stores inspection images in its own file store.
  The dates and the findings can be re-keyed if they matter; the photos cannot be exported into a
  database. Keep read-only access to Palace for a year, or export the reports as PDFs and file them.
- **Documents.** Tenancy agreements, bond forms, letters, signed statements. Export them as files
  and keep them in your own document store. This system references them, it does not hold them.
- **Owner statements already issued.** Historic statements stay where they were issued. The
  statements this system produces start from the month you switch.
- **Maintenance history and contractor invoices.** Palace holds these against its own job numbers.
  You can re-key anything still open with `maintenance new`; closed history is not worth moving.
- **Arrears history.** The paid-to date comes across, so the current arrears figure is right. The
  history of notices served before the switch does not. If a tenancy is heading to the Tribunal,
  keep the Palace file open until it is finished.
- **Anything your agency built in Palace as a custom field.** Add it here with `/customise` and it
  becomes a real column, not a note in a text box.

## Step 4: the first week

1. `compliance-items --all` and work through the properties whose items are `unknown`. This is the
   real work of the switch, and it is work you had to do anyway.
2. Fill in the "Who this is for" block in `CLAUDE.md` so drafts come out in your voice.
3. Put your agency name and colours in `brand.json`, then `npm run docs` and `npm run view`.
4. Run `attention` every Monday for a month against the Palace task list, and see which one is
   telling you more.

## Running both for a month

The safe way to switch is not to switch. For one full month:

- Receipt rent in Palace, as you do now.
- Record everything else here: inspections, maintenance, notices, arrears steps, owner contact.
- Send the owner statements from Palace and the owner monthly summary from here, and ask two owners
  which they prefer.
- At the end of the month, compare the arrears list, the inspection schedule and the compliance
  register from both.

If the answer is obvious, keep going. If it is not, you have lost a month and gained a clean
compliance register.
