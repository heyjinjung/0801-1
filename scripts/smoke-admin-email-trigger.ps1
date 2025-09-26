param(
  [string]$BaseUrl = "http://localhost:8000",
  [string]$AdminSiteId = "admin_smoke",
  [string]$AdminPassword = "passw0rd!"
)

function Invoke-Api($method, $url, $body = $null, $token = $null) {
  $headers = @{}
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  if ($body) { $json = $body | ConvertTo-Json -Depth 6 } else { $json = $null }
  if ($method -eq 'GET') {
    return Invoke-RestMethod -Method GET -Uri $url -Headers $headers -ContentType 'application/json'
  } else {
    return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -Body $json -ContentType 'application/json'
  }
}

Write-Host "[1/6] Health check..." -ForegroundColor Cyan
$health = Invoke-Api GET "$BaseUrl/health"
$health | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[2/6] Ensure admin exists -> signup + elevate if needed..." -ForegroundColor Cyan
# Try signup admin user (idempotent-ish; if exists, may 409 and we fallback to login)
try {
  $randAdmin = Get-Random -Minimum 1000 -Maximum 999999
  $adminSite = "$AdminSiteId$randAdmin"
  $phoneAdmin = "010" + ('{0:d8}' -f (Get-Random -Minimum 0 -Maximum 99999999))
  $InviteCode = if ($env:INVITE_CODE) { $env:INVITE_CODE } elseif ($env:UNLIMITED_INVITE_CODE) { $env:UNLIMITED_INVITE_CODE } else { throw "ENV INVITE_CODE 또는 UNLIMITED_INVITE_CODE가 필요합니다." }
  $signupAdmin = Invoke-Api POST "$BaseUrl/api/auth/signup" @{ site_id=$adminSite; nickname=$adminSite; password=$AdminPassword; invite_code=$InviteCode; phone_number=$phoneAdmin }
  $elevSiteId = $signupAdmin.user.site_id
  if (-not $elevSiteId) { $elevSiteId = $adminSite }
  # Elevate to admin (dev helper)
  Invoke-Api POST "$BaseUrl/api/admin/users/elevate" @{ site_id = $elevSiteId } | Out-Null
  $AdminSiteId = $elevSiteId
  Write-Host "Elevated user to admin: $AdminSiteId"
} catch {
  Write-Host "Admin signup/elevate skipped (may exist): $_" -ForegroundColor DarkYellow
}

Write-Host "[3/6] Admin login..." -ForegroundColor Cyan
$login = Invoke-Api POST "$BaseUrl/api/auth/admin/login" @{ site_id = $AdminSiteId; password = $AdminPassword }
$token = $login.access_token
if (-not $token) { throw "Admin login failed" }
Write-Host "Admin token length: $($token.Length)"

Write-Host "[4/6] Create a normal user (target)" -ForegroundColor Cyan
# Create normal user for targeting demo
$rand = Get-Random -Minimum 1000 -Maximum 999999
$site = "emailtrg_$rand"
$phoneUser = "010" + ('{0:d8}' -f (Get-Random -Minimum 0 -Maximum 99999999))
$InviteCode = if ($env:INVITE_CODE) { $env:INVITE_CODE } elseif ($env:UNLIMITED_INVITE_CODE) { $env:UNLIMITED_INVITE_CODE } else { throw "ENV INVITE_CODE 또는 UNLIMITED_INVITE_CODE가 필요합니다." }
$signup = Invoke-Api POST "$BaseUrl/api/auth/signup" @{ site_id=$site; nickname=$site; password="passw0rd!"; invite_code=$InviteCode; phone_number=$phoneUser }
$userId = $signup.user.id
Write-Host "Created user id=$userId site=$site"
# Optionally set a segment directly if API exists; if not, continue without.

Write-Host "[5/6] Trigger admin email to single user..." -ForegroundColor Cyan
$resp1 = Invoke-Api POST "$BaseUrl/api/admin/email/trigger" @{ template="event"; user_id=$userId; context=@{ event_name="Admin Test"; nickname=$site } } $token
$resp1 | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[6/6] Trigger admin email to segment=Low (if any users)..." -ForegroundColor Cyan
$resp2 = Invoke-Api POST "$BaseUrl/api/admin/email/trigger" @{ template="event"; segment="Low"; context=@{ event_name="Segment Blast" } } $token
$resp2 | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "Open Mailpit at http://localhost:8025 to verify deliveries." -ForegroundColor Yellow
