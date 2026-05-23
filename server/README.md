# DDLC Together — Server

Node.js + Express + socket.io + raw WS for Ren'Py.

## Run from source

```bash
yarn install
yarn start
```

Listens on `0.0.0.0:8001` (override with `DDLC_HOST` / `DDLC_PORT`).

## Build standalone `server.exe`

```bash
yarn build:win    # → ../build/server-win.exe (~50 MB, no node needed)
yarn build:linux  # → ../build/server-linux
```

The build embeds `../client/dist/**/*` so the same binary serves the web UI.

## Endpoints

- `GET  /`                — React SPA (room browser / lobby / overlay)
- `GET  /api/health`      — JSON health check
- `WS   /socket.io/`      — Browser clients
- `WS   /renpy?room=XXX&role=host` — Ren'Py game client

See `/INTEGRATION.md` for the full event catalogue.
