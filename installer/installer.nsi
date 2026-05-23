; DDLC Together — NSIS installer script
; Compile with:  makensis -V2 installer.nsi
; Produces:     ../build/DDLCTogether-Setup.exe

!define APPNAME       "DDLC Together"
!define APPVERSION    "1.0.0"
!define APPPUBLISHER  "DDLC Together Project"
!define APPEXENAME    "DDLCTogether.exe"
!define APPID         "DDLCTogether"
!define UNINSTKEY     "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}"

Unicode true
Name              "${APPNAME}"
OutFile           "..\build\DDLCTogether-Setup.exe"
InstallDir        "$PROGRAMFILES64\DDLCTogether"
InstallDirRegKey  HKLM "Software\${APPID}" "InstallDir"
RequestExecutionLevel admin
SetCompressor     /SOLID lzma
ShowInstDetails   show
ShowUninstDetails show
BrandingText      "${APPPUBLISHER}"
VIProductVersion  "1.0.0.0"
VIAddVersionKey   ProductName    "${APPNAME}"
VIAddVersionKey   ProductVersion "${APPVERSION}"
VIAddVersionKey   CompanyName    "${APPPUBLISHER}"
VIAddVersionKey   FileDescription "${APPNAME} installer"
VIAddVersionKey   FileVersion    "1.0.0.0"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON   "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"

; --- Pages -----------------------------------------------------------------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "assets\LICENSE.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXENAME}"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "English"

; --- Sections --------------------------------------------------------------

Section "DDLC Together (jeu + serveur)" SecCore
    SectionIn RO  ; required
    SetOutPath  "$INSTDIR"

    ; Ren'Py modded game distribution
    File /r "..\build\renpy_dist\DDLCTogether-1.0-pc\*"

    ; Launcher (orchestrator) — sits next to DDLCTogether.exe
    File /oname=DDLCTogetherLauncher.exe "..\build\launcher.exe"

    ; Embedded Node.js server
    File "..\build\server.exe"

    ; Icon
    File "/oname=app.ico" "assets\icon.ico"

    ; Registry uninstall info
    WriteRegStr HKLM "Software\${APPID}" "InstallDir" "$INSTDIR"
    WriteRegStr HKLM "${UNINSTKEY}" "DisplayName"     "${APPNAME}"
    WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion"  "${APPVERSION}"
    WriteRegStr HKLM "${UNINSTKEY}" "Publisher"       "${APPPUBLISHER}"
    WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon"     "$INSTDIR\app.ico"
    WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
    WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
    WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1

    ; --- ddlctgthr:// URL protocol handler ---
    WriteRegStr HKCR "ddlctgthr"                ""                 "URL:DDLC Together Protocol"
    WriteRegStr HKCR "ddlctgthr"                "URL Protocol"     ""
    WriteRegStr HKCR "ddlctgthr\DefaultIcon"    ""                 "$INSTDIR\app.ico"
    WriteRegStr HKCR "ddlctgthr\shell\open\command" "" '"$INSTDIR\DDLCTogetherLauncher.exe" "%1"'

    WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Raccourci sur le bureau" SecDesktop
    CreateShortCut "$DESKTOP\${APPNAME}.lnk" \
        "$INSTDIR\DDLCTogetherLauncher.exe" "" "$INSTDIR\app.ico" 0
SectionEnd

Section "Raccourci dans le menu démarrer" SecStartMenu
    CreateDirectory "$SMPROGRAMS\${APPNAME}"
    CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" \
        "$INSTDIR\DDLCTogetherLauncher.exe" "" "$INSTDIR\app.ico" 0
    CreateShortCut "$SMPROGRAMS\${APPNAME}\Désinstaller ${APPNAME}.lnk" \
        "$INSTDIR\Uninstall.exe"
SectionEnd

; --- Section descriptions (tooltip in MUI) --------------------------------
LangString DESC_SecCore      ${LANG_FRENCH} "Le jeu DDLC modifié + le serveur multijoueur local"
LangString DESC_SecDesktop   ${LANG_FRENCH} "Créer une icône sur le bureau"
LangString DESC_SecStartMenu ${LANG_FRENCH} "Ajouter au menu démarrer"
LangString DESC_SecCore      ${LANG_ENGLISH} "The modded DDLC game + local multiplayer server"
LangString DESC_SecDesktop   ${LANG_ENGLISH} "Create desktop shortcut"
LangString DESC_SecStartMenu ${LANG_ENGLISH} "Add to start menu"

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
    !insertmacro MUI_DESCRIPTION_TEXT ${SecCore}      $(DESC_SecCore)
    !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop}   $(DESC_SecDesktop)
    !insertmacro MUI_DESCRIPTION_TEXT ${SecStartMenu} $(DESC_SecStartMenu)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; --- Uninstaller -----------------------------------------------------------
Section "Uninstall"
    ; Kill server / game if running
    nsExec::Exec 'taskkill /F /IM "server.exe"'
    nsExec::Exec 'taskkill /F /IM "DDLCTogether.exe"'
    nsExec::Exec 'taskkill /F /IM "DDLCTogetherLauncher.exe"'
    Sleep 500

    RMDir /r "$INSTDIR\lib"
    RMDir /r "$INSTDIR\renpy"
    RMDir /r "$INSTDIR\game"
    Delete  "$INSTDIR\DDLCTogether.exe"
    Delete  "$INSTDIR\DDLCTogether.py"
    Delete  "$INSTDIR\DDLCTogetherLauncher.exe"
    Delete  "$INSTDIR\server.exe"
    Delete  "$INSTDIR\app.ico"
    Delete  "$INSTDIR\LICENSE.txt"
    Delete  "$INSTDIR\Uninstall.exe"
    Delete  "$INSTDIR\log.txt"
    RMDir   "$INSTDIR"

    Delete "$DESKTOP\${APPNAME}.lnk"
    RMDir /r "$SMPROGRAMS\${APPNAME}"

    DeleteRegKey HKCR "ddlctgthr"
    DeleteRegKey HKLM "${UNINSTKEY}"
    DeleteRegKey HKLM "Software\${APPID}"
SectionEnd
