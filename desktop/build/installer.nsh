; Bigglenet before 0.4 (built with Tauri) installed itself in its own folder. Remove it first, so
; there's one Bigglenet. Its data stays: 0.4 brings that over when it first starts.
!macro customInit
  IfFileExists "$LOCALAPPDATA\Bigglenet\uninstall.exe" 0 +4
    ExecWait '"$LOCALAPPDATA\Bigglenet\uninstall.exe" /S _?=$LOCALAPPDATA\Bigglenet'
    Delete "$LOCALAPPDATA\Bigglenet\uninstall.exe"
    RMDir "$LOCALAPPDATA\Bigglenet"
!macroend
