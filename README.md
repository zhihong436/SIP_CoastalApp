# SIP_CoastalDatingApp

Mobile website for the USI2001 coastal mystery dating app. React, TypeScript, Vite and Supabase.

## Setup

1. Run `npm install`.
2. Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The file is git-ignored. Cloudflare Pages needs the same two variables.
3. Run `npm run dev` to develop and `npm run build` to check types and build.

## Database

All schema changes live in `supabase/migrations/`. Apply them to the linked project with `npx supabase db push`. Never change the schema in the dashboard.

Public sign-up is off. Create tester accounts in the Supabase dashboard, and ban an account to revoke it.

Two administrative scripts are run by hand against the shared project, never from the app.

- `supabase/seed.sql` creates profiles for the three test accounts.
- `supabase/reset.sql` clears decisions, matches and messages so testing can repeat.

## Pages

- The app opens at `/sign-in`. After signing in, the tabs are Discover, Chats and Me, and a conversation opens its trail lobby.
- `/spike.html` is the standalone camera spike. Record its results in `docs/spike-results.md`.
