"""
DDLC Together — Game launcher
launcher/launcher.py  (compiled to launcher.exe via PyInstaller)

Started by the Windows Start-Menu / Desktop shortcut.
Responsibilities:
  1. Spawn server.exe (Node.js bundle) on 127.0.0.1:8001 if not already running.
  2. Wait until the server is reachable.
  3. Spawn DDLC.exe (Ren'Py game) in the install directory.
  4. Quit when the game window closes; kill the server.
"""
from __future__ import annotations
import os
import sys
import time
import socket
import signal
import subprocess
import urllib.request


def install_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def port_open(host: str, port: int, timeout: float = 0.3) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def wait_server(host: str, port: int, max_seconds: float = 15.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < max_seconds:
        if port_open(host, port):
            try:
                with urllib.request.urlopen(
                    f"http://{host}:{port}/api/health", timeout=1.5
                ) as r:
                    if r.status == 200:
                        return True
            except Exception:
                pass
        time.sleep(0.25)
    return False


def find(*relpaths: str) -> str | None:
    base = install_dir()
    for r in relpaths:
        full = os.path.join(base, r)
        if os.path.exists(full):
            return full
    return None


def main() -> int:
    base = install_dir()
    os.chdir(base)

    server_exe = find("server.exe", "DDLCTogether\\server.exe")
    game_exe = find("DDLC.exe", "DDLC-Together-1.0-pc\\DDLC.exe", "game\\DDLC.exe")

    procs: list[subprocess.Popen] = []

    # 1. Server
    if server_exe and not port_open("127.0.0.1", 8001):
        flags = 0
        if sys.platform == "win32":
            flags = subprocess.CREATE_NO_WINDOW  # hide console
        p = subprocess.Popen(
            [server_exe],
            cwd=os.path.dirname(server_exe),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
        )
        procs.append(p)
        if not wait_server("127.0.0.1", 8001, max_seconds=20):
            print("[launcher] server did not start in time")

    # 2. Game
    if not game_exe:
        print("[launcher] DDLC.exe not found in", base)
        return 1
    g = subprocess.Popen([game_exe], cwd=os.path.dirname(game_exe))
    g.wait()

    # 3. Cleanup
    for p in procs:
        try:
            p.terminate()
            try:
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                p.kill()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
