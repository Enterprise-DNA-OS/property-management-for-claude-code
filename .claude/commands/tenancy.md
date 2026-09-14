---
description: One tenancy in full: the tenants, the agreement, the rent history with the notice periods, the ledger, the bond, the notices served and where the arrears process has got to.
---

The operator will name a tenancy by reference, by address, or by the tenant's name. All three work.

1. Run `npm run property -- tenancy "<what they said>"`.
2. Read the whole card, including the rent history and the notices, before you answer anything.
3. Present it in this order:
   - **Who lives there and what they pay.** Tenants, contact details, rent, the day it is due, when it last went up.
   - **The agreement.** Periodic or fixed term, start date, fixed term end, whether the healthy homes and insulation statements are on file. A missing statement is a breach with a penalty, so say it out loud.
   - **The bond.** Amount, whether it is lodged, and the bond number. An unlodged bond is the first thing to fix.
   - **The money.** Anything owing, how far behind in calendar days and working days, when they last paid.
   - **What has been served.** Every notice with the notice period in days, and anything served short.
   - **The house.** Recent inspections and open maintenance.
4. On the rent history, always say the notice period for each increase. Sixty days is the floor (RTA 1986 s 24(1)(b)) and twelve months is the gap (s 24(1A)).
5. Never state that a tenant is in breach unless the data says so. Read the ledger.

Next steps to offer:
- `/rent-review <tenancy>` for the earliest date an increase can take effect
- `/notice serve <tenancy> "<kind>"` to serve one, with the notice period checked before it saves
- `/arrears-log <tenancy> "<step>"` to record where the arrears process has got to
- `rent paid <tenancy> --amount=` to record a receipt
- `renewal <tenancy> --stage=` when the renewal conversation moves
- `note "<tenancy>" "<what was said>"` for the contact log
