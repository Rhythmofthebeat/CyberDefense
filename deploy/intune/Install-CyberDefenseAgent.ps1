# Cyber Defense Agent — Microsoft Intune Win32 App Install Script
#
# Package as an Intune Win32 app (.intunewin):
#   1. Use the Microsoft Win32 Content Prep Tool:
#      IntuneWinAppUtil.exe -c .\deploy\intune -s Install-CyberDefenseAgent.ps1 -o .\dist
#   2. In Intune: Apps > Windows > Add > Windows app (Win32)
#   3. Upload the .intunewin file
#   4. Install command:
#      powershell.exe -ExecutionPolicy Bypass -File Install-CyberDefenseAgent.ps1 -Server "http://SERVER:4001" -Key "API_KEY"
#   5. Detection rule: File exists — C:\Program Files\CyberDefenseAgent\cyber-defense-agent.exe
#   6. Assign to device groups

param(
  [string]$Server   = "http://REPLACE_WITH_SERVER:4001",
  [string]$Key      = "REPLACE_WITH_API_KEY",
  [string]$Name     = $env:COMPUTERNAME,
  [int]   $Interval = 30
)

$InstallDir  = "C:\Program Files\CyberDefenseAgent"
$ConfigDir   = "C:\ProgramData\CyberDefense"
$ServiceName = "CyberDefenseAgent"
$BinaryName  = "cyber-defense-agent-win32-x64.exe"
$AgentExe    = "$InstallDir\cyber-defense-agent.exe"
$LogFile     = "$ConfigDir\agent.log"

function Write-Log($msg) { Write-Host "[$(Get-Date -f 'HH:mm:ss')] $msg" }

Write-Log "Cyber Defense Agent — Intune Install"
Write-Log "Server: $Server"
Write-Log "Device: $Name"

# ── Create directories ────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir  | Out-Null

# ── Download or copy binary ───────────────────────────────────────────────────
$localBinary = Join-Path $PSScriptRoot $BinaryName
if (Test-Path $localBinary) {
  Write-Log "Using bundled binary"
  Copy-Item $localBinary $AgentExe -Force
} else {
  Write-Log "Downloading binary from server..."
  try {
    Invoke-WebRequest "$Server/download/$BinaryName" -OutFile $AgentExe -UseBasicParsing
  } catch {
    Write-Log "Download failed: $_"
    exit 1
  }
}

# ── Generate device ID ────────────────────────────────────────────────────────
$DeviceId = (Get-WmiObject Win32_ComputerSystemProduct).UUID -replace '[^A-Za-z0-9]', '' | Select-Object -First 1
if (-not $DeviceId) { $DeviceId = [System.Guid]::NewGuid().ToString("N").Substring(0, 16) }

# ── Write config ──────────────────────────────────────────────────────────────
$config = @{
  serverUrl   = $Server
  apiKey      = $Key
  deviceId    = $DeviceId
  deviceName  = $Name
  intervalSec = $Interval
} | ConvertTo-Json
$config | Set-Content -Path "$ConfigDir\config.json" -Encoding UTF8

# Restrict config permissions to SYSTEM + Admins only
$acl = Get-Acl "$ConfigDir\config.json"
$acl.SetAccessRuleProtection($true, $false)
foreach ($principal in @("SYSTEM", "Administrators")) {
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($principal, "FullControl", "Allow")
  $acl.SetAccessRule($rule)
}
Set-Acl "$ConfigDir\config.json" $acl

Write-Log "Config written"

# ── Install Windows Service ───────────────────────────────────────────────────
$existing = Get-Service $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Log "Stopping existing service"
  Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep 1
}

sc.exe create $ServiceName binPath= `"$AgentExe`" start= auto DisplayName= "Cyber Defense Agent" | Out-Null
sc.exe description $ServiceName "System monitor for Cyber Defense Command" | Out-Null
sc.exe failure $ServiceName reset= 60 actions= restart/5000/restart/10000/restart/30000 | Out-Null

# Set log file via registry (SCM stdout redirect)
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
New-ItemProperty -Path $regPath -Name "Environment" -Value "CYBER_CONFIG=$ConfigDir\config.json" -PropertyType MultiString -Force | Out-Null

Start-Service $ServiceName
Write-Log "Service installed and started"

# ── Verify ────────────────────────────────────────────────────────────────────
Start-Sleep 3
$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
if ($svc?.Status -eq "Running") {
  Write-Log "SUCCESS — Agent is running"
  exit 0
} else {
  Write-Log "WARNING — Service may not have started. Check: Get-Service $ServiceName"
  exit 0  # Still exit 0 so Intune doesn't retry forever
}
