# Future Features & Enhancements

## Enhancements

### Work Order Locking / Unlocking
- Engineers lock a work order via `lockWorkOrder` (`src/hooks/useAllocations.js`) once allocations are verified. This sets `allocState[k].locked = true`, and the UI (WOView/ProductCard) disables edits.
- Request: allow accountants to unlock/return a work order if issues are found so engineers can adjust allocations again. Potential approach: add `unlockWorkOrder` in the hook, expose it to `App`, and provide a “Return to engineering” control (e.g., tied to history entry status changes) so the two sides coordinate around an explicit status transition.

### Per-Item Reset (Replace Global Clear History)
- Request: replace any global "clear history" action with a per-item reset control.
- Behavior: reset all assets for that specific item back to default values so the engineer can start fresh on just that item, without touching other items on the work order.

## Future

### Notifications & Audit Trail
- Future plan: tie the status history changes (open → submitted → returned) to both an unlock flow and a notification system so accounting gets notified when a work order is ready or returned.

### User Identity Integration
- The app currently has no built-in identity; any “who did it” data must be provided by the user manually.
- Request: integrate Azure (MS Entra/Azure AD) via MSAL (`@azure/msal-browser` + `@azure/msal-react`). Wrap `App` in `MsalProvider`, read `instance.getActiveAccount()`, and store that identity in context so every history/notification payload can know who acted.

### Microsoft Teams Messaging
- Sending Teams messages would keep both engineering and accounting aware of status changes.
- Implementation ideas:
  1. Add a backend that receives status-change webhooks (lock/unlock, history updates) from the SPA and delivers Teams (Graph or Incoming Webhook) messages safely.
  2. Alternatively, call Microsoft Graph directly from the browser once MSAL provides a token, requesting the necessary permissions (ChatMessage.Send, ChannelMessage.Send).
- Combine Teams notifications with the history + notification log so each alert includes WO ID, user, timestamp, and reason for the transition.

### Summary & Next Steps
1. Build an unlock path tied to history status transitions so accountants can “return” WOs cleanly.
2. Integrate Azure AD authentication for user context and use the same identity to drive MS Teams notifications when statuses change.

### Comprehensive AI-Consumable User Manual
- Capture every workflow step, UI affordance, and decision path inside a structured “user manual” that an AI chatbot can ingest (think JSON, markdown, or another consistent schema). The manual should describe: how to load work orders, interpret each dashboard panel, add/remove allocations (including synthetic placeholders), work with reels/spans, manage misc assets, and handle edge cases noted in the app today.
- The chatbot would then be able to answer user questions or walk them through specific tasks (“How do I convert a pending allocation to a reel?”) by referencing the manual, ensuring consistent, step-by-step guidance without requiring an engineer to study a manual in order to utilize the app.
- Maybe have a portion of the app house a chatwindow the user can use to access HCTC's internal AI suite for convenience.


### Connect Odoo via API and pull all the material moves involving work orders.
#### Create a comparison between, what Odoo shows to be charged, what was actually charged. This should take returns into account.

### Connect to NISC via API so that the work order data is automatically populated in real-time and does not require the user to upload CSVs manually.

### Shared backend database (interim)
- Provide a temporary shared data store on the LAN so multiple users can collaborate without manual JSON exports.
- Use a small LAN API with SQLite on a dedicated machine; the app reads/writes over HTTP and the DB stays local to that host.
- Capture audit history (who/when) and enforce charge-out rules consistently while the SQL backend is pending.

### Create a centralized SQL database that becomes one source of truth.
### Have this DB hosted by HCTC behind MS Azure authentication

### Setup MS Teams messaging

### Implement the ability for the app to recognize work order revisions

### Exportable report for charging out reels.
The chargeout experience should present a landscape-formatted “Cable Reel Chargeout” screen that mirrors the data already collected: work order, engineer, item number, reel number, and inner/outer sequence info. Reels and their spans should be listed with dedicated rows per reel, and each span table should be followed by a totals block that summarizes quantity and length per reel (important because the material management team charges per reel, even if multiple reels carry the same material). Below the spans, include a digital “Totals” row that adds the per-reel numbers together and provides space for a total dollar value as the ledger needs it. 

Each line in the form should accept input fields matching what the user types into the NISC chargeout screen (journal line numbers, reference, comments, etc.) so the Material Management Team can immediately note what they charged and make the reviewer’s reconciliation straightforward. The form should remain entirely digital—no printing—and should include signature/approval inputs for the engineer and material management verifier plus a timestamp and reminder that the material is not charged until the form is completed and verified. This would allow reviewers to match each chargeout form line with the corresponding journal entry line without switching contexts.

#### Charge-out multiple work orders
Material Management will need, at times, to create entries for more than one work order at a time. Can we make the charge-out form less about a specific work order, and more about the reel spans that have been flagged to be charged-out?
I'm thinking a filter on the charge-out form that would allow the user to see and filter all work orders with material ready to be charged-out.

### Real-time updates
Users should be able to see all updates made by anyone in real-time.
- As the engineers update their allocations
- When Material Management

### Data integrity detection
- Implement a way to avoid stale data from being imported as current data. There could be instances when a work order is imported and worked on by an engineer or other party. Maybe even accounting transactions have taken place. We need a way to keep the original, now stale data from being imported as actual and creating conflicts.
