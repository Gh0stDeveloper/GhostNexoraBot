param(
  [string]$InstallDir = (Join-Path $HOME 'GhostNexoraBot'),
  [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'GhostNexoraBot'),
  [string]$Branch = 'main',
  [ValidateSet('Ask', 'Yes', 'No')]
  [string]$Web = 'Ask',
  [ValidateSet('Ask', 'Local', 'Public')]
  [string]$WebMode = 'Ask',
  [int]$WebPort = 3000,
  [string]$PublicWebUrl = '',
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
$CurrentStage = 'Inicialización'
$CurrentStep = '0/10'
$ErrorLog = Join-Path $StateDir 'logs\install-error.log'

function Write-Line([string]$Character = '═', [ConsoleColor]$Color = [ConsoleColor]::DarkCyan) {
  Write-Host ($Character * 70) -ForegroundColor $Color
}

function Write-Banner([string]$Subtitle) {
  Clear-Host
  Write-Host ''
  Write-Line '═' DarkCyan
  Write-Host '   GHOST NEXORA BOT · WINDOWS INSTALLER' -ForegroundColor Cyan
  Write-Host ('   ' + $Subtitle) -ForegroundColor White
  Write-Line '═' DarkCyan
  Write-Host '   Instalación nativa · Windows 10/11 · sin WSL' -ForegroundColor DarkGray
  Write-Host ''
}

function Write-Section([string]$Title) {
  Write-Host ''
  Write-Line '─' DarkGray
  Write-Host ('  ' + $Title) -ForegroundColor White
  Write-Line '─' DarkGray
}

function Write-Step([string]$Step, [string]$Title) {
  $script:CurrentStep = $Step
  $script:CurrentStage = $Title
  Write-Host ''
  Write-Host ('┌─ PASO ' + $Step + ' ') -NoNewline -ForegroundColor DarkCyan
  Write-Host $Title -ForegroundColor Cyan
}

function Write-Ok([string]$Text) { Write-Host ('  [ OK ] ' + $Text) -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host ('  [INFO] ' + $Text) -ForegroundColor Gray }
function Write-Warn([string]$Text) { Write-Host ('  [WARN] ' + $Text) -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host ('  [ERROR] ' + $Text) -ForegroundColor Red }
function Write-Choice([string]$Key, [string]$Text, [string]$Detail = '') {
  Write-Host ('    [' + $Key + '] ') -NoNewline -ForegroundColor Cyan
  Write-Host $Text -NoNewline -ForegroundColor White
  if ($Detail) { Write-Host ('  · ' + $Detail) -ForegroundColor DarkGray } else { Write-Host '' }
}

function Read-YesNo([string]$Prompt, [bool]$DefaultNo = $true) {
  while ($true) {
    $suffix = if ($DefaultNo) { '[s/N]' } else { '[S/n]' }
    $value = (Read-Host ($Prompt + ' ' + $suffix)).Trim().ToLowerInvariant()
    if (-not $value) { return -not $DefaultNo }
    if ($value -match '^(s|si|sí|y|yes)$') { return $true }
    if ($value -match '^(n|no)$') { return $false }
    Write-Warn 'Respuesta no válida. Usa S o N.'
  }
}

function Read-Port([string]$Prompt, [int]$DefaultPort) {
  while ($true) {
    $raw = (Read-Host ($Prompt + ' [' + $DefaultPort + ']')).Trim()
    if (-not $raw) { return $DefaultPort }
    $parsed = 0
    if ([int]::TryParse($raw, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) {
      if ($parsed -eq 3001) {
        Write-Warn 'El puerto 3001 está reservado para BOT_HEALTH_PORT. Elige otro.'
        continue
      }
      return $parsed
    }
    Write-Warn 'Puerto inválido. Debe estar entre 1 y 65535.'
  }
}

function Normalize-PublicUrl([string]$Value) {
  $value = $Value.Trim().TrimEnd('/')
  if (-not $value) { throw 'El dominio público no puede estar vacío.' }
  if ($value -notmatch '^https?://') { $value = 'https://' + $value }
  $uri = $null
  if (-not [Uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri)) { throw 'El dominio/URL pública no es válida.' }
  if ($uri.Scheme -ne 'https') { throw 'La Web pública debe usar HTTPS.' }
  if ($uri.Host -match '^(localhost|127\.0\.0\.1|0\.0\.0\.0)$') { throw 'El modo público requiere un dominio real, no localhost.' }
  if ($uri.AbsolutePath -ne '/') { Write-Warn 'Se ignorará la ruta del dominio; PUBLIC_WEB_URL debe apuntar a la raíz.' }
  return ('https://' + $uri.Authority)
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (($machine, $user) -join ';')
  $extraDirs = @(
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Ollama'),
    (Join-Path $env:ProgramFiles 'Git\cmd'),
    (Join-Path $env:ProgramFiles 'nodejs')
  )
  foreach ($dir in $extraDirs) {
    if ((Test-Path $dir) -and ($env:Path -notlike "*$dir*")) { $env:Path += ';' + $dir }
  }
}

function Repair-CommandPath([string]$Command) {
  Refresh-Path
  if (Get-Command $Command -ErrorAction SilentlyContinue) { return $true }
  $packages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path $packages) {
    $candidate = Get-ChildItem -Path $packages -Filter $Command -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candidate) {
      $dir = $candidate.DirectoryName
      if ($env:Path -notlike "*$dir*") { $env:Path += ';' + $dir }
    }
  }
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function Require-WinGet {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw 'WinGet no está disponible. Instala o actualiza "App Installer" desde Microsoft Store.'
  }
  Write-Ok 'WinGet disponible.'
}

function Install-Package([string]$Id, [string]$Command, [string]$Label) {
  if (Get-Command $Command -ErrorAction SilentlyContinue) {
    Write-Ok "$Label ya está instalado."
    return
  }

  Write-Info "Instalando $Label ($Id)..."
  & winget.exe install --id $Id -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) { throw "WinGet no pudo instalar $Label. Código de salida: $LASTEXITCODE." }

  $available = $false
  for ($i = 0; $i -lt 8; $i++) {
    if (Repair-CommandPath $Command) { $available = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $available) { throw "$Label terminó de instalarse, pero $Command no apareció en PATH." }
  Write-Ok "$Label instalado y disponible en esta misma terminal."
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $envPath = Join-Path $InstallDir '.env'
  $lines = @()
  if (Test-Path $envPath) { $lines = @(Get-Content $envPath) }
  $escapedKey = [regex]::Escape($Key)
  $found = $false
  $newLines = foreach ($line in $lines) {
    if ($line -match ('^' + $escapedKey + '=')) { $found = $true; "$Key=$Value" } else { $line }
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

function Test-Truthy([string]$Value) {
  if ($null -eq $Value) { return $false }
  return $Value.Trim().ToLowerInvariant() -match '^(1|true|yes|on|si|sí)$'
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
    Write-Info 'Instalando Ollama mediante WinGet...'
    & winget.exe install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "Ollama no pudo instalarse. Código de salida: $LASTEXITCODE." }
    Refresh-Path
  }
  if (-not (Repair-CommandPath 'ollama.exe')) { throw 'Ollama fue instalado, pero ollama.exe no está disponible en PATH.' }

  if (-not (Test-OllamaApi)) {
    Write-Info 'Iniciando API local de Ollama...'
    Start-Process -FilePath 'ollama.exe' -ArgumentList @('serve') -WindowStyle Hidden | Out-Null
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      if (Test-OllamaApi) { $ready = $true; break }
    }
    if (-not $ready) { throw 'La API de Ollama no respondió en http://127.0.0.1:11434.' }
  }

  Write-Info "Descargando o verificando modelo $Model..."
  & ollama.exe pull $Model
  if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar el modelo $Model. Código: $LASTEXITCODE." }
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
    [Environment]::SetEnvironmentVariable('Path', (($parts + $binDir) -join ';'), 'User')
  }
  if ($env:Path -notlike "*$binDir*") { $env:Path += ';' + $binDir }

  [Environment]::SetEnvironmentVariable('GHOST_NEXORA_HOME', $InstallDir, 'User')
  [Environment]::SetEnvironmentVariable('GHOST_NEXORA_STATE', $StateDir, 'User')
  $env:GHOST_NEXORA_HOME = $InstallDir
  $env:GHOST_NEXORA_STATE = $StateDir

  Write-Ok "Gestor instalado: $cmdPath"
  return $managerTarget
}

function Write-InstallError([System.Management.Automation.ErrorRecord]$Record) {
  try { New-Item -ItemType Directory -Force -Path (Split-Path $ErrorLog -Parent) | Out-Null } catch {}

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $details = @(
    '============================================================',
    "Ghost Nexora Bot · ERROR DE INSTALACIÓN · $timestamp",
    "Paso: $CurrentStep",
    "Etapa: $CurrentStage",
    "Mensaje: $($Record.Exception.Message)",
    "Tipo: $($Record.Exception.GetType().FullName)",
    "Comando: $($Record.InvocationInfo.Line)",
    "Posición: $($Record.InvocationInfo.PositionMessage)",
    "Stack: $($Record.ScriptStackTrace)",
    '============================================================',
    ''
  )

  try { Add-Content -Path $ErrorLog -Value $details -Encoding utf8 } catch {}

  Write-Host ''
  Write-Line '═' Red
  Write-Host '   INSTALACIÓN DETENIDA POR UN ERROR' -ForegroundColor Red
  Write-Line '═' Red
  Write-Host ('   Paso   : ' + $CurrentStep) -ForegroundColor Yellow
  Write-Host ('   Etapa  : ' + $CurrentStage) -ForegroundColor Yellow
  Write-Host ('   Error  : ' + $Record.Exception.Message) -ForegroundColor Red
  if ($Record.InvocationInfo.Line) {
    Write-Host ('   Código : ' + $Record.InvocationInfo.Line.Trim()) -ForegroundColor DarkRed
  }
  Write-Host ('   Log    : ' + $ErrorLog) -ForegroundColor Gray
  Write-Host ''
  Write-Host '   La salida anterior permanece visible para localizar exactamente dónde falló.' -ForegroundColor White
  Write-Host '   Corrige el problema y vuelve a ejecutar el instalador.' -ForegroundColor White
  Write-Line '═' Red
}

try {
  if ($env:OS -ne 'Windows_NT') { throw 'Este instalador es exclusivo para Windows 10/11.' }

  New-Item -ItemType Directory -Force -Path (Join-Path $StateDir 'logs') | Out-Null
  Write-Banner $(if ($FirstInstall) { 'ASISTENTE DE PRIMERA INSTALACIÓN' } else { 'ACTUALIZACIÓN / REPARACIÓN' })

  Write-Section 'RESUMEN INICIAL'
  Write-Host ('  Repositorio : ' + $RepoUrl) -ForegroundColor Gray
  Write-Host ('  Rama        : ' + $Branch) -ForegroundColor Gray
  Write-Host ('  Código      : ' + $InstallDir) -ForegroundColor Gray
  Write-Host ('  Datos       : ' + $StateDir) -ForegroundColor Gray
  Write-Host ('  Modo        : ' + $(if ($FirstInstall) { 'Primera instalación' } else { 'Actualización / reparación' })) -ForegroundColor Gray

  Write-Step '1/10' 'Herramientas del sistema'
  Require-WinGet
  Install-Package 'Git.Git' 'git.exe' 'Git'
  Install-Package 'OpenJS.NodeJS.LTS' 'node.exe' 'Node.js LTS'
  Install-Package 'Gyan.FFmpeg' 'ffmpeg.exe' 'FFmpeg'
  Install-Package 'yt-dlp.yt-dlp' 'yt-dlp.exe' 'yt-dlp'
  Refresh-Path

  $nodeMajor = [int]((& node.exe -p "Number(process.versions.node.split('.')[0])").Trim())
  if ($nodeMajor -lt 24) {
    Write-Warn 'Node.js es demasiado antiguo. Intentando actualizar a LTS...'
    & winget.exe upgrade --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar Node.js. Código: $LASTEXITCODE." }
    Refresh-Path
    $nodeMajor = [int]((& node.exe -p "Number(process.versions.node.split('.')[0])").Trim())
    if ($nodeMajor -lt 24) { throw 'Ghost Nexora Bot requiere Node.js 24 o superior.' }
  }
  Write-Ok ("Node.js " + (& node.exe --version) + ' · npm ' + (& npm.cmd --version))

  Write-Step '2/10' 'Código fuente'
  if (Test-Path (Join-Path $InstallDir '.git')) {
    Write-Info "Actualizando rama $Branch..."
    & git.exe -C $InstallDir fetch origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "git fetch origin $Branch falló. Código: $LASTEXITCODE." }
    & git.exe -C $InstallDir checkout $Branch
    if ($LASTEXITCODE -ne 0) { throw "git checkout $Branch falló. Código: $LASTEXITCODE." }
    & git.exe -C $InstallDir pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "git pull --ff-only origin $Branch falló. Código: $LASTEXITCODE." }
    Write-Ok 'Repositorio actualizado.'
  } else {
    $parent = Split-Path $InstallDir -Parent
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Write-Info 'Clonando repositorio...'
    & git.exe clone --depth 1 --branch $Branch $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { throw "git clone falló. Código: $LASTEXITCODE." }
    Write-Ok 'Repositorio clonado.'
  }

  Write-Step '3/10' 'Persistencia y configuración base'
  New-Item -ItemType Directory -Force -Path $StateDir, (Join-Path $StateDir 'session'), (Join-Path $StateDir 'data'), (Join-Path $StateDir 'data\subbots'), (Join-Path $StateDir 'logs'), (Join-Path $StateDir 'run') | Out-Null
  $envPath = Join-Path $InstallDir '.env'
  if (-not (Test-Path $envPath)) { Copy-Item (Join-Path $InstallDir '.env.example') $envPath }

  Set-EnvValue 'NEXORA_RUNTIME_PROFILE' 'full'
  Set-EnvValue 'SESSION_DIR' (Join-Path $StateDir 'session')
  Set-EnvValue 'DATA_DIR' (Join-Path $StateDir 'data')
  Set-EnvValue 'MAX_DOWNLOAD_MB' '1900'
  Set-EnvValue 'BOT_HEALTH_PORT' '3001'
  Set-EnvValue 'BOT_HEALTH_URL' 'http://127.0.0.1:3001/health'
  Set-EnvValue 'OFFICIAL_CHANNEL_URL' 'https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i'

  $adminToken = Get-EnvValue 'ADMIN_WEB_TOKEN'
  if (-not $adminToken -or $adminToken -eq 'change-this-admin-token') {
    Set-EnvValue 'ADMIN_WEB_TOKEN' (New-SecureToken)
  }
  Write-Ok 'Datos persistentes y .env preparados.'

  Write-Step '4/10' 'Dashboard Web'
  if ($FirstInstall) {
    $webChoice = if ($SkipWeb) { 'No' } else { $Web }

    if ($webChoice -eq 'Ask') {
      Write-Section 'DASHBOARD WEB · OPCIONAL'
      Write-Host '  El bot funciona sin la Web. Actívala solo si necesitas el panel y portal de subbots.' -ForegroundColor White
      Write-Choice 'S' 'Instalar Dashboard Web' 'Después elegirás Local o Pública'
      Write-Choice 'N' 'No instalar Web' 'Solo se instalará el bot'
      $webChoice = if (Read-YesNo '¿Deseas instalar/configurar la Web?') { 'Yes' } else { 'No' }
    }

    if ($webChoice -eq 'Yes') {
      $selectedMode = $WebMode
      if ($selectedMode -eq 'Ask') {
        Write-Section 'MODO DE ACCESO WEB'
        Write-Choice '1' 'LOCAL' 'Solo esta PC · http://127.0.0.1:PUERTO'
        Write-Choice '2' 'PÚBLICA' 'Dominio HTTPS · requiere DNS + reverse proxy/túnel'
        while ($true) {
          $modeChoice = (Read-Host 'Selecciona 1 o 2').Trim()
          if ($modeChoice -eq '1') { $selectedMode = 'Local'; break }
          if ($modeChoice -eq '2') { $selectedMode = 'Public'; break }
          Write-Warn 'Opción inválida.'
        }
      }

      $selectedPort = Read-Port 'Puerto interno del Dashboard' $WebPort
      Set-EnvValue 'WEB_ENABLED' 'true'
      Set-EnvValue 'WEB_PORT' ([string]$selectedPort)

      if ($selectedMode -eq 'Public') {
        if (-not $PublicWebUrl) {
          Write-Host ''
          Write-Host '  Introduce el dominio público. Ejemplo: panel.midominio.com' -ForegroundColor White
          Write-Host '  Debe resolver hacia esta máquina mediante DNS y reverse proxy/túnel con HTTPS.' -ForegroundColor DarkGray
          $PublicWebUrl = Read-Host 'Dominio o URL HTTPS'
        }
        $normalizedPublicUrl = Normalize-PublicUrl $PublicWebUrl
        Set-EnvValue 'WEB_EXPOSURE' 'public'
        Set-EnvValue 'PUBLIC_WEB_URL' $normalizedPublicUrl
        Write-Ok "Web pública configurada: $normalizedPublicUrl"
        Write-Warn "El Dashboard escucha internamente en el puerto $selectedPort. El dominio necesita DNS + HTTPS + reverse proxy/túnel apuntando a ese puerto."
      } else {
        $localUrl = "http://127.0.0.1:$selectedPort"
        Set-EnvValue 'WEB_EXPOSURE' 'local'
        Set-EnvValue 'PUBLIC_WEB_URL' $localUrl
        Write-Ok "Web local configurada: $localUrl"
        Write-Info 'No se requiere dominio para el modo local.'
      }
    } else {
      Set-EnvValue 'WEB_ENABLED' 'false'
      Set-EnvValue 'WEB_EXPOSURE' 'disabled'
      if (-not (Get-EnvValue 'WEB_PORT')) { Set-EnvValue 'WEB_PORT' '3000' }
      if (-not (Get-EnvValue 'PUBLIC_WEB_URL')) { Set-EnvValue 'PUBLIC_WEB_URL' 'http://127.0.0.1:3000' }
      Write-Ok 'Dashboard Web deshabilitado. Se instalará únicamente el bot.'
    }
  } else {
    $existingWeb = Get-EnvValue 'WEB_ENABLED'
    if (-not $existingWeb) {
      $legacyWeb = Test-Path (Join-Path $InstallDir 'apps\web\.next')
      Set-EnvValue 'WEB_ENABLED' $(if ($legacyWeb) { 'true' } else { 'false' })
      Set-EnvValue 'WEB_EXPOSURE' $(if ($legacyWeb) { 'local' } else { 'disabled' })
      if (-not (Get-EnvValue 'WEB_PORT')) { Set-EnvValue 'WEB_PORT' '3000' }
      if (-not (Get-EnvValue 'PUBLIC_WEB_URL')) { Set-EnvValue 'PUBLIC_WEB_URL' 'http://127.0.0.1:3000' }
      Write-Info 'Instalación heredada detectada; se preservó el estado de la Web.'
    } else {
      Write-Info "Se conserva WEB_ENABLED=$existingWeb."
    }
  }

  $webEnabled = Test-Truthy (Get-EnvValue 'WEB_ENABLED')
  $webExposure = Get-EnvValue 'WEB_EXPOSURE'
  $webUrl = Get-EnvValue 'PUBLIC_WEB_URL'
  Write-Ok ('Dashboard: ' + $(if ($webEnabled) { ('HABILITADO · ' + $webExposure + ' · ' + $webUrl) } else { 'DESHABILITADO' }))

  Write-Step '5/10' 'Ollama + Qwen'
  if ($FirstInstall) {
    $choice = $Ollama
    if ($choice -eq 'Ask') {
      Write-Section 'INTELIGENCIA ARTIFICIAL LOCAL · OPCIONAL'
      Write-Host '  Ollama activa LLM local, RAG y conversación libre.' -ForegroundColor White
      Write-Host '  Consume RAM, CPU y almacenamiento. Si eliges No, el bot funciona normalmente.' -ForegroundColor DarkGray
      Write-Host ('  Modelo recomendado: ' + $OllamaModel) -ForegroundColor DarkGray
      $choice = if (Read-YesNo '¿Deseas instalar Ollama + Qwen?') { 'Yes' } else { 'No' }
    }

    if ($choice -eq 'Yes') {
      try {
        Ensure-Ollama $OllamaModel
        Set-EnvValue 'OLLAMA_ENABLED' 'true'
        Set-EnvValue 'OLLAMA_MODEL' $OllamaModel
      } catch {
        Set-EnvValue 'OLLAMA_ENABLED' 'false'
        throw "Ollama no pudo quedar operativo: $($_.Exception.Message)"
      }
    } else {
      Set-EnvValue 'OLLAMA_ENABLED' 'false'
      Set-EnvValue 'OLLAMA_MODEL' $OllamaModel
      Write-Ok 'Ollama omitido. Los comandos LLM locales permanecerán ocultos.'
    }
  } else {
    $enabled = (Get-EnvValue 'OLLAMA_ENABLED').ToLowerInvariant()
    if (($enabled -match '^(1|true|yes|on)$') -and -not (Get-Command ollama.exe -ErrorAction SilentlyContinue)) {
      Set-EnvValue 'OLLAMA_ENABLED' 'false'
      Write-Warn 'OLLAMA_ENABLED estaba activo pero Ollama ya no existe; se desactivó.'
    } else {
      Write-Info 'Se conserva la configuración actual de Ollama.'
    }
  }

  Write-Step '6/10' 'Dependencias Node.js'
  Push-Location $InstallDir
  try {
    if ($webEnabled) {
      Write-Info 'Ejecutando npm install para Bot + Web...'
      & npm.cmd install
      if ($LASTEXITCODE -ne 0) { throw "npm install falló. Código: $LASTEXITCODE." }
    } else {
      Write-Info 'Ejecutando npm install únicamente para el Bot...'
      & npm.cmd install --workspace=@ghostnexora/bot --include=dev
      if ($LASTEXITCODE -ne 0) { throw "npm install del bot falló. Código: $LASTEXITCODE." }
    }
  } finally {
    Pop-Location
  }
  Write-Ok ('Dependencias instaladas: ' + $(if ($webEnabled) { 'Bot + Web' } else { 'solo Bot' }))

  Write-Step '7/10' 'Build de producción'
  Push-Location $InstallDir
  try {
    if ($webEnabled) {
      Write-Info 'Compilando Bot + Dashboard...'
      & npm.cmd run build
      if ($LASTEXITCODE -ne 0) { throw "npm run build falló. Código: $LASTEXITCODE." }
    } else {
      Write-Info 'Preparando assets del bot...'
      & npm.cmd run assets:waifus
      if ($LASTEXITCODE -ne 0) { throw "assets:waifus falló. Código: $LASTEXITCODE." }

      Write-Info 'Compilando Bot...'
      & npm.cmd run build --workspace=@ghostnexora/bot
      if ($LASTEXITCODE -ne 0) { throw "build del bot falló. Código: $LASTEXITCODE." }
    }
  } finally {
    Pop-Location
  }
  Write-Ok ('Build completado: ' + $(if ($webEnabled) { 'Bot + Dashboard' } else { 'solo Bot' }))

  Write-Step '8/10' 'Gestor de Windows'
  $managerPath = Install-Manager

  Write-Step '9/10' 'Configuración del bot'
  if ($FirstInstall -and -not $SkipPair) {
    Write-Info 'Se abrirá el menú de configuración de APIs, owner y pairing.'
    Write-Info 'Nada se iniciará automáticamente salvo que lo elijas desde ese menú.'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $managerPath configure
    if ($LASTEXITCODE -ne 0) { throw "El menú ghostnexora configure terminó con código $LASTEXITCODE." }
  } else {
    Write-Info 'Menú interactivo omitido. Puedes abrirlo después con: ghostnexora configure'
  }

  Write-Step '10/10' 'Resumen final'
  $elapsed = [math]::Round(((Get-Date) - $StartedAt).TotalSeconds, 1)

  Write-Host ''
  Write-Line '═' Green
  Write-Host '   INSTALACIÓN COMPLETADA CORRECTAMENTE' -ForegroundColor Green
  Write-Line '═' Green
  Write-Host ('   Tiempo      : ' + $elapsed + ' s') -ForegroundColor White
  Write-Host ('   Código      : ' + $InstallDir) -ForegroundColor Gray
  Write-Host ('   Datos       : ' + $StateDir) -ForegroundColor Gray
  Write-Host ('   Web         : ' + $(if ($webEnabled) { ($webExposure + ' · ' + $webUrl) } else { 'DESHABILITADA' })) -ForegroundColor Gray
  Write-Host ('   Ollama      : ' + (Get-EnvValue 'OLLAMA_ENABLED')) -ForegroundColor Gray
  Write-Host ('   MainBot     : APAGADO hasta que el usuario lo inicie') -ForegroundColor Yellow
  Write-Host ''
  Write-Host '   Comandos útiles:' -ForegroundColor Cyan
  Write-Host '     ghostnexora configure' -ForegroundColor White
  Write-Host '     ghostnexora start' -ForegroundColor White
  Write-Host '     ghostnexora status' -ForegroundColor White
  Write-Host '     ghostnexora logs' -ForegroundColor White
  Write-Host '     ghostnexora update' -ForegroundColor White
  Write-Host '     ghostnexora doctor' -ForegroundColor White
  if ($webEnabled) { Write-Host '     ghostnexora web-start / web-stop' -ForegroundColor White }
  Write-Host ''
  Write-Line '═' Green
} catch {
  Write-InstallError $_
  exit 1
}
