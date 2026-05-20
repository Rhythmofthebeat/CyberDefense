; Cyber Defense Agent — Windows NSIS Installer
; Requires: NSIS 3.x (https://nsis.sourceforge.io)
; Build: makensis installer/windows/installer.nsi

!define APP_NAME      "Cyber Defense Agent"
!define APP_VERSION   "1.0.0"
!define APP_EXE       "cyber-defense-agent.exe"
!define SERVICE_NAME  "CyberDefenseAgent"
!define PUBLISHER     "Cyber Defense Command"
!define INSTALL_DIR   "$PROGRAMFILES64\CyberDefenseAgent"
!define CONFIG_DIR    "$APPDATA\CyberDefense"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CyberDefenseAgent"

Name          "${APP_NAME} ${APP_VERSION}"
OutFile       "..\..\dist\CyberDefenseAgent-${APP_VERSION}-Setup.exe"
InstallDir    "${INSTALL_DIR}"
RequestExecutionLevel admin
SetCompressor lzma

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Pages
Var ServerUrl
Var ApiKey
Var DeviceName
Var Dialog
Var ServerLabel
Var ServerInput
Var KeyLabel
Var KeyInput
Var NameLabel
Var NameInput

!insertmacro MUI_PAGE_WELCOME
Page custom ConfigPage ConfigPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Config page ───────────────────────────────────────────────────────────────
Function ConfigPage
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 10u 100% 12u "Central Server URL:"
  Pop $ServerLabel
  ${NSD_CreateText} 0 25u 100% 14u "http://3.230.151.229:4001"
  Pop $ServerInput

  ${NSD_CreateLabel} 0 50u 100% 12u "API Key:"
  Pop $KeyLabel
  ${NSD_CreatePassword} 0 65u 100% 14u "56cb6cdfe9e41523b3368d139755c3fcb2d6a86e4d4be04af512bf8ac37117f5"
  Pop $KeyInput

  ${NSD_CreateLabel} 0 90u 100% 12u "Device Name (optional):"
  Pop $NameLabel
  ${NSD_CreateText} 0 105u 100% 14u "$COMPUTERNAME"
  Pop $NameInput

  nsDialogs::Show
FunctionEnd

Function ConfigPageLeave
  ${NSD_GetText} $ServerInput $ServerUrl
  ${NSD_GetText} $KeyInput $ApiKey
  ${NSD_GetText} $NameInput $DeviceName
  ${If} $ServerUrl == ""
    MessageBox MB_OK "Please enter the server URL."
    Abort
  ${EndIf}
  ${If} $ApiKey == ""
    MessageBox MB_OK "Please enter the API key."
    Abort
  ${EndIf}
FunctionEnd

; ── Install ───────────────────────────────────────────────────────────────────
Section "Install"
  SetOutPath "${INSTALL_DIR}"

  ; Stop existing service
  ExecWait 'sc stop "${SERVICE_NAME}"' $0
  Sleep 2000

  ; Copy binary
  File "..\..\dist\cyber-defense-agent-win32-x64.exe"
  Rename "${INSTALL_DIR}\cyber-defense-agent-win32-x64.exe" "${INSTALL_DIR}\${APP_EXE}"

  ; Write config
  CreateDirectory "${CONFIG_DIR}"
  FileOpen $0 "${CONFIG_DIR}\config.json" w
  FileWrite $0 '{"serverUrl":"$ServerUrl","apiKey":"$ApiKey","deviceId":"$COMPUTERNAME-${__DATE__}","deviceName":"$DeviceName","intervalSec":30}'
  FileClose $0

  ; Install as Windows service using sc.exe
  ExecWait 'sc create "${SERVICE_NAME}" binPath= "${INSTALL_DIR}\${APP_EXE}" start= auto DisplayName= "${APP_NAME}"' $0
  ExecWait 'sc description "${SERVICE_NAME}" "System monitor for Cyber Defense Command dashboard"' $0
  ExecWait 'sc start "${SERVICE_NAME}"' $0

  ; Add to Add/Remove Programs
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayName"      "${APP_NAME}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayVersion"    "${APP_VERSION}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "Publisher"         "${PUBLISHER}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "UninstallString"   "${INSTALL_DIR}\uninstall.exe"
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify"          1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair"          1
  WriteUninstaller "${INSTALL_DIR}\uninstall.exe"

SectionEnd

; ── Uninstall ─────────────────────────────────────────────────────────────────
Section "Uninstall"
  ExecWait 'sc stop "${SERVICE_NAME}"'
  Sleep 2000
  ExecWait 'sc delete "${SERVICE_NAME}"'

  Delete "${INSTALL_DIR}\${APP_EXE}"
  Delete "${INSTALL_DIR}\uninstall.exe"
  RMDir  "${INSTALL_DIR}"
  RMDir  "${CONFIG_DIR}"

  DeleteRegKey HKLM "${UNINSTALL_KEY}"
SectionEnd
