# AGENTS.md

Repository guidance for coding agents. Keep changes focused, preserve existing behavior, and update this file when the architecture or workflows change. Facts were checked against the repository on 2026-11-24.

## Project and stack

PB Ledger is a single-shop, mobile-friendly billing PWA and learning project. It is not multi-tenant.

- **Frontend:** plain HTML, CSS, and JavaScript in `public/`. There is no frontend framework, bundler, or build step. Bootstrap and Bootstrap Icons are self-hosted under `public/vendor/`.
- **API:** TypeScript Cloudflare Worker in `src/`, deployed with `public/` as Workers static assets (not Pages). Static assets are served before unmatched requests reach the Worker.
- **Database:** Cloudflare D1 / SQLite, binding `DB`, database `bill-pwa-db`.
- **PDF:** browser-generated with jsPDF and jspdf-autotable in `public/bill-pdf.js`. The local Noto Sans font is required for reliable ₹ rendering.
- **Tests:** Node test runner with `tsx` for Worker handlers, and Playwright for browser behavior.

## Project map

```
src/index.ts               Worker entry point and route-handler registration
src/routes/                bills, customers, dashboard, items, products
src/validation.ts          API request parsing and business validation
src/http.ts                Shared JSON/text responses and request parsing
migrations/                Numbered D1 schema migrations
public/index.html          Shared shell, navigation, dialogs, script/style links
public/pages/*.html        Page fragments inserted into one shared document
public/js/app-loader.js    Fetches page fragments, then imports app.js
public/js/app.js           UI state, rendering, event handlers, and API calls
public/bill-pdf.js         PDF generation, sharing, amount-in-words, shopInfo
public/css/app.css         Application styles and responsive behavior
public/vendor/             Self-hosted third-party assets; do not edit by hand
tests/worker.test.mjs      Worker tests using D1 stubs
tests/browser/*.spec.ts    Playwright browser tests
tests/server.mjs           Static fixture server and mocked API responses
docs/log.md                Owner's learning notes
worker-configuration.d.ts  Generated Worker types; do not edit by hand
```

The user-facing **Items** page lists `bill_items` records and their associated bill/customer data. The separate `products` table and `/api/products` handlers are retained for catalog/suggestion functionality; do not confuse catalog products with billed line items.

## Local development and checks

```powershell
npm ci
npx wrangler d1 migrations apply bill-pwa-db --local
npx wrangler dev                 # http://127.0.0.1:8787
npm test                         # Worker tests, then browser tests
npm run test:worker
npm run test:browser
npx playwright install chromium  # only if Playwright reports Chromium is missing
npx wrangler types               # regenerate Worker types after binding changes
```

Local D1 data is under `.wrangler/` and is separate from production. Do not apply migrations remotely unless the owner explicitly requests it.

## Architecture and implementation guidance

- Keep the existing plain HTML/CSS/JS architecture. Do not introduce a frontend framework, bundler, CDN dependency, or broad `app.js` refactor unless explicitly requested.
- Page fragments are fetched by `public/js/app-loader.js`; add a new fragment to its `pages` array and add its navigation in `public/index.html`.
- **All page fragments are in the DOM at once.** Keep element IDs unique across every fragment and shared dialog. Duplicate IDs make `querySelector()` silently select the first fragment and can break hidden-page behavior.
- Keep user-facing pages read-only or editable according to the existing UX; API capability alone is not a reason to expose create/update/delete controls.
- Build dynamic UI with DOM APIs and `textContent`. `innerHTML` is only appropriate for fixed, trusted markup such as static icons; never interpolate user or database values into it.
- Use the existing helpers, naming, formatting, and localization. Prefer a small fix over restructuring.

### Worker and API patterns

- Each route module exports `handleX(request, env): Promise<Response | null>`. Return `null` for paths it does not own and register new handlers in `src/index.ts`.
- Validate every request body in `src/validation.ts` before database access. Return errors using `json({ error: "..." }, status)`.
- Parameterize SQL with `env.DB.prepare(...).bind(...)`; never interpolate user input into SQL.
- Use `env.DB.batch([...])` for related multi-row writes.
- Keep API JSON camelCase and SQL columns snake_case, aliased in queries.
- Customer, bill, and item directory UIs use server-side pagination (10 rows per page). Paginated APIs return `{ items, page, pageSize, total, pageCount }`; preserve this shape when changing list APIs.
- `/api/items` represents bill line items joined to bills, not rows in the product catalog. Item details should retain their bill and customer association.
- When changing an API response, update the matching browser fixture in `tests/server.mjs` and add/update Worker and browser tests as applicable.

### Data and business rules

- Money is stored as `REAL` rupees by owner decision; do not silently migrate it to paise. Keep calculations consistent.
- `total` and `due` are derived from bill items and paid amount; they are not stored.
- Customer and bill data, product names/codes, and bill item data are snapshotted for invoice history.
- Server validation currently requires a customer, a 10-digit mobile, 15 numeric IMEI digits, unique IMEIs within a bill, item amounts from ₹1,000 to ₹5,00,000, and 1–100 bill items. `paid` cannot exceed the total.
- Dates are `YYYY-MM-DD`; `created_at` values are UTC ISO timestamps. Amount-in-words uses Indian numbering (lakh/crore).
- GST/tax logic does not exist. Do not add it without the owner asking and a CA's input.

## Testing notes

- `npm test` is the standard verification command. Use targeted tests while iterating, then run the full suite before finishing.
- Worker tests use D1 stubs. They verify handler validation and query/response behavior, but they are not a real-D1 integration test.
- Playwright runs against `tests/server.mjs`, not the Worker or D1. Its fake API responses must match the production response shape; it verifies rendered behavior and interactions.
- For database/API changes, cover pagination, search, empty results, invalid input, and detail-not-found behavior where relevant.
- For PDF/share changes, test the actual file payload in the mocked Web Share API and the unsupported-browser fallback. Browser mocks do not replace testing on a physical device.
- Run `git diff --check` after edits. Do not add dependencies unless a requirement cannot be met with the existing stack.

## Privacy, secrets, and deployment safety

- Never put real customer names, phone numbers, IMEIs, or addresses in source, tests, fixtures, commits, or logs. Use synthetic values.
- Private owner details belong only in the local `personal/` folder; never commit them or copy them into new code/docs. Shop details currently live in `shopInfo` in `public/bill-pdf.js`.
- `wrangler.jsonc` `vars` are public configuration, not secrets. Keep local secrets in ignored `.dev.vars`; use production secrets only when explicitly authorized.
- Login protects `/api` using `LOGIN_USERNAME`, `LOGIN_PASSWORD`, and `LOGIN_SESSION_SECRET`. Missing or incomplete login configuration fails closed with a 503 response. `LOGIN_DISABLED=true` is a local-only opt-in for development and tests; do not set it in production. Do not expose real customer data or deploy changes without the owner's explicit request.
- Default all D1 work to `--local`. Do not run `--remote`, `wrangler deploy`, or `wrangler secret put` unless explicitly asked.
- Never edit an applied migration; add the next numbered migration. Do not hand-edit `worker-configuration.d.ts`, `public/vendor/`, or `package-lock.json`.
- A push to `main` deploys through Workers Builds. Run the full test suite before suggesting a push.
- Do not copy or reverse-engineer code, markup, APIs, or designs from paid billing products.

## Known limitations to keep in mind

- Camera scanning uses `BarcodeDetector` and `getUserMedia`; there is no decoder polyfill. `BarcodeDetector` support varies by browser. Camera access requires a secure context: HTTPS, or localhost on the same device. A phone opening a computer's `http://<LAN-IP>` URL does not meet that requirement.
- There is no service worker/offline mode, backup/export workflow, or IMEI Luhn validation.
- IMEIs are checked for uniqueness within a bill, not globally across all bills.
- Bill numbers are generated in the browser and `bills.bill_no` is not unique in the schema.
- `SHOP_NAME` in `wrangler.jsonc` is currently unused; PDF shop details are configured separately in `public/bill-pdf.js`.

## Working with the owner

- Explain TypeScript and Cloudflare concepts briefly, using a Python/FastAPI analogy when helpful.
- Prefer simple, focused solutions. Ask before adding a library, cloud service, or abstraction.
- Do not guess Cloudflare limits, costs, or API behavior; verify current documentation when needed and say what remains unverified.
- Be direct when an existing decision creates a limitation or risk, and explain why.
- Summarize changed files, behavior, tests run, and any manual/device verification still needed.
