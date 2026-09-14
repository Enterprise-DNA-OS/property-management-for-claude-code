---
description: The compliance register per property: the five healthy homes standards, the smoke alarms and the insulation statement, with the status, the date and the regulation.
---

1. Run `npm run property -- compliance-items [--property=<ref>] [--kind=heating] [--all]`. Without `--all` it shows only what is not compliant.
2. Group by property, not by item. An owner with three gaps on one house is one phone call.
3. For each gap say three things: what the standard actually requires, what the note says is wrong, and roughly what closing it out involves. The register is only useful if the next step is obvious.
4. The five healthy homes standards and what each one needs:
   - **Heating** (regs 8 to 12). A fixed heater in the main living room, sized by the heating assessment formula. A plug-in heater does not count.
   - **Insulation** (regs 13 to 18). Ceiling and underfloor insulation to the 2008 standard, or a recorded exemption with evidence.
   - **Ventilation** (regs 19 to 22). Openable windows in every habitable room, and extract in the kitchen and bathroom that vents outside. Venting into the ceiling space is the most common failure.
   - **Moisture and drainage** (regs 23 to 26). Guttering, downpipes, drains, and a ground moisture barrier where there is an enclosed subfloor.
   - **Draught stopping** (regs 27 to 29). Gaps and holes stopped, unused open fireplaces blocked.
   Plus **smoke alarms** (Smoke Alarms and Insulation Regulations 2016, regs 5 to 10) and the **insulation statement** in the agreement (reg 21).
5. Say the deadline once: every private rental has had to comply since 1 July 2025. There is no grace period at the start of a new tenancy any more.

Close one out:
```
npm run property -- compliance-item done <property> "<item>" --evidence=INV-1234 --note="<what was done>"
npm run property -- compliance-item fail <property> "<item>" --note="<what is wrong>"
npm run property -- compliance-item exempt <property> "<item>" --note="<the ground, and where the evidence is>"
```

An exemption is a real thing (reg 16 for insulation, among others) but it has to be recorded with the reason and the evidence. "Exempt" with an empty note is not an exemption, it is a gap.

For anything not compliant, the next step is usually a quote and an owner conversation. Offer `/maintenance new <property> "<what the standard needs>"` and `/draft-owner-update`.
