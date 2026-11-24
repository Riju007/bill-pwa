# PB Ledger

A mobile-friendly billing workspace for Pabitra Betal, built with a static HTML UI and a Cloudflare Worker API.

## Structure

`public/index.html` contains the shared workspace layout. Its dashboard, billing, bills, customers, and products views live in `public/pages/`; `public/css/app.css` and `public/js/app.js` hold the UI styling and behavior. The page loader fetches the views before initializing the app.

`src/index.ts` is the Worker entry point. Shared HTTP helpers and input validation are in `src/http.ts` and `src/validation.ts`, while API handlers are grouped under `src/routes/`.

## Run locally

```powershell
npm ci
npx wrangler d1 migrations apply bill-pwa-db --local
npx wrangler dev
```

The local UI framework, icon font, PDF generator, and Noto Sans font are served from `public/`; no CDN access is required at runtime.
Current shop contact details are kept in `personal/pabitra-info.txt`. The PDF module uses matching temporary values until a shop-settings feature is added.

## Tests

```powershell
npx playwright install chromium
npm test
```

`npm test` runs Worker API validation tests and Playwright browser tests for the UI, PWA icons, print styling, and draft/saved bill PDF downloads. The browser suite uses a local fixture server; it does not change the D1 database.

## Login setup

Login requires these three secrets in `.dev.vars` locally and as Worker secrets in production: `LOGIN_USERNAME`, `LOGIN_PASSWORD`, and `LOGIN_SESSION_SECRET`. The API fails closed with a 503 response until all three are set. The username value may be an email address. Generate a long random session secret; do not commit real values. `LOGIN_DISABLED=true` bypasses login only for local development or tests and must never be set in production.
