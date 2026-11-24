# Billwise

A mobile-friendly billing workspace built with a static HTML UI and a Cloudflare Worker API.

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
