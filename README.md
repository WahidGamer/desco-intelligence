# DESCO Prepaid Meter Intelligence Dashboard

<div align="center">

![DESCO Dashboard](https://img.shields.io/badge/DESCO-Intelligence%20Dashboard-blue?style=for-the-badge&logo=lightning&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js)
![Vercel](https://img.shields.io/badge/deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)

**A real-time intelligence dashboard for monitoring DESCO prepaid electricity meters**  
with BERC 2026 official tariff calculations, consumption analytics & financial forecasting.

[🌐 Live Demo](https://desco-intelligence.vercel.app) · [🐛 Report Bug](../../issues) · [✨ Request Feature](../../issues)

</div>

---

## ✨ Features

- 📊 **Real-time Balance Monitoring** — Live meter balances across all configured accounts
- 🔋 **Runout Estimation** — Intelligent "Days Left" prediction based on last 5-day burn rate
- 📈 **Consumption Charts** — Daily & monthly kWh consumption with dual-axis BDT cost overlay
- 🏷️ **BERC 2026 Tariff Engine** — Official Bangladesh slab-step rate calculator (LT-A/LT-E/LT-C1)
- ⚡ **Slab Proximity Tracker** — Visual progress bar showing distance to next tariff threshold
- 💰 **Financial Projections** — Seasonal-adjusted avg/projected monthly & yearly cost estimates
- 📅 **Recharge History** — Full year recharge records with VAT/net breakdown + CSV export
- 🔍 **Portfolio Summary** — Aggregate balance, month recharges, and portfolio-level cost forecasts
- 🌙 **Dark Glassmorphism UI** — Premium dark-mode design with animated orb backgrounds

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18.0.0
- npm ≥ 8.0.0

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/wahidgamers/desco-intelligence.git
cd desco-intelligence

# 2. Install dependencies
npm install

# 3. Configure your meter accounts
cp config.ini.example config.ini
# Edit config.ini and add your DESCO account numbers

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Configuration

Create a `config.ini` file in the project root (see `config.ini.example`):

```ini
[ACCOUNT]
Ground Floor = 12345678
First Floor  = 87654321
Second Floor = 11223344
```

- Account names are used as display labels in the dashboard
- Account numbers are your DESCO prepaid account IDs (8 digits)
- `config.ini` is gitignored — your account data stays local

---

## 🏗️ Architecture

```
desco-intelligence/
├── client/                 # Frontend (Vanilla JS + CSS)
│   └── public/
│       ├── js/
│       │   ├── globals.js  # App state & DOM element refs
│       │   ├── api.js      # Data fetching & caching
│       │   ├── ui.js       # Account cards & portfolio UI
│       │   ├── chart.js    # Chart.js consumption charts
│       │   ├── berc.js     # BERC 2026 tariff engine
│       │   ├── history.js  # Recharge history modal
│       │   └── main.js     # App init & event listeners
│       └── css/
│           └── styles.css  # Glassmorphism design system
├── server/
│   ├── app.ts              # Express API routes (TypeScript)
│   └── server.ts           # Dev server with Vite middleware
├── api/
│   └── index.js            # Vercel serverless function entry
├── config.ini              # Local account config (gitignored)
├── config.ini.example      # Config template
├── vercel.json             # Vercel deployment config
└── vite.config.ts          # Vite build config
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts` | List configured accounts |
| `GET` | `/api/desco/summary` | All account balances & info |
| `GET` | `/api/desco/recharge-summary/:accountNo` | Month/year recharge totals + 5-day avg cost |
| `GET` | `/api/desco/recharge-history/:accountNo` | Full recharge history (1 year) |
| `GET` | `/api/desco/customer-info/:accountNo` | Detailed customer info |
| `GET` | `/api/desco/consumption/daily/:accountNo` | Daily kWh consumption chart data |
| `GET` | `/api/desco/consumption/monthly/:accountNo` | Monthly kWh consumption chart data |

---

## 🚢 Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
npx vercel --prod
```

The build process automatically:
1. Compiles the frontend via Vite → `dist/`
2. Bundles the Express server → `dist/server.cjs`
3. Builds the Vercel serverless handler → `api/index.js`

> **Note:** After deploying, add your `config.ini` account data via a Vercel Environment Variable or configure it as needed for your hosting.

---

## 📦 Scripts

```bash
npm run dev      # Start development server (Vite HMR + Express)
npm run build    # Production build (Vite + esbuild)
npm run start    # Start production server
npm run lint     # TypeScript type check
```

---

## 🧮 BERC 2026 Tariff Reference

| Slab | Range | Rate (BDT/kWh) |
|------|-------|----------------|
| Lifeline | 0 – 50 units | 5.32 |
| Slab 1 | 0 – 75 units | 6.18 |
| Slab 2 | 76 – 200 units | 8.50 |
| Slab 3 | 201 – 300 units | 9.10 |
| Slab 4 | 301 – 400 units | 9.62 |
| Slab 5 | 401 – 600 units | 15.01 |
| Slab 6 | > 600 units | 17.35 |

*Plus: Demand Charge (42 BDT/kW/month), Prepaid Rebate (-0.5%), VAT (+5%)*

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JS, CSS (Glassmorphism), Chart.js, Font Awesome
- **Backend:** Node.js, Express.js, TypeScript
- **Build:** Vite (frontend), esbuild (server bundle)
- **Deployment:** Vercel (serverless functions)
- **Data Source:** DESCO Prepaid API (`prepaid.desco.org.bd`)

---

## 📝 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Made with ⚡ for DESCO prepaid meter users in Bangladesh
</div>
