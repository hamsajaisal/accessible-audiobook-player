!include "MUI2.nsh"

!define APPNAME "Accessible Audiobook Player"
!define COMPANYNAME "Hamsa Jaisal"
!define DESCRIPTION "Accessibility-first audiobook and music player"
!define VERSIONMAJOR 1
!define VERSIONMINOR 1
!define VERSIONBUILD 3

Name "${APPNAME}"
OutFile "dist\AccessibleAudiobookPlayer-Setup.exe"
InstallDir "$PROGRAMFILES\AccessibleAudiobookPlayer"
InstallDirRegKey HKLM "Software\${APPNAME}" ""
RequestExecutionLevel admin

; MUI Settings
!define MUI_ABORTWARNING

; MUI Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Language files
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath $INSTDIR
  File "dist\AccessibleAudiobookPlayer.exe"
  
  WriteRegStr HKLM "Software\${APPNAME}" "" $INSTDIR
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" '"$INSTDIR\AccessibleAudiobookPlayer.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${COMPANYNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}"
  
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\AccessibleAudiobookPlayer.exe" "" "$INSTDIR\AccessibleAudiobookPlayer.exe" 0
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\AccessibleAudiobookPlayer.exe" "" "$INSTDIR\AccessibleAudiobookPlayer.exe" 0
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$INSTDIR\AccessibleAudiobookPlayer.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegKey HKLM "Software\${APPNAME}"
SectionEnd
