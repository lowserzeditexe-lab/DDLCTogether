# PRD — DDLC Together

## Problem statement (original, abridged)

Build "DDLC Together", a multiplayer layer for Doki Doki Literature Club
delivered as a **single Windows installer** that bundles a modded game, a
local Node.js server and a React-based UI rendered without browser chrome
inside the Ren'Py window — no external web page, no remote server.

## Final architecture

```
DDLCTogether-Setup.exe  (~222 MB — DDLC sprites + audio bundled)
└── %ProgramFiles%\DDLCTogether\
    ├── DDLCTogether.exe           Ren'Py engine launcher
    ├── DDLCTogetherLauncher.exe   Node orchestrator (boots server + game)
    ├── server.exe                 Node 18 + Express + socket.io
    │                              (embeds React static bundle in-memory)
    ├── lib\py3-windows-x86_64\    Ren'Py runtime binaries
    ├── renpy\                     Ren'Py engine source
    ├── game\                      DDLC mod content (audio/images/scripts.rpa)
    │   └── multiplayer\           Our mod (network.rpy + hooks.rpy
    │       │                       + menu.rpy + discord_rpc.rpy)
    │       └── lib\               Bundled websocket-client
    ├── app.ico
    └── Uninstall.exe              Registry-aware uninstaller
```

UI is shown in a borderless Edge `--app=` window (no URL bar, no
tabs, no menu) — visually identical to a native app. Edge is shipped
with Windows 10/11; Chrome is used as fallback.

## Implemented

### v1.0 (2026-01-23)

- ✅ Server: full event catalogue (`room:*`, `player:*`, `host:transfer`,
  `game:start`, `game:scene_advance`, `game:choice_present`, `vote`,
  `progress`, `result`, `spectator:become_player`, disconnect cleanup,
  10-min TTL).
- ✅ Raw WS `/renpy` endpoint with role checks + bidirectional
  scene/choice relay.
- ✅ React UI : Home / RoomBrowser / Lobby / Overlay, character cards
  (Sayori, Natsuki, Yuri, Monika), username modal, copyable room code,
  vote panel (progress bar + 30s countdown + gold winner flash),
  spectator banner.
- ✅ DDLC aesthetic: Sniglet font, palette `#FFF0F5 / #FF6B9D /
  `#3D1C35 / #B08090`, 12-16 px radii, soft shadows, fade-in animations.
- ✅ Ren'Py mod (network.rpy + hooks.rpy + menu.rpy) compatible with
  DDLCModTemplate2.0; websocket-client vendored inside the game folder.
- ✅ Node launcher — cross-compiled to `launcher.exe` via `pkg`.
- ✅ MSEdge `--app=` integration replacing pywebview.
- ✅ NSIS installer (`installer.nsi`) with admin install, RO core
  component, optional desktop + start-menu shortcuts, MUI Welcome /
  License / Components / Directory / Finish pages in French + English,
  uninstall registry entries, process-kill before uninstall.
- ✅ DDLC base game `.rpa` archives (`audio`, `fonts`, `images`,
  `scripts` ≈ 207 MB) extracted from `vendor/ddlc.zip` and bundled into
  the Ren'Py distribution + the final installer.

### v1.1 (2026-02-17, current)

- ✅ **Critical fix — `singleton` ModuleNotFoundError on first launch**
  removed the bundled `scripts.rpa` archive from the Ren'Py distribution.
  Per `DDLCModTemplate2.0`'s README, only `audio.rpa`, `fonts.rpa` and
  `images.rpa` must be imported from the original DDLC; `scripts.rpa`
  contains the legacy compiled `definitions.rpyc` that imported a Python
  `singleton` module no longer shipped with the engine and which the mod
  template replaces with `definitions/py/0core_ren.py`.
- ✅ **Critical fix — PEP 604 `str | None` TypeError at module load**
  added `game/00_compat_ren.py` containing a `python early:` block that
  flips `renpy.config.future_annotations = True` *before* the rest of
  the mod template is compiled.  The `00_` prefix guarantees this file
  is parsed first; once `early_execute` flips the flag, every
  subsequent `_ren.py` is compiled with PEP 563 deferred-evaluation
  semantics, neutralising PEP 604 annotations under the bundled
  Python 3.9.10.  Verified by running `renpy.py lint` against the dist
  under QEMU — full 2,152 dialogue blocks parsed with zero errors.
- ✅ **Host-authority transfer**: when the host's `/renpy` raw-WS
  disconnects, the server hands authority to the next surviving Ren'Py
  socket via a `host:claim` event; `hooks.rpy` registers a periodic
  callback that promotes that client to `"host"` role and notifies the
  player with `renpy.notify`.
- ✅ **Discord Rich Presence** (`discord_rpc.rpy`): pure-Python local
  IPC handshake (Windows named pipe / Unix socket), no extra runtime
  dependency. Activity is set on connect / disconnect / room join,
  with party size + join secret advertised.
- ✅ **`ddlctgthr://CODE/lobby` URL protocol**: registered by the NSIS
  installer in `HKCR\ddlctgthr`, parsed by `launcher.exe`, which boots
  the server and opens the lobby page directly in the Edge --app
  window. Lobby UI exposes a *"Copier le lien d'invitation"* button
  next to the room code.
- ✅ **End-to-end integration test** (`server/test_e2e.js`):
  spins up the real server, runs 13 assertions covering room
  lifecycle, overflow → spectator, character selection,
  `game:start`, raw-WS scene relay, choice present + vote + result,
  socket.io `host:transfer`, and `host:claim` on Ren'Py host
  disconnect. **13/13 passing.**

## Build outputs

| File | Size | Type |
|------|------|------|
| `build/server.exe`             | 39 MB  | PE32+ x64 GUI |
| `build/launcher.exe`           | 36 MB  | PE32+ x64 GUI |
| `build/renpy_dist/...-pc/`     | 269 MB | Game payload (DDLC bundled) |
| **`build/DDLCTogether-Setup.exe`** | **222 MB** | **NSIS Win32 installer** |

## Not yet shipped

- ⚠ Code-signing certificate (installer is unsigned → Windows SmartScreen
  will show a "publisher unknown" warning on first launch). Acquiring an
  EV cert is the user's call.
- ⚠ Discord application id in `discord_rpc.rpy` is a placeholder
  (`1234567890123456789`). Replace with your own from
  <https://discord.com/developers/applications> for branded artwork.

## Future / backlog

- P2 — Auto-update channel via GitHub releases + `NSIS::UpdateExe`.
- P2 — In-game chat overlay (text bubbles synced via `chat:msg` event).
- P2 — Audio voting jingles + animated portrait reactions.

## Test credentials

No authentication. Free-form pseudo (1–16 chars, `[A-Za-z0-9_]+`)
stored in localStorage.

## How to rebuild

```
# 1. React UI
cd client && yarn build

# 2. Server + launcher EXEs (cross-compiled to Win64)
cd ../server && npx pkg . --targets node18-win-x64 --output ../build/server.exe
cd ../launcher && npx pkg . --targets node18-win-x64 --output ../build/launcher.exe
python3 ../tools/patch_pe_subsystem.py ../build/server.exe ../build/launcher.exe

# 3. Sync mod files into the Ren'Py distribution
cp renpy_mod/game/multiplayer/*.rpy build/renpy_dist/DDLCTogether-1.0-pc/game/multiplayer/

# 4. Final installer
cd installer && makensis -V2 installer.nsi
```
