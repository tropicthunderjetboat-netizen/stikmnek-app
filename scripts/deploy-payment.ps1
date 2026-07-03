# Deploy payment hardening: paypal_pending_orders migration + payment edge functions.
# Run from repo root:  .\scripts\deploy-payment.ps1
# First time: prompted to log in (npx supabase login).

$ErrorActionPreference = "Stop"
$NodeDir = "C:\Program Files\nodejs"
if (-not (Test-Path "$NodeDir\npm.cmd")) {
  Write-Error "Node.js not found at $NodeDir. Install from https://nodejs.org/ and re-run."
}
$env:Path = "$NodeDir;" + $env:Path

Set-Location $PSScriptRoot\..

Write-Host "Node: $(node -v)" -ForegroundColor Cyan
Write-Host "Project: hbaflbmfptobyfqbudrt (StikmNek)" -ForegroundColor Cyan
Write-Host "Checking Supabase login..." -ForegroundColor Cyan

$npx = "npx.cmd"
& $npx supabase projects list 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Opening login flow..." -ForegroundColor Yellow
  & $npx supabase login
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Supabase login failed. Run: npx supabase login"
  }
}

Write-Host "`nLinking project (if needed)..." -ForegroundColor Cyan
& $npx supabase link --project-ref hbaflbmfptobyfqbudrt

Write-Host "`nPushing database migration (paypal_pending_orders)..." -ForegroundColor Cyan
& $npx supabase db push
if ($LASTEXITCODE -ne 0) {
  Write-Error "db push failed. You can also run the SQL manually in Dashboard -> SQL Editor:"
  Write-Host "  supabase/migrations/20260703120000_paypal_pending_orders.sql" -ForegroundColor Yellow
}

$functions = @(
  "create-checkout",
  "paypal-capture",
  "process-card-payment",
  "send-email"
)

foreach ($fn in $functions) {
  Write-Host "`nDeploying $fn..." -ForegroundColor Cyan
  & $npx supabase functions deploy $fn --use-api
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to deploy $fn"
  }
}

Write-Host "`nPayment deploy complete." -ForegroundColor Green
Write-Host "Verify: Dashboard -> Edge Functions -> Logs after a test purchase." -ForegroundColor Cyan
