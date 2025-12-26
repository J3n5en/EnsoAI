; Custom NSIS script for EnsoAI
; Register enso:// URL scheme

!macro customInstall
  ; Register URL protocol
  WriteRegStr HKCU "Software\Classes\enso" "" "URL:EnsoAI Protocol"
  WriteRegStr HKCU "Software\Classes\enso" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\enso\shell\open\command" "" '"$INSTDIR\EnsoAI.exe" "%1"'
!macroend

!macro customUnInstall
  ; Remove URL protocol registration
  DeleteRegKey HKCU "Software\Classes\enso"
!macroend
