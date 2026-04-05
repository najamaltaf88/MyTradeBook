# Setup and Installation

## Requirements

- Node.js 18 or newer
- npm
- Supabase account for full authentication and synced state

## Steps

1. Clone the repository.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Fill in your Supabase values.
5. Run the SQL in `script/supabase-schema.sql`.
6. Create the `tradebook-uploads` storage bucket.
7. Start the app with `npm run dev`.

Open `http://localhost:5000` after the server starts.
