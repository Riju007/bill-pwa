# Billing PWA on Cloudflare: Learning Plan

A learning project: a mobile-friendly billing tool (form -> saved bill -> branded PDF) built as a PWA on Cloudflare. Reusable later for other "form -> branded PDF" needs (e.g. an astrologer's report).

> Verify before relying on it: Cloudflare's free-plan limits, Python Workers status and pricing change often. Check the official docs at each phase.

## Goals

1. Learn Cloudflare end to end (Pages, Workers, D1, deploy pipeline).
2. Ship a real, usable billing tool.
3. Practise the habit of: small step -> deploy -> test on phone -> commit.

## Non-goals (for now)

- Native Android, Play Store, offline-first sync
- GST logic (decide later, with a real user)
- Copying any existing paid product's code or design. Use it only as a *user* to learn what a billing app does.

## Stack (decisions and why)

| Layer | Choice | Why |
|---|---|---|
| Front end | Cloudflare Pages (static HTML/CSS/JS, installable PWA) | Free, git-push deploys, HTTPS built in |
| API | Cloudflare Workers (TypeScript) | The native, best-supported path |
| Database | Cloudflare D1 (SQLite) | Real database, no server to run |
| Files | R2 (only if needed, e.g. logo uploads) | Optional |
| PDF | Generated in the **browser** (pdf-lib or jsPDF) | Free-plan Workers have tight CPU limits; check current numbers |
| Source | GitHub repo, auto-deploy on push | Proper workflow |

Alternative to revisit later: Python Workers (beta) so the backend can stay in Python. Check its current limits before choosing it.

## Definition of done per phase

Each phase ends with: code committed -> deployed -> opened on **phone over mobile data AND home Wi-Fi** -> one-line note in `docs/log.md`.

---

## Phase 0: Setup (1 evening)

- [ ] Create GitHub repo `bill-pwa` (private is fine)
- [ ] Install Node.js LTS; confirm `node -v` and `npm -v`
- [ ] Create a free Cloudflare account
- [ ] Clone repo locally, add `.gitignore` (`node_modules/`, `.env`, `.wrangler/`, `.dev.vars`)
- [ ] Write a short `README.md`

**Check:** `git status` is clean and the repo is on GitHub.

## Phase 1: Hello World on Pages

- [ ] Create `public/index.html` with a heading and one button
- [ ] Connect the GitHub repo to Cloudflare Pages
- [ ] Push a change and watch it deploy
- [ ] Open the live URL on your phone

**Learn:** what a Pages project, a build, and a deployment are.
**Check:** change the heading, push, see it live within a minute.

## Phase 2: Hello World API (Workers)

- [ ] Install Wrangler (`npm i -D wrangler`) and log in
- [ ] Create a Worker with `GET /api/health` returning JSON
- [ ] Call it from the page with `fetch`
- [ ] Deploy and test on phone

**Learn:** Workers, routing, `wrangler dev`, secrets and env vars.
**Exercise:** add `GET /api/time` returning the server time in IST.

## Phase 3: Data model and D1

- [ ] Design tables on paper first: `customers`, `products`, `bills`, `bill_items`
- [ ] Create a D1 database and a first migration
- [ ] Endpoints: create / list customers, create / list products
- [ ] Store **money as integer paise** (never floats)

**Learn:** D1, migrations, parameterised queries (no string-built SQL).
**Quiz before coding:** why integers for money? Why compute `total` instead of storing it?

## Phase 4: The billing form

- [ ] Mobile-first form: bill no, date, due date, customer, items (code, product, IMEI, amount)
- [ ] "Add item" rows, live total, paid, due
- [ ] Auto bill number, customer lookup by code or mobile
- [ ] Save bill + items in one transaction (batch)

**Exercise:** validate IMEI (15 digits + Luhn check) and flag duplicates on the same bill.

## Phase 5: Branded PDF

- [ ] Shop details in one config (name, phone, address, logo, footer)
- [ ] Embed a TTF font that has the rupee sign (e.g. Noto Sans)
- [ ] Amount in words, Indian style (lakh / crore); write your own function and test it with edge cases
- [ ] Layout: logo, shop details, bill meta, customer, item table, totals, signature line
- [ ] Download or share the PDF (including WhatsApp share)

**Check:** compare against the sample bill; test with 1, 6 and 40 items (page breaks!).

## Phase 6: PWA

- [ ] `manifest.webmanifest` (name, icons, theme colour, `display: standalone`)
- [ ] Service worker for caching the app shell only (no offline billing yet)
- [ ] Install to home screen on a real phone
- [ ] Verify in DevTools -> Application -> Manifest / Service Workers

## Phase 7: Camera IMEI scan

- [ ] Add a barcode scanning library; needs HTTPS (Pages gives it)
- [ ] Fill the IMEI field from the scan, then run the Luhn check
- [ ] Fallback: manual typing always works

## Phase 8: Login and safety

- [ ] Simple auth (study Cloudflare Access vs your own login before choosing)
- [ ] Never store passwords in plain text
- [ ] Backups: export bills to JSON/CSV; schedule a regular copy
- [ ] Basic rate limiting and input validation on all endpoints

## Phase 9: Polish and reuse

- [ ] Saved bills list with search (by customer, bill no, IMEI)
- [ ] Customer dues view
- [ ] Notice what you copy-pasted for the bill; extract only that into a shared "form -> branded PDF" layer
- [ ] Try a second template (e.g. an astrologer report) to test the abstraction

---

## Weekly rhythm

- Mon-Fri: one small step a day, commit daily
- Weekend: deploy, test on phone over Wi-Fi and mobile data, write the log

## Risks and how to handle them

| Risk | Plan |
|---|---|
| Free-plan limits change | Re-check the docs each phase |
| Data loss | Backups from Phase 8; never keep the only copy in the browser |
| ISP DNS problems on some networks | Test every deploy on Wi-Fi and mobile data |
| Scope creep | Finish the phase, then add ideas to a "later" list |
| Learning two things at once (TypeScript + Cloudflare) | Keep each phase small; ask for a code review before moving on |

## Open questions

- Will real users need GST? (ask a CA before building)
- Does anyone need it to work with no internet?
- Who pays for hosting if this becomes real?

## Learning log (fill as you go)

| Date | Phase | What I built | What confused me | Next |
|---|---|---|---|---|
| | | | | |
