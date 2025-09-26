Param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info([string]$msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Fail([string]$msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

$Base = 'http://localhost:8000'

try {
  Write-Info 'Health check'
  $health = Invoke-RestMethod -Uri ($Base + '/health') -Method Get -TimeoutSec 10
  Write-Ok ("Backend healthy: " + ($health | ConvertTo-Json -Compress))
}
catch { Write-Fail ("Health check failed: " + $_.Exception.Message); exit 1 }

# Signup a fresh user
$suffix = Get-Random -Minimum 1000 -Maximum 999999
$siteId = "emailhook_$suffix"
$InviteCode = if ($env:INVITE_CODE) { $env:INVITE_CODE } elseif ($env:UNLIMITED_INVITE_CODE) { $env:UNLIMITED_INVITE_CODE } else { throw "ENV INVITE_CODE 또는 UNLIMITED_INVITE_CODE가 필요합니다." }
$signupBody = @{ site_id=$siteId; nickname=$siteId; phone_number='01000000000'; invite_code=$InviteCode; password='pass1234' }

try {
  Write-Info ("Sign up user: " + $siteId)
  $signupResp = Invoke-RestMethod -Uri ($Base + '/api/auth/signup') -Method Post -ContentType 'application/json' -Body ($signupBody | ConvertTo-Json)
  $token = $signupResp.access_token
  $uid = $signupResp.user.id
  if (-not $token) { throw 'No token returned' }
  Write-Ok ("Signed up user id=$uid; token length=" + ($token.Length))
}
catch { Write-Fail ("Signup failed: " + $_.Exception.Message); exit 1 }

# Test email endpoint
try {
  Write-Info 'Call /api/email/test'
  $emailTest = Invoke-RestMethod -Uri ($Base + '/api/email/test') -Method Get -Headers @{ Authorization = ('Bearer ' + $token) }
  Write-Ok ("Email test: " + ($emailTest | ConvertTo-Json -Compress))
}
catch { Write-Fail ("Email test failed: " + $_.Exception.Message) }

# Distribute reward to trigger reward-email hook
$rewardBody = @{ user_id=$uid; reward_type='TOKEN'; amount=7; source_description='hook-smoke' }
try {
  Write-Info 'Distribute reward'
  $rewardResp = Invoke-RestMethod -Uri ($Base + '/api/rewards/distribute') -Method Post -ContentType 'application/json' -Body ($rewardBody | ConvertTo-Json)
  Write-Ok ("Reward response: " + ($rewardResp | ConvertTo-Json -Compress))
}
catch { Write-Fail ("Reward distribute failed: " + $_.Exception.Message) }

Write-Ok 'Smoke completed. Open Mailpit at http://localhost:8025 to verify emails.'
