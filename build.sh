#!/usr/bin/env bash
# DDLC Together — Linux/Wine build pipeline
# Produces build/DDLCTogether-Setup.exe by chaining:
#   - yarn (React)
#   - pkg  (Node -> Windows .exe)
#   - Ren'Py SDK (Linux build -> Windows distribution)
#   - PyInstaller via Wine (Windows .exe helpers)
#   - Inno Setup 6 via Wine
#
# Designed to run on Ubuntu/Debian with Wine 8+ installed.
# See README.md for full setup instructions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
mkdir -p build vendor

# -------- 1. React client ----------------------------------------------------
echo "=== [1/7] Build React client ==="
( cd client && yarn install --frozen-lockfile && yarn build )

# -------- 2. Node server -> server-win.exe -----------------------------------
echo "=== [2/7] Bundle Node server ==="
( cd server && yarn install --frozen-lockfile && yarn build:win )

# -------- 3. PyInstaller helpers (via Wine) ----------------------------------
echo "=== [3/7] PyInstaller helpers ==="
if ! command -v wine >/dev/null; then
    echo "WARN: wine not installed — skipping helper EXEs"
    echo "      Install on Debian/Ubuntu:  sudo apt install wine winetricks"
    echo "      Then re-run this script."
else
    # Use a portable Python-for-Windows inside Wine
    WPY="$HOME/.wine/drive_c/Python311/python.exe"
    if [ ! -f "$WPY" ]; then
        echo "Download Python-3.11.9-amd64.exe into vendor/ and install via:"
        echo "  wine vendor/python-3.11.9-amd64.exe /quiet InstallAllUsers=1 PrependPath=1"
    fi
    wine "$WPY" -m pip install -r launcher/requirements.txt
    wine "$WPY" -m PyInstaller --noconfirm --onefile --windowed \
        --name launcher --distpath build --workpath build/.work --specpath build/.spec \
        launcher/launcher.py
    wine "$WPY" -m PyInstaller --noconfirm --onefile --windowed \
        --name overlay_window --distpath build --workpath build/.work --specpath build/.spec \
        --hidden-import pywebview --hidden-import webview.platforms.edgechromium \
        launcher/overlay_window.py
fi

# -------- 4. Prepare Ren'Py project ------------------------------------------
echo "=== [4/7] Prepare Ren'Py project ==="
if [ ! -d vendor/DDLCModTemplate2.0 ]; then
    git clone --depth 1 https://github.com/Bronya-Rand/DDLCModTemplate2.0.git vendor/DDLCModTemplate2.0
fi
if [ ! -f vendor/Doki_Doki_Literature_Club.zip ]; then
    echo "ERROR: place the official DDLC ZIP at vendor/Doki_Doki_Literature_Club.zip"
    exit 1
fi
rm -rf build/renpy_project
cp -r vendor/DDLCModTemplate2.0 build/renpy_project

# Extract DDLC assets
rm -rf vendor/ddlc_extracted && mkdir -p vendor/ddlc_extracted
unzip -q vendor/Doki_Doki_Literature_Club.zip -d vendor/ddlc_extracted
DDLC_GAME_DIR="$(find vendor/ddlc_extracted -type d -name game | head -n1)"
# Per DDLCModTemplate2.0 README: copy ONLY audio/fonts/images.rpa, NEVER scripts.rpa
# (scripts.rpa contains the legacy DDLC compiled definitions.rpyc which imports
#  the unavailable `singleton` module).  The mod template provides its own
#  definitions/screens/script files which replace what scripts.rpa contained.
for sub in bg characters audio gui; do
    if [ -d "$DDLC_GAME_DIR/$sub" ]; then
        cp -r "$DDLC_GAME_DIR/$sub" build/renpy_project/game/
    fi
done
for rpa in audio fonts images; do
    src="$(find vendor/ddlc_extracted -maxdepth 3 -name "${rpa}.rpa" | head -n1)"
    if [ -f "$src" ]; then
        cp "$src" build/renpy_project/game/
    fi
done

# Inject mod files
mkdir -p build/renpy_project/game/multiplayer
cp -r renpy_mod/game/multiplayer/. build/renpy_project/game/multiplayer/
# Compat shim for PEP 604 / `str | None` in DDLCModTemplate2.0 (Ren'Py 8.3
# ships Python 3.9.10 — see /app/renpy_mod/game/00_compat_ren.py).
cp renpy_mod/game/00_compat_ren.py build/renpy_project/game/

# Patch screens.rpy to insert the "Multijoueur" textbutton in the
# `navigation` screen, right after the "Quit" button (only visible while
# the main menu is showing).  We patch the file content directly because
# `config.overlay_screens` and `config.main_menu` are NOT shown during
# the main-menu screen in Ren'Py 8.x.
python3 - <<'PYEOF'
path = 'build/renpy_project/game/screens.rpy'
needle = 'textbutton _("Quit") action Quit(confirm=not main_menu)'
addition = (
    '\r\n\r\n'
    '            ## DDLC Together — Multijoueur (visible only on main menu).\r\n'
    '            if main_menu:\r\n'
    '                textbutton _("Multijoueur") action Jump("MultiplayerEntry")'
)
with open(path, 'rb') as f:
    src = f.read().decode('utf-8')
if 'MultiplayerEntry' not in src and needle in src:
    src = src.replace(needle, needle + addition, 1)
    with open(path, 'wb') as f:
        f.write(src.encode('utf-8'))
    print("patched screens.rpy with Multijoueur button")
else:
    print("screens.rpy already patched or needle missing")
PYEOF

# Pure-python websocket-client bundled inside the game folder
python3 -m pip install --target build/renpy_project/game/multiplayer/lib websocket-client==1.7.0

# -------- 5. Ren'Py distribution ---------------------------------------------
echo "=== [5/7] Build Ren'Py Windows distribution ==="
if [ -z "${RENPY_SDK:-}" ] || [ ! -x "$RENPY_SDK/renpy.sh" ]; then
    echo "ERROR: set RENPY_SDK to your Ren'Py SDK install dir."
    echo "       Download from https://www.renpy.org/latest.html and extract."
    exit 1
fi
"$RENPY_SDK/renpy.sh" "$RENPY_SDK/launcher" distribute \
    "$ROOT/build/renpy_project" --package pc --destination "$ROOT/build/renpy_dist"

rm -rf build/game
DIST_DIR="$(find build/renpy_dist -maxdepth 1 -type d -name '*-pc' | head -n1)"
cp -r "$DIST_DIR" build/game

# -------- 6. Download Edge WebView2 bootstrapper -----------------------------
mkdir -p installer/vendor
if [ ! -f installer/vendor/MicrosoftEdgeWebview2Setup.exe ]; then
    curl -L 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' \
        -o installer/vendor/MicrosoftEdgeWebview2Setup.exe
fi

# -------- 7. Inno Setup via Wine ---------------------------------------------
echo "=== [7/7] Compile installer with Inno Setup (Wine) ==="
ISCC_WIN_PATH='C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe'
ISCC_LOCAL="$HOME/.wine/drive_c/Program Files (x86)/Inno Setup 6/ISCC.exe"
if [ ! -f "$ISCC_LOCAL" ]; then
    echo "ERROR: Inno Setup 6 not installed in wine prefix."
    echo "       Download innosetup-6.x.x.exe and run: wine innosetup-6.x.x.exe /VERYSILENT"
    exit 1
fi
wine "$ISCC_WIN_PATH" /Q "installer\\installer.iss"

echo
echo "SUCCESS — build/DDLCTogether-Setup.exe"
