---
description: Fixed terms running out, where the renewal conversation has got to, and the decision the owner has to make before the term rolls over.
---

1. Run `npm run property -- renewals`.
2. Sort by the end date. For each one say the tenants, the rent, the market rent on file, and the renewal stage.
3. Say the thing most people get wrong, once: a fixed term nobody acts on does not end. It rolls into a periodic tenancy on exactly the same rent (RTA 1986 s 60A). Doing nothing is a decision to keep the rent where it is.
4. For each tenancy there are three choices, and the owner has to make one:
   - **Let it roll.** Cheapest, keeps a good tenant, locks in today's rent.
   - **A new fixed term.** Needs a conversation with the tenant and a new agreement. A new rent still needs sixty days notice and twelve months since the last increase (RTA 1986 s 24), so start early.
   - **End it.** Notice has to be given between 90 and 21 days before the end date, and only on one of the grounds in the Act.
5. Anything at stage "not started" inside sixty days is the urgent part of the list. Name it.
6. Check the arrears and the inspection history for each one before recommending a renewal. A tenant who has been behind three times this year is a different conversation.

Record where it gets to:
```
npm run property -- renewal <tenancy> --stage=owner asked|tenant asked|agreed|documented|ending --note="<what was said>"
```

Next steps to offer:
- `/draft-owner-update "<owner>"` to ask them
- `/rent-review <tenancy>` to see what a new rent could legally be
- `/notice serve <tenancy> "end of fixed term"` if the owner wants it to end
