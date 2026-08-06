# Gera a arte do instalador NEXUS no tema Solo Leveling / Stark.
# Saídas: build/installerSidebar.bmp, build/installerHeader.bmp, build/icon.ico
Add-Type -AssemblyName System.Drawing

$build = Join-Path $PSScriptRoot '..\build'
New-Item -ItemType Directory -Force -Path $build | Out-Null

$cyan = [System.Drawing.Color]::FromArgb(0, 212, 255)
$gold = [System.Drawing.Color]::FromArgb(255, 176, 32)
$ice  = [System.Drawing.Color]::FromArgb(232, 246, 255)

function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $b = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
    [System.Drawing.Color]::FromArgb(10, 12, 20),
    [System.Drawing.Color]::FromArgb(3, 4, 8), 90)
  $g.FillRectangle($b, $rect)
  return @($bmp, $g)
}

function Draw-Reactor($g, $cx, $cy, $scale) {
  for ($i = 0; $i -lt 5; $i++) {
    $r = (26 + $i * 9) * $scale
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb([int](130 - $i * 20), 0, 212, 255), 1.4)
    $g.DrawEllipse($pen, $cx - $r, $cy - $r, $r * 2, $r * 2)
  }
  for ($a = 0; $a -lt 360; $a += 12) {
    $rad = $a * [Math]::PI / 180
    $r1 = 50 * $scale; $r2 = 58 * $scale
    $long = ($a % 36) -eq 0
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb($(if ($long) { 200 } else { 90 }), 0, 212, 255), $(if ($long) { 1.6 } else { 0.9 }))
    $g.DrawLine($pen, $cx + [Math]::Cos($rad) * $r1, $cy + [Math]::Sin($rad) * $r1, $cx + [Math]::Cos($rad) * $r2, $cy + [Math]::Sin($rad) * $r2)
  }
  $penG = New-Object System.Drawing.Pen($gold, 2.2)
  $t = 20 * $scale
  $pts = @(
    (New-Object System.Drawing.PointF($cx, $cy - $t)),
    (New-Object System.Drawing.PointF($cx + $t * 0.9, $cy + $t * 0.6)),
    (New-Object System.Drawing.PointF($cx - $t * 0.9, $cy + $t * 0.6))
  )
  $g.DrawPolygon($penG, $pts)
  $brW = New-Object System.Drawing.SolidBrush($ice)
  $g.FillEllipse($brW, $cx - 4 * $scale, $cy - 4 * $scale, 8 * $scale, 8 * $scale)
}

# ---- Sidebar 164 x 314 (páginas de boas-vindas/fim) ----
$r = New-Canvas 164 314
$bmp = $r[0]; $g = $r[1]
Draw-Reactor $g 82 115 1.0
$g.DrawString('NEXUS', (New-Object System.Drawing.Font('Arial Black', 21, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush($ice)), 8, 210)
$g.DrawString('// SISTEMA', (New-Object System.Drawing.Font('Consolas', 9)), (New-Object System.Drawing.SolidBrush($cyan)), 11, 245)
$g.DrawString('J.A.R.V.I.S. PROTOCOL', (New-Object System.Drawing.Font('Consolas', 7)), (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 125, 249, 255))), 11, 264)
for ($i = 0; $i -lt 6; $i++) {
  $g.DrawLine((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 0, 212, 255), 1)), 11, 284 + $i * 4, (40 + $i * 15), 284 + $i * 4)
}
$g.Dispose()
$bmp.Save((Join-Path $build 'installerSidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()

# ---- Header 150 x 57 (topo das páginas internas) ----
$r = New-Canvas 150 57
$bmp = $r[0]; $g = $r[1]
Draw-Reactor $g 26 28 0.42
$g.DrawString('NEXUS', (New-Object System.Drawing.Font('Arial Black', 12, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush($ice)), 52, 12)
$g.DrawString('SISTEMA', (New-Object System.Drawing.Font('Consolas', 7)), (New-Object System.Drawing.SolidBrush($cyan)), 54, 32)
$g.Dispose()
$bmp.Save((Join-Path $build 'installerHeader.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()

# ---- Ícone 256x256 -> PNG embutido em .ico ----
$icoBmp = New-Object System.Drawing.Bitmap(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($icoBmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(255, 5, 6, 12))
Draw-Reactor $g 128 128 2.2
$g.Dispose()
$png = Join-Path $build 'icon.png'
$icoBmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$icoBmp.Dispose()

# Empacota o PNG num container .ico (Windows aceita PNG dentro de ICO)
$pngBytes = [System.IO.File]::ReadAllBytes($png)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)
$bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([Byte]0)
$bw.Write([UInt16]1); $bw.Write([UInt16]32)
$bw.Write([UInt32]$pngBytes.Length); $bw.Write([UInt32]22)
$bw.Write($pngBytes)
[System.IO.File]::WriteAllBytes((Join-Path $build 'icon.ico'), $ms.ToArray())
$bw.Dispose()

Write-Output "Arte do instalador gerada em build/"
Get-ChildItem $build | Select-Object Name, Length | Format-Table -AutoSize | Out-String
