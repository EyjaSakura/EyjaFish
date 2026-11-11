$ErrorActionPreference = 'Stop'
$root = 'D:\DSH\plugins\dsh-qq-onebot-bridge'
Write-Host '== audit =='
& node 'D:\DSH\qqbot\scripts\audit-plugins.mjs'
if ($LASTEXITCODE -ne 0) { Write-Host 'AUDIT FAILED'; exit 1 }
Write-Host '== lint =='
& node 'D:\DSH\qqbot\scripts\lint-project.mjs'
if ($LASTEXITCODE -ne 0) { Write-Host 'LINT FAILED'; exit 1 }
Write-Host '== bridge api =='
& node 'D:\DSH\qqbot\scripts\check-bridge-api.mjs'
if ($LASTEXITCODE -ne 0) { Write-Host 'BRIDGE API FAILED'; exit 1 }
Write-Host '== bridge size =='
& node 'D:\DSH\qqbot\scripts\check-bridge-size.mjs'
if ($LASTEXITCODE -ne 0) { Write-Host 'BRIDGE SIZE FAILED'; exit 1 }
Write-Host '== no-undef =='
Push-Location $root
& node 'D:\DSH\qqbot\tools\eslint\node_modules\eslint\bin\eslint.js' lib --no-eslintrc --env es2022,node --parser-options '{"ecmaVersion":2022,"sourceType":"module"}' --rule 'no-undef:error'
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host 'NO-UNDEF FAILED'; exit 1 }
Write-Host '== deploy smoke =='
& powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\DSH\qqbot\scripts\deploy-smoke.ps1'
if ($LASTEXITCODE -ne 0) { Write-Host 'DEPLOY SMOKE FAILED'; exit 1 }

Write-Host '== core/services unused vars =='
Push-Location $root
& node 'D:\DSH\qqbot\tools\eslint\node_modules\eslint\bin\eslint.js' lib/core lib/services --no-eslintrc --env es2022,node --parser-options '{"ecmaVersion":2022,"sourceType":"module"}' --rule 'no-undef:error' --rule 'no-unused-vars:error'
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host 'CORE/SERVICES UNUSED FAILED'; exit 1 }

Write-Host '== bridge unused imports =='
Push-Location $root
& node 'D:\DSH\qqbot\tools\eslint\node_modules\eslint\bin\eslint.js' lib/bridge.js --no-eslintrc --env es2022,node --parser-options '{"ecmaVersion":2022,"sourceType":"module"}' --rule 'no-unused-vars:error'
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host 'UNUSED IMPORTS FAILED'; exit 1 }
Write-Host '== typecheck (incremental) =='
& powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\DSH\qqbot\scripts\typecheck.ps1'
if ($LASTEXITCODE -ne 0) { Write-Host 'TYPECHECK FAILED'; exit 1 }
Write-Host '== unit tests (core+services) =='
Push-Location $root
& node --test --experimental-test-coverage --test-coverage-include=lib/core/** --test-coverage-include=lib/services/** --test-coverage-lines=97 --test-coverage-branches=82 --test-coverage-functions=79 "test/*.test.mjs"
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host 'TESTS FAILED'; exit 1 }
Write-Host '== feature tests =='
& node 'D:\DSH\qqbot\scripts\test-features.mjs' --coverage
if ($LASTEXITCODE -ne 0) { Write-Host 'FEATURE TESTS FAILED'; exit 1 }
Write-Host '== bridge coverage =='
Push-Location $root
& node --experimental-loader ./test/host-loader.mjs --test --experimental-test-coverage `
  --test-coverage-include=lib/bridge.js --test-coverage-lines=57 `
  --test-coverage-branches=83 --test-coverage-functions=10 test/bridge/bridge-core.test.mjs
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host 'BRIDGE COVERAGE FAILED'; exit 1 }
Write-Host '== broad coverage (all lib except bridge) =='
Push-Location $root
& node --test --experimental-test-coverage --test-coverage-include=lib/** --test-coverage-exclude=lib/bridge.js --test-coverage-lines=80 --test-coverage-branches=73 --test-coverage-functions=70 "test/*.test.mjs"
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host 'BROAD COVERAGE FAILED'; exit 1 }
Write-Host '== syntax =='
$bad = 0
Get-ChildItem 'D:\DSH\plugins\dsh-qq-onebot-bridge\lib','D:\DSH\plugins\features' -Recurse -File -Filter *.js | ForEach-Object {
  & node --check $_.FullName 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host ('SYNTAX FAIL ' + $_.FullName); $bad++ }
}
if ($bad -gt 0) { exit 1 }
Write-Host 'CI OK'
