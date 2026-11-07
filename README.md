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
| `spike.html`, `src/spike/` | Camera test page. Results in `docs/spike-results.md` |
| `ar.html`, `card.html`, `src/experiment/` | Standalone coastal AR experiment and print card. Results in `docs/ar-experiment.md` |
| `src/features/trail/BreakWaves*`, `Hunt*`, `breakWaves*` | Paired hunt stop, marker AR scene, camera lifecycle and challenge model. See `docs/break-the-waves.md` |
| `public/ar/` | Pinned local MindAR/Three browser modules, artwork and compiled target |

## Coastal AR experiment

The coastal AR experiment is a separate, local feasibility page. It uses pinned, locally served
MindAR 1.2.5 and Three.js 0.160.0 browser modules under `public/ar/vendor/`; no npm dependency was
added. Open `/card.html` to print the separate QR card and `/ar.html` for the camera experiment.

See `docs/ar-experiment.md` for local/HTTPS iPhone instructions, the compiled target, checks and
limitations. It is not the paired trail game and does not use Supabase.

## Break the waves hunt

The first paired hunt stop reuses the existing lobby and the pinned local MindAR/Three assets. New
trail sessions use the `hunt-v1` game version; existing trail rows remain `legacy` and keep the old
problem-board behaviour. `/scan/break-the-waves` is the canonical hunt card link, while
`/scan/storm-waves` remains the legacy card. `/card.html` keeps the experiment as the default card
type and adds an explicit hunt variant.

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

- Cloudflare Pages builds `npm run build` to `dist`.
- `main` deploys to the live site. Other branches deploy to `https://<branch>.sip-coastaldatingapp.pages.dev`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set as type Text, not Secret.
- The camera needs HTTPS. Test camera features on a deployed URL on iPhone.
- QR cards encode `<site>/scan/<problem>`, for example `/scan/storm-waves` (legacy) or
  `/scan/break-the-waves` (hunt stop 1).
