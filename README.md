# MyTradeBook

MyTradeBook is a full-stack trading journal built for forex and multi-asset traders who want a cleaner way to record trades, review performance, manage risk, and improve consistency over time.

Instead of keeping screenshots, notes, spreadsheets, and strategy reviews in different places, MyTradeBook brings them into one workspace. You can use it to log trades, review analytics, monitor discipline, study performance patterns, and keep your trading process organized.

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
- Performance analytics and reporting
- Risk tools and position planning
- Goals, psychology, notes, and playbook pages
- Alerts, heatmaps, AI insights, and strategy edge views
- Supabase-based authentication and realtime-ready setup
- PDF export support
- Desktop packaging with Electron
- Docker support for simple deployment

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
