$ErrorActionPreference = 'Stop'
$packageRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location -LiteralPath $packageRoot
try {
    & node scripts/build.mjs --check
    if ($LASTEXITCODE -ne 0) { throw 'Build verification failed.' }
    & node scripts/test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Offline tests failed.' }
    $packageVersion = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
    $distPath = Join-Path $packageRoot 'dist'
    New-Item -ItemType Directory -Path $distPath -Force | Out-Null
    $zipPath = Join-Path $distPath "disney-plus-edge-enhanced-v$packageVersion.zip"
    if (Test-Path -LiteralPath $zipPath) { throw "Archive already exists: $zipPath" }
    # Explicit allowlist: never include browser profiles, raw traces, or dumps.
    $releaseFiles = @('extension/manifest.json', 'extension/DisneyPlus-Edge-Enhanced.user.js', 'README.md', 'LICENSE', 'PRIVACY.md', 'NOTICE.md', 'docs/diagnostics.md', 'docs/related-issues.md')
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $releaseArchive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($relativeFile in $releaseFiles) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($releaseArchive, (Join-Path $packageRoot $relativeFile), $relativeFile, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $releaseArchive.Dispose()
    }
    Copy-Item -LiteralPath extension\DisneyPlus-Edge-Enhanced.user.js -Destination (Join-Path $distPath 'DisneyPlus-Edge-Enhanced.user.js')
    Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath, (Join-Path $distPath 'DisneyPlus-Edge-Enhanced.user.js') | Format-List
} finally {
    Pop-Location
}
