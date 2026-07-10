# Generates start-icon-v2.ico (blue play triangle) and stop-icon-v2.ico (red X),
# matching the style of the user's existing "Start/Stop Options Backtester"
# and "Start/Stop Stock Dashboard" desktop shortcuts.
#
# Two things the first version got wrong, fixed here:
#  1. Icon.Save() only supports a 1-bit transparency mask, so it printed a
#     white box - fixed previously by hand-building a PNG-in-ICO container.
#  2. It only had ONE 256px image, so Explorer had to downscale it on the fly
#     for the small desktop icon - this version bakes proper 16/32/48/256px
#     versions, each redrawn crisply at its own size (not just scaled).
#
# New filenames (v2) so Windows' icon cache can't serve a stale copy of the
# old file at the same path.

Add-Type -AssemblyName System.Drawing

$assetsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sizes = @(16, 32, 48, 256)

function New-TriangleBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $blue = [System.Drawing.Color]::FromArgb(255, 59, 149, 230)
    $brush = New-Object System.Drawing.SolidBrush($blue)
    $cx = $size * 0.5
    $cy = $size * 0.5
    $r = $size * 0.42
    $p1 = New-Object System.Drawing.PointF(($cx - $r * 0.55), ($cy - $r))
    $p2 = New-Object System.Drawing.PointF(($cx - $r * 0.55), ($cy + $r))
    $p3 = New-Object System.Drawing.PointF(($cx + $r * 0.95), $cy)
    $g.FillPolygon($brush, @($p1, $p2, $p3))
    $g.Dispose()
    return $bmp
}

function New-XBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $red = [System.Drawing.Color]::FromArgb(255, 237, 28, 36)
    $pen = New-Object System.Drawing.Pen($red, [Math]::Max(2, $size * 0.17))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $margin = $size * 0.22
    $g.DrawLine($pen, $margin, $margin, ($size - $margin), ($size - $margin))
    $g.DrawLine($pen, ($size - $margin), $margin, $margin, ($size - $margin))
    $g.Dispose()
    return $bmp
}

function Save-MultiResIcon([System.Drawing.Bitmap[]]$bitmaps, [int[]]$sizeList, [string]$path) {
    $pngByteArrays = New-Object System.Collections.ArrayList
    foreach ($bmp in $bitmaps) {
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        [void]$pngByteArrays.Add($ms.ToArray())
        $ms.Dispose()
    }

    $fs = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($fs)

    # ICONDIR
    $bw.Write([UInt16]0)                      # reserved
    $bw.Write([UInt16]1)                      # type = icon
    $bw.Write([UInt16]$bitmaps.Count)         # image count

    $headerSize = 6
    $entrySize = 16
    $offset = $headerSize + ($entrySize * $bitmaps.Count)

    for ($i = 0; $i -lt $bitmaps.Count; $i++) {
        $sz = $sizeList[$i]
        $byteSize = $pngByteArrays[$i].Length
        $wh = if ($sz -ge 256) { 0 } else { $sz }  # 0 means 256 in ICO format
        $bw.Write([Byte]$wh)      # width
        $bw.Write([Byte]$wh)      # height
        $bw.Write([Byte]0)        # color count
        $bw.Write([Byte]0)        # reserved
        $bw.Write([UInt16]1)      # planes
        $bw.Write([UInt16]32)     # bit count
        $bw.Write([UInt32]$byteSize)
        $bw.Write([UInt32]$offset)
        $offset += $byteSize
    }

    foreach ($pngBytes in $pngByteArrays) {
        $bw.Write($pngBytes)
    }

    $bw.Flush()
    $bw.Close()
    $fs.Close()
}

$triangleBitmaps = $sizes | ForEach-Object { New-TriangleBitmap $_ }
Save-MultiResIcon -bitmaps $triangleBitmaps -sizeList $sizes -path "$assetsDir\start-icon-v2.ico"
$triangleBitmaps | ForEach-Object { $_.Dispose() }

$xBitmaps = $sizes | ForEach-Object { New-XBitmap $_ }
Save-MultiResIcon -bitmaps $xBitmaps -sizeList $sizes -path "$assetsDir\stop-icon-v2.ico"
$xBitmaps | ForEach-Object { $_.Dispose() }

Write-Output "Icons created: $assetsDir\start-icon-v2.ico, $assetsDir\stop-icon-v2.ico"
