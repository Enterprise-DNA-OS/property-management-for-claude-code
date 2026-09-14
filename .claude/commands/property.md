---
description: Everything about one property: the owner, the tenancy, the rent, the arrears, the inspection history, the maintenance and the compliance register.
---

The operator will name a property by reference ("PR-1013"), by address ("Cleveland Street"), or by suburb.

1. Run `npm run property -- property "<what they said>"`. If the name is ambiguous the command lists the candidates and stops. Show the list and ask which one; never guess.
2. Read the whole card before you say anything, including the compliance block and the notes.
3. Present it in this order, because it is the order a property manager thinks in:
   - **Who and what.** Owner, manager, the house itself, the management fee, the market rent on file.
   - **Let at.** The current tenancy, the tenants, the rent, and anything owing.
   - **Compliance.** Anything not compliant, with the regulation and what it will cost the owner. This is the part that turns into a phone call.
   - **The property itself.** Last inspection, what it found, what is still open in maintenance.
   - **History.** Previous tenancies and recent contact.
4. If the market rent on file is above the rent being paid, say the gap in dollars a week and whether a review is legally available yet.
5. If the last inspection is past the cycle, say so with the date, not "overdue".

Next steps to offer, in the words a property manager uses:
- `/tenancy <ref>` for the agreement in full
- `/inspection schedule <property> --on=` to book the next one
- `/maintenance new <property> "<what is wrong>"`
- `/compliance-items --property=<ref> --all` for the full register
- `/owner "<name>"` for the person who pays for all of it
