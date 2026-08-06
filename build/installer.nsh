; Tema do instalador NEXUS — cores escuras estilo Sistema (Solo Leveling) / Stark.
; electron-builder injeta este arquivo nos hooks do NSIS.

!macro customHeader
  ; Fundo e texto das páginas do assistente.
  !define MUI_BGCOLOR "0A0C14"
  !define MUI_TEXTCOLOR "9EEBFF"
  !define MUI_LICENSEPAGE_BGCOLOR "0A0C14"
  !define MUI_INSTFILESPAGE_COLORS "9EEBFF 0A0C14"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "NEXUS // SISTEMA"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "Inicializando o nucleo J.A.R.V.I.S.$\r$\n$\r$\nEste assistente vai instalar o NEXUS nesta maquina. Voce podera escolher a pasta de destino na proxima etapa.$\r$\n$\r$\nPressione AVANCAR para sincronizar."
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "NUCLEO ONLINE"
  !define MUI_FINISHPAGE_TEXT "O NEXUS foi instalado. Sistemas prontos, Senhor.$\r$\n$\r$\nA esfera J.A.R.V.I.S. aguarda sua ordem."
  !define MUI_FINISHPAGE_RUN_TEXT "Iniciar o NEXUS agora"
!macroend
