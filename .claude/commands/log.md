---
description: Record what happened. A call, an email, a visit, a task to chase, a task done, a rent receipt. The small entries that keep the arrears list and the owner record true.
---

The operator will say "rang the tenant about the oven", "chase the roofer on Friday", "that is done", "the Ellis rent came in".

**A conversation.**
```
npm run property -- note "<property, tenancy or owner>" "<what was said and what was agreed>" [--kind=call|email|text|visit] [--on=YYYY-MM-DD] [--who="<who you spoke to>"]
```
The first argument resolves against a property, then a tenancy, then an owner, so a reference, an address or an owner name all work. A note against a property attaches to the running tenancy as well.

Write what was agreed, not that a call happened. "Told him the 14 day notice has expired and the next step is the Tribunal. He offered $200 on Friday" is a record. "Called tenant" is not.

Owner contact is what `/attention` uses to find owners nobody has spoken to in six months. It is worth thirty seconds.

**A task.**
```
npm run property -- task add "<what and for whom>" [--property= --tenancy= --owner= --due=YYYY-MM-DD --kind=arrears|inspection|maintenance|compliance|owner|renewal]
npm run property -- task done <id>
```
The default due date is a week out. Give it a real one if the operator said a day.

**Rent.**
```
npm run property -- rent paid <tenancy> [--amount=] [--on=]
npm run property -- rent charge <tenancy> --amount= --note="Water rates recharge"
npm run property -- rent credit <tenancy> --amount= --note="<why>"
```
This is a record, not a bank transaction. The money moves in the trust account, in the system that holds it. Say that if the operator sounds like they think it is a receipt.

**An arrears step.** Use `/arrears` and `arrears-log`, not a note. The arrears process needs its own dated record or the Tribunal file is thin.

Never write a note the operator did not say. If a detail is missing, ask for it.
