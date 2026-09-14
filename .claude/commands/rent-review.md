---
description: Every rent review the Act now allows, with the gap to market rent, and the command that serves the notice with the sixty day and twelve month rules checked before it saves.
---

The operator will ask "what rents can we put up", or name one tenancy.

**The whole list.**
```
npm run property -- rent-review
```
Every tenancy where twelve months have passed since the tenancy started or the last increase took effect, plus anything falling due inside sixty days. Present it sorted by the gap to market rent, biggest first, because that is where the owner's money is. Give the total weekly gap across the portfolio in one line: that is the number the principal wants.

**One tenancy.**
```
npm run property -- rent-review "<tenancy>"
```
Shows the rent history, the earliest date an increase can take effect, and the earliest date a notice served today could bite.

**Serving one.**
```
npm run property -- rent-review serve <tenancy> --new-rent=720 [--effective=YYYY-MM-DD] [--on=YYYY-MM-DD]
```
The effective date defaults to sixty days out. The command refuses an increase that breaks either rule and tells you the earliest date that works. Do not pass `--force` unless the operator has said why the rule does not apply, and record the reason in `--note`.

The two rules, every time you talk about this:
- **Twelve months.** Rent cannot rise within twelve months of the tenancy starting or of the last increase taking effect (RTA 1986 s 24(1A)).
- **Sixty days.** At least sixty days written notice (s 24(1)(b)).

Before you recommend an increase:
1. Check the market rent on file, and say where it came from if the note says.
2. Check the arrears position. Putting the rent up on a tenant already fourteen days behind is a decision, not a routine.
3. Check whether the tenancy is ending. A rent review on a tenancy with a vacate date booked is wasted work.
4. The owner has to agree. Say who has to be asked and offer `/draft-owner-update`.

After the notice is served, the rent on the tenancy changes when the increase takes effect, and the bond may be topped up: a top-up is still capped at four weeks of the new rent and gets its own 23 working days to lodge (RTA 1986 ss 18 and 19).
