# Packaged adapter; uses only Windows' built-in PowerShell/.NET and User32.
# Loaded as the app's fixed command source; no execution policy is changed.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LoopPointer {
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    public static void SetDpi() { SetThreadDpiAwarenessContext(new IntPtr(-4)); }
    public static int[] Current() { POINT p; if (!GetCursorPos(out p)) throw new Exception("cursor-unavailable"); return new int[]{p.X,p.Y}; }
}
'@
[LoopPointer]::SetDpi()
$activeToken = $null
$expected = $null
$expires = 0
function Distance($a, $b) { return [Math]::Sqrt([Math]::Pow($a[0]-$b[0],2)+[Math]::Pow($a[1]-$b[1],2)) }
while ($null -ne ($line = [Console]::ReadLine())) {
    $request = $null
    try {
        $request = $line | ConvertFrom-Json
        $point = [LoopPointer]::Current()
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $reason = ''
        switch ($request.op) {
            'get' { }
            'cancel' { $activeToken = $null }
            'begin' { $activeToken = $request.token; $expected = $point; $expires = $now + 400 }
            'step' {
                if (!$activeToken -or $request.token -ne $activeToken -or $now -gt $expires -or [Math]::Abs($now-$request.time) -gt 50) { $reason = 'stale-native-frame' }
                elseif ([LoopPointer]::GetForegroundWindow().ToInt64().ToString() -ne $request.hwnd) { $reason = 'native-window-inactive' }
                elseif ((Distance $point $expected) -gt $request.tolerance) { $reason = 'user-moved' }
                elseif ($request.point.Count -ne 2) { $reason = 'invalid-native-point' }
                else {
                    $x = [int][Math]::Round($request.point[0]); $y = [int][Math]::Round($request.point[1])
                    $moved = [LoopPointer]::SetCursorPos($x,$y)
                    $point = [LoopPointer]::Current()
                    if (!$moved -or (Distance $point @($x,$y)) -gt 2) { $reason = 'warp-not-confirmed' }
                    else { $expected = $point }
                }
                if ($reason) { $activeToken = $null }
            }
            default { $reason = 'unknown-operation' }
        }
        $reply = @{ id=$request.id; ok=(!$reason); reason=$reason; point=$point }
    } catch { $activeToken = $null; $reply = @{ id=$request.id; ok=$false; reason='adapter-error' } }
    [Console]::WriteLine(($reply | ConvertTo-Json -Compress))
}
