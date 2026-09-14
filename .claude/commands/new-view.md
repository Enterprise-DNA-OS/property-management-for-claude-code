---
description: Add a read-only HTML dashboard from a plain-language description, rendered in the agency's brand by npm run view.
---

The operator will describe a page they want to look at. Real examples from this industry:

- "A Monday page for each property manager: their arrears, their inspections due, their jobs waiting on owners."
- "A page I can send the principal: rent roll by suburb, fee income, and the gap to market rent."
- "A compliance board: every property, the seven items, red or green."
- "A page for the owner meeting: their properties, the rent, what we spent and what is coming."

1. Work out which existing SQL views or tables answer each part. The ones already here are `v_rent_roll`, `v_owner_summary`, `v_tenancy_current`, `v_arrears`, `v_inspections_due`, `v_maintenance_open`, `v_lease_events`, `v_compliance_due` and `v_attention_due`. If a section needs a new query, write it as a SQL view in the next numbered migration and run `npm run migrate`, so the CLI and the page share one definition.
2. Add an entry to `views.json`: a `name` (kebab-case, becomes the file name), a `title`, an optional `subtitle`, and one `sections` item per block with `title`, `sql`, optional `note` and optional `columns` (to pick and order columns).
3. Alias every column into plain words in the SQL (`select address_line as property`), because the column names come straight out of the query and end up as the table headings.
4. Where a section touches a statutory rule, put the rule in the section `note` with its section number. The person reading the page is usually the person who has to act on it.
5. Run `npm run view -- <name>` and open `views/<name>.html` to check it reads. It prints, so check the column count is not so wide it wraps.
6. Add one line to the README command table describing the view.

Report: the file path, the sections it has, and the command to regenerate it.

The page is read-only by design. If the operator asks for buttons, filters or editing, explain that changes are made through the slash commands and offer to add one.
