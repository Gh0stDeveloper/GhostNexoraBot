param(
  [string]$InstallDir = (Join-Path $HOME 'GhostNexoraBot'),
  [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'GhostNexoraBot'),
  [string]$Branch = 'main',
  [ValidateSet('Ask', 'Yes', 'No')]
  [string]$Ollama = 'Ask',
  [string]$OllamaModel = 'qwen2.5:1.5b',
  [switch]$SkipPair,
  [switch]$NoStart,
  [switch]$SkipWeb
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$RepoUrl = 'https://github.com/Gh0stDeveloper/GhostNexoraBot.git'
$StartedAt = Get-Date
$FirstInstall = -not (Test-Path (Join-Path $InstallDir '.git'))

function Write-Header([string]$Title) {
  Write-Host ''
  Write-Host '================================================================' -ForegroundColor DarkCyan
  Write-Host (' Ghost Nexora Bot · ' + $Title) -ForegroundColor Cyan
  Write-Host '================================================================' -ForegroundColor DarkCyan
}
function Write-Step([string]$Step, [string]$Title) { Write-Host ''; Write-Host ("[$Step] $Title") -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host ('[ OK ] ' + $Text) -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host ('[INFO] ' + $Text) -ForegroundColor Gray }
function Write-Warn([string]$Text) { Write-Host ('[WARN] ' + $Text) -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host ('[FAIL] ' + $Text) -ForegroundColor Red }

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (($machine, $user) -join ';')
  $ollamaDir = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
  if ((Test-Path $ollamaDir) -and ($env:Path -notlike "*$ollamaDir*")) { $env:Path += ';' + $ollamaDir }
}

function Require-WinGet {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw 'WinGet no está disponible. Instala/actualiza "App Installer" desde Microsoft Store y vuelve a ejecutar el instalador.'
  }
}

function Install-Package([string]$Id, [string]$Command, [string]$Label) {
  if (Get-Command $Command -ErrorAction SilentlyContinue) {
    Write-Ok "$Label ya está disponible."
    return
  }
  Write-Info "Instalando $Label ($Id)…"
  & winget.exe install --id $Id -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) { throw "WinGet no pudo instalar $Label (exit $LASTEXITCODE)." }
  Refresh-Path
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "$Label terminó de instalarse, pero $Command aún no está en PATH. Cierra PowerShell, abre una nueva terminal y repite el instalador."
  }
  Write-Ok "$Label instalado."
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $envPath = Join-Path $InstallDir '.env'
  $lines = @()
  if (Test-Path $envPath) { $lines = @(Get-Content $envPath) }
  $escapedKey = [regex]::Escape($Key)
  $found = $false
  $newLines = foreach ($line in $lines) {
    if ($line -match ('^' + $escapedKey + '=')) {
      $found = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $found) { $newLines += "$Key=$Value" }
  Set-Content -Path $envPath -Value $newLines -Encoding utf8
}

function Get-EnvValue([string]$Key) {
  $envPath = Join-Path $InstallDir '.env'
  if (-not (Test-Path $envPath)) { return '' }
  $line = Get-Content $envPath | Where-Object { $_ -match ('^' + [regex]::Escape($Key) + '=') } | Select-Object -Last 1
  if (-not $line) { return '' }
  return ($line -split '=', 2)[1]
}

function New-SecureToken {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Test-OllamaApi {
  try {
    $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

function Ensure-Ollama([string]$Model) {
  if (-not (Get-Command ollama.exe -ErrorAction SilentlyContinue)) {
    Write-Info 'Instalando Ollama mediante WinGet…'
    & winget.exe install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "Ollama no pudo instalarse (exit $LASTEXITCODE)." }
    Refresh-Path
  }
  if (-not (Get-Command ollama.exe -ErrorAction SilentlyContinue)) {
    throw 'Ollama fue instalado, pero ollama.exe todavía no está disponible en PATH.'
  }

  if (-not (Test-OllamaApi)) {
    Write-Info 'Iniciando API local de Ollama…'
    Start-Process -FilePath 'ollama.exe' -ArgumentList @('serve') -WindowStyle Hidden | Out-Null
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      if (Test-OllamaApi) { $ready = $true; break }
    }
    if (-not $ready) { throw 'La API de Ollama no respondió en http://127.0.0.1:11434.' }
  }

  Write-Info "Descargando/verificando modelo $Model…"
  & ollama.exe pull $Model
  if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar el modelo $Model." }
  Write-Ok "Ollama + $Model disponibles."
}

function Install-Manager {
  $binDir = Join-Path $env:LOCALAPPDATA 'GhostNexora\bin'
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  $managerSource = Join-Path $InstallDir 'scripts\windows\ghostnexora.ps1'
  $managerTarget = Join-Path $binDir 'ghostnexora.ps1'
  Copy-Item $managerSource $managerTarget -Force

  $cmdPath = Join-Path $binDir 'ghostnexora.cmd'
  $cmd = '@echo off' + [Environment]::NewLine + 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $managerTarget + '" %*'
  Set-Content -Path $cmdPath -Value $cmd -Encoding ascii

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @($userPath -split ';' | Where-Object { $_ })
  if ($parts -notcontains $binDir) {
    $newUserPath = (($parts + $binDir) -join ';')
    [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
  }
  if ($env:Path -notlike "*$binDir*") { $env:Path += ';' + $binDir }

  [Environment]::SetEnvironmentVariable('GHOST_NEXORA_HOME', $InstallDir, 'User')
  [Environment]::SetEnvironmentVariable('GHOST_NEXORA_STATE', $StateDir, 'User')
  $env:GHOST_NEXORA_HOME = $InstallDir
  $env:GHOST_NEXORA_STATE = $StateDir
  Write-Ok "Gestor instalado: $cmdPath"
  return $managerTarget
}

try {
  if ($env:OS -ne 'Windows_NT') { throw 'Este instalador es exclusivo para Windows 10/11.' }
  Write-Header 'INSTALACIÓN NATIVA PARA WINDOWS'
  Write-Info "Repositorio : $RepoUrl"
  Write-Info "Rama        : $Branch"
  Write-Info "Código      : $InstallDir"
  Write-Info "Datos       : $StateDir"
  Write-Info ('Modo        : ' + $(if ($FirstInstall) { 'primera instalación' } else { 'actualización/reparación' }))

  Write-Step '1/9' 'Herramientas del sistema'
  Require-WinGet
  Install-Package 'Git.Git' 'git.exe' 'Git'
  Install-Package 'OpenJS.NodeJS.LTS' 'node.exe' 'Node.js LTS'
  Install-Package 'Gyan.FFmpeg' 'ffmpeg.exe' 'FFmpeg'
  Install-Package 'yt-dlp.yt-dlp' 'yt-dlp.exe' 'yt-dlp'
  Refresh-Path

  $nodeMajor = [int]((& node.exe -p "Number(process.versions.node.split('.')[0])").Trim())
  if ($nodeMajor -lt 24) {
    Write-Info 'Node.js es anterior a 24; solicitando actualización LTS…'
    & winget.exe upgrade --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    Refresh-Path
    $nodeMajor = [int]((& node.exe -p "Number(process.versions.node.split('.')[0])").Trim())
    if ($nodeMajor -lt 24) { throw 'Ghost Nexora Bot requiere Node.js 24 o superior.' }
  }
  Write-Ok ("Node.js " + (& node.exe --version) + ' · npm ' + (& npm.cmd --version))

  Write-Step '2/9' 'Código fuente'
  if (Test-Path (Join-Path $InstallDir '.git')) {
    & git.exe -C $InstallDir fetch origin $Branch
    if ($LASTEXITCODE -ne 0) { throw 'git fetch falló.' }
    & git.exe -C $InstallDir checkout $Branch
    if ($LASTEXITCODE -ne 0) { throw 'git checkout falló.' }
    & git.exe -C $InstallDir pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) { throw 'git pull falló.' }
    Write-Ok 'Repositorio actualizado.'
  } else {
    $parent = Split-Path $InstallDir -Parent
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    & git.exe clone --depth 1 --branch $Branch $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo clonar el repositorio.' }
    Write-Ok 'Repositorio clonado.'
  }

  Write-Step '3/9' 'Persistencia y .env'
  New-Item -ItemType Directory -Force -Path $StateDir, (Join-Path $StateDir 'session'), (Join-Path $StateDir 'data'), (Join-Path $StateDir 'data\subbots'), (Join-Path $StateDir 'logs'), (Join-Path $StateDir 'run') | Out-Null
  $envPath = Join-Path $InstallDir '.env'
  if (-not (Test-Path $envPath)) { Copy-Item (Join-Path $InstallDir '.env.example') $envPath }
  Set-EnvValue 'NEXORA_RUNTIME_PROFILE' 'full'
  Set-EnvValue 'SESSION_DIR' (Join-Path $StateDir 'session')
  Set-EnvValue 'DATA_DIR' (Join-Path $StateDir 'data')
  Set-EnvValue 'MAX_DOWNLOAD_MB' '1900'
  Set-EnvValue 'BOT_HEALTH_PORT' '3001'
  Set-EnvValue 'BOT_HEALTH_URL' 'http://127.0.0.1:3001/health'
  Set-EnvValue 'WEB_PORT' '3000'
  Set-EnvValue 'PUBLIC_WEB_URL' 'http://127.0.0.1:3000'
  Set-EnvValue 'OFFICIAL_CHANNEL_URL' 'https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i'
  $adminToken = Get-EnvValue 'ADMIN_WEB_TOKEN'
  if (-not $adminToken -or $adminToken -eq 'change-this-admin-token') { Set-EnvValue 'ADMIN_WEB_TOKEN' (New-SecureToken) }
  Write-Ok 'Datos persistentes separados del checkout y .env preparado.'

  Write-Step '4/9' 'Ollama + Qwen (opcional)'
  if ($FirstInstall) {
    $choice = $Ollama
    if ($choice -eq 'Ask') {
      Write-Host ''
      Write-Host 'Ollama NO es obligatorio.' -ForegroundColor Yellow
      Write-Host 'Activa LLM local, RAG y conversación libre, pero consume RAM, CPU y almacenamiento.' -ForegroundColor DarkGray
      Write-Host "Modelo recomendado: $OllamaModel" -ForegroundColor DarkGray
      $answer = Read-Host '¿Instalar Ollama + Qwen? [s/N]'
      if ($answer -match '^(s|si|sí|y|yes)$') { $choice = 'Yes' } else { $choice = 'No' }
    }
    if ($choice -eq 'Yes') {
      try {
        Ensure-Ollama $OllamaModel
        Set-EnvValue 'OLLAMA_ENABLED' 'true'
        Set-EnvValue 'OLLAMA_MODEL' $OllamaModel
      } catch {
        Set-EnvValue 'OLLAMA_ENABLED' 'false'
        Write-Warn ('Ollama se desactivó porque no pudo quedar operativo: ' + $_.Exception.Message)
      }
    } else {
      Set-EnvValue 'OLLAMA_ENABLED' 'false'
      Set-EnvValue 'OLLAMA_MODEL' $OllamaModel
      Write-Ok 'Ollama omitido. Los comandos LLM locales no aparecerán en el bot.'
    }
  } else {
    $enabled = (Get-EnvValue 'OLLAMA_ENABLED').ToLowerInvariant()
    if (($enabled -match '^(1|true|yes|on)$') -and -not (Get-Command ollama.exe -ErrorAction SilentlyContinue)) {
      Set-EnvValue 'OLLAMA_ENABLED' 'false'
      Write-Warn 'OLLAMA_ENABLED estaba activo pero Ollama no existe; se desactivó y sus comandos quedarán ocultos.'
    } else {
      Write-Info 'Instalación existente: se conserva la configuración actual de Ollama.'
    }
  }

  Write-Step '5/9' 'Dependencias Node'
  Push-Location $InstallDir
  try {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw 'npm install falló.' }
  } finally { Pop-Location }
  Write-Ok 'Dependencias instaladas.'

  Write-Step '6/9' 'Build de producción'
  Push-Location $InstallDir
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build falló.' }
  } finally { Pop-Location }
  Write-Ok 'Bot y dashboard compilados.'

  Write-Step '7/9' 'Gestor de Windows'
  $managerPath = Install-Manager

  Write-Step '8/9' 'Vinculación de WhatsApp'
  $credsPath = Join-Path $StateDir 'session\creds.json'
  $registered = $false
  if (Test-Path $credsPath) {
    try { $registered = [bool]((Get-Content $credsPath -Raw | ConvertFrom-Json).registered) } catch { $registered = $false }
  }
  if ($registered) {
    Write-Ok 'Sesión existente detectada; no se vuelve a vincular.'
  } elseif ($SkipPair) {
    Write-Warn 'Pairing omitido por parámetro. Usa después: ghostnexora pair 521XXXXXXXXXX'
  } else {
    $phone = Read-Host 'Número principal de WhatsApp en formato internacional (Enter para omitir)'
    $phone = ($phone -replace '\D', '')
    if ($phone) {
      if (-not (Get-EnvValue 'OWNER_NUMBERS')) { Set-EnvValue 'OWNER_NUMBERS' $phone }
      $oldEnvFile = $env:ENV_FILE
      $oldPair = $env:PAIRING_NUMBER
      try {
        $env:ENV_FILE = $envPath
        $env:PAIRING_NUMBER = $phone
        & node.exe (Join-Path $InstallDir 'apps\bot\dist\pair.js')
        if ($LASTEXITCODE -ne 0) { Write-Warn "Pairing terminó con código $LASTEXITCODE. Puedes repetirlo con ghostnexora pair." }
      } finally {
        $env:ENV_FILE = $oldEnvFile
        $env:PAIRING_NUMBER = $oldPair
      }
    } else {
      Write-Warn 'Pairing omitido. Puedes hacerlo después con ghostnexora pair <numero>.'
    }
  }

  Write-Step '9/9' 'Arranque y resumen'
  if (-not $NoStart) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $managerPath start
    if (-not $SkipWeb) {
      try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $managerPath web-start } catch { Write-Warn 'El dashboard no pudo iniciarse automáticamente.' }
    }
  } else {
    Write-Info 'Arranque automático omitido.'
  }

  $elapsed = [math]::Round(((Get-Date) - $StartedAt).TotalSeconds)
  $ollamaFinal = Get-EnvValue 'OLLAMA_ENABLED'
  Write-Header 'INSTALACIÓN COMPLETADA'
  Write-Host ("Código      : $InstallDir")
  Write-Host ("Datos       : $StateDir")
  Write-Host ("Ollama/LLM  : $ollamaFinal")
  Write-Host 'Health      : http://127.0.0.1:3001/health'
  Write-Host 'Dashboard   : http://127.0.0.1:3000'
  Write-Host ("Duración     : ${elapsed}s")
  Write-Host ''
  Write-Host 'Comandos:' -ForegroundColor Cyan
  Write-Host '  ghostnexora status'
  Write-Host '  ghostnexora logs'
  Write-Host '  ghostnexora restart'
  Write-Host '  ghostnexora pair 521XXXXXXXXXX'
  Write-Host '  ghostnexora update'
  Write-Host '  ghostnexora doctor'
  Write-Host ''
  Write-Ok 'Ghost Nexora Bot está listo para Windows.'
} catch {
  Write-Host ''
  Write-Fail $_.Exception.Message
  Write-Host 'La sesión y los datos persistentes no se eliminan al repetir el instalador.' -ForegroundColor DarkGray
  exit 1
}
