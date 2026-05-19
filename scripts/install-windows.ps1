# Cyber Defense Agent — Windows Installer
# Installs as a Windows Service via NSSM (auto-starts on boot)
#
# Run in PowerShell as Administrator:
#   .\install-windows.ps1 -Server "http://YOUR_SERVER:4001" -Key "YOUR_API_KEY"
#   .\install-windows.ps1 -Server "http://YOUR_SERVER:4001" -Key "YOUR_API_KEY" -Name "Workstation-01"

param(
  [Parameter(Mandatory=$true)]  [string]$Server,
  [Parameter(Mandatory=$true)]  [string]$Key,
  [Parameter(Mandatory=$false)] [string]$Name = $env:COMPUTERNAME
)

$InstallDir = "C:\Program Files\CyberDefenseAgent"
$ConfigDir  = "C:\ProgramData\CyberDefense"
$ServiceName = "CyberDefenseAgent"
$LogFile    = "C:\ProgramData\CyberDefense\agent.log"

Write-Host ""
Write-Host "  Installing Cyber Defense Agent" -ForegroundColor Cyan
Write-Host "  Server: $Server"
Write-Host "  Device: $Name"
Write-Host ""

# ── Admin check ────────────────────────────────────────────────────────────────
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "  [!] Please run as Administrator" -ForegroundColor Red
  exit 1
}

# ── Node.js check ──────────────────────────────────────────────────────────────
$nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodePath) {
  Write-Host "  [!] Node.js not found. Downloading installer..." -ForegroundColor Yellow
  $nodeInstaller = "$env:TEMP\node-installer.msi"
  Invoke-WebRequest "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi" -OutFile $nodeInstaller
  Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart" -Wait
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
  if (-not $nodePath) {
    Write-Host "  [!] Node.js install failed. Install manually from https://nodejs.org" -ForegroundColor Red
    exit 1
  }
}
Write-Host "  [√] Node.js: $(node --version)" -ForegroundColor Green

# ── NSSM (service manager) ─────────────────────────────────────────────────────
$nssmPath = "$InstallDir\nssm.exe"
if (-not (Test-Path $nssmPath)) {
  Write-Host "  Downloading NSSM (service manager)..." -ForegroundColor Yellow
  $nssmZip = "$env:TEMP\nssm.zip"
  Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip
  Expand-Archive $nssmZip "$env:TEMP\nssm" -Force
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $nssmPath
}

# ── Copy agent files ───────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir  | Out-Null

Copy-Item "agent\agent.js"     "$InstallDir\agent.js"    -Force
Copy-Item "agent\package.json" "$InstallDir\package.json" -Force

Push-Location $InstallDir
npm install --production 2>$null
Pop-Location

# ── Write config ───────────────────────────────────────────────────────────────
$DeviceId = [System.Guid]::NewGuid().ToString("N").Substring(0, 16)

$config = @{
  serverUrl   = $Server
  apiKey      = $Key
  deviceId    = $DeviceId
  deviceName  = $Name
  intervalSec = 30
} | ConvertTo-Json

$configPath = "$ConfigDir\config.json"
$config | Set-Content -Path $configPath -Encoding UTF8

# Restrict config file permissions
$acl = Get-Acl $configPath
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM","FullControl","Allow")
$acl.SetAccessRule($rule)
$rule2 = New-Object System.Security.AccessControl.FileSystemAccessRule("Administrators","FullControl","Allow")
$acl.SetAccessRule($rule2)
Set-Acl $configPath $acl

Write-Host "  [√] Config written to $configPath" -ForegroundColor Green

# ── Install as Windows Service ─────────────────────────────────────────────────
$nodeExe = (Get-Command node).Source

# Remove existing service if present
$existing = Get-Service $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  & $nssmPath stop $ServiceName confirm 2>$null
  & $nssmPath remove $ServiceName confirm 2>$null
}

& $nssmPath install $ServiceName $nodeExe "$InstallDir\agent.js"
& $nssmPath set $ServiceName AppEnvironmentExtra "CYBER_CONFIG=$configPath"
& $nssmPath set $ServiceName AppDirectory $InstallDir
& $nssmPath set $ServiceName DisplayName "Cyber Defense Agent"
& $nssmPath set $ServiceName Description "System monitor for Cyber Defense Command dashboard"
& $nssmPath set $ServiceName Start SERVICE_AUTO_START
& $nssmPath set $ServiceName AppStdout $LogFile
& $nssmPath set $ServiceName AppStderr $LogFile
& $nssmPath set $ServiceName AppRotateFiles 1
& $nssmPath set $ServiceName AppRotateBytes 5242880

Start-Service $ServiceName

Write-Host "  [√] Service '$ServiceName' installed and started" -ForegroundColor Green
Write-Host ""
Write-Host "  Logs:    Get-Content '$LogFile' -Wait"
Write-Host "  Status:  Get-Service $ServiceName"
Write-Host "  Stop:    Stop-Service $ServiceName"
Write-Host "  Remove:  & '$nssmPath' remove $ServiceName confirm"
Write-Host ""
