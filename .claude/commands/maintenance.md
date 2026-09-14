---
description: Everything open, worst first, and who it is waiting on. Raise a request, ask the owner, approve it, decline it, close it.
---

The operator wants the maintenance board, or is raising something a tenant has just rung about.

**The board.**
```
npm run property -- maintenance [--urgent] [--priority=] [--manager=] [--all]
```
Present it in this order, because this is the order that keeps an agency out of trouble:

1. **Habitability.** No hot water, no heat, no power, no lock, water coming in. These are not a queue. Say how many days each has been open and what is booked. A landlord's obligation to maintain is in RTA 1986 s 45, and an urgent repair does not wait for an owner to answer an email.
2. **Waiting on an owner.** Anything asked and not answered, with the number of days. Over a week, name the owner and offer `/draft-owner-update`.
3. **Approved and nothing happening.** The owner said yes and nobody sent a contractor. This is the one that quietly makes an agency look useless.
4. **Everything else**, by age.

**Raise one.**
```
npm run property -- maintenance new <property> "<what is wrong>" [--priority=urgent|high|normal|low] [--category=] [--habitability] [--detail="<what the tenant said>"]
```
Write what the tenant actually said in `--detail`. "Shower leaking into the wall cavity" is a job; "shower issue" is not.

**Move it through the owner.**
```
npm run property -- maintenance ask <ref> --quote=640
npm run property -- maintenance approve <ref> [--limit=800]
npm run property -- maintenance decline <ref> "<why the owner said no>"
npm run property -- maintenance complete <ref>
```

**Send someone.** `/job issue <ref> "<contractor>"`.

Rules that do not bend:
- Never mark something approved the owner has not approved. An approval is evidence of a conversation.
- Never tell a tenant a date a contractor has not given you.
- If a job is habitability and the owner is not answering, say so plainly and recommend proceeding. The obligation is the landlord's, and the agency carries it in the meantime.
- A tenant is entitled to 24 hours notice for a repair visit (RTA 1986 s 48(4)). Say that every time a job is booked.
