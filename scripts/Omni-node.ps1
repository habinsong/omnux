param(
    [ValidateSet("start", "shutdown", "setup", "help")]
    [string]$Command = "start"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $PSCommandPath
& (Join-Path $ScriptDir "omnux.ps1") $Command
exit $LASTEXITCODE
