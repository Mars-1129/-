# Stop Docker Compose stack. Uses T: subst when project path contains non-ASCII characters.

$ErrorActionPreference = 'Stop'

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$DriveLetter = 'T:'

function Test-AsciiPath {
    param([string]$Path)
    foreach ($char in $Path.ToCharArray()) {
        if ([int]$char -gt 127) {
            return $false
        }
    }
    return $true
}

$workDir = $ProjectRoot.Path
if (-not (Test-AsciiPath $workDir)) {
    $substLine = subst 2>$null | Select-String -Pattern "^$([regex]::Escape($DriveLetter))\s"
    if ($substLine) {
        $workDir = Join-Path $DriveLetter ''
    }
}

Push-Location $workDir
try {
    docker compose down @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
