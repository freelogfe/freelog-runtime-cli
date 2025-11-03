# 测试环境配置脚本
# 使用方法: . .\scripts\dev-test.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Freelog CLI - 测试环境" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 设置环境变量
$env:FREELOG_ENV = "development"
$env:FREELOG_API_URL = "http://api.testfreelog.com"
$env:LOG_LEVEL = "info"

# 清除本地环境的环境变量
Remove-Item Env:\TEMPLATE_PATH -ErrorAction SilentlyContinue

Write-Host "✓ 环境变量已设置:" -ForegroundColor Green
Write-Host "  FREELOG_ENV       = $env:FREELOG_ENV" -ForegroundColor Gray
Write-Host "  FREELOG_API_URL   = $env:FREELOG_API_URL" -ForegroundColor Gray
Write-Host "  LOG_LEVEL         = $env:LOG_LEVEL" -ForegroundColor Gray
Write-Host ""

Write-Host "快速开始:" -ForegroundColor Cyan
Write-Host "  node src/index.js login" -ForegroundColor White
Write-Host "  node src/index.js init test-project" -ForegroundColor White
Write-Host "  node src/index.js --help" -ForegroundColor White
Write-Host ""

