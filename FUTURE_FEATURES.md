# Future Features & Enhancements

## Enhancements

### Work Order Locking / Unlocking
- Engineers lock a work order via `lockWorkOrder` (`src/hooks/useAllocations.js`) once allocations are verified. This sets `allocState[k].locked = true`, and the UI (WOView/ProductCard) disables edits.
- Request: allow accountants to unlock/return a work order if issues are found so engineers can adjust allocations again. Potential approach: add `unlockWorkOrder` in the hook, expose it to `App`, and provide a “Return to engineering” control (e.g., tied to history entry status changes) so the two sides coordinate around an explicit status transition.

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

### Create a centralized SQL database that becomes one source of truth.
### Have this DB hosted by HCTC behind MS Azure authentication

### Setup MS Teams messaging

### Implement the ability for the app to recognize work order revisions