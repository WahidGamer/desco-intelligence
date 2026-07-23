# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-07-23

### Added
- 🎉 Initial public release
- Real-time balance monitoring for multiple DESCO prepaid meter accounts
- BERC 2026 official tariff engine (LT-A residential, LT-E commercial, LT-C1 small industry)
- BERC Slab Proximity Tracker — visual progress bar showing distance to next tariff threshold
- Interactive consumption charts (daily kWh + BDT cost, monthly kWh + BDT cost) via Chart.js
- Runout estimation ("Days Left") based on last 5-day average burn rate
- Recharge history modal with full-year records, VAT/net breakdown, and CSV export
- Financial projections: seasonal-adjusted average and projected monthly/yearly costs
- Portfolio executive summary with aggregate balance and cost forecasts across all accounts
- Global search and filter (All / Critical / Safe) across account cards
- Dark glassmorphism UI with animated ambient glow orbs
- Vercel serverless deployment support via `api/index.js`
- `config.ini` based account configuration (gitignored, never committed)
- LocalStorage cache for fast metric hydration on page reload

### Technical
- TypeScript Express backend (`server/app.ts`) with 7 API endpoints
- Vite frontend build pipeline
- esbuild server bundle for production
- Vercel serverless function entry point (`api/index.js`) auto-built during `npm run build`
