---
description: Who is leaving, when, and what has not been booked. The exit inspection, the bond refund, the owner conversation and the re-let.
---

1. Run `npm run property -- vacates`.
2. Sort by the date they are out, soonest first. For each one say who gave notice, when, and under which section.
3. The detail column says NO EXIT INSPECTION BOOKED where one is missing. That is the first thing to fix on every line, because the exit inspection is what the bond refund is argued from.
4. For each vacate, work through the list in this order and say what is done and what is not:
   - **Exit inspection booked.** `inspection schedule <property> --on= --kind=exit`. Book it for the day after they are out, not the day itself.
   - **The owner told.** They lose rent from the day it is empty. Offer `/draft-owner-update`.
   - **Re-let started.** Market rent checked, photographs, listing. Ask the operator what they want to advertise it at and check it against the market rent on file.
   - **Bond refund.** A refund needs both signatures or a Tribunal order (RTA 1986 s 22). Say what the bond is and whether there is anything on the file that would justify a claim against it.
   - **Final rent.** Anything owing at the end date, from `/arrears`.
   - **Keys, chattels and the meter readings.**
5. If a tenant is leaving with arrears, say so loudly. The bond is not automatically yours: a claim against it goes through the process or the Tribunal.

Notice periods, for reference when the operator asks whether a notice was valid:
- Landlord, no reason: 90 days (RTA 1986 s 51(1)).
- Landlord with a stated reason, for example the owner or a family member moving in: 42 days (s 51(2)).
- Tenant: 21 days (s 51(3)).

These are the periods from 30 January 2025, when the Residential Tenancies Amendment Act 2024 came into force. A notice served before that date runs on the old periods.
