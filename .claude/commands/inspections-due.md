---
description: Routine inspections against the three month cycle: what is overdue, what is booked, and whether the 48 hour entry notice has actually gone out.
---

The operator wants the inspection run. Arguments might be a manager, or "what is overdue".

1. Run `npm run property -- inspections-due [--overdue] [--manager=]`.
2. Lead with two numbers: how many are due inside thirty days, and how many are already past the cycle.
3. Sort the overdue ones by how far past they are, and name the property and the tenants. Anything showing NEVER has not been inspected at all since the tenancy started, and goes to the top.
4. For anything already booked, check the entry notice column:
   - **NONE** means no notice is recorded. Entry without notice is trespass. Serve it or move the visit.
   - **Fewer than 2 days** is short of the 48 hours the Act requires (RTA 1986 s 48(3)). Move the visit.
   - More than 14 days ahead is also outside the rule.
5. Say the rule once, plainly: at least 48 hours and no more than 14 days written notice, no more than one inspection every four weeks, entry between 8am and 7pm.
6. Suggest a run: group the overdue properties by suburb so the manager can do them in one trip.

Next steps:
- `inspection schedule <property> --on=YYYY-MM-DD` books it and tells you the date the notice has to be out by
- `inspection notice <id>` records the entry notice, and warns if it is too late
- `/inspection <id>` to walk through the visit itself
- `task add "<what>" --property=<ref> --due=` for anything you cannot do today

The three month cycle is the agency's own promise to the owner and the insurer, not a legal requirement. The notice and the frequency ceiling are the legal parts. Keep the two separate when you explain it.
