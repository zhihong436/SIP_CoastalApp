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
| `src/features/trail/` | Game. Legacy problem board plus the Break the waves hunt, `holdTheShore.ts` text |
| `src/lib/` | Supabase client, foreground reload hook |
| `src/styles/` | `tokens.css` (colours and shared values), `global.css` |
| `supabase/migrations/` | Schema, row level security, database functions |
| `card.html`, `src/experiment/card.ts` | Printable Break the waves QR card helper |
| `src/features/trail/BreakWaves*`, `Hunt*`, `breakWaves*` | Paired hunt stop, world-tracking AR scene, camera lifecycle and challenge model. See `docs/break-the-waves.md` |
| `public/ar/` | Pinned local Three.js and 8th Wall browser modules, plus the decorative card illustration |

## Build entries

Vite builds two HTML entry pages: `index.html` for the React app and `card.html` for the printable
QR card. The older standalone experiment, diorama and camera-spike pages are retired and are no
longer built or served.

## Print card and QR

Open `/card.html` to print the card. Its QR defaults to `/scan/break-the-waves` on the current host,
so the printed link follows the deployment base path. The illustration on the card is decorative;
it is not an AR tracking target. The current hunt places the shared coast on a textured floor with
world tracking.

See `docs/ar-experiment.md` for the historical image-tracking experiment and its checks, and
`docs/spike-results.md` for the historical camera-spike results. Those pages and assets are retained
as evidence only and are not available in the current build.

## Break the waves hunt

The first paired hunt stop reuses the existing lobby and the pinned local 8th Wall/Three.js assets.
New trail sessions use the `hunt-v1` game version; existing trail rows remain `legacy` and keep the
old problem-board behaviour. `/scan/break-the-waves` is the canonical hunt card link, while
`/scan/storm-waves` remains the legacy card. `/card.html` prints only the current hunt card.

See `docs/break-the-waves.md` for the rules, database actions, migration and legacy limitations,
two-iPhone acceptance checklist and the checks that were actually run. The additive migration is
applied to the existing shared development Supabase project; existing legacy trail rows remain
legacy. No reset was run. The branch preview intentionally uses that same shared development backend;
only the `ar-scavenger-demo` branch is being previewed, and `main` is not changed.

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
- `20261026170000_break_the_waves_hunt.sql` is applied to the shared development project. Existing
  legacy trail rows were left in place; do not reset or convert them.
- The service key is never used in the app or committed.
- `npm run db:reset` wipes all test data, including trails in progress, and resets the three test profiles.
- Do not use `supabase db reset --linked`.

## Hosting

- Cloudflare Pages builds `npm run build` to `dist`, with `index.html` and `card.html` as the only
  HTML entry pages.
- `main` deploys to the live site. Other branches deploy to `https://<branch>.sip-coastaldatingapp.pages.dev`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set as type Text, not Secret.
- The camera needs HTTPS. Test camera features on a deployed URL on iPhone.
- QR cards encode `<site>/scan/<problem>`, for example `/scan/storm-waves` (legacy) or
  `/scan/break-the-waves` (hunt stop 1).
