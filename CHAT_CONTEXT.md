# Quick onboarding notes

These points are for any new chat window tackling this project; opening `CHAT_CONTEXT.md` is the least-token-heavy way to understand what’s already in motion.

## Testing-first mindset
- The app is the **Work Order Material Allocation** sample (React + Vite + Tailwind).

## Where to start
- `dist/index.html` is the built entry point currently open in the IDE; use it to see how the compiled shell looks before diving into the source.
- `src/App.jsx` orchestrates uploads, allocations, misc entries, notes, persistence (IndexedDB/localStorage), and exports; read this file next for core behavior.
- `src/components/Section`, `Badge`, and `WOView` render the UI blocks you’ll interact with, while `src/hooks/useAllocations` houses the allocation state helpers.
- Supporting utilities live in `src/lib/rows.js`, `src/lib/data.js`, and `src/lib/xlsxExport.js`, and general helpers live under `src/utils/*`.
- Added a `chargeout` mode alongside engineering/accounting so a dedicated Material Charge-out section hosts the Reel Chargeout prototype; see the tab selector in `src/App.jsx` for the new dropdown and routing logic.

## Useful commands
- `npm run dev` → launch the Vite dev server.
- `npm run test` → run Vitest suite.
- `npm run build` → produce `dist`.
- Check the `public` folder when you need static assets (favicon, etc.).

## Best practice for new conversations
1. Re-open this file to refresh context—it is intentionally short and focused.

This guide stays current with the next iteration of work, so update it only if the onboarding needs shift.
