!define APPNAME "Accessible Audiobook Player"
!define COMPANYNAME "Hamsa Jaisal"
!define DESCRIPTION "Accessibility-first audiobook and music player"
!define VERSIONMAJOR 1
!define VERSIONMINOR 1
!define VERSIONBUILD 0

# Output File Name
OutFile "dist\AccessibleAudiobookPlayer-Setup.exe"

# Default Installation Directory
InstallDir "$PROGRAMFILES\AccessibleAudiobookPlayer"

# Registry key to check for directory
InstallDirRegKey HKLM "Software\${APPNAME}" ""

# Request administrator privileges
RequestExecutionLevel admin

Page directory
Page instfiles

Section "Install"
  # Set output path to installation directory
  SetOutPath $INSTDIR
  
  # Files to include
  File "dist\AccessibleAudiobookPlayer.exe"
  
  # Write the installation path into the registry
  WriteRegStr HKLM "Software\${APPNAME}" "" $INSTDIR
  
  # Write the uninstall keys for Windows
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" '"$INSTDIR\AccessibleAudiobookPlayer.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${COMPANYNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}"
  
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  # Create shortcuts
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\AccessibleAudiobookPlayer.exe" "" "$INSTDIR\AccessibleAudiobookPlayer.exe" 0
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\AccessibleAudiobookPlayer.exe" "" "$INSTDIR\AccessibleAudiobookPlayer.exe" 0
SectionEnd

Section "Uninstall"
  # Remove shortcuts
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  
  # Remove files and uninstaller
  Delete "$INSTDIR\AccessibleAudiobookPlayer.exe"
  Delete "$INSTDIR\uninstall.exe"
  
  # Remove directory
  RMDir "$INSTDIR"
  
  # Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegKey HKLM "Software\${APPNAME}"
SectionEnd
