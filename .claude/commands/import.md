---
description: Bring the rent roll across from Palace, PropertyMe, Console Cloud or a plain CSV. Dry run first, then the real thing.
---

The operator has export files from their old system, or is about to make them.

1. Read `docs/replace-palace.md` first and tell the operator what will not come across before they start: the trust account, inspection photographs, documents, historic statements and maintenance history. Being surprised by that after the switch is the worst way to find out.
2. Ask for three files: owners, properties and tenancies. Palace exports them from its reporting module; PropertyMe and Console Cloud have the equivalent. If the export only prints, print it to CSV.
3. Dry run, every time:
```
npm run property -- import palace --owners=owners.csv --properties=properties.csv --tenancies=tenancies.csv --dry-run
```
Nothing is written. Read the skipped list out loud. The usual causes are an owner code in the property file that is not in the owner file, and a property address that does not match.
4. Fix the files, dry run again, and only then:
```
npm run property -- import palace --owners=owners.csv --properties=properties.csv --tenancies=tenancies.csv
```
Use `propertyme`, `console-cloud` or `csv` in place of `palace` for the others.
5. Check it against the old system before anyone relies on it:
```
npm run property -- stats
npm run property -- properties
npm run property -- arrears
```
The property count and the weekly rent roll should match the old rent roll report to the dollar. If they do not, the difference is almost always a property with no current tenancy, or a rent stored fortnightly in one system and weekly in the other.

What the import does that matters:
- The paid-to date becomes an opening charge in the rent ledger, so the arrears figure is right from the first minute.
- Two names in one tenant cell ("Ari and Kate Solomon") become two tenants, the first primary.
- Every property gets its seven compliance items created as "unknown". That is deliberate. The system will not say a property is compliant because the old one did not say otherwise.

Then say the first job out loud: `compliance-items --all` and work through the unknowns. That is the real work of the switch, and it is work the agency owed anyway.
