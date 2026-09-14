---
description: Who is behind on rent, how far, and the exact step the Residential Tenancies Act expects next. The number a property manager is judged on.
---

The operator wants the arrears list. Arguments might be a number of days ("14"), a manager ("Mere"), or nothing at all.

1. Run `npm run property -- arrears [--min-days=] [--manager=]`.
2. Lead with two numbers: the total owing, and how many tenancies are past fourteen days. Those are the ones that become Tribunal applications.
3. Work down the list worst first, and for each one say the step the Act expects, in the Act's own words:
   - **Twenty one days or more.** The Tenancy Tribunal can terminate for rent arrears (RTA 1986 s 55(1)(a)). If there is no application on file, that is today's job.
   - **Fourteen days or more.** A 14 day notice to remedy (s 56) gives the tenant a fortnight to put it right and puts the file on a footing.
   - **Five working days or more.** A notice of overdue rent (s 55AA). Three of those inside ninety days is its own ground for termination under s 55(1)(aa).
   - **Under five working days.** A phone call. Not a notice.
4. Name the tenants and the property in every line. An arrears list without a name in it does not get actioned.
5. Say plainly where a payment plan is already running, and whether the tenant has kept to it.
6. End with the two or three to deal with today, and one line each on why.

Record what happens next:
- `arrears-log <tenancy> "notice of overdue rent"` after you serve one. It writes the notice record as well.
- `arrears-log <tenancy> "14 day notice to remedy"`
- `arrears-log <tenancy> "payment plan" --note="$80 a week on top until square"`
- `arrears-log <tenancy> "tribunal application"`
- `rent paid <tenancy> --amount=` when money comes in
- `/draft-arrears-letter <tenancy>` for the letter, saved to `drafts/`

Never serve anything from here. This system records notices; a person serves them the way the tenancy agreement allows, and keeps the proof.
