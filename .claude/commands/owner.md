---
description: One owner in full: their properties, the rent they earn, what is owed, the maintenance waiting on their decision, the compliance they have to fund, and what we have sent them.
---

The operator will name an owner, or ask "how is the Ellis Trust doing".

1. Run `npm run property -- owner "<name>"`. Ambiguous names list the candidates; ask, do not guess.
2. Read the whole card, including the contact log. Then write it the way you would brief someone before they ring the owner.
3. Lead with the position: how many properties, how many let, the weekly rent, and the annual management fee that rent generates for us.
4. Then the three things an owner cares about, in this order:
   - **Is my rent coming in.** Arrears across their properties, and the step being taken.
   - **Is anything broken.** Open maintenance, and specifically anything sitting on their own desk waiting for their approval, with how many days.
   - **What is it going to cost me.** Compliance items not met, each with the regulation and what closing it out involves.
5. Say when they were last sent a statement and when anyone last spoke to them. If it is over three months, say so plainly.
6. If the rent on any of their properties is under the market rent on file and a review is legally available, say the gap in dollars a week.

Next steps to offer:
- `/draft-owner-update "<owner>"` for the note that goes to them, saved to `drafts/`
- `npm run docs -- owner-monthly-summary` for the branded statement pack
- `/maintenance approve <ref>` once they say yes
- `/rent-review serve <tenancy> --new-rent=` once they agree a new rent
- `note "<owner>" "<what was said and what was agreed>" --kind=call` after the call

Never write to an owner from here. Drafts go to `drafts/` and a person sends them.
