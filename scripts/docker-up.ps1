# Docker Compose helper for Windows paths that contain non-ASCII characters (e.g. D:\字节).
# BuildKit embeds the build context path in gRPC headers; Chinese characters break the build.

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

function Ensure-SubstDrive {
    param([string]$TargetPath, [string]$Letter)
    $existing = subst 2>$null | Select-String -Pattern "^$([regex]::Escape($Letter))\s" -SimpleMatch
    if ($existing) {
        $mapped = ($existing -split '\s+', 3)[2]
        if ($mapped -ne $TargetPath) {
            Write-Error "Drive $Letter is already mapped to '$mapped'. Run: subst $Letter /d"
        }
        return
    }
    Write-Host "Mapping $Letter -> $TargetPath (Docker BuildKit requires ASCII paths)"
    subst $Letter $TargetPath
}

# Configure Docker registry mirrors for China
$DaemonConfigPath = "$env:USERPROFILE\.docker\daemon.json"
$MirrorsConfig = @{
    "registry-mirrors" = @(
        "https://docker.m.daocloud.io",
        "https://mirror.ccs.tencentyun.com"
    )
}
if (Test-Path $DaemonConfigPath) {
    $ExistingConfig = Get-Content $DaemonConfigPath -Raw | ConvertFrom-Json
    if ($ExistingConfig."registry-mirrors") {
        Write-Host "Registry mirrors already configured"
    } else {
        $ExistingConfig | Add-Member -NotePropertyName "registry-mirrors" -NotePropertyValue $MirrorsConfig."registry-mirrors" -Force
        $ExistingConfig | ConvertTo-Json -Depth 10 | Set-Content $DaemonConfigPath
        Write-Host "Updated Docker daemon config with registry mirrors"
        Write-Host "Please restart Docker Desktop for changes to take effect"
    }
} else {
    $MirrorsConfig | ConvertTo-Json -Depth 10 | Set-Content $DaemonConfigPath
    Write-Host "Created Docker daemon config with registry mirrors"
    Write-Host "Please restart Docker Desktop for changes to take effect"
}

$workDir = $ProjectRoot.Path
if (-not (Test-AsciiPath $workDir)) {
    Ensure-SubstDrive -TargetPath $workDir -Letter $DriveLetter
    $workDir = Join-Path $DriveLetter ''
}

Push-Location $workDir
try {
    Write-Host "Running: docker compose up -d --build (cwd=$workDir)"
    docker compose up -d --build @args
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    Write-Host ''
    Write-Host 'Services started. Open http://localhost:5173 (web) and http://localhost:3000/health (API).'
} finally {
    Pop-Location
}
