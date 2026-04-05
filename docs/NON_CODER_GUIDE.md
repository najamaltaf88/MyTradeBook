# MyTradeBook Non-Coder Guide

This guide is written for people who want to use MyTradeBook without being developers.

You do not need to understand React, TypeScript, Node.js, or the internal code. You only need to install a few tools, create a Supabase project, fill in a `.env` file, run the app, and connect MT5 if you want automatic trade sync.

## What MyTradeBook Is

MyTradeBook is a trading journal platform.

It helps you:

- capture trades from MT5
- keep a trade journal
- add notes, screenshots, logic, and emotions
- review analytics and reports
- track psychology, goals, compliance, and risk
- use AI-assisted feedback for coaching and review

## Who This Guide Is For

This guide is for:

- traders who are not programmers
- users installing the project for personal use
- beginners who want a simple step-by-step setup path

## What You Need Before Starting

Install these first:

1. Node.js version 18 or newer
2. Git
3. Visual Studio Code or another editor
4. A Supabase account
5. MetaTrader 5 if you want automatic MT5 sync

Useful download links:

- Node.js: https://nodejs.org/
- Git: https://git-scm.com/downloads
- VS Code: https://code.visualstudio.com/
- Supabase: https://supabase.com/

## The Simplest Setup Path

If you want the shortest version first, do this:

1. Download or clone the repository.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Create a Supabase project.
5. Put your Supabase keys into `.env`.
6. Run the SQL file from `script/supabase-schema.sql`.
7. Create the `tradebook-uploads` bucket in Supabase.
8. Enable Email/Password auth in Supabase.
9. Run `npm run dev`.
10. Open `http://localhost:5000`.
11. Create your account.
12. Connect MT5 through the EA if you want trade sync.

## Step 1: Get The Project

### Option A: Download ZIP

1. Open the GitHub repository page.
2. Click `Code`.
3. Click `Download ZIP`.
4. Extract it to a folder such as `C:\MyTradeBook`.

### Option B: Clone with Git

Open PowerShell and run:

```powershell
git clone https://github.com/najamaltaf88/MyTradeBook.git
cd MyTradeBook
```

## Step 2: Install Dependencies

Inside the project folder, run:

```powershell
npm install
```

This downloads the packages the app needs.

## Step 3: Create The Environment File

Run:

```powershell
Copy-Item .env.example .env
```

Now open `.env` in your editor.

This file stores your setup values such as keys and URLs.

## Step 4: Create A Supabase Project

MyTradeBook uses Supabase for authentication and cloud-backed storage.

### In Supabase:

1. Sign in to Supabase.
2. Create a new project.
3. Wait for the project to finish provisioning.
4. Open the project dashboard.
5. Find these values:
   - Project URL
   - Anon key
   - Service role key

## Step 5: Fill In `.env`

These values are the most important:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### What each value means

- `SUPABASE_URL`
  The main URL of your Supabase project.

- `SUPABASE_ANON_KEY`
  The client-safe key used for frontend authentication flows.

- `SUPABASE_SERVICE_ROLE_KEY`
  The powerful server-side key. Keep this private.

- `VITE_SUPABASE_URL`
  The same project URL, exposed to the frontend.

- `VITE_SUPABASE_ANON_KEY`
  The same anon key, exposed to the frontend.

## Step 6: Create The Database Table

Open the Supabase SQL Editor and run the SQL from:

`script/supabase-schema.sql`

This creates the `app_state` table required by the app.

## Step 7: Create The Storage Bucket

In Supabase Storage:

1. Create a bucket named `tradebook-uploads`
2. Use that default name unless you want to customize it

If you change the name, update:

`SUPABASE_STORAGE_BUCKET`

inside `.env`.

## Step 8: Enable Login

In Supabase Auth:

1. Enable Email/Password authentication
2. Save the settings

This allows users to:

- sign up
- sign in
- recover passwords

## Step 9: Start The App

Run:

```powershell
npm run dev
```

Then open:

`http://localhost:5000`

## Step 10: Create Your Account

When the app opens:

1. Sign up with your email and password
2. Sign in
3. Open the dashboard

## Step 11: Connect MT5

If you want automatic trade sync, use the built-in MT5 Expert Advisor.

### Inside MyTradeBook

1. Open the Accounts page
2. Create an account
3. Copy the generated API key
4. Download the EA file

### Inside MT5

1. Open `File > Open Data Folder`
2. Go to `MQL5 > Experts`
3. Copy `MyTradebook_EA.mq5` into the Experts folder
4. Restart MT5 or refresh Navigator
5. Go to `Tools > Options > Expert Advisors`
6. Enable `Allow WebRequest for listed URL`
7. Add your MyTradeBook server URL such as `http://127.0.0.1:5000`
8. Attach the EA to a chart
9. Paste:
   - your MyTradeBook API key
   - your MyTradeBook server URL

After that, MT5 can start syncing:

- open trades
- closed trades
- account balance
- account equity

## Optional APIs

The app can work without all optional APIs.

### Optional keys

- `TWELVE_DATA_API_KEY`
  For deeper intraday market data support

- `GROK_API_KEY`
  For AI coaching and advanced suggestions

- `CMC_API_KEY`
  For CoinMarketCap crypto data

- `METAAPI_TOKEN`
  For MetaApi-related integration paths

- `CRYPTO_SALT`
  For stronger custom crypto-related configuration

If you are a beginner, start with Supabase only and add optional APIs later.

## What To Do After Installation

Once the app is working:

1. Add your trading account
2. Connect MT5
3. Let trades sync
4. Open the Trade Journal page
5. Add notes, screenshots, trade logic, and emotions
6. Review Analytics, Reports, Risk, and Psychology pages weekly

## Common Problems And Fixes

### The app does not open

Check:

- Node.js is installed
- `npm install` completed successfully
- you started the app with `npm run dev`

### Login does not work

Check:

- `SUPABASE_URL` is correct
- `SUPABASE_ANON_KEY` is correct
- `VITE_SUPABASE_URL` is correct
- `VITE_SUPABASE_ANON_KEY` is correct
- Email/Password auth is enabled in Supabase

### Trades do not sync from MT5

Check:

- MT5 is open
- the EA is attached to a chart
- the API key is correct
- the server URL is correct
- WebRequest is enabled in MT5
- your MyTradeBook app is running

### Screenshots or files do not upload

Check:

- the Supabase bucket exists
- the bucket name matches `SUPABASE_STORAGE_BUCKET`
- you are using supported image formats

## How Codex Can Help You

If you are using Codex to work with this repository, Codex can help even if you are not a coder.

You can ask Codex things like:

- "Explain how to install this project step by step"
- "Check my README and improve it"
- "Why is my app not connecting to Supabase?"
- "Help me fix my `.env` setup"
- "Add screenshots to the README"
- "Explain how MT5 sync works"
- "Create better documentation for non-technical users"
- "Find why trades are not syncing"

## Good Ways To Use Codex On This Project

### For setup help

Ask:

- "Check if my environment file looks right"
- "Explain what each API key does"
- "Tell me what I still need to install"

### For debugging

Ask:

- "Why is login failing?"
- "Why is the EA not syncing trades?"
- "Why is the app showing blank analytics?"

### For documentation help

Ask:

- "Rewrite this guide in simpler English"
- "Make this README more beginner-friendly"
- "Create a setup checklist for new users"

### For improvements

Ask:

- "Add a new section to the README"
- "Create feature documentation"
- "Improve wording for GitHub visitors"

## Best Prompt Examples For Non-Coders

You can copy prompts like these:

```text
Explain this project to me like I am a beginner.
```

```text
Check this repository and tell me the exact steps to run it on my computer.
```

```text
Help me configure Supabase for this project.
```

```text
Read my README and make it easier for non-technical users.
```

```text
Explain how the MT5 EA connects to the journal.
```

## Security Advice

- Never commit your real `.env` file
- Never share your `SUPABASE_SERVICE_ROLE_KEY`
- Never share private tokens publicly
- Keep your local machine secure if it stores account-related data

## Final Advice

If you are a non-coder, do not try to understand everything at once.

Follow this order:

1. install the tools
2. get the project
3. set up Supabase
4. run the app
5. create your account
6. connect MT5
7. start journaling

That is enough to begin using MyTradeBook successfully.
