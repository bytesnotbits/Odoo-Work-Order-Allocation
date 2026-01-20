# Cable Reel Chargeout Form Mockup

This mockup describes a landscape, digital-first form that the engineering team can complete once the RedLines are reported, so material management can charge cable reels to the work order without printing anything.

## 1. Header

| Field | Control type |
| --- | --- |
| Work Order Number | pre-filled |
| Engineer Name | pre-filled |
| Date & Time | Auto-populated timestamp with manual override |
| Chargeout Status | Read-only badge (default `Pending Charge`, `Ready for Review`, `Pending Review`, `Ready to Post`, `Ok to Post`) |

## 2. Cable Reel Details Table

Columns are pre-populated from the data the system already collects. Each row is keyed to a reel, and the reviewer can attach the matching NISC journal entry information on the same row.
This is the table Material Management uses to enter the charge-out.

| Item # | Reel # | Item Description | Inner Seq | Outer Seq | Qty (derived from spans) | NISC Line # | Reference |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [pre-filled] | [pre-filled] | [pre-filled] | [pre-filled] | [pre-filled] | [pre-filled] | [input] | [input] |
| ... | ... | ... | ... | ... | ... | ... | ... |

Each column marked `[pre-filled]` is taken directly from the work order/reel data. The columns with `[input]` allow the Material Management to mirror the data keyed into the NISC chargeout screen (journal line number, reference, notes).
Any change to the item, sequence, or quantity data must go through the allocation workflow so the spans remain the single source of truth; this table simply summarizes those spans for review and journal-entry matching.

## 3. Cable Spans by Reel

Below the main table, display every span for each reel grouped by reel number. Each span row includes From/To segments and length. Provide expandable sections or subtables so the reviewer can focus on one reel at a time. Only spans that are backed by allocations with the “Aerial”, “Buried”, “Underground”, or “Expense” categories should be listed here; spans tied to pending or returned allocations are excluded from the chargeout so they aren’t billed twice.

Sample layout for Reel 12345:

| Span ID | From | To | Length (ft) | Quantity | Comments |
| --- | --- | --- | --- | --- | --- |
| 1 | Pole A | Pole B | 120 | 1 |  |
| 2 | Pole B | Pole C | 150 | 1 |  |

### Totals per Reel

| Item # | Item Description | Reel # | Total Quantity | NISC Line # |
| --- | --- | --- | --- | --- |
| [pre-filled] | [pre-filled] | [pre-filled] | [pre-filled] | [input] |
| [pre-filled] | [pre-filled] | [pre-filled] | [pre-filled] | [input] |

These totals ensure the material management team charges each reel individually even if multiple reels share the same material.

## 4. Grand Totals and Approval

| Label | Field |
| --- | --- |
| Aggregate Quantity | Auto-calculated sum of all reels |
| Aggregate Length | Auto-calculated sum of all spans |
| Notes | Multi-line text area |

## 5. Digital Signoffs

- Material Management Approval: signature field + timestamp
- Material Management Review: signature field + timestamp
- Reminder text: "Material is charged only after both approvals are captured. Match NISC Journal Entry lines to the same span rows above to confirm accuracy."

Each signature line can capture the user identity automatically, display a `Signed by <name>` badge, and allow comments so reviewers can trace which line in the chargeout form corresponds to which line in NISC.

## 6. Reviewer Aids

- Display a collapsible “Journal Entry Matching” panel that lists the lines brought into NISC with a link back to the reel/spans.
- Highlight rows that do not yet have a matching `NISC Line #` or `Reference`.
- Provide a `Save & Send for Chargeout` button that locks the form, notifies material management, and moves the status to `Ready for Charge`.

## 7. Submitted Spans / Unlock Flow

- Each reel/span card should show a `Submitted` badge once a chargeout has been sent to Material Management. The badge disables the inputs inside that card so duplicate submissions are prevented.
- Engineers and accountants can unlock the card by clicking an “Unlock for adjustment” action. Trigger a modal warning that accounting transactions have already been posted and unlocking requires notifying Material Management before proceeding.
- Lock state is tied to the `Chargeout Status` badge (e.g., `Ready for Charge` → `Submitted / Locked`). Unlocking updates the history/audit trail and sets the status back to `Ready for Review`, but the modal reminder makes the user confirm they will contact MM before edits can resume.
