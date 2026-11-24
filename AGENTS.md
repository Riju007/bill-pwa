# AGENTS.md

Guidance for AI coding agents (GitHub Copilot, Claude Code, etc.) working in this repo. Keep changes small and match the existing style. Facts below were checked against the code on 2026-11-24.

## Project

Billwise is a mobile-friendly billing workspace: customers, products, bills, and a branded A4 PDF per bill. It is a **learning project** by one developer (strong Python/Django/FastAPI background, new to TypeScript and Cloudflare) for a single shop. It is not a client product and it is not multi-tenant.

## Stack

- **Frontend:** plain HTML/CSS/JS in `public/`. No framework, no bundler, no build step. Bootstrap and Bootstrap Icons are self-hosted in `public/vendor/` (no CDN at runtime).
- **API:** Cloudflare Worker in TypeScript (`src/`). It is deployed together with `public/` as Workers static assets (not Pages). Files in `public/` are served first; unmatched paths reach the Worker.
- **Database:** Cloudflare D1 (SQLite). Binding `DB`, database name `bill-pwa-db`.
- **PDF:** generated in the browser with jsPDF + jspdf-autotable (`public/bill-pdf.js`). The Noto Sans font in `public/vendor/fonts/` is needed for the rupee sign.
- **Tests:** Node test runner (with `tsx`) for the Worker; Playwright for the browser.

## Layout

```
src/index.ts            Worker entry: /api/health, /api/time, then route handlers
src/routes/             bills.ts, customers.ts, products.ts, dashboard.ts
src/validation.ts       Request-body parsing and validation (Parsed<T>)
src/http.ts             json(), text(), readJson(), Parsed<T>
migrations/             D1 migrations, numbered (0001_init_schema.sql)
public/index.html       Shared layout; page fragments are in public/pages/
public/js/app-loader.js Loads page fragments, then imports public/js/app.js
public/js/app.js        All UI behaviour
public/bill-pdf.js      PDF generation, amount in words (Indian system), shopInfo
public/css/app.css      Styles
tests/                  worker.test.mjs, browser/*.spec.ts, server.mjs (fixture server)
docs/log.md             Owner's learning notes
worker-configuration.d.ts  GENERATED, do not edit
```

## Commands

```powershell
npm ci
npx wrangler d1 migrations apply bill-pwa-db --local
npx wrangler dev                 # http://127.0.0.1:8787
npm test                         # test:worker, then test:browser
npm run test:worker
npx playwright install chromium  # once, before test:browser
npx wrangler types               # regenerate worker-configuration.d.ts after binding changes
```

Local D1 data lives in `.wrangler/` (gitignored) and is separate from production.

## Code conventions

- TypeScript with 4-space indentation, double quotes and semicolons.
- Each route module exports `handleX(request, env): Promise<Response | null>`. Return `null` when the path is not yours, and register the handler in `src/index.ts`.
- Validate every request body in `src/validation.ts` before touching D1. Errors are `{ "error": "message" }` with a 4xx status, built with `json()`.
- SQL is always parameterised: `env.DB.prepare("... ?").bind(value)`. Never put user input into SQL text.
- Writes that touch several rows use `env.DB.batch([...])`.
- API JSON is camelCase. SQL columns are snake_case and aliased with `AS` in queries.
- `bill_date` and `due_date` are `YYYY-MM-DD` text (calendar days). `created_at` is a UTC ISO timestamp.
- Frontend: build DOM with `textContent` and DOM APIs. Do not insert user data with `innerHTML`.

## Money and business rules

- Money is stored as `REAL` rupees. This is the owner's decision (the original plan said integer paise), so do not "fix" it silently. Keep money arithmetic in as few places as possible.
- `total` and `due` are never stored. Compute them from `bill_items` (`due = total - paid`).
- Customer name/mobile/address and product code/name are **snapshotted** onto the bill and its items.
- Enforced on the server today: mobile is exactly 10 digits; IMEI is exactly 15 digits; each item amount is 1000 to 500000; `paid` cannot exceed the total; 1 to 100 items per bill; `customerId` is required.
- Amount in words follows the Indian system (lakh, crore).
- GST and tax logic does not exist. Do not add any without the owner asking and a CA's input.

## Privacy and secrets

- Never put real customer data (names, phones, IMEIs, addresses) in code, tests, fixtures, commits, logs or prompts. Use obviously fake data such as `Sample Customer`, `9876543210`, `123456789012345`.
- Shop details are hardcoded in `shopInfo` in `public/bill-pdf.js` until a settings feature exists. Do not add more personal details to the repo. A local `personal/` folder is for private notes and must never be committed.
- No secrets in code or in `wrangler.jsonc` `vars` (those are public config). Local secrets go in `.dev.vars` (gitignored). Production secrets use `npx wrangler secret put NAME`.
- Do not copy or reverse-engineer code, HTML, CSS, API calls or design from any existing paid billing product.

## Safety rules for agents

- Default to `--local` for D1. Do not run anything with `--remote`, `wrangler deploy` or `wrangler secret put` unless the owner explicitly asks.
- Never edit a migration that has been applied. Add the next numbered file in `migrations/`.
- Stage files by name (`git add path/to/file`), not `git add .` or `git add --all`. Run `git status` before every commit.
- Do not hand-edit generated or vendored files: `worker-configuration.d.ts`, `public/vendor/`, `package-lock.json`.
- A push to `main` deploys to production automatically (Workers Builds). The Worker name in the Cloudflare dashboard must equal `name` in `wrangler.jsonc` (`bill-pwa`). Run `npm test` before suggesting a push.

## Testing notes

- `tests/worker.test.mjs` replaces `env.DB` with a stub that throws, so it only covers requests rejected before any SQL runs. No test exercises the real D1 queries.
- Playwright tests run against `tests/server.mjs`, a fixture server with fake data that serves `public/` and mocks `/api/*`. It does not run the real Worker. If you change an API response shape, update `tests/server.mjs` and the tests too.
- Add or update tests when you change validation, amount-in-words, or PDF output.

## Known gaps (as of 2026-11-24)

- There is no login. Every `/api` route, including DELETE, is public.
- There is no Luhn check on IMEI and no duplicate-IMEI check within a bill.
- There is no service worker (only a manifest and icons), no offline support, no camera IMEI scan, and no backup or export.
- `bills.bill_no` is not unique and is generated in the browser.
- `vars.SHOP_NAME` in `wrangler.jsonc` is unused.

## Working with the owner

- Explain TypeScript and Cloudflare concepts briefly, with a Python or FastAPI analogy when it helps.
- Prefer simple solutions. Ask before adding a library, service or abstraction.
- Never invent Cloudflare limits, prices or API details. Check the current docs, and say what you did not verify.
- If a decision looks weak, say so directly and say why.
- Work in small steps. After a change, say how to test it (a command or a request to send).
