# DDLC Together — Ren'Py hooks
# game/multiplayer/hooks.rpy
#
# - Replaces renpy.exports.menu so host choices become a server-side vote
# - Pushes scene labels to the server via config.label_callback
# - Launches the pywebview overlay window
#
# Files are intentionally minimal: this layer never RENDERS UI itself.

init -5 python:
    import subprocess
    import sys
    import os

    _real_menu = renpy.exports.menu
    _overlay_proc = None

    def mp_menu(items, interact=True, screen="choice"):
        """Host-side: relay choices to server, await vote result."""
        if not mp_active() or _mp_role != "host":
            return _real_menu(items, interact=interact, screen=screen)

        options = [caption for caption, action in items if action is not None]
        if not options:
            return _real_menu(items, interact=interact, screen=screen)

        mp_send("game:choice_present", options=options)

        # Poll the WS queue until we receive a result.  We yield to Ren'Py
        # every 50ms so the engine stays responsive (TextBox, music, etc.).
        deadline = renpy.get_game_runtime() + 60.0
        while True:
            renpy.pause(0.05, hard=False)
            for msg in mp_poll():
                ev = msg.get("event")
                if ev == "game:choice_result":
                    winner = msg.get("winner")
                    for caption, action in items:
                        if caption == winner:
                            return action
                    # If no exact match (unlikely), fall back to first valid
                    for caption, action in items:
                        if action is not None:
                            return action
            if renpy.get_game_runtime() > deadline:
                # Server failed to resolve; fall back to local choice menu
                return _real_menu(items, interact=interact, screen=screen)

    renpy.exports.menu = mp_menu

    def mp_label_callback(name, abnormal):
        if mp_active() and _mp_role == "host":
            mp_send("game:scene_advance", label=name)

    config.label_callback = mp_label_callback

    def mp_drain_control_events():
        """Pump WS queue for non-choice control messages (host:claim, etc.).

        Called from a periodic callback so a non-host client picks up the
        `host:claim` event the server emits when the previous host quits.
        """
        global _mp_role
        for msg in mp_poll():
            ev = msg.get("event")
            if ev == "host:claim":
                _mp_role = "host"
                try:
                    renpy.notify("Vous êtes le nouvel hôte de la partie.")
                except Exception:
                    pass
            elif ev == "ws:closed":
                try:
                    renpy.notify("Connexion perdue avec le serveur.")
                except Exception:
                    pass
        return 0.25  # poll again in 250 ms

    config.periodic_callbacks = config.periodic_callbacks or []
    if mp_drain_control_events not in config.periodic_callbacks:
        config.periodic_callbacks.append(mp_drain_control_events)

    def _find_app_browser():
        """Locate a browser binary that supports `--app=URL` (Edge / Chrome)."""
        cands = []
        if sys.platform == "win32":
            local_app = os.environ.get("LOCALAPPDATA", "")
            program_files = os.environ.get("PROGRAMFILES", r"C:\Program Files")
            program_files_x86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
            cands = [
                os.path.join(program_files_x86, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(program_files, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(program_files, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(program_files_x86, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(local_app, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(local_app, "Google", "Chrome", "Application", "chrome.exe"),
            ]
        elif sys.platform == "darwin":
            cands = [
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            ]
        else:
            cands = ["/usr/bin/microsoft-edge", "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"]
        for c in cands:
            if c and os.path.exists(c):
                return c
        return None

    def mp_open_overlay(room_code, route="rooms"):
        """Open the multiplayer UI in a frameless app-mode window.

        Uses MSEdge / Chrome --app= which displays a borderless Chromium
        window without URL bar, tabs or browser chrome — visually identical
        to a native desktop application.  No pywebview, no Electron, no
        separate runtime to ship.
        """
        global _overlay_proc
        if _overlay_proc and _overlay_proc.poll() is None:
            return  # already open

        route = (route or "rooms").strip("/")
        code = (room_code or "").strip()
        host = "82.64.128.239:8001"
        if route in ("lobby", "overlay") and code:
            url = "http://{h}/#/{r}/{c}".format(h=host, r=route, c=code)
        elif route in ("", "home"):
            url = "http://{h}/#/".format(h=host)
        else:
            url = "http://{h}/#/{r}".format(h=host, r=route)

        browser = _find_app_browser()
        if browser:
            # User-data-dir keeps a clean isolated session (no merge with
            # the user's normal Edge profile)
            udd = os.path.join(os.path.expanduser("~"), ".ddlc-together", "browser")
            try:
                os.makedirs(udd, exist_ok=True)
            except Exception:
                udd = None

            args = [browser, "--app=" + url, "--window-size=1280,720"]
            if udd:
                args.append("--user-data-dir=" + udd)
            try:
                _overlay_proc = subprocess.Popen(args, cwd=os.path.dirname(browser))
                return
            except Exception as e:
                print("[mp] app-mode browser failed:", e)

        # Last-resort fallback: open the system browser
        try:
            if sys.platform == "win32":
                os.startfile(url)  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", url])
            else:
                subprocess.Popen(["xdg-open", url])
        except Exception as e:
            print("[mp] no browser available:", e)

    def mp_close_overlay():
        global _overlay_proc
        if _overlay_proc and _overlay_proc.poll() is None:
            try:
                _overlay_proc.terminate()
            except Exception:
                pass
        _overlay_proc = None
