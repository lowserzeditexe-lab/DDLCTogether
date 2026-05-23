# DDLC Together — Discord Rich Presence (pure-Python, no extra deps)
# game/multiplayer/discord_rpc.rpy
#
# Implements just enough of Discord's local-IPC protocol to advertise the
# current room state.  The connection uses the named pipe
#   \\.\pipe\discord-ipc-0..9   (Windows)
#   $XDG_RUNTIME_DIR/discord-ipc-0..9  (Linux/macOS)
# No external `discord-rpc` library required.
#
# The Discord application id below is a generic placeholder — replace it
# with your own from https://discord.com/developers/applications if you
# want a custom large image / dev branding.

init -8 python:
    import os
    import sys
    import json
    import time
    import struct
    import socket
    import threading
    import uuid

    DISCORD_APP_ID = "1234567890123456789"  # placeholder client id

    _rpc_lock     = threading.Lock()
    _rpc_sock     = None
    _rpc_thread   = None
    _rpc_enabled  = False
    _rpc_state    = {"details": "Démarrage", "state": "DDLC Together"}

    def _rpc_pipe_paths():
        """Yield candidate IPC endpoints (Discord opens up to 10)."""
        if sys.platform == "win32":
            for i in range(10):
                yield r"\\.\pipe\discord-ipc-%d" % i
        else:
            base = (os.environ.get("XDG_RUNTIME_DIR")
                    or os.environ.get("TMPDIR")
                    or "/tmp")
            for sub in ("", "snap.discord/", "app/com.discordapp.Discord/"):
                for i in range(10):
                    yield os.path.join(base, sub + "discord-ipc-%d" % i)

    def _rpc_connect():
        global _rpc_sock
        for p in _rpc_pipe_paths():
            try:
                if sys.platform == "win32":
                    # Open the named pipe as a regular file
                    f = open(p, "r+b", buffering=0)
                    _rpc_sock = ("pipe", f)
                else:
                    if not os.path.exists(p):
                        continue
                    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    s.connect(p)
                    _rpc_sock = ("sock", s)
                return True
            except Exception:
                continue
        _rpc_sock = None
        return False

    def _rpc_send(op, payload):
        if not _rpc_sock:
            return False
        data = json.dumps(payload).encode("utf-8")
        header = struct.pack("<II", op, len(data))
        kind, h = _rpc_sock
        try:
            if kind == "pipe":
                h.write(header + data)
                h.flush()
            else:
                h.sendall(header + data)
            return True
        except Exception:
            return False

    def _rpc_recv():
        if not _rpc_sock:
            return None
        kind, h = _rpc_sock
        try:
            if kind == "pipe":
                head = h.read(8)
            else:
                head = h.recv(8)
            if not head or len(head) < 8:
                return None
            op, ln = struct.unpack("<II", head)
            buf = b""
            while len(buf) < ln:
                chunk = h.read(ln - len(buf)) if kind == "pipe" else h.recv(ln - len(buf))
                if not chunk:
                    break
                buf += chunk
            return op, json.loads(buf.decode("utf-8") or "{}")
        except Exception:
            return None

    def _rpc_handshake():
        return _rpc_send(0, {"v": 1, "client_id": DISCORD_APP_ID})

    def _rpc_set_activity_locked(state, details, party_size=None, party_max=None, join_secret=None):
        if not _rpc_sock:
            return False
        activity = {
            "details": (details or "")[:128],
            "state":   (state   or "")[:128],
            "timestamps": {"start": int(time.time())},
            "assets": {
                "large_image": "logo",
                "large_text":  "DDLC Together",
            },
        }
        if party_size and party_max:
            activity["party"] = {
                "id":   "ddlctgthr-" + (join_secret or "party"),
                "size": [int(party_size), int(party_max)],
            }
            if join_secret:
                activity["secrets"] = {"join": join_secret}
        return _rpc_send(1, {
            "cmd":   "SET_ACTIVITY",
            "args":  {"pid": os.getpid(), "activity": activity},
            "nonce": uuid.uuid4().hex,
        })

    def rpc_enable():
        """Spin up Discord RPC connection.  Safe no-op if Discord is absent."""
        global _rpc_thread, _rpc_enabled
        if _rpc_enabled:
            return True
        if not _rpc_connect():
            return False
        if not _rpc_handshake():
            try:
                kind, h = _rpc_sock
                h.close()
            except Exception:
                pass
            return False
        # Drain the handshake READY frame (non-blocking best-effort)
        try:
            _rpc_recv()
        except Exception:
            pass
        _rpc_enabled = True

        def _keepalive():
            while _rpc_enabled:
                with _rpc_lock:
                    st = dict(_rpc_state)
                _rpc_set_activity_locked(
                    state=st.get("state"),
                    details=st.get("details"),
                    party_size=st.get("party_size"),
                    party_max=st.get("party_max"),
                    join_secret=st.get("join_secret"),
                )
                time.sleep(15)

        _rpc_thread = threading.Thread(target=_keepalive, daemon=True)
        _rpc_thread.start()
        return True

    def rpc_disable():
        global _rpc_enabled, _rpc_sock
        _rpc_enabled = False
        try:
            if _rpc_sock:
                kind, h = _rpc_sock
                h.close()
        except Exception:
            pass
        _rpc_sock = None

    def rpc_update(details=None, state=None, party_size=None, party_max=None, join_secret=None):
        with _rpc_lock:
            if details is not None:      _rpc_state["details"] = details
            if state is not None:        _rpc_state["state"]   = state
            if party_size is not None:   _rpc_state["party_size"] = party_size
            if party_max is not None:    _rpc_state["party_max"]  = party_max
            if join_secret is not None:  _rpc_state["join_secret"] = join_secret
        if _rpc_enabled:
            with _rpc_lock:
                st = dict(_rpc_state)
            _rpc_set_activity_locked(
                state=st.get("state"),
                details=st.get("details"),
                party_size=st.get("party_size"),
                party_max=st.get("party_max"),
                join_secret=st.get("join_secret"),
            )

    # Best-effort: try to connect at startup; ignore failure silently.
    try:
        rpc_enable()
        rpc_update(details="Au menu principal", state="DDLC Together")
    except Exception as e:
        print("[rpc] enable failed:", e)
