# PromptCite installer shim — thin PowerShell bootstrap that hands off to bin/install.js.
#
# All detection, merge, and install logic lives in bin/install.js. This shim
# exists only to make the Windows one-liner work. Do NOT reimplement install
# logic here. One Node brain, two shell shims. PowerShell 5.1+ compatible.

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$Repo = 'camadkins/promptcite'

$nodeCmd = Get-Command -Name node -ErrorAction SilentlyContinue
if ($null -eq $nodeCmd) {
    Write-Error @"
promptcite: Node.js (>=18) required.
  Windows: https://nodejs.org (LTS installer) or `winget install OpenJS.NodeJS.LTS`
"@
    exit 1
}

$nodeMajor = & node -p "process.versions.node.split('.')[0]"
if ([int]$nodeMajor -lt 18) {
    Write-Error "promptcite: Node $nodeMajor is too old. Need Node >=18. Upgrade: https://nodejs.org"
    exit 1
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$localEntry = Join-Path $here 'bin/install.js'

if (Test-Path -LiteralPath $localEntry) {
    & node $localEntry @args
    exit $LASTEXITCODE
}

$npxCmd = Get-Command -Name npx -ErrorAction SilentlyContinue
if ($null -eq $npxCmd) {
    Write-Error 'promptcite: npx required (ships with Node >=18). Reinstall Node.js.'
    exit 1
}

& npx -y "github:$Repo" @args
exit $LASTEXITCODE
