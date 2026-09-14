---
description: The Residential Tenancies Act, the healthy homes standards, the smoke alarm regulations and the Privacy Act, run against your own records. Eleven rules, each with its source.
---

1. Run `npm run property -- compliance`. One rule can be run on its own: `compliance bond-lodgement`.
2. Read `docs/compliance.md` before you explain anything. Each rule has its source, what a breach looks like in the data, the query that finds it and the command that fixes it.
3. Present the summary table first: rule, breaches, the worst example, the source. Then the detail for anything breached.
4. Order what you say by consequence, not by the order the command prints:
   - **Unlawful acts with a penalty.** A bond not lodged inside 23 working days (RTA 1986 s 19), a bond over four weeks rent (s 18), a rent increase inside twelve months or on less than sixty days notice (s 24), a tenancy agreement with no healthy homes compliance statement (s 13A).
   - **Things that void what you have done.** A termination notice served short (s 51). An entry notice under 48 hours (s 48(3)).
   - **Things that cost the owner money.** Healthy homes standards not met since the 1 July 2025 deadline, smoke alarms not checked in twelve months.
   - **Things that lose at the Tribunal.** Arrears with the steps skipped (ss 55, 55AA, 56).
   - **Things that are quietly wrong.** Tenant records held years after the tenancy ended (Privacy Act 2020, principle 9).
5. For every breach, draft the fix the operator can approve: the record to update, the notice to draft to `drafts/`, or the task to add. Never send anything.
6. If a rule in `docs/compliance.md` is out of date, say so and stop. Do not guess at law. The operator confirms the rule, then you update the doc and the check together, in one commit, with a test.

Say this once in any compliance conversation: nothing here is legal advice. This is the agency's own rule book pointed at its own data, with the section numbers written down so anybody can check them. Change the rules to match your jurisdiction and your agency agreement.

Rent trust accounting is not in this system and this check does not touch it. That is audited where it lives, under the Real Estate Agents Act 2008 and the Real Estate Agents (Audit) Regulations 2009.
