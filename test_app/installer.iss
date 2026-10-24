; =====================================================================
; Inno Setup Script: SciProspect (Evaluation Edition)
; =====================================================================
; Installs application cleanly into standard C: drive Program Files,
; prompts user to choose their dedicated Lead Data Folder,
; and auto-generates config.json pointing to their chosen folder.
; =====================================================================

[Setup]
AppName=SciProspect
AppVersion=1.0 Evaluation (7-Day Trial)
AppPublisher=SciProspect Lead Intelligence
; Standard C: Drive Program Files installation:
DefaultDirName={autopf}\SciProspect
DisableDirPage=yes
DefaultGroupName=SciProspect
OutputDir=dist_installer
OutputBaseFilename=SciProspect_Setup
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\SciProspect.exe
SetupIconFile=..\static\favicon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Packages the entire compiled dist directory into C: drive app location:
Source: "dist\SciProspect\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\SciProspect"; Filename: "{app}\SciProspect.exe"; Tasks: desktopicon
Name: "{group}\SciProspect"; Filename: "{app}\SciProspect.exe"
Name: "{group}\Uninstall SciProspect"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\SciProspect.exe"; Description: "Launch SciProspect now"; Flags: nowait postinstall skipifsilent

[Code]
var
  DataDirPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  // Create user prompt for dedicated Lead Data Directory
  DataDirPage := CreateInputDirPage(
    wpSelectProgramGroup,
    'Choose Lead Data Storage Folder',
    'Where should your lead datasets, verified contacts, and search queues be stored?',
    'Select the folder where SciProspect will save extracted researcher leads and CSV files. This folder will contain only your data.',
    False,
    'SciProspect Data'
  );
  DataDirPage.Add('Lead Data Folder:');
  DataDirPage.Values[0] := ExpandConstant('{userdocs}\SciProspect Data');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath: String;
  LocalAppConfig: String;
  ConfigContent: String;
  SelectedDataDir: String;
  EscapedDir: String;
begin
  if CurStep = ssPostInstall then
  begin
    SelectedDataDir := Trim(DataDirPage.Values[0]);
    if SelectedDataDir = '' then
      SelectedDataDir := ExpandConstant('{userdocs}\SciProspect Data');
    
    // Ensure the data directory exists
    ForceDirectories(SelectedDataDir);

    // Escape backslashes for valid JSON
    EscapedDir := SelectedDataDir;
    StringChangeEx(EscapedDir, '\', '\\', True);

    ConfigContent := '{' + #13#10 +
                     '  "data_dir": "' + EscapedDir + '"' + #13#10 +
                     '}';

    // 1. Save config.json in application root folder
    ConfigPath := ExpandConstant('{app}\config.json');
    SaveStringToFile(ConfigPath, ConfigContent, False);

    // 2. Save config.json in %LOCALAPPDATA%\SciProspect\config.json
    LocalAppConfig := ExpandConstant('{localappdata}\SciProspect');
    ForceDirectories(LocalAppConfig);
    SaveStringToFile(LocalAppConfig + '\config.json', ConfigContent, False);
  end;
end;
