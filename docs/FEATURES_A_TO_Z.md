# MyTradeBook Features Guide

This document explains the major features of MyTradeBook from A to Z.

It is designed for users, contributors, and reviewers who want a full picture of what the project includes.

## A. Accounts

The Accounts module is where trading accounts are created and managed.

It supports:

- creating account profiles inside MyTradeBook
- generating account-specific API keys
- viewing sync status
- viewing last sync time
- downloading the MT5 Expert Advisor
- showing setup steps for automatic trade sync
- regenerating API keys if needed

## B. Alerts

The Alerts section is for configurable notifications and threshold-based warnings.

It supports:

- creating alert rules
- enabling or disabling alerts
- account-specific or global scope
- channels such as Discord, Slack, email, push, and custom webhooks
- alert history tracking

## C. Analytics

The Analytics page helps users review trading performance and behavior patterns.

It is intended to turn raw trade data into understandable trends and summaries.

Typical use cases:

- reviewing consistency
- evaluating win rate and profitability
- studying patterns across accounts
- spotting strengths and weaknesses over time

## D. Dashboard

The Dashboard is the main command center of the app.

It is built to give a quick summary of:

- balances
- recent activity
- performance snapshots
- selected account context
- reflection and improvement signals

## E. Expert Advisor Integration

The project includes `MyTradebook_EA.mq5` for MT5 integration.

This EA supports:

- sending open trade events
- sending closed trade events
- syncing account balance and equity
- sending heartbeat updates
- first-run history import

The EA is for data sync, not trade execution.

## F. Feature Flags By Setup

Some features work immediately after basic installation, while others require optional APIs.

### Core setup features

- dashboard
- trade journal
- notes
- reports
- goals
- psychology
- risk tools
- templates

### Optional API-powered features

- AI insights
- CoinMarketCap-based crypto listings
- deeper market-data-related functionality

## G. Goals

The Goals system helps traders set and track performance targets.

It supports:

- daily goals
- weekly goals
- monthly goals
- notes on targets
- goal progress tracking

This is useful for habit building and accountability.

## H. Heatmaps

The Heatmaps section helps users visually identify performance clusters.

It can help answer questions such as:

- which times perform best
- which sessions perform worst
- where profit clusters appear
- where losses repeat

## I. AI Insights

The AI Insights page provides AI-assisted coaching and review.

It includes:

- trade-performance review
- risk-management commentary
- psychology observations
- strategy-performance notes
- recommendations
- fallback analysis when live AI is unavailable
- PDF export of AI reports

## J. Journal And Notes

MyTradeBook is not only a sync tool. It is a journaling workspace.

The journal layer supports:

- trade reason
- execution logic
- emotional state
- screenshots
- trade notes
- review context

The Notes page expands that by supporting broader reflection, lesson tracking, and workspace-wide notes.

## K. Login And Authentication

The project includes account-based authentication through Supabase.

It supports:

- sign up
- sign in
- sign out
- password reset
- recovery flow

## L. Landing Experience

The landing page introduces the product and helps users understand:

- what MyTradeBook is
- how it connects to MT5
- why journaling matters
- what the app offers

## M. MT5 Automatic Sync

One of the most important features is MT5 sync.

It supports:

- attaching the EA to MT5
- syncing trades automatically
- importing trade history
- updating account information
- matching incoming MT5 data to the right account by API key

## N. Notes Workspace

The Notes workspace supports deeper written reflection beyond single trade entries.

It is useful for:

- lessons learned
- recurring mistakes
- mental notes
- weakness tracking
- reflection drafting

## O. Open Positions And Historical Trades

The sync system is designed to handle both current and past trading activity.

This helps users:

- see active trades
- backfill old trades
- build journal history faster

## P. Playbook

The Playbook feature is for structured trading rules and setup definitions.

It helps traders define:

- what a valid setup looks like
- what rules must be followed
- what conditions must exist before entry

This is useful for discipline and repeatability.

## Q. Quality Of Review

MyTradeBook tries to improve review quality by combining:

- automatic trade capture
- manual journaling
- screenshots
- structured notes
- AI commentary
- strategy and risk analysis

The project is built around reflection, not just storage.

## R. Reports

The Reports section helps convert trading data into readable summaries.

It supports:

- performance summaries
- journaling rate awareness
- coaching suggestions
- review-ready reporting

## S. Screenshots And Uploads

Users can attach screenshots to trades and strategy concepts.

This supports:

- chart evidence
- visual setup review
- trade replay context
- educational documentation

Uploads can be stored locally or through Supabase storage depending on setup.

## T. Templates

Templates reduce friction in journaling.

They support:

- reusable trade-entry structures
- setup-based journaling shortcuts
- duplicate templates
- public template discovery

This is useful for consistency and speed.

## U. User Interface Features

The app includes several usability features:

- sidebar navigation
- account selector
- workspace timezone selector
- zoom controls
- theme toggle
- install button for PWA-capable environments

## V. Views For Professional Use

The Professional Features group includes:

- Alerts
- Compliance
- Heatmaps

These are designed for traders who want more structured monitoring and control.

## W. Weekly Review Support

The project is especially useful for weekly review workflows.

A trader can:

1. sync trades automatically
2. add notes during the week
3. review analytics and reports
4. analyze psychology and risk
5. update playbook rules and goals

## X. Cross-Platform Use

The project supports multiple ways of running:

- web app
- progressive web app
- desktop-oriented Electron setup
- Docker-based deployment

## Y. Yield Of Data Over Time

The more consistently a trader uses the app, the more useful it becomes.

Over time, the project can build:

- better analytics
- stronger pattern detection
- richer reports
- more accurate self-review

## Z. Zero-To-Review Workflow

The full product workflow can be summarized like this:

1. create an account
2. connect MT5
3. sync trades automatically
4. enrich trades with notes and screenshots
5. review analytics, risk, and psychology
6. update playbook and goals
7. repeat every session or week

## Additional Major Features

### Compliance

The Compliance section helps track whether the trader is following their own rules.

It is useful for:

- identifying rule violations
- measuring professional discipline
- improving process consistency

### Crypto Charts

The Crypto Charts module adds crypto-focused market viewing support.

It can combine charting and CoinMarketCap-style context for broader market review.

### PDF Export

The project includes PDF export capability for clean reporting and sharing.

This is useful for:

- personal archives
- coach review
- trading records

### Psychology

The Psychology section focuses on behavior patterns and emotional review.

It helps users study:

- confidence
- fear
- revenge trading
- discipline drift
- emotional mistakes

### Realtime Sync

The app includes realtime update behavior so workspace pages can refresh after key actions such as account creation, sync updates, journaling actions, and similar changes.

### Risk Analysis

The Risk Analysis section helps traders understand:

- drawdown
- risk of ruin
- consistency of sizing
- exposure behavior
- risk-adjusted performance

### Risk Calculator

The Risk Calculator is a practical tool for position planning.

It helps with:

- risk percent estimation
- stop distance planning
- position size thinking
- capital exposure control

### Strategy Edge

Strategy Edge analyzes performance by tagged strategy.

It helps answer:

- which setup has edge
- which setup should be reduced or stopped
- which sessions support a strategy best
- how much confidence exists in the sample

It also supports concept notes with optional image uploads.

## Storage Modes

The app supports more than one storage pattern depending on configuration.

It can use:

- local data storage
- Supabase-backed state
- Supabase storage for uploaded files

## Summary

MyTradeBook is more than a trade logger.

It combines:

- automatic MT5 sync
- journaling
- analytics
- psychology review
- risk management
- strategy analysis
- reports
- templates
- professional monitoring tools

That combination is what makes the project useful for serious self-review.
