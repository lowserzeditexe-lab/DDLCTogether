# DDLC Together

Multiplayer layer for **Doki Doki Literature Club!** — built as a single
self-contained Windows installer.  No web page, no external server, no
account required.  Install, double-click the desktop shortcut, play.

```
┌────────────────────────────────────────────────────────────────────────┐
│  DDLCTogether-Setup.exe   (≈ 250 MB)                                   │
│  ├── DDLC.exe (Ren'Py game, modded)                                    │
│  ├── server.exe (Node.js + socket.io, runs on 127.0.0.1:8001)          │
│  ├── launcher.exe (starts server then game)                            │
│  ├── overlay_window.exe (pywebview frame, no browser UI)               │
│  └── game/multiplayer/ (network.rpy + hooks.rpy + menu.rpy)            │
└────────────────────────────────────────────────────────────────────────┘
```

## End-user experience

1. Run `DDLCTogether-Setup.exe`, accept defaults, finish.
2. Shortcut **DDLC Together** is created on the desktop and start menu.
3. Double-clicking it boots the modded DDLC.  The bundled server starts in
   the background — *no console window, no browser*.
4. The DDLC main menu now shows **Multijoueur**.  Clicking it opens an
   embedded panel (room browser → lobby → in-game vote overlay) drawn by a
   borderless `pywebview` frame.  It looks and feels like a native game
   menu, not a webpage.
5. Choices in the VN become real-time votes among connected players.

## Build the installer

**Windows (recommended):** open a `cmd` in repo root and run

```
build.bat
```

**Linux/Wine:**

```
RENPY_SDK=~/renpy-8.2.3-sdk ./build.sh
```

Output: `build/DDLCTogether-Setup.exe`.

Both pipelines do **seven** steps in order:

| # | Step | Tool | Output |
|---|------|------|--------|
| 1 | Build React UI | Vite | `client/dist/` |
| 2 | Bundle Node server | `pkg` | `build/server-win.exe` |
| 3 | Compile launcher + overlay helper | PyInstaller | `build/launcher.exe`, `build/overlay_window.exe` |
| 4 | Stage Ren'Py project (template + DDLC assets + mod) | git + unzip + pip | `build/renpy_project/` |
| 5 | Build Ren'Py Windows distribution | Ren'Py SDK | `build/game/` |
| 6 | Fetch Edge WebView2 bootstrapper | curl / Invoke-WebRequest | `installer/vendor/` |
| 7 | Compile installer | Inno Setup 6 | `build/DDLCTogether-Setup.exe` |

## Required vendor files (place yourself, due to IP)

```
vendor/
└── Doki_Doki_Literature_Club.zip       # official freeware ZIP
                                        # (or use the Discord CDN URL in the spec)
```

Everything else is downloaded automatically.

## Source layout

```
server/           Node.js + Express + socket.io  (bundled to server.exe)
client/           Vite + React 18  (bundled as static files served by server)
renpy_mod/        .rpy files copied into the game folder during build
launcher/         Python helpers compiled to .exe with PyInstaller
installer/        Inno Setup script + assets + LICENSE
build/            All build artefacts (ignored by git)
vendor/           Third-party blobs not committed (DDLC ZIP, Ren'Py SDK, …)
build.bat         Windows build pipeline
build.sh          Linux/Wine build pipeline
INTEGRATION.md    Where to add the hooks in DDLCModTemplate2.0
```

## Dev mode (no installer, no Wine)

You can run the multiplayer stack without compiling the installer:

```
# Terminal 1 — server
cd server && yarn install && yarn start

# Terminal 2 — React dev server (hot reload)
cd client && yarn install && yarn dev   # opens http://localhost:5173
```

For Ren'Py: open `vendor/DDLCModTemplate2.0` in the Ren'Py SDK launcher
after copying `renpy_mod/game/multiplayer/` into its `game/` folder, then
press **Launch Project**.

## License

MIT for the multiplayer layer.  DDLC assets remain © Team Salvato, used
under their official mod IP guidelines.
# DDLCTogether
