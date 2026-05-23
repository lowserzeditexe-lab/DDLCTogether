@echo off
:: =========================================================================
:: DDLC Together — Windows build pipeline (single click)
:: =========================================================================
:: Prerequisites (one-time install):
::   - Node.js 20+         (https://nodejs.org)
::   - Python 3.11+        (https://python.org)
::   - Inno Setup 6        (https://jrsoftware.org/isdl.php)  -> add iscc.exe to PATH
::   - Ren'Py 8.2+ SDK     (https://www.renpy.org/latest.html) -> set RENPY_SDK env var
::   - DDLC base game ZIP  (place Doki_Doki_Literature_Club.zip at vendor\)
::   - DDLCModTemplate2.0  (auto-cloned)
::
:: Run: build.bat
:: Output: build\DDLCTogether-Setup.exe
:: =========================================================================
setlocal enabledelayedexpansion
set ROOT=%~dp0
cd /d "%ROOT%"

echo === [1/7] Build React client ===
cd client
call yarn install --frozen-lockfile || goto :err
call yarn build || goto :err
cd ..

echo === [2/7] Bundle Node server -^> server-win.exe ===
cd server
call yarn install --frozen-lockfile || goto :err
call yarn build:win || goto :err
cd ..

echo === [3/7] Build PyInstaller helpers ===
python -m pip install -r launcher\requirements.txt || goto :err
python -m PyInstaller --noconfirm --onefile --windowed ^
    --name launcher --distpath build --workpath build\.work --specpath build\.spec ^
    launcher\launcher.py || goto :err
python -m PyInstaller --noconfirm --onefile --windowed ^
    --name overlay_window --distpath build --workpath build\.work --specpath build\.spec ^
    --hidden-import pywebview --hidden-import webview.platforms.edgechromium ^
    launcher\overlay_window.py || goto :err

echo === [4/7] Prepare Ren'Py distribution ===
if not exist "vendor\DDLCModTemplate2.0" (
    git clone --depth 1 https://github.com/Bronya-Rand/DDLCModTemplate2.0.git vendor\DDLCModTemplate2.0 || goto :err
)
if not exist "vendor\Doki_Doki_Literature_Club.zip" (
    echo MISSING: place the official DDLC ZIP at vendor\Doki_Doki_Literature_Club.zip
    goto :err
)

set RENPY_PROJECT=build\renpy_project
if exist "%RENPY_PROJECT%" rmdir /s /q "%RENPY_PROJECT%"
xcopy /e /i /q vendor\DDLCModTemplate2.0 "%RENPY_PROJECT%" >nul

:: Extract DDLC assets into the template's game/ folder
echo Extracting DDLC base game assets...
powershell -nologo -command ^
    "Expand-Archive -Force vendor\Doki_Doki_Literature_Club.zip vendor\ddlc_extracted" || goto :err
xcopy /y /e /q vendor\ddlc_extracted\*\game\bg            "%RENPY_PROJECT%\game\bg\" >nul 2>&1
xcopy /y /e /q vendor\ddlc_extracted\*\game\characters    "%RENPY_PROJECT%\game\characters\" >nul 2>&1
xcopy /y /e /q vendor\ddlc_extracted\*\game\audio         "%RENPY_PROJECT%\game\audio\" >nul 2>&1
xcopy /y /e /q vendor\ddlc_extracted\*\game\gui           "%RENPY_PROJECT%\game\gui\" >nul 2>&1

:: Inject our multiplayer mod
xcopy /e /i /y /q renpy_mod\game\multiplayer "%RENPY_PROJECT%\game\multiplayer\" >nul

:: Bundle websocket-client into the mod (pure-python)
python -m pip install --target "%RENPY_PROJECT%\game\multiplayer\lib" websocket-client==1.7.0 || goto :err

echo === [5/7] Build Ren'Py Windows distribution ===
if "%RENPY_SDK%"=="" set RENPY_SDK=C:\renpy-8.2.3-sdk
"%RENPY_SDK%\renpy.exe" "%RENPY_SDK%\launcher" distribute "%CD%\%RENPY_PROJECT%" --package pc --destination "%CD%\build\renpy_dist" || goto :err

:: Move flattened game files to build\game\
if exist build\game rmdir /s /q build\game
for /d %%d in (build\renpy_dist\*-pc) do xcopy /e /i /y /q "%%d" build\game >nul

echo === [6/7] Download Edge WebView2 bootstrapper ===
if not exist "installer\vendor" mkdir installer\vendor
if not exist "installer\vendor\MicrosoftEdgeWebview2Setup.exe" (
    powershell -nologo -command ^
        "Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile installer\vendor\MicrosoftEdgeWebview2Setup.exe" || goto :err
)

echo === [7/7] Build Inno Setup installer ===
iscc /Q installer\installer.iss || goto :err

echo.
echo SUCCESS — installer at build\DDLCTogether-Setup.exe
exit /b 0

:err
echo BUILD FAILED at step above (exit %errorlevel%)
exit /b 1
