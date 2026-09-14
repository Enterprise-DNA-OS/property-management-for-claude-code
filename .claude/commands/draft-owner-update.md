---
description: Draft the update that goes to an owner, from their properties, their arrears, the maintenance waiting on them and the compliance they have to fund. Writes to drafts/. Never sends.
---

The operator will name an owner, or say "write to the Lawsons about the deck".

1. Run `npm run property -- owner "<name>"` and read the whole card, including the contact log. If the operator named a specific thing, run `npm run property -- property "<ref>"` as well.
2. Decide what this letter is for. There are only four kinds, and mixing them is why owners do not read them:
   - **An approval ask.** One job, one quote, one decision, one deadline.
   - **A monthly update.** Their properties, the rent, what happened, what is coming.
   - **A compliance conversation.** A standard is not met, here is what it needs and what it costs.
   - **A vacate or a rent review.** A decision about income.
3. Write it short. An owner reads the first two lines. Lead with the decision or the number, not the background.
4. Rules for the content:
   - Every figure comes from the data. Never estimate a repair cost that is not a recorded quote.
   - Name the regulation when you mention compliance, and say what it actually requires in one sentence. Owners resent compliance spend they do not understand.
   - If rent is behind, say the number and the step being taken. Never soften it.
   - If the market rent on file is above what is being paid, say the gap in dollars a week and whether a review is legally available yet.
   - Say what you need from them, and by when.
5. Save it to `drafts/owner-<owner-slug>-<date>.md`.
6. If they want the statement pack with it, run `npm run docs -- owner-monthly-summary` and point at the file. It carries the properties, the rent position, the maintenance, the inspections, the compliance and what is coming up, in the agency's brand.

Then tell the operator: the draft path, what decision it asks for, and the command that records the answer (`maintenance approve`, `rent-review serve`, `note "<owner>" "..."`).

Never send it. Never commit the agency to a date a contractor has not given you.
