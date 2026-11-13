---
id: SCHED-4515
title: Ack moves from the row into an incident panel
status: done
plan: R2 (changed)
---

Product's decision after the step-1 recording: at 00:11 a new incident landed on top while the pointer rested
on INC-7575's Ack, and the click acked INC-2321. New incidents stay live at the top. Ack leaves the row: a row
opens its incident panel, and Ack lives there.

- Clicking (or Enter on) a row opens `data-testid="incident-panel"`, which names the incident id. Clicking another
  row switches the panel to that incident.
- The panel's `data-testid="panel-ack"` acks the panel's incident (the id fixed when it opened), then the row shows
  `data-testid="acked"`.
- Rows carry no `data-testid="ack"`. The panel sits outside the list, so live inserts never move it.

Acceptance: a live insert during aiming can open the wrong panel, but the panel names the id before anything is
acked, and the ack always goes to the incident the panel names.
