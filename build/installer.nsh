!macro customPageAfterChangeDir
  Page custom ensureTaskTrackInstallDir
!macroend

Function ensureTaskTrackInstallDir
  StrCpy $0 $INSTDIR 11 -11
  StrCmp $0 "\task track" done
  StrCpy $0 $INSTDIR 10 -10
  StrCmp $0 "task track" done
  StrCpy $1 $INSTDIR 1 -1
  StrCmp $1 "\" appendWithoutSlash appendWithSlash

  appendWithoutSlash:
    StrCpy $INSTDIR "$INSTDIRtask track"
    Goto done

  appendWithSlash:
    StrCpy $INSTDIR "$INSTDIR\task track"

  done:
    Abort
FunctionEnd
