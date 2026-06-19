param(
    [ValidateSet("desktop", "start", "shutdown", "setup", "help")]
    [string]$Command = "desktop"
)

$ErrorActionPreference = "Stop"

$ScriptPath = $PSCommandPath
$ScriptDir = Split-Path -Parent $ScriptPath
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$StateRoot = Join-Path $HOME ".omnux"
$StateDir = Join-Path $StateRoot "cli"
$PidFile = Join-Path $StateDir "middleware.pid"
$LogFile = Join-Path $StateDir "middleware.log"
$ErrLogFile = Join-Path $StateDir "middleware.err.log"
$MetaFile = Join-Path $StateDir "last-start.env"
$SetupMarkerFile = Join-Path $StateDir "setup-complete"
$MiddlewareProject = Join-Path $RepoRoot "apps\omnux-middleware\Omnux.Middleware.csproj"
$DefaultPort = if ($env:OMNUX_WS_PORT) { $env:OMNUX_WS_PORT } else { "41880" }
$DefaultBaseUrl = "http://127.0.0.1:$DefaultPort"
$DesktopUiPort = 1420

Set-Location $RepoRoot

function Write-Info {
    param([string]$Message)
    Write-Host "[omnux] $Message"
}

function Stop-WithError {
    param([string]$Message)
    Write-Error "[omnux] $Message"
    exit 1
}

function Ensure-StateDir {
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
}

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-PowerShellCommand {
    if (Test-CommandExists "pwsh") {
        return "pwsh"
    }

    return "powershell"
}

function Resolve-PythonCommand {
    if (Test-CommandExists "python") {
        $result = & python --version 2>$null
        if ($LASTEXITCODE -eq 0 -and "$result" -match "Python 3") {
            return @{ File = "python"; Args = @() }
        }
    }

    if (Test-CommandExists "py") {
        & py -3 --version *> $null
        if ($LASTEXITCODE -eq 0) {
            return @{ File = "py"; Args = @("-3") }
        }
    }

    Stop-WithError "Python 3 실행 파일을 찾지 못했습니다. python 또는 py 런처를 PATH에 추가하세요."
}

function Invoke-Python {
    param(
        [hashtable]$Python,
        [string[]]$Arguments
    )

    & $Python.File @($Python.Args + $Arguments)
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

function Test-ProcessAlive {
    param([string]$PidText)
    if ([string]::IsNullOrWhiteSpace($PidText)) {
        return $false
    }

    try {
        Get-Process -Id ([int]$PidText) -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Read-PidFile {
    if (Test-Path $PidFile) {
        return (Get-Content -Raw $PidFile).Trim()
    }
    return ""
}

function Test-HttpOk {
    param([string]$Path)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "$DefaultBaseUrl$Path"
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Cleanup-StaleState {
    $pidText = Read-PidFile
    if ($pidText -and -not (Test-ProcessAlive $pidText)) {
        Remove-Item -Force -ErrorAction SilentlyContinue $PidFile
    }
}

function Ensure-RequiredCommands {
    $missing = @()
    foreach ($tool in @("dotnet", "node", "npm")) {
        if (-not (Test-CommandExists $tool)) {
            $missing += $tool
        }
    }

    Resolve-PythonCommand | Out-Null

    if ($missing.Count -gt 0) {
        Stop-WithError "필수 도구가 없습니다: $($missing -join ', '). 먼저 scripts\omnux.ps1 setup을 실행하세요."
    }
}

function Test-SetupComplete {
    return (Test-Path $SetupMarkerFile) -and (Test-Path (Join-Path $RepoRoot "node_modules"))
}

function Write-SetupMarker {
    Ensure-StateDir
    @(
        "repo=$RepoRoot",
        "script=$ScriptPath",
        "completed_at=$(Get-Date -Format o)"
    ) | Set-Content -Encoding UTF8 -Path $SetupMarkerFile
}

function Install-CliWrapper {
    $binDir = Join-Path $HOME ".omnux\bin"
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    $cmdPath = Join-Path $binDir "omnux.cmd"
    @"
@echo off
pwsh -NoProfile -ExecutionPolicy Bypass -File "$ScriptPath" %*
if %ERRORLEVEL% EQU 9009 powershell -NoProfile -ExecutionPolicy Bypass -File "$ScriptPath" %*
"@ | Set-Content -Encoding ASCII -Path $cmdPath
    Write-Info "명령 래퍼 생성 완료: $cmdPath"
    Write-Info "전역 실행이 필요하면 PATH에 추가하세요: $binDir"
}

function Invoke-Step {
    param(
        [string]$Label,
        [string]$FileName,
        [string[]]$Arguments
    )

    Write-Info $Label
    & $FileName @Arguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

function Run-Setup {
    Ensure-StateDir
    Ensure-RequiredCommands

    $python = Resolve-PythonCommand
    $powerShell = Resolve-PowerShellCommand
    Install-CliWrapper

    Invoke-Step "Node 의존성 설치" "npm" @("ci")
    Invoke-Step ".NET 빌드" "dotnet" @("build", "apps\omnux-middleware\Omnux.Middleware.csproj")

    Write-Info "샌드박스 smoke"
    Invoke-Python $python @("apps\omnux-sandbox\executor.py", "--code", "print('ok')")

    Invoke-Step "통합 테스트" "npm" @("test")
    Write-SetupMarker
    Write-Info "setup 완료"
}

function Ensure-SetupIfNeeded {
    if (Test-SetupComplete) {
        return
    }

    Write-Info "첫 실행이거나 setup 상태가 없어 자동 setup을 시작합니다."
    Run-Setup
}

function Wait-ForReady {
    param([int]$Pid)
    for ($i = 0; $i -lt 60; $i++) {
        if (-not (Test-ProcessAlive "$Pid")) {
            Get-Content -Tail 40 -ErrorAction SilentlyContinue $LogFile, $ErrLogFile
            Stop-WithError "서버 프로세스가 준비 전에 종료됐습니다. 로그를 확인하세요: $LogFile"
        }

        if ((Test-HttpOk "/healthz") -and (Test-HttpOk "/readyz")) {
            return
        }

        Start-Sleep -Seconds 1
    }

    Get-Content -Tail 40 -ErrorAction SilentlyContinue $LogFile, $ErrLogFile
    Stop-WithError "서버가 $DefaultBaseUrl 에서 준비 상태가 되지 않았습니다. 로그: $LogFile"
}

function Write-StartMetadata {
    param([int]$Pid)
    @(
        "pid=$Pid",
        "port=$DefaultPort",
        "url=$DefaultBaseUrl/",
        "repo=$RepoRoot",
        "log=$LogFile",
        "stderr_log=$ErrLogFile",
        "started_at=$(Get-Date -Format o)"
    ) | Set-Content -Encoding UTF8 -Path $MetaFile
}

function Start-Server {
    Ensure-StateDir
    Cleanup-StaleState
    Ensure-SetupIfNeeded
    Ensure-RequiredCommands

    $currentPid = Read-PidFile
    if ((Test-ProcessAlive $currentPid) -and (Test-HttpOk "/healthz")) {
        Write-Info "이미 실행 중입니다. pid=$currentPid url=$DefaultBaseUrl/"
        return
    }

    "`n[$(Get-Date -Format o)] omnux start" | Add-Content -Encoding UTF8 -Path $LogFile
    $workspaceRoot = if ($env:OMNUX_WORKSPACE_ROOT) { $env:OMNUX_WORKSPACE_ROOT } else { Join-Path $RepoRoot "workspace\coding" }
    $env:OMNUX_WORKSPACE_ROOT = $workspaceRoot
    $localOtp = if ($env:OMNUX_ENABLE_LOCAL_OTP_FALLBACK) { $env:OMNUX_ENABLE_LOCAL_OTP_FALLBACK } else { "1" }
    $env:OMNUX_ENABLE_LOCAL_OTP_FALLBACK = $localOtp
    $startupProbe = if ($env:OMNUX_GATEWAY_STARTUP_PROBE) { $env:OMNUX_GATEWAY_STARTUP_PROBE } else { "1" }
    $env:OMNUX_GATEWAY_STARTUP_PROBE = $startupProbe
    $env:OMNUX_WS_PORT = $DefaultPort
    if (-not $env:OMNUX_TELEGRAM_POLLING_DISABLED) {
        $env:OMNUX_TELEGRAM_POLLING_DISABLED = "1"
    }

    $process = Start-Process -FilePath "dotnet" `
        -ArgumentList @("run", "--project", $MiddlewareProject) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $ErrLogFile `
        -WindowStyle Hidden `
        -PassThru

    Set-Content -Encoding ASCII -Path $PidFile -Value $process.Id
    Write-StartMetadata $process.Id

    Write-Info "서버 시작 중입니다. pid=$($process.Id)"
    Wait-ForReady $process.Id
    Write-Info "서버가 준비됐습니다."
    Write-Info "미들웨어 API/WS: $DefaultBaseUrl/"
    Write-Info "Tauri 외부접속 UI는 scripts\omnux.ps1 desktop 실행 후 http://<LAN-IP>:$DesktopUiPort/ 로 접속하세요."
    Write-Info "로그: $LogFile"
}

function Shutdown-Server {
    Ensure-StateDir
    Cleanup-StaleState

    $pidText = Read-PidFile
    if (-not $pidText) {
        Write-Info "종료할 서버 PID를 찾지 못했습니다."
        return
    }

    if (Test-ProcessAlive $pidText) {
        Stop-Process -Id ([int]$pidText) -Force -ErrorAction SilentlyContinue
        Write-Info "미들웨어 종료 완료 (pid=$pidText)"
    }

    Remove-Item -Force -ErrorAction SilentlyContinue $PidFile
    Write-Info "omnux 종료 완료"
}

function Stop-ListenerOnPort {
    param(
        [int]$Port,
        [string]$Label
    )
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        return
    }

    Write-Info "$Label 포트 $Port에 기존 프로세스가 있습니다. 정리합니다."
    foreach ($conn in $connections) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

function Run-Desktop {
    if (-not (Test-CommandExists "npm")) {
        Stop-WithError "npm이 필요합니다. 먼저 setup을 실행하세요."
    }

    if (-not (Test-CommandExists "cargo")) {
        Stop-WithError "Rust(cargo)가 필요합니다 (Tauri). https://rustup.rs 에서 설치 후 다시 시도하세요.`n미들웨어만 실행하려면 'omnux start'를 사용하세요."
    }

    $desktopDir = Join-Path $RepoRoot "apps\desktop"
    if (-not (Test-Path $desktopDir)) {
        Stop-WithError "apps\desktop 디렉터리를 찾을 수 없습니다."
    }

    if (-not (Test-Path (Join-Path $desktopDir "node_modules"))) {
        Write-Info "데스크톱 의존성 설치 (apps/desktop)"
        & npm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    Cleanup-StaleState
    Stop-ListenerOnPort -Port ([int]$DefaultPort) -Label "미들웨어"
    Stop-ListenerOnPort -Port $DesktopUiPort -Label "Tauri UI"
    if (-not $env:OMNUX_DESKTOP_UI_HOST) {
        $env:OMNUX_DESKTOP_UI_HOST = "0.0.0.0"
    }
    Write-Info "Tauri 데스크톱 dev 실행 — 자체 .NET 미들웨어(ws=41880)를 함께 띄웁니다."
    Write-Info "Tauri UI: http://localhost:$DesktopUiPort/"
    Write-Info "외부접속 UI: http://<LAN-IP>:$DesktopUiPort/ (미들웨어 외부접속 토글 필요)"
    Write-Info "인증이 필요하면 데스크톱 앱에서 OTP 요청 버튼을 누르세요. OTP가 이 터미널에 출력됩니다. (Ctrl+C 종료)"

    Set-Location $desktopDir
    & npm run tauri dev
}

switch ($Command) {
    "desktop" { Run-Desktop }
    "start" { Start-Server }
    "shutdown" { Shutdown-Server }
    "setup" { Run-Setup }
    "help" {
        @"
사용법:
  scripts\omnux.ps1           Tauri 데스크톱 앱 + 미들웨어 dev 실행 (포그라운드, Ctrl+C 종료)
  scripts\omnux.ps1 desktop   위와 동일
  scripts\omnux.ps1 start     미들웨어만 백그라운드 실행 (UI 없이 API/WS만 실행)
  scripts\omnux.ps1 shutdown  미들웨어 서버 종료
  scripts\omnux.ps1 setup     의존성 확인, 빌드, 검증
"@ | Write-Host
    }
}
