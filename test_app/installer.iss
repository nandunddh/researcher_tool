; =====================================================================
; Inno Setup Script: SciNexus (Evaluation Edition)
; =====================================================================
; Generates a single SciNexus_Setup.exe that:
; 1. Asks user to choose their destination folder.
; 2. Installs all required files and assets.
; 3. Creates a Desktop Shortcut icon.
; 4. Launches the dashboard automatically on finish.
; =====================================================================

[Setup]
AppName=SciNexus
AppVersion=1.0 Evaluation (7-Day Trial)
AppPublisher=SciNexus Intelligence Team
DefaultDirName={autopf}\SciNexus
; DisableDirPage=no ensures the user is ALWAYS prompted to select their folder:
DisableDirPage=no
DefaultGroupName=SciNexus
OutputDir=dist_installer
OutputBaseFilename=SciNexus_Setup
Compression=lzma2/max
SolidCompression=yes
; PrivilegesRequired=lowest allows normal non-admin user installation:
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\SciNexus.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Packages the entire compiled dist directory into the setup:
Source: "dist\SciNexus\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Creates Desktop icon:
Name: "{autodesktop}\SciNexus"; Filename: "{app}\SciNexus.exe"; Tasks: desktopicon
; Creates Start Menu icons:
Name: "{group}\SciNexus"; Filename: "{app}\SciNexus.exe"
Name: "{group}\Uninstall SciNexus"; Filename: "{uninstallexe}"

[Run]
; Auto-launch after finish:
Filename: "{app}\SciNexus.exe"; Description: "Launch SciNexus now"; Flags: nowait postinstall skipifsilent
