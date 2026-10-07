; OpenVision installer additions (D51), included by electron-builder's NSIS script.
;
; Install (per-machine, elevated):
;   1. C:\ProgramData\OpenVision\{data,logs,backups} is created.
;   2. A local group "OpenVision Users" is created (skipped if it exists) and the Windows user who ran
;      the installer is added to it.
;   3. The folder's permissions are set with icacls: SYSTEM and Administrators full control,
;      "OpenVision Users" modify, inherited by everything inside, and nothing inherited from
;      ProgramData (so other Windows users cannot open it).
; Another Windows user is given access by an administrator:
;   Computer Management > Local Users and Groups > Groups > OpenVision Users > Add, or
;   net localgroup "OpenVision Users" <user name> /add
; and then signs out of Windows and back in.
;
; Uninstall keeps the data folder unless the person says otherwise (default: keep). Updates never ask.
;
; The acceptance page (nsis.license in builder.config.cjs) is the data safety notice followed by the
; Terms of Use; the person must tick the box before Next is enabled.

!define MUI_LICENSEPAGE_CHECKBOX
!define MUI_LICENSEPAGE_CHECKBOX_TEXT "I have read and accept the Terms of Use and the data safety notice"
!define MUI_LICENSEPAGE_TEXT_TOP "Please read the data safety notice and the Terms of Use."

!define OV_GROUP "OpenVision Users"

!ifndef BUILD_UNINSTALLER
  ; Runs in the installer's original (not elevated) process when UAC elevated it: the user who
  ; started the installer, which may differ from the administrator who approved it.
  Function ovOriginalUser
    ReadEnvStr $0 USERDOMAIN
    ReadEnvStr $1 USERNAME
  FunctionEnd
!endif

!macro customInstall
  ReadEnvStr $R0 ProgramData
  ${If} $R0 == ""
    StrCpy $R0 "C:\ProgramData"
  ${EndIf}
  StrCpy $R1 "$R0\OpenVision"
  CreateDirectory "$R1\data"
  CreateDirectory "$R1\logs"
  CreateDirectory "$R1\backups"

  ; The group (an error just means it exists already).
  nsExec::ExecToLog 'net localgroup "${OV_GROUP}" /add /comment:"Can use OpenVision and its data folder"'
  Pop $0

  ; The installing user.
  ${If} ${UAC_IsInnerInstance}
    !insertmacro UAC_AsUser_Call Function ovOriginalUser ${UAC_SYNCREGISTERS}
  ${Else}
    Call ovOriginalUser
  ${EndIf}
  ${If} $1 != ""
    ${If} $0 != ""
      StrCpy $R2 "$0\$1"
    ${Else}
      StrCpy $R2 "$1"
    ${EndIf}
    nsExec::ExecToLog 'net localgroup "${OV_GROUP}" "$R2" /add'
    Pop $0
    DetailPrint "Added $R2 to ${OV_GROUP} (exit $0; 2 = already a member)"
  ${EndIf}

  ; Permissions: well-known SIDs for SYSTEM (S-1-5-18) and Administrators (S-1-5-32-544) work in every Windows language.
  nsExec::ExecToLog 'icacls "$R1" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "${OV_GROUP}:(OI)(CI)M" /T /C /Q'
  Pop $0
  ${If} $0 != 0
    DetailPrint "icacls exit code $0"
    MessageBox MB_ICONEXCLAMATION|MB_OK "The permissions of $R1 could not be set (icacls exit code $0). Ask your IT support to give only Administrators, SYSTEM and the OpenVision Users group access to that folder." /SD IDOK
  ${EndIf}
!macroend

!macro customUnInstall
  ; Updates run the old version's uninstaller silently: never touch the data then.
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
    ReadEnvStr $R0 ProgramData
    ${If} $R0 == ""
      StrCpy $R0 "C:\ProgramData"
    ${EndIf}
    ${If} ${FileExists} "$R0\OpenVision\*.*"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete OpenVision's patient data and backups in $R0\OpenVision?$\r$\n$\r$\nChoose No (recommended) to keep them; a later install uses them again. Deleting cannot be undone." /SD IDNO IDYES ovDeleteData
      Goto ovKeepData
      ovDeleteData:
        MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Delete all patient records in $R0\OpenVision permanently?" /SD IDNO IDNO ovKeepData
        RMDir /r "$R0\OpenVision"
      ovKeepData:
    ${EndIf}
  ${EndIf}
!macroend
