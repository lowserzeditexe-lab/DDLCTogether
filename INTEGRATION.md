# INTEGRATION.md — Hooking DDLC Together into DDLCModTemplate2.0

This document lists the **exact lines** to add / change so the multiplayer
layer plugs into a fresh clone of
[`Bronya-Rand/DDLCModTemplate2.0`](https://github.com/Bronya-Rand/DDLCModTemplate2.0).

`build.bat` / `build.sh` already perform every step automatically; this
file exists for **manual installation** (e.g. modders who maintain their
own DDLC mod and want to add multiplayer on top).

---

## 1.  Copy the mod folder

```
DDLCModTemplate2.0/
└── game/
    └── multiplayer/          ← copy from renpy_mod/game/multiplayer/
        ├── network.rpy
        ├── hooks.rpy
        ├── menu.rpy
        └── lib/              ← `pip install --target lib websocket-client==1.7.0`
```

That's the only required filesystem change.  All three `.rpy` files use
`init -10` / `init -5` / `init 100` priorities so they merge cleanly with
the template's own init blocks.

## 2.  Main menu button (automatic)

`menu.rpy` already appends a `"Multijoueur"` entry to `config.main_menu`,
which the template's `screens.rpy` reads at runtime.  No edit needed.

If your template overrides `screen main_menu` directly (rare), add this
line inside the navigation `vbox`:

```renpy
textbutton _("Multijoueur") action Start("MultiplayerEntry")
```

## 3.  Choice rebinding (automatic)

`hooks.rpy` rebinds `renpy.exports.menu` *before* any user dialogue runs
(`init -5`).  Every `menu:` block in your mod's scripts is therefore
intercepted **only when** `mp_active()` returns `True` *and* the local
player is the room host.  Otherwise the original menu engine runs and the
game behaves exactly like vanilla.

## 4.  Scene tracking (automatic)

`config.label_callback` is wired in `hooks.rpy`.  Each label transition is
relayed to the server which broadcasts to other players' overlays.

## 5.  Launching the overlay from the lobby

When the lobby host clicks "Lancer la partie" in the React UI, the server
emits a `game:started` event that triggers, in the Ren'Py game,
`jump MultiplayerStartGame` (defined in `menu.rpy`).

If your mod uses a custom entry point instead of `label start`, edit
`menu.rpy`:

```renpy
label MultiplayerStartGame:
    $ mp_open_overlay(_mp_room or "", route="overlay")
    jump my_custom_entry_label   ← change this
```

## 6.  Resources at runtime

The Ren'Py game needs three sibling files in its directory:

| File | Provided by |
|------|-------------|
| `server.exe`         | `pkg` build of `server/server.js` |
| `overlay_window.exe` | PyInstaller build of `launcher/overlay_window.py` |
| `launcher.exe`       | PyInstaller build of `launcher/launcher.py`   |

The Inno Setup script places them all next to `DDLC.exe` automatically.

## 7.  Event catalogue (reference)

### Socket.io  (browser ↔ server)

| Direction | Event | Payload |
|-----------|-------|---------|
| C→S | `room:create` | `{ username, maxPlayers, visibility }` |
| C→S | `room:join`   | `{ username, code }` |
| C→S | `room:list`   | `{}` |
| C→S | `room:leave`  | `{}` |
| C→S | `player:character_select` | `{ character }` |
| C→S | `player:kick` | `{ targetId }` (host only) |
| C→S | `host:transfer` | `{ targetId }` (host only) |
| C→S | `game:start` | `{}` (host only) |
| C→S | `game:choice_vote` | `{ option }` |
| C→S | `spectator:become_player` | `{ character }` |
| S→C | `room:created` | `{ code, room }` |
| S→C | `room:joined`  | `{ code, room, as }` |
| S→C | `room:updated` | `room` |
| S→C | `room:list`    | `[ { code, players, maxPlayers, state } ]` |
| S→C | `room:error`   | `{ message }` |
| S→C | `room:kicked`  | `{ code }` |
| S→C | `game:started` | `{ code }` |
| S→C | `game:scene`   | `{ label }` |
| S→C | `game:choice`  | `{ options, deadline }` |
| S→C | `game:choice_progress` | `{ voted, total }` |
| S→C | `game:choice_result`   | `{ winner, tally }` |
| S→C | `game:ended`   | `{}` |

### Raw WS  /renpy  (Ren'Py game ↔ server)

Query string : `?room=XXXXXX&role=host|player|spectator`

| Direction | Event | Payload |
|-----------|-------|---------|
| G→S | `game:scene_advance`  | `{ label }` |
| G→S | `game:choice_present` | `{ options }` |
| G→S | `game:end`            | `{}` |
| S→G | `ws:connected`        | `{ room }` |
| S→G | `game:choice_result`  | `{ winner, tally }` |
| S→G | `ws:error`            | `{ error }` |
