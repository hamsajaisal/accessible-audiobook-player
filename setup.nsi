!include "MUI2.nsh"

!define APPNAME "Accessible Audiobook Player"
!define COMPANYNAME "Hamsa Jaisal"
!define DESCRIPTION "Accessibility-first audiobook and music player"
!define VERSIONMAJOR 1
!define VERSIONMINOR 1
!define VERSIONBUILD 5

Name "${APPNAME}"
OutFile "dist\AccessibleAudiobookPlayer-Setup.exe"
InstallDir "$PROGRAMFILES\AccessibleAudiobookPlayer"
InstallDirRegKey HKLM "Software\${APPNAME}" ""
RequestExecutionLevel admin

; MUI Settings
!define MUI_ABORTWARNING

; MUI Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

; Finish page option to launch the app
!define MUI_FINISHPAGE_RUN "$INSTDIR\AccessibleAudiobookPlayer.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APPNAME}"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Language files
!insertmacro MUI_LANGUAGE "English"

Section "Accessible Audiobook Player (Required)" SecApp
  SectionIn RO
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

  # File associations for Open With
  WriteRegStr HKLM "Software\Classes\AccessibleAudiobookPlayer.AssocFile" "" "Accessible Audio File"
  WriteRegStr HKLM "Software\Classes\AccessibleAudiobookPlayer.AssocFile\shell\open\command" "" '"$INSTDIR\AccessibleAudiobookPlayer.exe" "%1"'
  WriteRegStr HKLM "Software\Classes\AccessibleAudiobookPlayer.AssocFile\DefaultIcon" "" '"$INSTDIR\AccessibleAudiobookPlayer.exe",0'

  # Register ProgID for extensions
  WriteRegStr HKLM "Software\Classes\.mp3\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile" ""
  WriteRegStr HKLM "Software\Classes\.wav\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile" ""
  WriteRegStr HKLM "Software\Classes\.flac\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile" ""
  WriteRegStr HKLM "Software\Classes\.m4a\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile" ""
  WriteRegStr HKLM "Software\Classes\.m4b\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile" ""
  WriteRegStr HKLM "Software\Classes\.ogg\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile" ""
  WriteRegStr HKLM "Software\Classes\.opus\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile" ""
  
  # Notify shell of changes
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
SectionEnd

Section "Create Desktop Shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\AccessibleAudiobookPlayer.exe" "" "$INSTDIR\AccessibleAudiobookPlayer.exe" 0
SectionEnd

; Descriptions
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecApp} "Installs the core files for Accessible Audiobook Player."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Creates a shortcut to launch the app from your desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  
  Delete "$INSTDIR\AccessibleAudiobookPlayer.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegKey HKLM "Software\${APPNAME}"

  # Clean up file associations
  DeleteRegKey HKLM "Software\Classes\AccessibleAudiobookPlayer.AssocFile"
  DeleteRegValue HKLM "Software\Classes\.mp3\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile"
  DeleteRegValue HKLM "Software\Classes\.wav\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile"
  DeleteRegValue HKLM "Software\Classes\.flac\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile"
  DeleteRegValue HKLM "Software\Classes\.m4a\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile"
  DeleteRegValue HKLM "Software\Classes\.m4b\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile"
  DeleteRegValue HKLM "Software\Classes\.ogg\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile"
  DeleteRegValue HKLM "Software\Classes\.opus\OpenWithProgids" "AccessibleAudiobookPlayer.AssocFile"
  
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
SectionEnd
