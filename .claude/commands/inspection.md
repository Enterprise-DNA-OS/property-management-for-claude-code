---
description: Run one inspection end to end: book it, serve the entry notice, record what you saw room by room, close it, and send the report to the owner.
---

The operator is either booking a visit, writing one up afterwards, or asking what an inspection found.

**Book it.**
```
npm run property -- inspection schedule <property> --on=YYYY-MM-DD [--kind=routine|entry|exit|healthy homes]
```
The command tells you the date the entry notice has to be with the tenant by. Put that date in front of the operator.

**Serve the entry notice.**
```
npm run property -- inspection notice <id> [--on=YYYY-MM-DD] [--method=email|post|hand|text]
```
Records the notice and warns if there is less than 48 hours before the visit (RTA 1986 s 48(3)). If it warns, move the visit rather than going anyway.

**Write it up, room by room.**
```
npm run property -- inspection item <id> "<area>" "<what you saw>" [--condition=good|fair|poor] [--action]
```
One row per area. Use the words the operator used. `--action` marks anything that needs work, and those rows are what turn into maintenance requests.

**Close it.**
```
npm run property -- inspection complete <id> [--overall=good|fair|poor] [--summary="..."]
```
Sets the next inspection date from the property's cycle.

**Send the owner the report.**
```
npm run docs -- inspection-report
npm run property -- inspection report <id>
```
The first renders the branded HTML. The second records that the owner got it. Do not mark it sent until it has been.

For every item marked `--action`, ask whether it should become a maintenance request, and raise it with `maintenance new <property> "<what>" --reported-by=inspection`. An inspection that finds a problem and does not raise a job is how a habitability complaint starts.

If anything you saw touches a healthy homes standard or a smoke alarm, update the compliance register as well: `compliance-item fail <property> "<item>" --note="<what you saw>"`. The inspection is the moment the register gets true.

Photographs live in your own file store. Put the reference in the item note. This system does not hold images.
