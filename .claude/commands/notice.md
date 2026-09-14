---
description: Serve a notice with the notice period checked before it saves, and see everything already served, including anything served short.
---

**Serve one.**
```
npm run property -- notice serve <tenancy> "<kind>" [--effective=YYYY-MM-DD] [--on=YYYY-MM-DD] [--method=email|post|hand|text] [--detail="..."]
```

The kinds, and the notice period each one needs:

| Kind | Notice | Source |
|---|---|---|
| `rent increase` | 60 days | RTA 1986 s 24(1)(b) |
| `notice of overdue rent` | none | s 55AA, after five working days of arrears |
| `14 day notice to remedy` | 14 days | s 56 |
| `termination 90 day` | 90 days | s 51(1), landlord, no reason needed |
| `termination 42 day` | 42 days | s 51(2), owner or family moving in, sale with vacant possession, or needed for an employee |
| `tenant notice 21 day` | 21 days | s 51(3), tenant ending a periodic tenancy |
| `entry notice` | 48 hours | s 48(3) |
| `breach notice` | none | s 56 process |
| `end of fixed term` | 90 to 21 days before the end date | s 60A |

The effective date defaults to the statutory period. The command refuses anything shorter and tells you the earliest date that works. `--force` exists for the cases where the operator knows why the rule does not apply; make them say why, and put it in `--detail`.

Serving a termination notice or a tenant's 21 day notice marks the tenancy "notice given" and sets the vacate date. The next thing that has to happen is the exit inspection: `/vacates` will show it as missing until it is booked.

**See what has been served.**
```
npm run property -- notices [--tenancy=] [--kind=] [--all]
```
The Days column flags anything served with less notice than the Act requires. A notice served short is void, and the tenant can stay.

**Every time.** This system records a notice. It does not serve one. Serve it the way the tenancy agreement allows, keep the proof of service, and remember that the notice period runs from proper service, not from the date on the letter. The Tenancy Tribunal will ask for the proof.
