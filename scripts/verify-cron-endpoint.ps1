# Verify cron endpoint (same as GitHub Actions). Run from project root.
# Usage: .\scripts\verify-cron-endpoint.ps1
# Requires CRON_SECRET in env or pass: $env:CRON_SECRET = "your-secret"

$base = "https://www.outlieryt.com"
$secret = $env:CRON_SECRET
if (-not $secret) {
  Write-Host "Set CRON_SECRET first, e.g. `$env:CRON_SECRET = 'your-secret'" -ForegroundColor Yellow
  exit 1
}

Write-Host "1. GET (no auth) -> expect 401..." -ForegroundColor Cyan
try {
  $r1 = Invoke-WebRequest -Uri "$base/api/cron/ingest" -Method GET -UseBasicParsing -ErrorAction SilentlyContinue
  Write-Host "   Status: $($r1.StatusCode)" -ForegroundColor $(if ($r1.StatusCode -eq 401) { "Green" } else { "Red" })
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  Write-Host "   Status: $sc (expected 401)" -ForegroundColor $(if ($sc -eq 401) { "Green" } else { "Red" })
}

Write-Host "2. POST with CRON_SECRET -> expect 200 or 503/500 (not 405)..." -ForegroundColor Cyan
try {
  $headers = @{
    "Authorization" = "Bearer $secret"
    "Content-Type"  = "application/json"
  }
  $r2 = Invoke-WebRequest -Uri "$base/api/cron/ingest" -Method POST -Headers $headers -UseBasicParsing
  Write-Host "   Status: $($r2.StatusCode)" -ForegroundColor Green
  Write-Host "   Body: $($r2.Content.Substring(0, [Math]::Min(200, $r2.Content.Length)))..."
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  $msg = if ($sc -eq 405) { "405 = Method Not Allowed -> deploy may be old (no POST)" } else { "Status: $sc" }
  Write-Host "   $msg" -ForegroundColor $(if ($sc -eq 405) { "Red" } else { "Yellow" })
}

Write-Host "3. GET in browser: $base/api/cron/ingest -> should get 401, not 404" -ForegroundColor Cyan
