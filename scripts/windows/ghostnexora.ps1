param(
  [Parameter(Position = 0)]
  [string]$Action = 'help',

  [Parameter(Position = 1)]
  [string]$Value = ''
)

$ErrorActionPreference = 'Stop'

$RepoDefault = Join-Path $HOME 'GhostNexoraBot'
$StateDefault = Join-Path $env:LOCALAPPDATA 'GhostNexoraBot'
$InstallDir = if ($env:GHOST_NEXORA_HOME) { $env:GHOST_NEXORA_HOME } else { $RepoDefault }
$StateDir = if ($env:GHOST_NEXORA_STATE) { $env:GHOST_NEXORA_STATE } else { $StateDefault }
$EnvFile = Join-Path $InstallDir '.env'
$RunDir = Join-Path $StateDir 'run'
$LogDir = Join-Path $StateDir 'logs'
$BotPidFile = Join-Path $RunDir 'bot.pid'
$WebPidFile = Join-Path $RunDir 'web.pid'
$BotOutLog = Join-Path $LogDir 'bot.out.log'
$BotErrLog = Join-Path $LogDir 'bot.err.log'
$WebOutLog = Join-Path $LogDir 'web.out.log'
$WebErrLog = Join-Path $LogDir 'web.err.log'
$BotEntry = Join-Path $InstallDir 'apps\bot\dist\index.js'
$PairEntry = Join-Path $InstallDir 'apps\bot\dist\pair.js'

function Write-Header([string]$Title) {
  Write-Host ''
  Write-Host '============================================================' -ForegroundColor DarkCyan
  Write-Host (' Ghost Nexora Bot · ' + $Title) -ForegroundColor Cyan
  Write-Host '============================================================' -ForegroundColor DarkCyan
}
function Write-Ok([string]$Message) { Write-Host ('[ OK ] ' + $Message) -ForegroundColor Green }
function Write-Info([string]$Message) { Write-Host ('[INFO] ' + $Message) -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Host ('[WARN] ' + $Message) -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host ('[FAIL] ' + $Message) -ForegroundColor Red }

function Ensure-Directories { New-Item -ItemType Directory -Force -Path $RunDir, $LogDir | Out-Null }

function Require-Install {
  if (-not (Test-Path (Join-Path $InstallDir '.git'))) { throw "No se encontró Ghost Nexora Bot en $InstallDir. Ejecuta primero install-windows.ps1." }
  if (-not (Test-Path $EnvFile)) { throw "No existe $EnvFile. Repite el instalador para reparar la configuración." }
}

function Require-Runtime {
  Require-Install
  if (-not (Test-Path $BotEntry)) { throw 'El build no existe. Ejecuta: ghostnexora update' }
}

function Get-EnvValue([string]$Key) {
  if (-not (Test-Path $EnvFile)) { return '' }
  $line = Get-Content $EnvFile | Where-Object { $_ -match ('^' + [regex]::Escape($Key) + '=') } | Select-Object -Last 1
  if (-not $line) { return '' }
  return ($line -split '=', 2)[1]
}

function Test-WebEnabled {
  $value = (Get-EnvValue 'WEB_ENABLED').Trim().ToLowerInvariant()
  if ($value) { return $value -match '^(1|true|yes|on|si|sí)$' }
  # Compatibilidad con instalaciones Windows anteriores a WEB_ENABLED.
  return Test-Path (Join-Path $InstallDir 'apps\web\.next')
}

function Get-StoredPid([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  $raw = (Get-Content $Path -Raw -ErrorAction SilentlyContinue).Trim()
  $pidValue = 0
  if ([int]::TryParse($raw, [ref]$pidValue)) { return $pidValue }
  return $null
}

function Test-ProcessId([Nullable[int]]$ProcessId) {
  if ($null -eq $ProcessId) { return $false }
  return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Start-Bot {
  Require-Runtime
  Ensure-Directories
  $pidValue = Get-StoredPid $BotPidFile
  if (Test-ProcessId $pidValue) { Write-Info "MainBot ya está activo (PID $pidValue)."; return }

  Remove-Item $BotPidFile -Force -ErrorAction SilentlyContinue
  $oldEnvFile = $env:ENV_FILE
  try {
    $env:ENV_FILE = $EnvFile
    $process = Start-Process -FilePath 'node.exe' -ArgumentList @($BotEntry) -WorkingDirectory $InstallDir -WindowStyle Hidden -RedirectStandardOutput $BotOutLog -RedirectStandardError $BotErrLog -PassThru
  } finally { $env:ENV_FILE = $oldEnvFile }

  Set-Content -Path $BotPidFile -Value $process.Id -Encoding ascii
  Start-Sleep -Seconds 2
  if (-not (Test-ProcessId $process.Id)) {
    Remove-Item $BotPidFile -Force -ErrorAction SilentlyContinue
    Write-Fail 'El MainBot terminó durante el arranque.'
    if (Test-Path $BotErrLog) { Get-Content $BotErrLog -Tail 25 }
    throw 'No se pudo iniciar el MainBot.'
  }
  Write-Ok "MainBot iniciado (PID $($process.Id))."
}

function Stop-FromPidFile([string]$PidFile, [string]$Label) {
  $pidValue = Get-StoredPid $PidFile
  if (-not (Test-ProcessId $pidValue)) {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Info "$Label no está activo."
    return
  }
  Stop-Process -Id $pidValue -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 20; $i++) {
    if (-not (Test-ProcessId $pidValue)) { break }
    Start-Sleep -Milliseconds 250
  }
  if (Test-ProcessId $pidValue) { Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  Write-Ok "$Label detenido."
}

function Stop-Bot { Stop-FromPidFile $BotPidFile 'MainBot' }
function Stop-Web { Stop-FromPidFile $WebPidFile 'Dashboard' }

function Start-Web {
  Require-Install
  Ensure-Directories
  if (-not (Test-WebEnabled)) {
    Write-Info 'Dashboard deshabilitado por WEB_ENABLED=false. El MainBot funciona normalmente sin web.'
    return
  }
  $nextBuild = Join-Path $InstallDir 'apps\web\.next'
  if (-not (Test-Path $nextBuild)) { throw 'WEB_ENABLED=true pero el build web no existe. Ejecuta: ghostnexora update' }
  $pidValue = Get-StoredPid $WebPidFile
  if (Test-ProcessId $pidValue) { Write-Info "Dashboard ya está activo (PID $pidValue)."; return }

  $oldEnvFile = $env:ENV_FILE
  try {
    $env:ENV_FILE = $EnvFile
    $process = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'start', '--workspace=@ghostnexora/web') -WorkingDirectory $InstallDir -WindowStyle Hidden -RedirectStandardOutput $WebOutLog -RedirectStandardError $WebErrLog -PassThru
  } finally { $env:ENV_FILE = $oldEnvFile }

  Set-Content -Path $WebPidFile -Value $process.Id -Encoding ascii
  Start-Sleep -Seconds 2
  if (-not (Test-ProcessId $process.Id)) {
    Remove-Item $WebPidFile -Force -ErrorAction SilentlyContinue
    Write-Fail 'El dashboard terminó durante el arranque.'
    if (Test-Path $WebErrLog) { Get-Content $WebErrLog -Tail 25 }
    throw 'No se pudo iniciar el dashboard.'
  }
  Write-Ok "Dashboard iniciado (PID $($process.Id))."
}

function Show-Status {
  Require-Install
  Write-Header 'ESTADO'
  $botPid = Get-StoredPid $BotPidFile
  $webPid = Get-StoredPid $WebPidFile
  $webEnabled = Test-WebEnabled
  Write-Host ('MainBot    : ' + $(if (Test-ProcessId $botPid) { "ONLINE · PID $botPid" } else { 'OFFLINE' }))
  Write-Host ('Dashboard  : ' + $(if (-not $webEnabled) { 'DISABLED' } elseif (Test-ProcessId $webPid) { "ONLINE · PID $webPid" } else { 'OFFLINE' }))
  Write-Host ('Instalación: ' + $InstallDir)
  Write-Host ('Datos       : ' + $StateDir)
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 3
    Write-Host ('WhatsApp    : ' + $(if ($health.connected) { 'CONECTADO' } else { 'DESCONECTADO' }))
    if ($null -ne $health.llm) { Write-Host ('LLM local   : ' + $(if ($health.llm.localEnabled) { 'ON · ' + $health.llm.model } else { 'OFF' })) }
    if ($null -ne $health.subbots) { Write-Host ("Subbots     : $($health.subbots.online)/$($health.subbots.total) online") }
  } catch { Write-Warn 'Health endpoint no disponible todavía.' }
}

function Pair-Bot([string]$Phone) {
  Require-Runtime
  if (-not $Phone) { $Phone = Read-Host 'Número internacional de WhatsApp (solo dígitos)' }
  $Phone = ($Phone -replace '\D', '')
  if ($Phone.Length -lt 8) { throw 'Número de WhatsApp inválido.' }
  $wasRunning = Test-ProcessId (Get-StoredPid $BotPidFile)
  if ($wasRunning) { Stop-Bot }
  $oldEnvFile = $env:ENV_FILE
  $oldPairing = $env:PAIRING_NUMBER
  try {
    $env:ENV_FILE = $EnvFile
    $env:PAIRING_NUMBER = $Phone
    & node.exe $PairEntry
    if ($LASTEXITCODE -ne 0) { throw "Pairing terminó con código $LASTEXITCODE." }
  } finally {
    $env:ENV_FILE = $oldEnvFile
    $env:PAIRING_NUMBER = $oldPairing
    if ($wasRunning) { Start-Bot }
  }
}

function Update-Bot {
  Require-Install
  Write-Header 'ACTUALIZACIÓN'
  $botWasRunning = Test-ProcessId (Get-StoredPid $BotPidFile)
  $webWasRunning = Test-ProcessId (Get-StoredPid $WebPidFile)
  if ($botWasRunning) { Stop-Bot }
  if ($webWasRunning) { Stop-Web }

  Write-Info 'Actualizando main…'
  & git.exe -C $InstallDir fetch origin main
  if ($LASTEXITCODE -ne 0) { throw 'git fetch falló.' }
  & git.exe -C $InstallDir checkout main
  if ($LASTEXITCODE -ne 0) { throw 'git checkout main falló.' }
  & git.exe -C $InstallDir pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { throw 'git pull falló.' }

  $webEnabled = Test-WebEnabled
  Write-Info ('Dashboard: ' + $(if ($webEnabled) { 'habilitado; se actualizará.' } else { 'deshabilitado; Next.js se omite.' }))
  Push-Location $InstallDir
  try {
    if ($webEnabled) {
      & npm.cmd install
      if ($LASTEXITCODE -ne 0) { throw 'npm install falló.' }
      & npm.cmd run build
      if ($LASTEXITCODE -ne 0) { throw 'npm run build falló.' }
    } else {
      & npm.cmd install --workspace=@ghostnexora/bot --include=dev
      if ($LASTEXITCODE -ne 0) { throw 'npm install del bot falló.' }
      & npm.cmd run assets:waifus
      if ($LASTEXITCODE -ne 0) { throw 'assets:waifus falló.' }
      & npm.cmd run build --workspace=@ghostnexora/bot
      if ($LASTEXITCODE -ne 0) { throw 'build del bot falló.' }
    }
  } finally { Pop-Location }

  if ($botWasRunning) { Start-Bot }
  if ($webWasRunning -and $webEnabled) { Start-Web }
  Write-Ok 'Actualización completada. Sesiones, datos y estado opcional de Web se conservaron.'
}

function Show-Logs {
  Ensure-Directories
  Write-Header 'LOGS'
  Write-Info "Salida: $BotOutLog"
  Write-Info "Errores: $BotErrLog"
  if (Test-Path $BotErrLog) {
    $errors = Get-Content $BotErrLog -Tail 15 -ErrorAction SilentlyContinue
    if ($errors) { Write-Host ''; Write-Host 'Últimos errores:' -ForegroundColor Yellow; $errors | ForEach-Object { Write-Host $_ } }
  }
  if (-not (Test-Path $BotOutLog)) { New-Item -ItemType File -Path $BotOutLog -Force | Out-Null }
  Write-Host ''
  Get-Content $BotOutLog -Tail 60 -Wait
}

function Doctor {
  Write-Header 'DIAGNÓSTICO'
  $checks = @(
    @{ Name = 'Node.js'; Command = 'node.exe'; Args = @('--version') },
    @{ Name = 'npm'; Command = 'npm.cmd'; Args = @('--version') },
    @{ Name = 'Git'; Command = 'git.exe'; Args = @('--version') },
    @{ Name = 'FFmpeg'; Command = 'ffmpeg.exe'; Args = @('-version') },
    @{ Name = 'yt-dlp'; Command = 'yt-dlp.exe'; Args = @('--version') },
    @{ Name = 'Ollama'; Command = 'ollama.exe'; Args = @('--version') }
  )
  foreach ($check in $checks) {
    $cmd = Get-Command $check.Command -ErrorAction SilentlyContinue
    if ($null -eq $cmd) { Write-Warn ($check.Name + ': no disponible'); continue }
    try {
      $line = (& $check.Command @($check.Args) 2>$null | Select-Object -First 1)
      Write-Ok ($check.Name + ': ' + $line)
    } catch { Write-Warn ($check.Name + ': instalado, pero no respondió correctamente') }
  }
  Write-Info ('WEB_ENABLED=' + $(if (Test-WebEnabled) { 'true' } else { 'false' }))
  if (Test-Path $EnvFile) {
    $ollamaLine = Get-Content $EnvFile | Where-Object { $_ -match '^OLLAMA_ENABLED=' } | Select-Object -Last 1
    Write-Info ('Config local LLM: ' + $(if ($ollamaLine) { $ollamaLine } else { 'OLLAMA_ENABLED no definido' }))
  }
  try { Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 3 | ConvertTo-Json -Depth 4 } catch { Write-Warn 'Health local no disponible.' }
}

function Show-Help {
  Write-Header 'WINDOWS MANAGER'
  Write-Host 'Uso: ghostnexora <comando> [valor]'
  Write-Host ''
  Write-Host '  start             Inicia el MainBot'
  Write-Host '  stop              Detiene el MainBot'
  Write-Host '  restart           Reinicia el MainBot'
  Write-Host '  status            Estado, health, Web, LLM y subbots'
  Write-Host '  logs              Sigue los logs del MainBot'
  Write-Host '  pair <numero>     Vincula WhatsApp por pairing code'
  Write-Host '  web-start         Inicia el dashboard si WEB_ENABLED=true'
  Write-Host '  web-stop          Detiene el dashboard'
  Write-Host '  update            Actualiza main respetando componentes opcionales'
  Write-Host '  doctor            Diagnóstico de dependencias y runtime'
  Write-Host '  help              Muestra esta ayuda'
}

Ensure-Directories
try {
  switch ($Action.ToLowerInvariant()) {
    'start' { Start-Bot }
    'stop' { Stop-Bot }
    'restart' { Stop-Bot; Start-Bot }
    'status' { Show-Status }
    'logs' { Show-Logs }
    'pair' { Pair-Bot $Value }
    'web-start' { Start-Web }
    'web-stop' { Stop-Web }
    'update' { Update-Bot }
    'doctor' { Doctor }
    'help' { Show-Help }
    default { Show-Help; exit 2 }
  }
} catch {
  Write-Fail $_.Exception.Message
  exit 1
}
