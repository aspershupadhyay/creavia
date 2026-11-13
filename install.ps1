# Install Creavia on Windows with one command, in PowerShell:
#
#   irm https://raw.githubusercontent.com/aspershupadhyay/creavia/main/install.ps1 | iex
#
# It downloads the newest release from GitHub, installs it for you (no admin needed), and opens it.
# Downloaded this way, Windows doesn't show the "Windows protected your PC" box. Afterwards Creavia updates itself.
#
# Options (environment variables, set before running):
#   $env:CREAVIA_VERSION = "v0.1.1"   a specific release instead of the newest
#   $env:CREAVIA_NO_LAUNCH = "1"      don't open Creavia when done
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is many times faster without its progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = "aspershupadhyay/creavia"
function Say($t) { Write-Host "  * $t" -ForegroundColor Yellow }
function Ok($t) { Write-Host "  v $t" -ForegroundColor Green }
function Fail($t) { Write-Host "  x $t" -ForegroundColor Red; throw $t }

Write-Host ""; Write-Host "  Creavia - create, publish and grow" -ForegroundColor White; Write-Host ""

if (-not [Environment]::Is64BitOperatingSystem) { Fail "Creavia needs 64-bit Windows 10 or 11." }

$api = if ($env:CREAVIA_VERSION) { "https://api.github.com/repos/$Repo/releases/tags/$($env:CREAVIA_VERSION)" } else { "https://api.github.com/repos/$Repo/releases/latest" }
Say "Finding the newest Creavia..."
try { $release = Invoke-RestMethod -Uri $api -Headers @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "creavia-installer" } }
catch { Fail "Couldn't reach GitHub. Check your internet connection and try again." }

$asset = $release.assets | Where-Object { $_.name -like "*_x64-setup.exe" } | Select-Object -First 1
if (-not $asset) { Fail "No Windows installer in release $($release.tag_name)." }

$file = Join-Path $env:TEMP $asset.name
Say "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)..."
try { Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing -Headers @{ "User-Agent" = "creavia-installer" } }
catch { Fail "The download stopped. Run the command again." }
Unblock-File -Path $file -ErrorAction SilentlyContinue

Get-Process -Name "creavia" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Say "Installing..."
$p = Start-Process -FilePath $file -ArgumentList "/S" -Wait -PassThru   # the NSIS installer, silent, for this user
Remove-Item $file -Force -ErrorAction SilentlyContinue
if ($p.ExitCode -ne 0) { Fail "The installer stopped (code $($p.ExitCode)). Try running it by hand from the Releases page." }

$exe = @(
  (Join-Path $env:LOCALAPPDATA "Creavia\creavia.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\Creavia\creavia.exe"),
  (Join-Path $env:ProgramFiles "Creavia\creavia.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($exe) { Ok "Creavia $($release.tag_name) is installed, and in your Start menu." }
else { Ok "Creavia $($release.tag_name) is installed. Find it in your Start menu." }

if ($exe -and -not $env:CREAVIA_NO_LAUNCH) { Start-Process -FilePath $exe }
Write-Host ""; Write-Host "  Vee will walk you through the first minute. Updates come by themselves, from inside the app." ; Write-Host ""
