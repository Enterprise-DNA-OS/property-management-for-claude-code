---
description: Make this system yours in plain language. Add a field, rename a stage, change a rule, add a column to the owner statement. Writes the migration, applies it, updates every command that touches it.
---

The operator will describe a change in their own words. Real examples from this industry:

- "We inspect every twelve weeks, not thirteen."
- "Add a pet bond field, and a pet clause flag on the tenancy."
- "Our owners are on different fee rates for the first year. Add an introductory rate and an end date."
- "Track the water meter reading at every inspection."
- "Add a rule: no tenancy starts without the healthy homes statement signed."
- "We are in New South Wales. Bonds go to Fair Trading in ten working days and inspections are four a year with seven days notice."
- "Put the owner's accountant on the monthly summary."
- "Add a 'rent review declined by owner' stage so we stop asking every month."

How to do it:

1. Read `CLAUDE.md`, the current schema in `supabase/migrations/`, and every command, view and document that touches the thing being changed. Say back in one line what you are about to change and where.
2. Write the next numbered migration in `supabase/migrations/` (never edit an applied one). Keep names plain and lowercase. Default new columns so existing rows stay valid. If a view depends on a column you are changing, recreate the view in the same migration.
3. Run `npm run migrate`. If it fails, fix the SQL and run it again.
4. Update every place the change shows up: the CLI output and flags in `scripts/property.mjs`, the affected slash commands, `views.json`, `documents.json`, the import column mapping, and the README command table.
5. If the change is a compliance rule, change three things together: `docs/compliance.md` (the rule, its source, the breach, the query), the `COMPLIANCE_RULES` array in `scripts/property.mjs`, and the assertion in `scripts/smoke.mjs`.
6. Run `npm test`. Add an assertion for the new behaviour if it is visible in a command's output.
7. If the change is branding rather than schema, it is `brand.json`: business name, logo path, colours, footer line. Then rerun `npm run docs` and `npm run view`.

Report in three lines: what changed, the migration file, the commands that now show it.

Two things that need an explicit yes in this session: deleting a column or a table, and changing a statutory notice period. Notice periods are law, not preference. If the operator wants one changed because they are in a different state or country, ask them to name the Act and section, and put it in `docs/compliance.md` next to the rule.
