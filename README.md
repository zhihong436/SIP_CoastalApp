# SIP_CoastalDatingApp

Mobile web app for the USI2001 Social Innovation Project: a closed-test dating app with a two-player coastal protection game.

React, TypeScript, Vite, Supabase (Auth, Postgres, Realtime). Hosted on Cloudflare Pages.

## Setup

```bash
npm install
```

Create `.env.local`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Values from the project owner. Public sign-up is off; test accounts are created in Supabase.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type check and production build |
| `npm run db:reset` | Runs `supabase/reset.sql` then `supabase/seed.sql` on the shared database |

## Structure

| Path | Contents |
| --- | --- |
| `src/app/` | Routes and guards |
| `src/features/` | `auth`, `profiles`, `discover`, `chat`, `trail`, `camera` |
| `src/features/trail/` | Game. `problems.ts` lists problems, `holdTheShore.ts` holds minigame text |
| `src/lib/` | Supabase client, foreground reload hook |
| `src/styles/` | `tokens.css` (colours and shared values), `global.css` |
| `supabase/migrations/` | Schema, row level security, database functions |
| `spike.html`, `src/spike/` | Camera test page. Results in `docs/spike-results.md` |

## Conventions

- Run `npm run build` before pushing.
- All writes go through database functions. Game results are computed in the database, not the client.
- Schema changes go in a new migration. Applied migrations are not edited.
- New tables enable RLS and grant only to `authenticated`.
- Colours go in `tokens.css`.
- No new dependencies without agreement.
- No secrets in the repo. Only the publishable key goes in `.env.local`.

## Database

- One shared Supabase project for all environments. Access is by invite to the Supabase organisation as Developer.
- Link once with `npx supabase login` and `npx supabase link --project-ref ukshfrnhqhvqmrmrqutd`.
- Apply migrations with `npx supabase db push`, at the same time as pushing the code that needs them.
- The service key is never used in the app or committed.
- `npm run db:reset` wipes all test data, including trails in progress, and resets the three test profiles.
- Do not use `supabase db reset --linked`.

## Hosting

- Cloudflare Pages builds `npm run build` to `dist`.
- `main` deploys to the live site. Other branches deploy to `https://<branch>.sip-coastaldatingapp.pages.dev`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set as type Text, not Secret.
- The camera needs HTTPS. Test camera features on a deployed URL on iPhone.
- QR cards encode `<site>/scan/<problem>`, for example `/scan/storm-waves`.
