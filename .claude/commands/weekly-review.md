---
description: The Monday review, written from three commands. Arrears, the property work, the lease calendar, the compliance register and the five things that matter this week.
---

Run these three, in this order, and write the review from what they return. Do not write anything they do not support.

```
npm run property -- arrears
npm run property -- attention
npm run property -- inspections-due
```

Then write it in this shape, no more than a page:

1. **The week in one line.** Total arrears, how many tenancies are past fourteen days, and how many properties are past their inspection cycle.
2. **Rent.** Arrears worst first, each with the step the Act expects next. Name anything at twenty one days with no Tribunal application: that is the section a principal reads first.
3. **The properties.** Inspections overdue, inspections booked without proper entry notice, and any inspection completed that the owner has never been sent.
4. **Maintenance.** Habitability jobs open, anything waiting on an owner for more than a week with the owner named, and anything approved that nobody has actioned.
5. **The lease calendar.** Vacates with no exit inspection booked, fixed terms inside sixty days at stage "not started", and the rent reviews the Act now allows with the total weekly gap to market rent.
6. **Compliance.** Bonds not lodged, healthy homes items open, smoke alarms not checked in twelve months. One count each and the worst one named.
7. **The owner side.** Statements not sent, owners nobody has spoken to in six months, and the maintenance spend that is going to surprise someone this month.
8. **The five things to do this week.** Pick them yourself from the attention list, weighted by risk first and money second, and say why each one made the list.
9. **One thing to decide.** The single item that needs a person, not a process.

Add `npm run view -- week` and `npm run view -- portfolio` if the operator wants pages to send on. They render the same numbers in the agency's brand, and they print.

Numbers come from the commands. If a number is not in the output, it does not go in the review.
