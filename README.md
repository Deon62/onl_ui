# Oryne Network - Payment Collection Platform (Frontend Prototype)

> **DEMO DATA.** No Daraja, Safaricom, PayHero, database or payment provider is connected. All interactions run locally against generated mock data stored in `localStorage`.

React 19 + TypeScript + Tailwind CSS v4 + Recharts + Lucide, built with Vite.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## Demo login

Any email and any password work. After signing in, use the **Admin | Merchant** toggle in the top bar to switch modes at any time. In Merchant mode, the merchant picker next to it chooses which merchant you see.
Signing in with a merchant email (e.g. `accounts@acmecarhire.com`) opens that merchant's dashboard first; any other email opens the admin console.
"Request access" on the sign-in page sends a mock request that shows up in the admin notifications.

**Settings → Reset demo data** regenerates everything.

### Mock data on/off
The sign-in card has a **Mock data** switch. Off starts a brand-new, empty workspace with one freshly onboarded merchant (named from the sign-in email), so you can see exactly what new users see: empty states, chart placeholders and the getting-started checklists. Each mode keeps its own data in the browser.

### Loading and error states
All pages and key actions go through a simulated network layer (`src/lib/net.ts`). Pages show layout-matched skeletons the first time they load each session, and actions show spinners on their buttons (loaders from [ldrs](https://uiball.com/ldrs)). **Settings → Network simulation** sets response time and a failure rate to preview slow connections and error screens; **Replay loading** shows the skeletons again. When the FastAPI backend lands, `simulateRequest` is the single place to swap for real API calls.

## Structure

```
src/
  types/          Domain types (shapes a FastAPI backend would return)
  data/           Mock merchants, platform config and deterministic data generator
  lib/finance.ts  All accounting: fees, ledgers, platform P&L, Till reconciliation
  lib/            Formatting, dates/buckets, CSV export, RNG, callback attribution
  store/          App state + actions (each action maps to a future API endpoint)
  components/
    shared/       Design-system primitives, tables, charts, drawers, layout
    admin/        Super-admin pages
    merchant/     Merchant pages
  pages/Login.tsx
```

## How it works

- Customers pay into **one Oryne business Till**. Merchants integrate nothing: Oryne runs the checkout pages and payment links, and sends the STK push itself.
- Each payment gets a unique reference (e.g. `ACM-7KQ2PX`) stored against the merchant before the prompt is sent. The callback is matched on that reference and the M-Pesa receipt (duplicates are ignored). Direct Till payments with no reference are held in suspense until an admin attributes them.
- Merchants choose where payouts go on their **Settlement** page: an M-Pesa number, a Till, a Paybill or a bank account, plus a payout schedule. Oryne remits via **M-Pesa B2C** (phones) or **B2B** (Tills and Paybills), both simulated, or records a **manual transfer** (banks).
- **SMS payment alerts** are optional per merchant (Settings, or the merchant's "Collection & SMS" tab for admins). Each SMS is charged per recipient and deducted from the merchant balance. The price and the mock gateway cost are set under Fees & Charges.

## Accounting model

- **Merchant collections are not revenue.** They are a liability (funds owed to merchants).
- **Oryne revenue** = transaction fees + SMS alert fees + payout fees + subscriptions.
- **Operating costs** = provider charges + SMS sending costs + B2C transfer costs + recorded expenses.
- Token and overhead **allocations** are for unit economics only. They are never counted as operating costs a second time.
- **Available balance** = collections - fees - SMS charges - refunds - pending settlement - payouts.
- **Till reconciliation**: funds held = merchant funds owed + suspense + Oryne's retained share, with a difference of 0.00 (`/admin/reconciliation`).

## Connecting a backend

Replace `generateData()` and the functions in `useActions()` (`src/store/AppStore.tsx`) with calls to Oryne's own backend. The calculations in `src/lib/finance.ts` should move server-side, with the frontend displaying server-computed ledgers.
