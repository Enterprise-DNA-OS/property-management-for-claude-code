---
description: Draft the rent arrears letter to the tenant from the ledger and the notices already served. Writes to drafts/. Never sends.
---

The operator will name a tenancy, or say "write to the Coromandel Street tenant about the rent".

1. Run `npm run property -- tenancy "<what they said>"` and read the whole card: the ledger, the arrears events, the notices already served, and the contact log. Never write this letter without reading what was last said to them.
2. Work out where the file actually is:
   - Under five working days: this is a reminder, not a notice.
   - Five working days or more: a notice of overdue rent (RTA 1986 s 55AA).
   - Fourteen days or more: a 14 day notice to remedy (s 56).
   - Twenty one days or more: the letter goes with a Tribunal application (s 55(1)(a)).
   Say which one you are drafting, and why, before you draft it.
3. Write the letter. Plain, short, and not aggressive. It gets read out at the Tribunal.
   - What is owed, as a number, and what period it covers.
   - The last payment received and its date.
   - What the tenant needs to do, and by when.
   - What happens if they do not, in one sentence, naming the section.
   - Who to ring, by name, with a number.
   - If a payment plan was discussed, restate it exactly as it was agreed.
4. Save it to `drafts/arrears-<tenancy-ref>-<date>.md`.
5. Render the full pack if the operator wants the ledger attached: `npm run docs -- arrears-notice-draft`. That produces the branded HTML with the ledger, the notices already served and the next step.

Then tell the operator three things: the draft path, the step this letter represents, and the command that records it once they have served it (`arrears-log <tenancy> "<action>"`).

Never send it. Never use a statutory form you have not read. If the next step is a formal notice, say that Tenancy Services publishes the form and the operator should use it rather than a letter.
