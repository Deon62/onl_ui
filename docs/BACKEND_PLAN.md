# Oryne backend plan

FastAPI (Python) on Render, Supabase for Postgres + Auth + file storage, Safaricom Daraja for M-Pesa.

---

## 1. The business model in one picture

```
 Customer on acmecarhire.com            Customer on novatrading.co.ke
            |                                       |
            |  "Pay with M-Pesa" (built by Oryne)   |
            v                                       v
   +--------------------------------------------------------+
   |            Oryne API  (FastAPI on Render)              |
   |  - knows WHICH business started each payment           |
   |  - sends STK push to Safaricom using ORYNE's Till      |
   |  - receives Safaricom's result callback                |
   |  - credits the right merchant's ledger                 |
   +--------------------------------------------------------+
            |                     ^
   STK push |                     | callback (receipt, amount, phone)
            v                     |
   +--------------------------------------------------------+
   |       Safaricom Daraja  ->  ONE Oryne Buy Goods Till   |
   |       (money from all businesses lands here)           |
   +--------------------------------------------------------+

   Supabase Postgres = source of truth (merchants, payments, ledger, payouts)
   Oryne dashboard (this React app) = reads/writes only through the Oryne API
```

**The key idea:** all money lands on one Till, so the Till itself cannot tell businesses apart.
Oryne separates it by recording *who started each payment before it happens*:

1. The merchant's website calls Oryne with **that merchant's API key** (one key per business, bound to its domain).
2. Oryne creates a `payment` row (merchant_id, amount, phone, our reference) and sends the STK push.
3. Safaricom returns a `CheckoutRequestID` immediately - we store it on that row.
4. When the result callback arrives it carries the same `CheckoutRequestID` -> we look up the row -> we know the merchant.

The domain is recorded for display and as an extra check (the browser `Origin` must be on the merchant's allow-list),
but **the API key is what proves ownership** - an `Origin` header can be faked outside a browser.

Payments that reach the Till *without* going through Oryne (a customer typing the Till number manually) arrive via
the C2B confirmation URL with no reference -> they go to **Unmatched / suspense** for an admin to attribute
(this is already modelled in the dashboard's Collections page).

---

## 2. Components

| Piece | Where | Purpose |
|---|---|---|
| **Oryne API** | Render Web Service (paid instance - free instances sleep and Safaricom callbacks would time out) | Public payment API for client websites, Daraja callbacks, dashboard API |
| **Worker / cron jobs** | Render Cron Jobs | Settlement run, scheduled payouts, re-query stuck payments, daily reconciliation |
| **Database** | Supabase Postgres | All data. Only the API connects (service credentials); Row Level Security ON for every table as a safety net |
| **Auth** | Supabase Auth | Dashboard logins (email + password, 2FA for admins). The API verifies the Supabase JWT on every request |
| **Storage** | Supabase Storage (private bucket) | KYC documents from access requests (registration cert, KRA PIN, IDs) |
| **Dashboard** | This React app (Render Static Site or similar) | Talks to the Oryne API only. `simulateRequest` in `src/lib/net.ts` is replaced by real `fetch` calls |
| **Checkout snippet** | Served by the API (`/checkout.js`) | Drop-in "Pay with M-Pesa" button Oryne installs on client sites |

Why the dashboard does not write to Supabase directly: every money movement must go through one place that enforces
the ledger rules, fees and audit log. Supabase is the database; FastAPI is the only thing allowed to change balances.

---

## 3. Payment flow (STK push)

```
Client site            Oryne API                         Daraja                  Supabase
    | POST /v1/payments    |                               |                        |
    | (secret key, amount, |                               |                        |
    |  phone, order_ref)   |-- insert payment (Initiated) ---------------------------->|
    |                      |-- OAuth token (cached 55 min) ->|                       |
    |                      |-- STK push ------------------>|                        |
    |                      |<- CheckoutRequestID ----------|                        |
    |                      |-- update payment (Pending, checkout_request_id) -------->|
    |<- 201 {payment_id,   |                               |                        |
    |   status: Pending}   |                               |                        |
    |                      |        customer enters PIN    |                        |
    |                      |<- POST /callbacks/stk/{secret}|                        |
    |                      |-- idempotent update (Successful/Failed/Cancelled),      |
    |                      |   ledger entries, fees, SMS alert --------------------->|
    |                      |-- 200 to Safaricom immediately                         |
    | GET /v1/payments/{id}|  (or webhook to client site)  |                        |
```

Daraja specifics for a **Buy Goods Till**:
- `TransactionType = CustomerBuyGoodsOnline`, `BusinessShortCode` = the store / head-office number, `PartyB` = the Till number.
- `AccountReference` (max 12 chars) = our payment reference, e.g. `ACM-7F3K2Q`.
- Callback `ResultCode 0` = paid; `1032` = cancelled by user; others = failed. Receipt, amount, phone and date are in `CallbackMetadata`.
- If no callback arrives within ~2 minutes, a cron job calls **STK Push Query** to settle the status.
- **C2B Register URL** on the Till for confirmation of manual payments (these become Unmatched).

Callback safety:
- Callback URL contains a long random secret path segment, and (optionally) source IPs are checked against Safaricom's published list.
- Idempotent: unique on `checkout_request_id` and `mpesa_receipt` - a repeated callback never double-credits.
- The amount is taken from the callback, never from the client site.

---

## 4. Payouts to merchants

- Merchant requests a payout (or the schedule creates one) -> **Pending** -> admin approves.
- **Bank** -> admin pays manually and records it (as the dashboard does now).
- **M-Pesa phone (B2C)** / **Till or Paybill (B2B)** -> Daraja B2C / B2B APIs, result via callback.

**Important to confirm with Safaricom before building payouts:** B2C and B2B are sent from a *separate disbursement
shortcode* (usually a Paybill with B2C enabled), not from a Buy Goods Till. Money collected on the Till has to be moved
to that disbursement account first. Phase 1 can therefore launch with **manual remittance only** and add automated
B2C/B2B once that account exists.

---

## 5. Database (Supabase Postgres)

Money is stored as **integer cents** (`bigint`) to avoid rounding errors. Every balance is derived from an
append-only **ledger** - nothing is ever "edited" into a balance.

| Table | Key columns |
|---|---|
| `merchants` | id, name, legal_name, status, reference_prefix, pricing (pct_bps, fixed, min, max), payout_method, payout_destination, settlement (jsonb), payout_schedule, sms_alerts (jsonb), created_at |
| `merchant_domains` | merchant_id, domain, verified_at - allow-list for checkout `Origin` |
| `api_keys` | merchant_id, prefix, **hash** (never the raw key), kind (`publishable`/`secret`), last_used_at, revoked_at |
| `payments` | id, merchant_id (null = unmatched), reference, checkout_request_id **unique**, merchant_request_id, mpesa_receipt **unique**, amount, phone (encrypted/masked), status, fee, provider_charge, sms_fee, channel, domain, order_ref, initiated_at, confirmed_at, raw_callback (jsonb) |
| `callbacks` | id, type (stk/c2b/b2c/b2b), payload jsonb, received_at, processed_at, error - every Safaricom request is stored before processing |
| `ledger_entries` | id, merchant_id, payment_id/payout_id, type (collection, fee, refund, payout, payout_fee, sms_topup...), amount (+/-), available_at, created_at |
| `payouts` | id, merchant_id, amount, fee, net, method, destination, status, remittance, provider_ref, requested_at, completed_at, initiated_by |
| `sms_topups` / `sms_messages` | prepaid credit and each alert sent |
| `expenses`, `revenue_entries` | Oryne's own costs and non-transaction income |
| `access_requests` | business, contact, volume, status, documents (storage paths), reviewed_by |
| `profiles` | user_id (Supabase auth), role (`super_admin`/`ops`/`finance`/`merchant_owner`/`merchant_staff`), merchant_id |
| `activity_log` | actor, role, action, target, merchant_id, ip, at |
| `notifications` | audience, title, body, read |
| `platform_config` | settlement hours, payout/SMS fees, provider costs |

Balances the dashboard already shows map directly onto ledger sums: **available**, **pending settlement**,
**paid out**, **in progress** - and the Till reconciliation (`held = merchant funds + SMS credit + suspense + Oryne share`) becomes a SQL view.

Migrations: **Alembic** in the backend repo (one source of truth for schema), applied to Supabase on deploy.

---

## 6. API surface

**Public payment API (for client websites)** - authenticated by merchant API key
- `POST /v1/payments` - start STK push `{amount, phone, order_ref, description}`
- `GET  /v1/payments/{id}` - status
- `POST /v1/payment-links/{slug}/pay` - hosted payment links
- `GET  /checkout.js` - drop-in button (publishable key + domain allow-list)
- Optional outbound webhook to the client site when a payment completes

**Safaricom callbacks** - no auth header, secret path + idempotency
- `POST /callbacks/stk/{secret}`, `/callbacks/c2b/confirmation/{secret}`, `/callbacks/c2b/validation/{secret}`
- `POST /callbacks/b2c/{secret}`, `/callbacks/b2b/{secret}`, `/callbacks/timeout/{secret}`

**Dashboard API** - Supabase JWT, role checked on every route; merchants only ever see their own `merchant_id`
- Merchant: `/me/dashboard`, `/me/transactions`, `/me/payouts`, `/me/settlement`, `/me/payment-links`, `/me/sms`, `/me/profile`
- Admin: `/admin/overview`, `/admin/merchants`, `/admin/transactions` (+ attribute / refund), `/admin/payouts` (+ approve / remit), `/admin/reconciliation`, `/admin/revenue`, `/admin/expenses`, `/admin/config`, `/admin/access-requests`, `/admin/activity`
- These mirror the existing `useActions()` functions in the frontend one-to-one.

---

## 7. Backend project layout

```
oryne-api/
  app/
    main.py              FastAPI app, CORS, routers
    config.py            settings from env (pydantic-settings)
    db.py                async SQLAlchemy engine (Supabase pooler)
    auth.py              Supabase JWT verification, role guards, API-key auth
    models/              SQLAlchemy tables
    schemas/             Pydantic request/response models
    routers/             public_payments, callbacks, merchant, admin
    services/
      daraja.py          OAuth token cache, STK push/query, C2B register, B2C/B2B
      ledger.py          the only code that writes ledger entries
      fees.py            fee / provider-charge calculation (ported from src/lib/finance.ts)
      attribution.py     match callbacks to payments, unmatched handling
      sms.py             SMS alerts (provider TBD)
    jobs/                settlement, scheduled payouts, stuck-payment re-query, reconciliation
  alembic/               migrations
  tests/                 pytest - ledger, fees, callback idempotency, tenant isolation
  render.yaml            web service + cron jobs
  .env.example
```

Stack: FastAPI, Uvicorn, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2, httpx, PyJWT, pytest.

---

## 8. Render setup

- **Web service** `oryne-api`: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/health`, paid instance (always on).
- **Cron jobs**: settlement + scheduled payouts (daily), stuck-payment re-query (every 2-5 min), reconciliation report (daily).
- **Environment variables**: `DATABASE_URL` (Supabase pooler), `SUPABASE_URL`, `SUPABASE_JWT_SECRET` / JWKS URL, `DARAJA_ENV` (sandbox/production), `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_TILL`, `DARAJA_PASSKEY`, `CALLBACK_SECRET`, `PUBLIC_BASE_URL`, `ALLOWED_DASHBOARD_ORIGINS`.
- Secrets live only in Render env vars - never in the frontend or the repo.

---

## 9. Build phases

1. **Foundation** - project skeleton, Supabase schema + migrations, auth (Supabase JWT + roles), merchants CRUD, deploy to Render, `/health`.
2. **Collections (sandbox)** - Daraja OAuth, STK push, callback, STK query job, ledger + fees, API keys, `/v1/payments`. Test end-to-end against the Daraja sandbox.
3. **Dashboard wiring** - replace mock store with API calls page by page (dashboards, transactions, reconciliation).
4. **Payouts** - request/approve, manual remittance; then B2C/B2B once the disbursement account exists.
5. **Extras** - SMS alerts provider, access-request review + KYC uploads, C2B unmatched flow, outbound webhooks to client sites.
6. **Go-live** - production Daraja credentials, Safaricom go-live approval, monitoring/alerts, backups.

---

## 10. Decisions needed before / during phase 1

- **Daraja account**: production shortcode type (Buy Goods Till confirmed?), store/head-office number, and whether a **B2C/B2B disbursement account** will be set up.
- **SMS provider** for payment alerts (e.g. Africa's Talking) - affects the SMS cost model.
- **Legal / regulatory**: collecting and remitting funds for other businesses may require Central Bank of Kenya authorisation under the National Payment System Act, and Safaricom may have rules on one Till serving several businesses. Get advice before production.
- **Tax** on Oryne's fees (VAT / excise) - confirm with an accountant so revenue is computed correctly.
