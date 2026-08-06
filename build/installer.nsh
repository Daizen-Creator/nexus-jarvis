; Tema escuro do instalador NEXUS. O electron-builder já define algumas cores;
; por isso removemos (!undef) antes de redefinir, senão dá "already defined".

!macro customHeader
  !undef MUI_BGCOLOR
  !define MUI_BGCOLOR "0A0C14"
  !undef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "7DF9FF"
!macroend
