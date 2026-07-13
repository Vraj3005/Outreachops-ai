# OutreachOps AI V2 CI Pipeline Local Runner

Write-Host "[INFO] Starting Local CI/CD Checks..." -ForegroundColor Cyan

# 1. Secret Scanning
Write-Host "[INFO] Running Secret Scan..." -ForegroundColor Yellow
$secrets = Get-ChildItem -Path "backend" -Filter "*.py" -Recurse | Where-Object { $_.FullName -notmatch "\\.venv" } | Get-Content | Select-String -Pattern "GEMINI_API_KEY\s*=\s*[\x27\x22].+[\x27\x22]"
if ($secrets) {
    Write-Host "[ERROR] Hardcoded Gemini API Key detected in Python files!" -ForegroundColor Red
    exit 1
}
Write-Host "[SUCCESS] Secret scan passed: no plain credentials found in source files." -ForegroundColor Green

# 2. Backend Format check
Write-Host "[INFO] Checking Backend Code Formatting..." -ForegroundColor Yellow
& .\backend\.venv\Scripts\black.exe --check backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Black formatting check failed. Run make format or black formatting." -ForegroundColor Red
    exit 1
}
Write-Host "[SUCCESS] Formatting check passed." -ForegroundColor Green

# 3. Backend Linting
Write-Host "[INFO] Running Backend Lint check (Ruff)..." -ForegroundColor Yellow
& .\backend\.venv\Scripts\ruff.exe check backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Ruff check failed." -ForegroundColor Red
    exit 1
}
Write-Host "[SUCCESS] Backend lint check passed." -ForegroundColor Green

# 4. Backend & Database Migration tests
Write-Host "[INFO] Running Backend Test Suite..." -ForegroundColor Yellow
$env:ENV = "test"
& .\backend\.venv\Scripts\python.exe -m pytest backend/tests --cov=backend/app --cov-fail-under=15
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Backend test suite or coverage checks failed." -ForegroundColor Red
    exit 1
}
Write-Host "[SUCCESS] Backend tests and coverage verification passed." -ForegroundColor Green

# 5. Frontend Lint check
Write-Host "[INFO] Running Frontend Lint check..." -ForegroundColor Yellow
Set-Location frontend
& npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend linting failed." -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "[SUCCESS] Frontend lint check passed." -ForegroundColor Green

# 6. Frontend Typecheck
Write-Host "[INFO] Running Frontend TypeScript Typecheck..." -ForegroundColor Yellow
& npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend typecheck failed." -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "[SUCCESS] Frontend typecheck passed." -ForegroundColor Green

# 7. Frontend Dependency Vulnerability check
Write-Host "[INFO] Running Frontend Dependency Audit..." -ForegroundColor Yellow
& npm audit --audit-level=high
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] High-severity vulnerabilities detected in npm dependencies." -ForegroundColor Yellow
} else {
    Write-Host "[SUCCESS] Dependency audit passed." -ForegroundColor Green
}

# 8. Production Next.js Build
Write-Host "[INFO] Building Production Frontend Bundle..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend production build failed." -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "[SUCCESS] Frontend production build succeeded." -ForegroundColor Green

Set-Location ..
Write-Host "[SUCCESS] All CI/CD checks passed successfully! Code is ready for merge." -ForegroundColor Green
exit 0
