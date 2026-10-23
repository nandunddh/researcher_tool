; =====================================================================
; Inno Setup Script: SciProspect (Evaluation Edition)
; =====================================================================
; Generates a single SciProspect_Setup.exe that:
; 1. Asks user to choose their destination folder.
; 2. Installs all required files and assets.
; 3. Creates a Desktop Shortcut icon.
; 4. Launches the dashboard automatically on finish.
; =====================================================================

[Setup]
AppName=SciProspect
AppVersion=1.0 Evaluation (7-Day Trial)
AppPublisher=SciProspect Data Intelligence
DefaultDirName={autopf}\SciProspect
; DisableDirPage=no ensures the user is ALWAYS prompted to select their folder:
DisableDirPage=no
DefaultGroupName=SciProspect
OutputDir=dist_installer
OutputBaseFilename=SciProspect_Setup
Compression=lzma2/max
SolidCompression=yes
; PrivilegesRequired=lowest allows normal non-admin user installation:
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\SciProspect.exe
SetupIconFile=..\static\favicon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Packages the entire compiled dist directory into the setup:
Source: "dist\SciProspect\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Creates Desktop icon:
Name: "{autodesktop}\SciProspect"; Filename: "{app}\SciProspect.exe"; Tasks: desktopicon
; Creates Start Menu icons:
Name: "{group}\SciProspect"; Filename: "{app}\SciProspect.exe"
Name: "{group}\Uninstall SciProspect"; Filename: "{uninstallexe}"

[Run]
; Auto-launch after finish:
Filename: "{app}\SciProspect.exe"; Description: "Launch SciProspect now"; Flags: nowait postinstall skipifsilent
