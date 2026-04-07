# OBS Yahoo Fantasy Football Overlay (Local)

Local Node.js + Express app for an OBS Browser Source overlay that shows Yahoo Fantasy Football weekly matchups with live scoreboard updates and TD player alerts.

## Highlights
- Yahoo OAuth flow with local token storage and auto-refresh
- Live matchup scoreboard polling (default: every 10 seconds)
- TD scan polling for live matchups (default: every 10 seconds)
- Push updates via SSE (`/events`) with no full page reload in OBS
- Overlay route with transparent background: `/overlay`
- Admin/config UI: `/admin`
- Mock mode for styling before Yahoo auth is complete
- Cache fallback if Yahoo fails temporarily
- Optional admin API key protection for config/control routes
- Health and metrics endpoints for local reliability checks
- Scene presets: centered card, lower-third, sidebar widget, bottom ticker

## Project Structure

```txt
FantasyFootball-Yahoo/
├─ client/
│  ├─ admin.html
│  ├─ admin.css
│  ├─ admin.js
│  ├─ overlay.html
│  ├─ overlay.css
│  └─ overlay.js
├─ server/
│  ├─ index.js
│  ├─ dataService.js
│  ├─ yahooAuth.js
│  ├─ yahooApi.js
│  ├─ normalizer.js
│  ├─ configStore.js
│  ├─ secretStore.js
│  ├─ tokenStore.js
│  ├─ cacheStore.js
│  ├─ tdStateStore.js
│  ├─ metrics.js
│  ├─ sseHub.js
│  ├─ mockData.js
│  ├─ defaultSettings.js
│  ├─ logger.js
│  └─ utils.js
├─ public/
│  ├─ assets/
│  │  └─ logo-fallback.svg
│  └─ themes/
│     ├─ neon-grid.css
│     ├─ classic-gold.css
│     └─ ice-night.css
├─ config/
│  ├─ settings.json
│  └─ settings.example.json
├─ cache/
│  └─ .gitkeep
├─ test/
│  ├─ normalizer.test.js
│  └─ dataService.test.js
├─ .env.example
├─ .gitignore
├─ Dockerfile
├─ docker-compose.yml
├─ package.json
└─ README.md
```

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Create env file:
```bash
cp .env.example .env
```

3. Start app:
```bash
npm run dev
```
or
```bash
npm start
```

4. Open admin UI:
- [http://localhost:3030/admin](http://localhost:3030/admin)

5. Overlay preview:
- [http://localhost:3030/overlay](http://localhost:3030/overlay)

## Environment Variables

Use `.env` (see `.env.example`):

```bash
PORT=3030
APP_BASE_URL=http://localhost:3030
YAHOO_CLIENT_ID=
YAHOO_CLIENT_SECRET=
YAHOO_REDIRECT_URI=http://localhost:3030/auth/callback
MOCK_MODE=true
ADMIN_API_KEY=
```

Notes:
- If `ADMIN_API_KEY` is set, protected admin endpoints require `x-admin-key`.
- Yahoo secret is persisted locally in `config/secrets.json` (gitignored).

## Yahoo OAuth Setup

1. Create Yahoo developer app and get Client ID + Client Secret.
2. Set Yahoo redirect URI to:
- `http://localhost:3030/auth/callback`
3. In `/admin`, enter client ID/secret/redirect URI/scope.
4. Click **Save Settings**.
5. Click **Start Yahoo OAuth** and complete authorization.

Stored locally:
- OAuth tokens: `config/tokens.json`
- Secret cache: `config/secrets.json`

If tokens expire, refresh is handled automatically when possible.

## Polling and Live Update Behavior

Default polling values:
- `data.scoreboardPollMs`: `10000`
- `data.tdScanIntervalMs`: `10000`
- `data.refreshIntervalMs`: `10000` (fallback/general)

Behavior:
- Scoreboard poll checks matchup/score changes.
- TD scan checks active starters on live matchups only.
- Changes are pushed to overlay through SSE.
- Overlay avoids full page refresh and avoids rerender on TD-only updates.
- Exponential backoff is applied on failures, bounded by `maxRetryDelayMs`.
- Cached data is reused on transient Yahoo failures.

## Admin UI Features

`/admin` supports:
- Yahoo credentials + OAuth controls
- League settings (`leagueId`, `gameKey`/`season`, week)
- Polling intervals and retry settings
- Overlay controls (mode, layout, rotation, projections, records, logos, ticker)
- TD alerts + duration
- Closest/upset highlighting
- Manual Game of the Week pin
- Optional webhook hook URL for score/TD events
- Theme controls (colors/font scale)
- Reduced motion mode
- Config export/import
- Force refresh + force next matchup controls

## OBS Browser Source Setup

1. Add a **Browser Source** in OBS.
2. Use URL:
- `http://localhost:3030/overlay`
3. Suggested base size:
- Width: `1920`
- Height: `1080`
4. Keep transparency enabled (default page background is transparent).

Useful query params:
- `?preset=centered-card`
- `?preset=lower-third`
- `?preset=sidebar-widget`
- `?preset=bottom-ticker`
- `?mode=ticker`
- `?twoUp=1`
- `?scale=0.9`

Examples:
- `http://localhost:3030/overlay?preset=lower-third`
- `http://localhost:3030/overlay?preset=sidebar-widget&twoUp=1&scale=0.95`

## API Endpoints

Core:
- `GET /health`
- `GET /metrics`
- `GET /events`
- `GET /api/public-config`

Protected when admin key is enabled:
- `GET /api/config`
- `PUT /api/config`
- `GET /api/config/export`
- `POST /api/config/import`
- `GET /api/status`
- `POST /api/refresh`
- `POST /api/test-connection`
- `POST /api/control/next`
- `POST /api/auth/logout`
- `GET /auth/start`

## Testing

Run test suite:
```bash
npm test
```

Includes:
- Yahoo payload normalization tests
- TD diff/state serialization tests
- Score change detection tests

## Docker

Build and run:
```bash
docker compose up --build
```

Then open:
- [http://localhost:3030/admin](http://localhost:3030/admin)
- [http://localhost:3030/overlay](http://localhost:3030/overlay)

## Troubleshooting

### Yahoo auth fails
- Confirm Yahoo redirect URI exactly matches `http://localhost:3030/auth/callback`.
- Verify client ID/secret in admin.
- Use **Clear Stored Tokens**, then retry OAuth.

### No matchup data
- Check `leagueId` and `gameKey`.
- Use **Test API Connection** in admin.
- Temporarily enable mock mode to confirm overlay rendering.

### Overlay not updating in OBS
- Confirm app is running and SSE endpoint `/events` is reachable.
- Check `/health` and `/metrics` for poll/error counters.
- Use **Force Refresh** in admin.

### TD alerts missing
- Ensure `showTdAlerts` is enabled.
- TD scan only evaluates live matchups and non-bench starters.
- If league stat labels differ, fallback TD stat mapping is applied.

### Admin routes return 401
- `ADMIN_API_KEY` or `security.adminApiKey` is enabled.
- Provide the same key in admin UI and retry.

