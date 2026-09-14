---
description: The contractor job under a maintenance request: issue it, book it, mark it done, record the invoice. And the jobs finished that nobody has invoiced.
---

**Issue a job.**
```
npm run property -- job issue <maintenance ref> "<contractor>" [--quote=640] [--scheduled=YYYY-MM-DD]
```
The command refuses to issue a job the owner has not approved, unless you pass `--force`. Only force it for urgent work the agency is entitled to order without approval, and say in the note why.

Before you pick a contractor, run `npm run property -- contractors` and check three things: the trade, whether their public liability insurance is current, and whether the licence reference is on file. Sending an unlicensed electrician or a builder with lapsed insurance to an owner's property is the agency's problem, not the owner's.

**Move it.**
```
npm run property -- job book <job> --on=YYYY-MM-DD
npm run property -- job done <job> [--on=] [--complete]
npm run property -- job invoice <job> --amount=712.50 [--ref=INV-5511]
npm run property -- job cancel <job>
```
`--complete` on `job done` closes the maintenance request as well. Use it when the job was the whole request.

`job invoice` warns when the invoice is more than ten percent over the quote. Do not put that on an owner statement without checking it first, because the owner will check it.

**What is not invoiced.**
```
npm run property -- jobs
```
Defaults to open jobs and work that is finished with no invoice. Anything done more than a fortnight ago with no invoice is money the owner has not been charged and a contractor who will bill it in three months in the middle of a month-end. Chase it.

Always tell the tenant when a contractor is coming. A repair visit needs 24 hours notice (RTA 1986 s 48(4)), and a contractor turning up unannounced is a complaint.

Nothing here emails anybody. Send the work order yourself.
