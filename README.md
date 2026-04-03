# MyTradeBook

MYTradeBook is a comprehensive trading journal application designed for forex traders. It provides tools for tracking trades, analyzing performance, managing risk, and gaining AI-powered insights to optimize trading strategies.

## Features

- **Real-time Trade Tracking**: Log and monitor trades in real-time with synchronization across devices.
- **AI-Powered Insights**: Leverage artificial intelligence for trade analysis, pattern recognition, and strategic recommendations.
- **Risk Management**: Built-in risk calculators, compliance tools, and position sizing utilities.
- **Analytics & Reporting**: Detailed analytics, heatmaps, backtesting (removed), and PDF export capabilities.
- **Calendar & Alerts**: Trading calendar, alert system, and goal tracking.
- **Psychology & Playbook**: Track psychological factors and maintain a strategy playbook.
- **Multi-Platform Support**: Web app (PWA), desktop version, and mobile-friendly interface.
- **Data Integration**: Integrates with Supabase for secure data storage and real-time sync.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Shadcn/UI components
- **Backend**: Node.js, Express, Supabase
- **Desktop**: Electron
- **Database**: Supabase (PostgreSQL)
- **Other**: Docker, MetaAPI, AI analysis services

## Installation

### Prerequisites

- Node.js (v18+)
- npm or yarn
- Docker (for containerized setup)
- Supabase account (for database)

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/mytradebook.git
   cd mytradebook
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   - Copy `.env.example` to `.env` and fill in your Supabase credentials and other API keys.
   - Set up Supabase database using the schema in `script/supabase-schema.sql`.

4. **Build and Run**:
   - For development:
     ```bash
     npm run dev
     ```
   - For production build:
     ```bash
     npm run build
     npm run preview
     ```
   - For desktop:
     ```bash
     npm run desktop
     ```

5. **Docker Setup** (optional):
   ```bash
   docker-compose up
   ```

## Usage

1. **Sign Up/Login**: Create an account or log in to access your trading journal.
2. **Add Trades**: Use the trades page to log new trades with details like entry/exit points, P/L, and notes.
3. **Analyze Performance**: Visit the analytics page for charts, heatmaps, and AI insights.
4. **Manage Risk**: Use the risk calculator and compliance tools to stay within limits.
5. **Export Data**: Generate PDF reports or export data for external analysis.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit changes: `git commit -m 'Add your feature'`.
4. Push to the branch: `git push origin feature/your-feature`.
5. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Disclaimer

MYTradeBook is a tool for educational and analytical purposes. Trading involves risk, and past performance does not guarantee future results. Always consult with financial advisors before making trading decisions.
