# CLAUDE.md — Breakwater

This file documents the codebase for AI assistants. Read this before making changes.

---

## Project Overview

**Breakwater** is a personal finance subscription tracker. It connects to bank accounts via the Plaid API, syncs transactions into Supabase, and automatically detects recurring subscription charges. Users can confirm, ignore, or flag subscriptions for review, and see a monthly cashflow timeline based on confirmed subscriptions.

Currency is **Canadian Dollars (CAD)**.

---

## Repository Layout

```
breakwater416/               ← git root
├── CLAUDE.md
├── README.md
├── .gitignore               ← ignores .vercel and .env*.local
├── plaidClient.js           ← legacy JS Plaid client (sandbox only); not used by the Next.js app
└── breakwater/              ← THE MAIN NEXT.JS APP (all work happens here)
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── middleware.ts          ← auth guard
    ├── eslint.config.mjs
    ├── tailwind.config.js     ← Tailwind installed but rarely used; see styling notes
    ├── postcss.config.js / .mjs
    ├── scripts/
    │   └── check-env.mjs      ← validates required env vars, run before deploy
    ├── public/                ← static assets
    └── src/
        ├── app/               ← Next.js App Router
        │   ├── layout.tsx     ← root layout, applies design tokens
        │   ├── page.tsx       ← home / landing page
        │   ├── globals.css
        │   ├── auth/callback/route.ts   ← Supabase OAuth callback
        │   ├── login/                   ← magic-link login (no passwords)
        │   ├── connect/page.tsx         ← Plaid Link bank connection flow
        │   ├── dashboard/page.tsx       ← main dashboard (client component)
        │   ├── subscriptions/page.tsx   ← subscription management (client component)
        │   ├── infrastructure/page.tsx  ← infrastructure view
        │   ├── onboarding/page.tsx      ← onboarding flow
        │   └── api/
        │       ├── create-link-token/route.ts     ← POST: create Plaid link token
        │       ├── exchange-public-token/route.ts ← POST: exchange + save access token
        │       ├── transactions/route.ts          ← GET: fetch txns from file (legacy)
        │       ├── transactions/sync/route.ts     ← POST: cursor-based Plaid→Supabase sync
        │       ├── plaid/sync/route.ts            ← POST: placeholder sync stub
        │       ├── subscriptions/route.ts         ← POST: detect + upsert subscriptions
        │       │                                     GET: list subscriptions
        │       │                                     PATCH: update a subscription
        │       ├── cashflow/route.ts              ← GET: monthly cashflow projection
        │       ├── recurring/recompute/route.ts   ← POST: recompute stub (TODO)
        │       ├── infrastructure/route.ts        ← GET: infrastructure table
        │       └── actions/set/route.ts           ← POST: action setter
        ├── components/
        │   ├── Shell.tsx                ← page layout wrapper (title, subtitle, children)
        │   ├── PlaidConnectButton.tsx   ← full Plaid Link button with state machine
        │   └── components/             ← duplicate folder (artifact, ignore)
        └── lib/
            ├── plaid.ts                ← Plaid API client + assertPlaidEnv()
            ├── supabase/
            │   ├── browser.ts          ← singleton browser Supabase client
            │   └── server.ts           ← async server Supabase client (SSR cookies)
            ├── subscriptionDetector.ts ← core subscription detection algorithm
            ├── subscriptionStore.ts    ← file-based subscription store (.subscriptions.json)
            ├── subscriptionRepo.ts     ← subscription repository helpers
            ├── subscriptionRules.ts    ← rule definitions for detection
            ├── recurring.ts            ← recurring transaction detection (simpler version)
            ├── normalizeMerchant.ts    ← normalize merchant names for grouping
            ├── style.ts               ← design tokens (colors, fonts)
            ├── log.ts                 ← structured logging helpers
            └── devAuth.ts             ← dev-only auth bypass via header
```

> **Note:** `breakwater/breakwater/` is a second nested Next.js scaffold (artifact of project creation). It contains a Prisma schema stub but is not the active application. Ignore it.

---

## Development Commands

All commands run from `breakwater/` (the Next.js app root):

```bash
cd breakwater/

npm run dev      # start dev server at http://localhost:3000
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint

node scripts/check-env.mjs   # validate required env vars before deploying
```

There are **no tests** in this project.

---

## Environment Variables

Create `breakwater/.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Plaid
PLAID_CLIENT_ID=<client-id>
PLAID_SECRET=<secret>
PLAID_ENV=sandbox          # sandbox | development | production

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional: dev-only auth bypass (non-production only)
DEV_BYPASS_KEY=<random-string>
```

`scripts/check-env.mjs` will fail the process if any of the first six are missing or blank.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router) |
| Language | TypeScript 5 — strict mode enabled |
| Auth + Database | Supabase (`@supabase/ssr` for SSR cookie handling) |
| Financial Data | Plaid API v19 (`plaid`, `react-plaid-link`) |
| Styling | Tailwind CSS installed; **mostly not used** — see styling notes |
| Deployment | Vercel (`.vercel` in `.gitignore`) |

---

## Authentication

- **Method:** Supabase magic-link email (no passwords).
- **Middleware** (`middleware.ts`) guards `/dashboard/*`, `/connect/*`, `/manage/*` by checking for any cookie starting with `sb-`. Unauthenticated requests redirect to `/login?redirect=<path>`.
- **Server components / API routes** call `await supabaseServer()` — always `await` it; it is async.
- **Client components** call `supabaseBrowser()` — a singleton that memoizes the client.
- **Dev bypass:** pass header `x-dev-bypass: <DEV_BYPASS_KEY>` to skip auth in non-production. See `lib/devAuth.ts`.

---

## Database Schema (Supabase)

### `plaid_items`
Stores one row per connected bank account (Plaid "item").

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid | FK → auth.users |
| `item_id` | text | Plaid item ID (unique per connection) |
| `access_token_enc` | text | Access token (plaintext for now; encryption planned) |
| `institution_name` | text | Display name of the bank |
| `cursor` | text | Plaid transactions sync cursor |
| `updated_at` | timestamptz | |

Unique constraint: `(user_id, item_id)`

### `plaid_transactions`
Raw transactions synced from Plaid.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid | |
| `item_id` | text | |
| `transaction_id` | text | Plaid transaction ID |
| `account_id` | text | |
| `name` | text | Raw transaction name |
| `merchant_name` | text | Cleaned merchant name (may be null) |
| `amount` | numeric | Positive = outflow (spend), negative = inflow |
| `iso_currency_code` | text | e.g., `CAD`, `USD` |
| `date` | date | Settlement date (YYYY-MM-DD) |
| `authorized_date` | date | May be null |
| `pending` | boolean | |
| `category` | jsonb | Plaid category array |

Unique constraint: `(user_id, transaction_id)`

### `subscriptions`
Detected and user-managed recurring subscriptions.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid | |
| `merchant_norm` | text | Normalized merchant key |
| `display_name` | text | Human-readable name |
| `cadence` | text | `monthly` or `yearly` |
| `amount_cents` | integer | Amount in cents |
| `currency` | text | e.g., `CAD` |
| `confidence` | float | 0–1 detection confidence |
| `first_seen` | date | |
| `last_seen` | date | |
| `last_transaction_id` | text | |
| `status` | text | `tracking`, `confirmed`, `ignored`, `needs_review` |
| `category` | text | User-assigned category |
| `updated_at` | timestamptz | |

Unique constraint: `(user_id, merchant_norm, cadence, amount_cents, currency)`

### `infrastructure`
General infrastructure/config data per user. Structure is open-ended.

---

## Plaid Integration Flow

1. User visits `/connect` → button click triggers `POST /api/create-link-token`
2. Plaid Link modal opens, user selects bank and logs in
3. Plaid calls `onSuccess(public_token, metadata)`:
   - `POST /api/exchange-public-token` → exchanges public token for access token, upserts to `plaid_items`
   - `POST /api/transactions/sync` with `item_id` → cursor-based sync loop into `plaid_transactions`
   - `POST /api/subscriptions` → runs subscription detection, upserts to `subscriptions`
4. User redirected to `/dashboard`

**Transaction sync** (`/api/transactions/sync/route.ts`) uses Plaid's cursor-based `transactionsSync` API, paging through `has_more` in a loop. The cursor is persisted to `plaid_items` after each full sync.

---

## Subscription Detection Algorithm

Two implementations exist:

### `lib/subscriptionDetector.ts` (primary, used by dashboard)
More rigorous. Called from the dashboard client side.

- Filters to outgoing payments only (`amount > 0`)
- Excludes transfers, deposits, ACH, wire, payroll, Venmo, Zelle, Cash App, refunds, etc.
- Normalizes merchant names (strips corporate suffixes, reference numbers, geo noise)
- Groups by normalized name; requires ≥ 3 occurrences
- Checks amount consistency: all amounts within `±$2` or `±6%` of the median
- Infers cadence from median gap between charges:
  - Monthly: 25–35 days
  - Yearly: 350–380 days
- Validates cadence spacing: ≥ 66% of consecutive gaps must be in range (allows one miss)
- Returns results sorted by `annualCost` descending

### `lib/recurring.ts` (simpler, used by recurring API)
Cruder heuristic — groups by merchant, requires ≥ 3 occurrences, uses average gap to infer weekly/monthly cadence. Used by `/api/recurring/recompute`.

### File-based store: `lib/subscriptionStore.ts`
A JSON file at `.subscriptions.json` (in the `breakwater/` working directory). Used by some API routes as a local persistence layer. Does **not** overwrite user decisions (`confirmed`/`ignored`) on re-sync.

---

## API Route Conventions

Every API route follows this pattern:

```typescript
export async function POST(req: Request) {
  log("feature.action.start");            // structured log at entry

  try {
    const supabase = await supabaseServer(); // always await
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = data.user.id;
    // ... business logic ...

    log("feature.action.ok", { userId });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    logError("feature.action.err", e);
    return NextResponse.json({ error: "..." }, { status: 500 });
  }
}
```

Key rules:
- **Always `await supabaseServer()`** — it is async.
- Auth check is always the first operation.
- Error responses always return `{ error: "..." }` JSON.
- Use `log(tag, meta)` / `logError(tag, err, meta)` from `lib/log.ts` for structured logs. Tags use dot notation: `plaid.link_token.start`.

---

## Styling & Design System

Tailwind is installed but **most pages use inline styles** via design tokens from `lib/style.ts`.

### Design Tokens (`lib/style.ts`)
```typescript
export const IVORY = "#F6F3EE";           // page background
export const serifStack = 'ui-serif, Georgia, "Times New Roman", Times, serif';
export const ink = "rgba(25, 20, 18, 0.82)";     // primary text
export const inkSoft = "rgba(25, 20, 18, 0.62)"; // secondary text
export const line = "rgba(25, 20, 18, 0.10)";    // borders / dividers
```

### Visual Language
- Warm off-white (`IVORY`) background
- Serif typeface throughout
- Rounded cards (`borderRadius: 18`) and pill buttons (`borderRadius: 9999`)
- Glass-like card backgrounds: `rgba(255, 255, 255, 0.36)`
- Subtle box shadows: `0 1px 0 rgba(20,16,12,0.03)`
- Error/review state: muted red `rgba(155,28,28,...)` or `rgba(140,40,40,...)`

When adding new UI, follow the inline style pattern and import tokens from `lib/style.ts`. Do not introduce new CSS files or Tailwind classes for components that already use inline styles.

---

## TypeScript Conventions

- **Strict mode** is on — no implicit `any`.
- Use `e: any` in `catch` blocks (Next.js convention for error handling).
- Path alias `@/*` maps to `./src/*`.
- File-level comment with path at top of each file: `// src/app/api/example/route.ts`
- `_trash/` is excluded from TypeScript compilation (see `tsconfig.json`).

---

## Merchant Normalization

`lib/normalizeMerchant.ts` is used by the subscription detection API. It:
- Lowercases and trims
- Strips corporate suffixes (inc, llc, ltd, corp, co)
- Removes URLs
- Replaces non-letter/non-digit with spaces (Unicode-aware via `\p{L}\p{N}`)
- Collapses whitespace

`lib/subscriptionDetector.ts` has its own internal normalization that additionally strips reference numbers and geo noise — used only within the client-side detection algorithm.

---

## Known Issues & TODOs in the Code

- **Access token encryption** — `access_token_enc` is stored plaintext. A comment in `exchange-public-token/route.ts` notes "Phase 3.2 will encrypt".
- **`/api/plaid/sync/route.ts`** — stub with a TODO comment; does not actually sync.
- **`/api/recurring/recompute/route.ts`** — stub with a TODO comment; always returns `{ ok: true }`.
- **Duplicate components folder** — `src/components/components/` mirrors `src/components/`. The nested one is an artifact; use `src/components/`.
- **Legacy file-based access token** — `src/app/api/transactions/route.ts` reads access token from `.plaid_access_token` (a plain file). This is the legacy path; the Supabase-backed path is `/api/transactions/sync`.
- **`subscriptions` API GET handler** — the GET on `/api/subscriptions` is not shown in the file listing but is referenced by the dashboard and subscriptions page. Confirm it exists before modifying.

---

## Adding New API Routes

1. Create `src/app/api/<name>/route.ts`
2. Always authenticate first with `await supabaseServer()`
3. Return `NextResponse.json(...)` for all responses
4. Log entry and exit with `log()` / `logError()`
5. Add route to this document's API table

## Adding New Pages

1. Create `src/app/<route>/page.tsx`
2. If the route needs auth, add its prefix to `PROTECTED_PREFIXES` in `middleware.ts`
3. Use the `Shell` component for consistent layout, or inline styles matching the design system
4. Mark as `"use client"` if the page uses hooks, state, or browser APIs

---

## Git & Deployment

- Branch prefix for this project: `claude/`
- Deployed on Vercel; environment variables must be set in Vercel dashboard
- `.vercel/` and `.env*.local` are gitignored
- Run `node scripts/check-env.mjs` to validate env before deploying
