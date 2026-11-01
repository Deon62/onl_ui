# Oryne Network - Merchant Dashboard

Admin and merchant dashboard for Oryne's shared-Till M-Pesa collections, live at https://panel.oryne.org. Data comes from the Oryne API (FastAPI + Supabase, `oryne-api`). Payments and payouts connect in the next backend phase.

React 19 + TypeScript + Tailwind CSS v4 + Recharts + Lucide, built with Vite.

```bash
npm install
npm run dev        # http://localhost:5180 is allowed by the API's CORS
npm run build
```

## Signing in

Sign in with a Supabase user that has dashboard access. Admins (super admin, ops, finance) get the admin console and can switch to **Merchant** view to see any merchant's dashboard. Merchant users only see their own business.

### Live data
Sign in with a Supabase user that has dashboard access; all data comes from the Oryne API (`https://apiv1.oryne.org`). Merchants, domains, status, pricing, business profile, settlement details, merchant requests, logins, activity and notifications are live. Payments, payouts, expenses and SMS arrive with the payments phase; until then those pages show empty states and their actions say "not live yet".

### Merchant requests
"Request access" on the sign-in page (business, contact, phone, **website**) lands in **Admin → Merchant Requests**. **Set up account** creates the merchant with the details and pricing you choose, creates the owner's login with a generated password, and emails it via Resend. The password is also shown once with copy buttons, so you can send it yourself. **Send login** on a merchant's page issues a new password. Merchants change it under **Settings → Password**.

Supabase config lives in `.env.production` (public values only; see `.env.example`).

### Loading and error states
Pages show layout-matched skeletons while data loads from the API for the first time each session, and actions show spinners on their buttons (loaders from [ldrs](https://uiball.com/ldrs)).

## Structure

```
src/
  types/          Domain types (shapes a FastAPI backend would return)
  data/           Platform default configuration
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
- **SMS payment alerts** are optional per merchant (Settings, or the merchant's "Collection & SMS" tab for admins). Each SMS is charged per recipient and deducted from the merchant balance. The price and the assumed gateway cost are set under Fees & Charges.

## Accounting model

- **Merchant collections are not revenue.** They are a liability (funds owed to merchants).
- **Oryne revenue** = transaction fees + SMS alert fees + payout fees + subscriptions.
- **Operating costs** = provider charges + SMS sending costs + B2C transfer costs + recorded expenses.
- Token and overhead **allocations** are for unit economics only. They are never counted as operating costs a second time.
- **Available balance** = collections - fees - SMS charges - refunds - pending settlement - payouts.
- **Till reconciliation**: funds held = merchant funds owed + suspense + Oryne's retained share, with a difference of 0.00 (`/admin/reconciliation`).

## Backend

The API is a separate project (`oryne-api`, FastAPI + Supabase on Render). `src/lib/api.ts` handles Supabase sign-in, calling the API, and mapping between the API's snake_case/cents and the dashboard's camelCase/KES. Actions that still say "not live yet" in `useActions()` move to the API as each backend phase lands, and the calculations in `src/lib/finance.ts` move server-side with them.
