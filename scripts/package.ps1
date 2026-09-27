$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseDir = Join-Path $projectRoot 'dist'
$null = New-Item -ItemType Directory -Path $releaseDir -Force
$archivePath = Join-Path $releaseDir 'dead-planner-dokploy.zip'
# Explicit allowlist: never package database files, secrets or old backups.
$releaseFiles = @(
  'Dockerfile', 'docker-compose.yml', '.dockerignore', '.gitignore', '.gitattributes', '.env.example',
  'package.json', 'package-lock.json', 'server.js', 'store.js', 'accounts.js',
  'README.md', 'DOKPLOY.md', 'public/index.html', 'public/css/style.css',
  'public/js/date.js', 'public/js/api.js', 'public/js/calendar.js',
  'public/js/app.js', 'public/js/accounts.js',
  'audit/regression.test.cjs', 'audit/accounts.test.cjs', 'scripts/package.ps1'
)
foreach ($relativePath in $releaseFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relativePath) -PathType Leaf)) {
    throw "Missing release file: $relativePath"
  }
}
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
  try {
    foreach ($relativePath in $releaseFiles) {
      $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, (Join-Path $projectRoot $relativePath), $relativePath,
        [System.IO.Compression.CompressionLevel]::Optimal)
    }
  } finally { $zip.Dispose() }
} finally { $stream.Dispose() }
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($archivePath + '.sha256') -Value "$hash  dead-planner-dokploy.zip" -Encoding ascii
Write-Output "Package: $archivePath"
Write-Output "Files: $($releaseFiles.Count)"
Write-Output "SHA256: $hash"
