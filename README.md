# MyTradeBook

MyTradeBook is a full-stack trading journal built for forex and multi-asset traders who want a cleaner way to record trades, review performance, manage risk, and improve consistency over time.

Instead of keeping screenshots, notes, spreadsheets, and strategy reviews in different places, MyTradeBook brings them into one workspace. You can use it to log trades, review analytics, monitor discipline, study performance patterns, and keep your trading process organized.

The main workflow is built around MetaTrader 5. You connect your MT5 account to MyTradeBook through a lightweight Expert Advisor, the EA sends trade and account updates to the app, and the app turns that raw trading activity into a structured journal with analytics, screenshots, notes, psychology tracking, reports, and AI-assisted review.

## What This Project Does

MyTradeBook helps traders:

- record trades and trading notes in one place
- review performance through dashboards and reports
- track risk, goals, psychology, and rule compliance
- use AI-assisted analysis for coaching and reflection
- sync application state with Supabase
- run the project as a web app, PWA, or desktop app

## Main Features

- Trade journal with structured trade logging
- MT5 Expert Advisor connection for automatic trade sync
- Performance analytics and reporting
- Risk tools and position planning
- Goals, psychology, notes, and playbook pages
- Alerts, heatmaps, AI insights, and strategy edge views
- Supabase-based authentication and realtime-ready setup
- PDF export support
- Desktop packaging with Electron
- Docker support for simple deployment

## How The MT5 Connection Works

MyTradeBook does not place trades on your behalf. Instead, it uses an MT5 Expert Advisor named `MyTradebook_EA.mq5` to read trade activity from your MetaTrader terminal and send it to the MyTradeBook server through a secure API key.

The flow looks like this:

1. You create an account inside the MyTradeBook Accounts page.
2. MyTradeBook generates a unique API key for that account.
3. You download the included EA file and install it in MetaTrader 5.
4. You paste your MyTradeBook server URL and API key into the EA settings.
5. While MT5 is running, the EA sends:
   - open trade events
   - closed trade events
   - account balance and equity updates
   - heartbeat updates showing the connection is alive
6. MyTradeBook stores that data and updates the journal, dashboard, reports, and analytics pages.

Important notes:

- The EA is designed for trade data sync, not trade execution.
- The app uses your account-specific API key to match incoming MT5 data to the correct journal account.
- The app can mark accounts as live or offline based on recent sync activity.
- The journal becomes more useful over time because synced trades can then be enriched with notes, screenshots, emotions, logic, and post-trade review.

## How Trade Sync Works

When the EA is attached to a chart in MT5 and MT5 remains open, MyTradeBook can automatically keep the journal updated.

### Real-time sync

- When a trade opens, the EA sends a `TRADE_OPEN` event.
- When a trade closes, the EA sends a `TRADE_CLOSE` event.
- The server updates or creates the matching trade record in the journal.
- Account balance, equity, leverage, and connection status can also be updated automatically.

### First-time history import

On the first run, the EA can also import historical trades from MT5 history.

- `HistoryDaysBack = 0` means sync the full available history that MT5 can access
- `HistoryDaysBack > 0` means sync only the last N days on first sync

This is useful if you want to:

- backfill past trades into the journal
- start small with only recent trades
- migrate from a manual journal to an automatic one

### What gets synced

The MT5 sync can send:

- ticket or position id
- symbol
- buy or sell direction
- open time and close time
- open and close price
- volume
- profit
- commission
- swap
- stop loss and take profit
- account balance and equity
- optional MT5 comments

## How The Journal Works After Sync

Trade sync is only the first step. After a trade appears in MyTradeBook, you can use the app to turn that raw trade into a real journal entry.

For each synced trade, you can add or review:

- trade reason
- execution logic
- emotional state
- screenshots
- supporting notes
- tags and setup context

This means MyTradeBook is not just a sync dashboard. It is a review workflow:

1. MT5 sends the trade automatically.
2. The trade appears in the journal.
3. You add context around why you took it and how you managed it.
4. The app uses those records in reports, psychology review, strategy analysis, and AI coaching.

That is the core value of the project: automatic capture plus structured reflection.

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Backend: Node.js, Express
- Auth and cloud data: Supabase
- Desktop: Electron
- Charts and data visualization: Recharts
- Optional integrations: Grok, Twelve Data, CoinMarketCap, MetaApi

## Who This Is For

This project is useful for:

- individual traders who want a private self-hosted journal
- developers building a branded trading journal product
- traders who want analytics and journaling without managing many spreadsheets
- teams experimenting with trading dashboards, coaching tools, or trading workflows

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/najamaltaf88/MyTradeBook.git
cd MyTradeBook
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your environment file

Copy `.env.example` to `.env`.

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 4. Add your environment values

At minimum, if you want authentication and Supabase-backed state, configure:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional values:

- `TWELVE_DATA_API_KEY` for deeper intraday market data fallback
- `GROK_API_KEY` for AI coaching and analysis features
- `CMC_API_KEY` for CoinMarketCap crypto listings
- `LOCAL_DATA_DIR` to change where local app data is stored
- `PORT` to change the server port, default is `5000`
- `SUPABASE_STORAGE_BUCKET` if you want a custom storage bucket name
- `SUPABASE_STATE_TABLE` and `SUPABASE_STATE_KEY` if you want custom app state storage names
- `CRYPTO_SALT` for stronger encryption-related customization

## MT5 Setup Guide

After the app is running, use this process to connect MetaTrader 5.

### 1. Create a trading account inside MyTradeBook

Go to the Accounts page and create a new account record. This gives you:

- an account entry inside the app
- a generated API key
- access to the MT5 EA download and setup instructions

### 2. Download the Expert Advisor

The EA file included in this repository is:

`public/MyTradebook_EA.mq5`

You can also download it from the app through the Accounts page.

### 3. Install the EA in MetaTrader 5

1. Open MT5.
2. Go to `File > Open Data Folder`.
3. Open `MQL5 > Experts`.
4. Copy `MyTradebook_EA.mq5` into that folder.
5. Restart MT5 or refresh the Navigator panel.

### 4. Allow WebRequest in MT5

Inside MT5:

1. Go to `Tools > Options > Expert Advisors`.
2. Enable `Allow WebRequest for listed URL`.
3. Add your MyTradeBook server URL, for example:

`http://127.0.0.1:5000`

If you run the app on another machine or domain, use that URL instead.

### 5. Attach the EA to a chart

1. In the MT5 Navigator panel, find `MyTradebook_EA`.
2. Drag it onto any chart.
3. Enter:
   - your MyTradeBook API key
   - your MyTradeBook server URL
4. Click OK.

### 6. Keep MT5 running for live sync

As long as MT5 stays open and the EA remains attached, new trades and account updates can continue syncing to MyTradeBook automatically.

## What Users Can Expect In Practice

If someone uses this project for their own trading journal, the practical daily experience is usually:

1. Open MT5 and keep the EA attached.
2. Take trades normally in MetaTrader 5.
3. Let MyTradeBook import open and closed trades automatically.
4. Open the Trades page and add your journal notes, screenshots, logic, and emotions.
5. Review the Dashboard, Analytics, Reports, Risk, and Psychology sections at the end of the session or week.

This makes the app useful for both:

- traders who want automatic trade capture
- traders who want deeper manual reflection after sync

## Beginner-Friendly Installation Guide For Non-Coders

This section is for users who do not write code but still want to install and use MyTradeBook on their own computer.

You do not need to understand the codebase. You only need to follow the steps carefully, copy a few commands, and fill in the required API values.

### What you need before starting

Please install these tools first:

1. `Node.js` version 18 or newer
2. `Git`
3. A code editor such as `Visual Studio Code`
4. A `Supabase` account
5. MetaTrader 5 if you want automatic MT5 trade sync

Recommended downloads:

- Node.js: https://nodejs.org/
- Git: https://git-scm.com/downloads
- Visual Studio Code: https://code.visualstudio.com/
- Supabase: https://supabase.com/
- MetaTrader 5: from your broker or MetaQuotes

### Option 1: Download the project as ZIP

If you do not want to use Git commands:

1. Open the GitHub repository page.
2. Click `Code`.
3. Click `Download ZIP`.
4. Extract the ZIP to a folder such as `C:\MyTradeBook`.

### Option 2: Clone the project with Git

If Git is installed, open PowerShell and run:

```powershell
git clone https://github.com/najamaltaf88/MyTradeBook.git
cd MyTradeBook
```

### Open the project folder

Open the extracted or cloned folder in Visual Studio Code.

If you want, you can also stay in PowerShell and run commands from the project folder.

### Install project dependencies

Inside the project folder, run:

```powershell
npm install
```

This downloads all required packages for the app.

### Create your `.env` file

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

The `.env` file is where you place your project keys and configuration values.

### Which APIs and keys are required

For most users, only Supabase is required.

#### Required

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are needed for:

- login and sign up
- account sessions
- cloud-backed storage
- file uploads when Supabase storage is enabled

#### Optional

- `TWELVE_DATA_API_KEY`
  Use this if you want deeper intraday market data support when Yahoo data is not enough.

- `GROK_API_KEY`
  Use this if you want AI-powered coaching, summaries, and analysis features.

- `CMC_API_KEY`
  Use this if you want CoinMarketCap crypto listings and crypto-related features.

- `METAAPI_TOKEN`
  This is only needed if you plan to use MetaApi-specific integration paths.

- `CRYPTO_SALT`
  Recommended for stronger custom encryption-related behavior.

### How to set up Supabase step by step

If you are a non-coder, follow these exact steps:

1. Create a new project in Supabase.
2. Wait for the project to finish provisioning.
3. Open your project dashboard.
4. Copy:
   - Project URL
   - Anon key
   - Service role key
5. Paste them into your `.env` file.

Example:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Set up the database table in Supabase

Open the Supabase SQL Editor and run the SQL from:

`script/supabase-schema.sql`

This creates the `app_state` table used by the app.

### Create the storage bucket

In Supabase Storage:

1. Create a new bucket
2. Name it `tradebook-uploads`
3. Make it public if you want uploaded files and screenshots to be accessible by the app

If you use another bucket name, change `SUPABASE_STORAGE_BUCKET` in `.env`.

### Enable login in Supabase

In Supabase Auth:

1. Enable Email/Password sign-in
2. Save your settings

This is required for user signup, login, and password recovery inside MyTradeBook.

### Start the app

Run:

```powershell
npm run dev
```

Then open:

`http://localhost:5000`

### What to do after the app starts

1. Create your user account in the app
2. Open the Accounts page
3. Add your MT5 trading account
4. Download the EA
5. Install it in MT5
6. Paste your API key and server URL into the EA
7. Keep MT5 open for automatic sync

### Simple API guide in plain English

Here is what each important key does:

- `SUPABASE_URL`
  The web address of your Supabase project.

- `SUPABASE_ANON_KEY`
  A public app key used by the frontend for login and client access.

- `SUPABASE_SERVICE_ROLE_KEY`
  A powerful private server key. Never expose this publicly.

- `VITE_SUPABASE_URL`
  The same Supabase URL, but specifically exposed to the frontend build.

- `VITE_SUPABASE_ANON_KEY`
  The same anon key, but specifically exposed to the frontend build.

- `TWELVE_DATA_API_KEY`
  Optional market data provider key.

- `GROK_API_KEY`
  Optional AI provider key for advanced coaching and suggestions.

- `CMC_API_KEY`
  Optional crypto data provider key.

### Common beginner mistakes

- Forgetting to create `.env`
- Pasting the wrong Supabase key into the wrong variable
- Forgetting to run the SQL schema
- Forgetting to create the storage bucket
- Not enabling Email/Password authentication
- Not allowing WebRequest in MT5
- Closing MT5 and expecting live trade sync to continue

### If you want the easiest possible setup

Use this order:

1. Install Node.js
2. Install Git
3. Download or clone the repository
4. Run `npm install`
5. Copy `.env.example` to `.env`
6. Set up Supabase and paste the required keys
7. Run the SQL schema
8. Create the storage bucket
9. Run `npm run dev`
10. Open the app in your browser
11. Create your account
12. Connect MT5 through the EA

If you can follow those steps, you can use MyTradeBook without needing to be a developer.

## Quick Setup Walkthrough

If this were explained like a short video, the setup flow would look like this:

### Part 1: Install the basics

1. Install Node.js
2. Install Git
3. Download or clone MyTradeBook
4. Open the project folder
5. Run `npm install`

### Part 2: Connect the app to Supabase

1. Create a Supabase project
2. Copy your project URL, anon key, and service role key
3. Paste them into `.env`
4. Run the SQL in `script/supabase-schema.sql`
5. Create the `tradebook-uploads` bucket
6. Enable Email/Password authentication

### Part 3: Launch MyTradeBook

1. Run `npm run dev`
2. Open `http://localhost:5000`
3. Sign up for your account
4. Open the Accounts page

### Part 4: Connect MT5

1. Create a trading account inside MyTradeBook
2. Copy your generated API key
3. Download `MyTradebook_EA.mq5`
4. Install the EA in MT5
5. Allow WebRequest for your MyTradeBook server URL
6. Attach the EA to a chart
7. Paste your API key and server URL into the EA settings

### Part 5: Start journaling

1. Let MT5 sync open and closed trades automatically
2. Open the Trades page
3. Add trade notes, screenshots, logic, and emotions
4. Review Analytics, Reports, Risk, and Psychology pages weekly

That is the simplest end-to-end workflow for a first-time user.

## Suggested Screenshots For The GitHub Page

If you want this repository to look more professional, add screenshots to the README later. The best screenshots to include are:

1. Landing page
2. Accounts page showing MT5 connection setup
3. Trades journal page with synced trades
4. Analytics dashboard
5. Reports or psychology page
6. EA setup dialog with API key and server URL instructions

Recommended screenshot order for GitHub:

1. Product overview or landing page
2. MT5 account connection flow
3. Trade journal view
4. Analytics and reporting view

You can save screenshots in a folder such as:

`docs/screenshots/`

Then embed them in the README like this:

```md
![Dashboard](docs/screenshots/dashboard.png)
![Trades](docs/screenshots/trades.png)
![Accounts](docs/screenshots/accounts.png)
```

## Recommended First Screenshots To Capture

If you want the fastest improvement to the GitHub page, capture these first:

- the landing page hero section
- the Accounts page with the EA setup dialog open
- the Trades page with journal notes and screenshots visible
- the Analytics page with charts populated

These four images alone are enough to make the repository easier to understand for new visitors.

## Supabase Setup

If you want the full product experience for your own use, Supabase should be configured first.

### 1. Create a Supabase project

Create a new project at [Supabase](https://supabase.com/).

### 2. Get your project keys

From your Supabase dashboard, copy:

- Project URL
- Anon key
- Service role key

Put those values into your `.env` file.

### 3. Create the app state table

Open the Supabase SQL Editor and run the SQL from:

`script/supabase-schema.sql`

This creates the `app_state` table used by the application state layer.

### 4. Create the storage bucket

Create a public storage bucket in Supabase. The default bucket name expected by the app is:

`tradebook-uploads`

If you use a different bucket name, update `SUPABASE_STORAGE_BUCKET` in `.env`.

### 5. Enable email authentication

The login page supports:

- sign up
- sign in
- password reset
- recovery flow through email

Make sure email/password auth is enabled in Supabase Auth settings.

## Running the App

### Development mode

```bash
npm run dev
```

This starts the Express server and Vite-powered frontend in development mode.

Default URL:

`http://localhost:5000`

### Production build

```bash
npm run build
npm run start
```

### Type check

```bash
npm run check
```

### Lint

```bash
npm run lint
```

### Format

```bash
npm run format
```

## Desktop Usage

This repository also includes Electron support.

### Prepare desktop files

```bash
npm run desktop:setup
```

### Run desktop-oriented development flow

```bash
npm run desktop:dev
```

### Build and run production desktop/server assets

```bash
npm run desktop:prod
```

### Open the Electron app

```bash
npm run desktop:electron
```

### Build a Windows installer

```bash
npm run desktop:exe
```

## Docker Usage

You can also run the project with Docker:

```bash
docker-compose up
```

The included Docker setup:

- installs dependencies
- builds the app
- starts the production server
- maps port `5000`
- stores local data in a named Docker volume

Before using Docker in a real environment, update the secret values in `docker-compose.yml`.

## How To Use This Project For Yourself

If you are not just developing the app but actually want to use it as your own trading journal, this is the easiest path:

### 1. Set up Supabase

Create your Supabase project, fill in `.env`, run the SQL file, and create the storage bucket.

### 2. Start the app

Run:

```bash
npm run dev
```

Then open `http://localhost:5000`.

### 3. Create your account

Use the login page to:

- create a new account
- sign in with email and password
- recover your password later if needed

### 4. Build your trading workspace

After logging in, start using the main areas of the app:

- dashboard for overall performance snapshots
- trades for logging entries, exits, and notes
- analytics for deeper review
- reports for summaries
- risk pages for position sizing and discipline review
- goals and psychology pages for habit tracking
- notes and templates for process documentation
- alerts and AI views for advanced review

### 5. Journal every trade

For best results:

- log each trade as soon as possible
- record the setup, reasoning, and emotions
- add screenshots or supporting notes when relevant
- review wins and losses with the same level of detail

### 6. Review your data weekly

A strong workflow is:

1. log trades daily
2. review performance at the end of each week
3. identify repeated mistakes and best setups
4. adjust your risk plan and strategy rules
5. keep notes in the psychology and playbook sections

## Environment Variables Reference

### Required for full cloud-backed usage

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Common local settings

- `LOCAL_DATA_DIR`
- `PORT`
- `MAX_UPLOAD_SIZE_MB`
- `WEBHOOK_RATE_LIMIT_MAX`
- `MAX_STARTING_BALANCE`

### Optional integrations

- `TWELVE_DATA_API_KEY`
- `GROK_API_KEY`
- `CMC_API_KEY`
- `GROK_MODEL`
- `GROK_API_URL`
- `METAAPI_TOKEN`
- `CRYPTO_SALT`

## Project Scripts

- `npm run dev` starts the development server
- `npm run build` creates the production build
- `npm run start` runs the production server
- `npm run check` runs TypeScript checks
- `npm run lint` runs ESLint
- `npm run format` formats source files with Prettier
- `npm run desktop:setup` prepares desktop assets
- `npm run desktop:dev` runs the desktop development flow
- `npm run desktop:prod` builds and starts production assets
- `npm run desktop:electron` launches the Electron app
- `npm run desktop:exe` builds a Windows installer

## Project Structure

```text
client/    React frontend
server/    Express server and backend services
shared/    Shared models, constants, and utilities
desktop/   Electron entry files
script/    Build, setup, migration, and verification scripts
public/    Static assets
```

## Security Notes

- Never commit your real `.env` file.
- Never expose your `SUPABASE_SERVICE_ROLE_KEY` in client-side code.
- Change default secret values before deploying publicly.
- Review Docker and production configuration before exposing the app to the internet.

## Troubleshooting

### The app opens but login does not work

Check that:

- `VITE_SUPABASE_URL` is correct
- `VITE_SUPABASE_ANON_KEY` is correct
- Supabase email/password auth is enabled

### The server starts but some cloud features fail

Check that:

- `SUPABASE_URL` is correct
- `SUPABASE_SERVICE_ROLE_KEY` is correct
- the storage bucket exists
- the SQL schema has been applied

### A feature like AI insights or crypto charts is empty

That usually means the related optional API key is missing.

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Run checks locally.
5. Open a pull request.

## Disclaimer

MyTradeBook is provided for journaling, analytics, and educational use. It is not financial advice. Trading involves significant risk, and past performance does not guarantee future results.

## License

This project is licensed under the MIT License.
