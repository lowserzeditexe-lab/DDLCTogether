# DDLC Together — Ren'Py multiplayer hook
# game/multiplayer/network.rpy
#
# Background WebSocket thread + message queue.
# Communicates with the bundled Node.js server on 127.0.0.1:8001.
#
# This file does NOT render any UI — it only relays scene/choice events.
# All player-facing UI lives in the pywebview frame launched by the
# native helper `overlay_window.exe` (see launcher/overlay_window.py).

init -10 python:
    import threading
    import queue
    import json
    import os
    import sys

    # The websocket-client lib is shipped inside game/multiplayer/lib/
    # via build.bat -> see installer.iss.
    _mp_lib_dir = os.path.join(renpy.config.gamedir, "multiplayer", "lib")
    if _mp_lib_dir not in sys.path:
        sys.path.insert(0, _mp_lib_dir)

    try:
        import websocket  # websocket-client
    except ImportError:
        websocket = None
        print("[mp] websocket-client not available, multiplayer disabled")

    _mp_queue   = queue.Queue()
    _mp_ws      = None
    _mp_thread  = None
    _mp_enabled = False
    _mp_room    = None
    _mp_role    = None   # "host" | "player" | "spectator"
    _mp_server  = "82.64.128.239:8001"

    def _ws_thread(url):
        global _mp_ws
        def on_message(ws, msg):
            try:
                _mp_queue.put(json.loads(msg))
            except Exception as e:
                print("[mp] bad msg:", e)
        def on_error(ws, err):
            _mp_queue.put({"event": "ws:error", "error": str(err)})
        def on_close(ws, *a):
            _mp_queue.put({"event": "ws:closed"})
        def on_open(ws):
            _mp_queue.put({"event": "ws:open"})
        _mp_ws = websocket.WebSocketApp(
            url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )
        _mp_ws.run_forever(ping_interval=20, ping_timeout=8)

    def mp_connect(room_code, role):
        global _mp_enabled, _mp_room, _mp_role, _mp_thread
        if not websocket:
            return False
        if _mp_enabled:
            return True
        _mp_room = room_code
        _mp_role = role
        _mp_enabled = True
        url = "ws://{server}/renpy?room={code}&role={role}".format(
            server=_mp_server, code=room_code, role=role
        )
        _mp_thread = threading.Thread(target=_ws_thread, args=(url,), daemon=True)
        _mp_thread.start()
        print("[mp] connecting", url)
        # Update Discord RPC if available
        try:
            rpc_update(
                details="Salon " + str(room_code),
                state="En jeu (" + str(role) + ")",
                join_secret=str(room_code),
            )
        except Exception:
            pass
        return True

    def mp_disconnect():
        global _mp_enabled, _mp_ws
        _mp_enabled = False
        try:
            if _mp_ws:
                _mp_ws.close()
        except Exception:
            pass
        _mp_ws = None
        try:
            rpc_update(details="Au menu principal", state="DDLC Together",
                       party_size=None, party_max=None, join_secret=None)
        except Exception:
            pass

    def mp_send(event, **data):
        if not _mp_enabled or _mp_ws is None:
            return
        payload = dict(data)
        payload["event"] = event
        try:
            _mp_ws.send(json.dumps(payload))
        except Exception as e:
            print("[mp] send failed:", e)

    def mp_poll():
        msgs = []
        while not _mp_queue.empty():
            try:
                msgs.append(_mp_queue.get_nowait())
            except Exception:
                break
        return msgs

    def mp_active():
        return _mp_enabled and _mp_ws is not None
