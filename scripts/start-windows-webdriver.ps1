[CmdletBinding()]
param(
  [int]$Port = 9515,
  [string]$AllowedIp = $env:OFFGRID_WEBDRIVER_ALLOWED_IP,
  [string]$ElectronVersion = $env:OFFGRID_ELECTRON_VERSION
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($AllowedIp)) {
  $AllowedIp = '192.168.1.27'
}

if ([string]::IsNullOrWhiteSpace($ElectronVersion)) {
  $installedElectron = Join-Path $repoRoot 'node_modules/electron/package.json'
  if (Test-Path $installedElectron) {
    $ElectronVersion = (Get-Content $installedElectron -Raw | ConvertFrom-Json).version
  } else {
    $manifest = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
    $electronRange = $manifest.devDependencies.electron
    $versionMatch = [regex]::Match($electronRange, '\d+\.\d+\.\d+')
    if (-not $versionMatch.Success) {
      throw "Cannot derive an Electron version from package.json: $electronRange"
    }
    $ElectronVersion = $versionMatch.Value
  }
}

Get-Command npx.cmd -ErrorAction Stop | Out-Null

Write-Host "Starting Electron ChromeDriver $ElectronVersion on port $Port"
Write-Host "Allowing WebDriver connections from $AllowedIp"
Write-Host 'Leave this window open while the coordinated test runs.'

Set-Location $repoRoot
& npx.cmd --yes --package "electron-chromedriver@$ElectronVersion" chromedriver `
  "--port=$Port" `
  "--allowed-ips=$AllowedIp"

exit $LASTEXITCODE
