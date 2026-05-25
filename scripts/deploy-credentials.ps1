# Deploy business-credentials migration helpers (Supabase CLI via npx).
# Run from repo root:  .\scripts\deploy-credentials.ps1
# First time: you will be prompted to log in (supabase login).

$ErrorActionPreference = "Stop"
$NodeDir = "C:\Program Files\nodejs"
if (-not (Test-Path "$NodeDir\npm.cmd")) {
  Write-Error "Node.js not found at $NodeDir. Install from https://nodejs.org/ and re-run."
}
$env:Path = "$NodeDir;" + $env:Path

Set-Location $PSScriptRoot\..

Write-Host "Node: $(node -v)" -ForegroundColor Cyan
Write-Host "Checking Supabase login..." -ForegroundColor Cyan
# Use .cmd so Windows does not block npx.ps1 (PowerShell script policy)
$npx = "npx.cmd"

& $npx supabase projects list 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Opening login flow..." -ForegroundColor Yellow
  & $npx supabase login
}

Write-Host "`nPushing database migration (business_credentials)..." -ForegroundColor Cyan
& $npx supabase db push

Write-Host "`nDeploying manage-business..." -ForegroundColor Cyan
& $npx supabase functions deploy manage-business --use-api

Write-Host "`nDeploying upload-credential..." -ForegroundColor Cyan
& $npx supabase functions deploy upload-credential --use-api

Write-Host "`nDone." -ForegroundColor Green
