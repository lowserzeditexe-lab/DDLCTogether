"""
DDLC Together — pywebview overlay window
launcher/overlay_window.py  (compiled to overlay_window.exe via PyInstaller)

Spawned by the Ren'Py mod (hooks.rpy -> mp_open_overlay) as a child process.
Shows a frameless, always-on-top, click-through-friendly window that loads
the local React app (room browser, lobby or overlay) served by server.exe.

Usage:
    overlay_window.exe --route rooms
    overlay_window.exe --route lobby   --code XK4T2A
    overlay_window.exe --route overlay --code XK4T2A
"""
from __future__ import annotations
import argparse
import os
import sys
import webview


SERVER = "http://127.0.0.1:8001"


def build_url(route: str, code: str | None) -> str:
    route = (route or "rooms").strip("/")
    code = (code or "").strip()
    # The React app uses HashRouter, so all client routes live under /#/...
    if route in ("lobby", "overlay") and code:
        return f"{SERVER}/#/{route}/{code}"
    if route == "home" or route == "":
        return f"{SERVER}/#/"
    return f"{SERVER}/#/{route}"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--route", default="rooms")
    p.add_argument("--code", default="")
    p.add_argument("--transparent", action="store_true",
                   help="Frameless transparent always-on-top (overlay mode).")
    args = p.parse_args()

    url = build_url(args.route, args.code)

    is_overlay = (args.route == "overlay") or args.transparent
    title = {
        "rooms": "DDLC Together — Salons",
        "lobby": "DDLC Together — Salon",
        "overlay": "DDLC Together",
    }.get(args.route, "DDLC Together")

    if is_overlay:
        win = webview.create_window(
            title,
            url,
            width=1280, height=720,
            frameless=True,
            on_top=True,
            transparent=True,
            background_color="#00000000",
            resizable=True,
        )
    else:
        win = webview.create_window(
            title,
            url,
            width=960, height=720,
            resizable=True,
            background_color="#FFF0F5",
        )

    # gui="edgechromium" forces the modern Edge WebView2 runtime on Windows
    # (installed by the Inno Setup installer if missing).
    gui = "edgechromium" if sys.platform == "win32" else None
    webview.start(gui=gui, debug=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
