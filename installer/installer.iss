; DDLC Together — Inno Setup script
; Compile on Windows with Inno Setup 6 (iscc.exe installer.iss)
; Produces:  build\DDLCTogether-Setup.exe

#define MyAppName        "DDLC Together"
#define MyAppVersion     "1.0.0"
#define MyAppPublisher   "DDLC Together Project"
#define MyAppExeName     "launcher.exe"
#define MyAppId          "{{8B6C2A41-9F2E-4B9F-9C7E-DDLC-TOGETHER}}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\DDLCTogether
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=no
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
OutputDir=..\build
OutputBaseFilename=DDLCTogether-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
LicenseFile=assets\LICENSE.txt
WizardImageFile=assets\wizard.bmp
WizardSmallImageFile=assets\wizard_small.bmp

[Languages]
Name: "french";  MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le bureau"; GroupDescription: "Raccourcis :"
Name: "startmenuicon"; Description: "Créer un raccourci dans le menu démarrer"; GroupDescription: "Raccourcis :"

[Files]
; Game (Ren'Py distribution built by build.bat / build.sh)
Source: "..\build\game\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Native helpers (PyInstaller output)
Source: "..\build\launcher.exe";       DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\overlay_window.exe"; DestDir: "{app}"; Flags: ignoreversion

; Standalone Node server (pkg output)
Source: "..\build\server-win.exe"; DestDir: "{app}"; DestName: "server.exe"; Flags: ignoreversion

; Edge WebView2 runtime bootstrapper (downloaded by build.bat)
Source: "vendor\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName}";            Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\icon.ico"; Tasks: startmenuicon
Name: "{group}\Désinstaller {#MyAppName}"; Filename: "{uninstallexe}"; Tasks: startmenuicon
Name: "{autodesktop}\{#MyAppName}";      Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\icon.ico"; Tasks: desktopicon

[Run]
; Install Edge WebView2 runtime silently (skipped if already present)
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; \
    StatusMsg: "Installation du moteur Edge WebView2 (requis par l'overlay)…"; \
    Flags: waituntilterminated skipifsilent runhidden
; Launch the game
Filename: "{app}\{#MyAppExeName}"; Description: "Lancer {#MyAppName} maintenant"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\save"
Type: filesandordirs; Name: "{app}\log.txt"
