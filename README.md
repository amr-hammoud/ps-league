# PS League — NASA International Schools

Single-page tournament website for the FC26 PS League. React frontend + tiny Express API, JSON-on-disk storage.

## Pages

- `/` — Home: status, next match, champion, tier overview
- `/bracket` — Full bracket grouped by round
- `/schedule` — Match-by-match timetable with auto-computed start/end
- `/players` — Player roster with live qualifier status
- `/admin` — Password-protected: record scores/winners, edit schedule settings

## Stack

- Vite + React 18 + React Router 6
- Tailwind CSS for styling (brand palette built from the NASA International Schools magenta `#9D3689`)
- Express 4 serves the built React app **and** the `/api/*` JSON endpoints
- Storage: plain JSON files in `/data` (`players.json`, `bracket.json`, `settings.json`)

## Local development

```bash
npm install
npm run dev        # runs Vite (5173) + Express API (3001) together
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the Express server.

## Production build

```bash
npm run build      # produces /dist
npm start          # serves /dist + /api on PORT (default 3001)
```

Visit `http://localhost:3001` to see the full site served from a single Node process.

## Environment variables

Copy `.env.example` to `.env` (Hostinger's Node.js panel lets you set these directly):

| Var | What it does |
| --- | --- |
| `ADMIN_PASSWORD` | Password for the `/admin` login screen. **Change this before going live.** |
| `SESSION_SECRET` | HMAC key used to sign the admin cookie. Any long random string. |
| `PORT` | Port for Express. Hostinger sets this automatically; leave blank in prod. |

## Deploying to Hostinger (Node.js Business plan)

1. **Build locally first**: `npm install && npm run build`. You can also build on the server, but uploading `dist/` is faster.
2. **Upload the project** (or `git clone` it) to your domain's folder via Hostinger's File Manager / SSH.
3. In **hPanel → Advanced → Node.js**:
   - Application root: the folder you uploaded.
   - Application URL: your domain.
   - Application startup file: `server.js`.
   - Node version: 18 or newer.
4. Open the Node.js app's **Environment Variables** and set `ADMIN_PASSWORD` and `SESSION_SECRET`.
5. **Run `npm install`** from the Node.js panel (it has a one-click button).
6. **Start the app**. Hostinger will route your domain to the Node process and inject `PORT`.

That's it — the site serves both the static React app and the `/api/*` endpoints from one process.

### Re-deploying after changes

- Frontend code changes → rebuild with `npm run build` and replace `dist/`.
- JSON-only changes (scores, winners, settings) → just use `/admin`. Nothing to redeploy.

## Backing up the tournament data

The source of truth lives in `/data/*.json`. Copy that folder before/after a tournament and you're safe. Each JSON write is atomic (temp file → rename), so a crash mid-update won't corrupt the file.

## API reference (short)

Public (no auth):
- `GET /api/players` — roster + tiers
- `GET /api/bracket` — every match with `resolvedA` / `resolvedB` filled in (winners propagate)
- `GET /api/schedule` — bracket + computed `start` / `end` times
- `GET /api/settings` — schedule settings

Admin (cookie auth):
- `POST /api/admin/login` `{ password }`
- `POST /api/admin/logout`
- `GET  /api/admin/session` — `{ authed: bool }`
- `POST /api/admin/match` `{ id, scoreA, scoreB, winner }` — winner is a player id (e.g. `"P08"`)
- `POST /api/admin/settings` — full settings object
- `POST /api/admin/reset` — clears every score & winner

## Multi-station scheduling

The tournament runs on `settings.stations` PlayStations in parallel (default 3). The scheduler is dependency-aware: it iterates matches in their declared order (M1 first, M14 later) and assigns each one to whichever station frees up first, but **never starts a match before both of its predecessor matches have finished**.

That means:

- M1, M2, M3 start simultaneously on PS 1, 2, 3 at the tournament start time.
- A QF or SF only starts after its two feeder matches are done — even if a station is sitting idle, it'll wait.
- The Grand Final ignores stations: it runs at `grandFinalStart` in the auditorium.

To change the number of stations, open **/admin → Schedule Settings → Number of stations** and Save. The whole timetable recomputes instantly. Set it to `1` if you ever have to fall back to a single console.

Each match gets a colored chip on the Bracket and Schedule pages so it's obvious at a glance which station is hosting it.

## Match statuses (when things don't go to plan)

Each match has a `status` field. The admin row has a dropdown — pick whichever applies and Save. Downstream matches react automatically.

| Status | What it means | What happens to scores / winner |
| --- | --- | --- |
| **Scheduled** | Default. Not started. | No winner. Scores cleared on save. |
| **In progress** | Match is being played. | You can be entering scores. |
| **Completed** | Normal finish — entered scores, set the winner. | Winner advances to the next round. |
| **Walkover** | One player didn't show or withdrew. | Pick which side advances. Scores are cleared and the bracket shows "W/O". |
| **Cancelled** | Match is nullified, nobody advances. | Winner and scores cleared. Downstream matches re-open. |
| **Postponed** | Will be played later. | Winner and scores cleared. Marked visibly on the schedule. |

A few rules-of-thumb for live operations:

- **Player no-show?** Set status to *Walkover*, pick the opponent as winner, Save. Done.
- **Wrong winner entered by mistake?** Re-pick the correct side and Save. Every downstream match recomputes — names, schedule, qualifiers.
- **Running late?** Open the *Schedule Settings* tab and bump the start time. The whole chain re-times.
- **Match needs to be replayed?** Set status to *Postponed*. Clear the winner. When you re-run it, change the status back to *Completed* and enter the new scores.
- **Want to wipe everything mid-event?** Use *Reset all*. It clears every score, winner, and status across all 26 matches.

## Notes & next steps

- The bracket uses references (`{ type: "winner", id: "M14" }`) so when you record a winner, downstream rounds automatically display the right player name on every page.
- Players are loaded from `players.json` by `id`. If you need to swap a player, edit that file and they'll appear correctly across the whole site.
- The schedule recalculates whenever you change `startTime`, `matchDurationMin`, `bufferMin`, or `grandFinalStart` — no per-match editing required.
