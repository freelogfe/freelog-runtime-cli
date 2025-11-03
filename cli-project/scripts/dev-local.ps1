# 本地开发环境配置脚本
# 使用方法: . .\scripts\dev-local.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Freelog CLI - 本地开发环境" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 设置环境变量
$env:FREELOG_ENV = "local"
$env:FREELOG_API_URL = "http://localhost:3000"
$env:LOG_LEVEL = "debug"

# 自动检测模板路径
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:TEMPLATE_PATH = Join-Path $projectRoot "templates"

Write-Host "✓ 环境变量已设置:" -ForegroundColor Green
Write-Host "  FREELOG_ENV       = $env:FREELOG_ENV" -ForegroundColor Gray
Write-Host "  FREELOG_API_URL   = $env:FREELOG_API_URL" -ForegroundColor Gray
Write-Host "  TEMPLATE_PATH     = $env:TEMPLATE_PATH" -ForegroundColor Gray
Write-Host "  LOG_LEVEL         = $env:LOG_LEVEL" -ForegroundColor Gray
Write-Host ""

# 检查模板路径是否存在
if (Test-Path $env:TEMPLATE_PATH) {
    Write-Host "✓ 模板目录已找到" -ForegroundColor Green
    $templateCount = (Get-ChildItem $env:TEMPLATE_PATH -Directory).Count
    Write-Host "  找到 $templateCount 个模板" -ForegroundColor Gray
} else {
    Write-Host "⚠ 模板目录不存在: $env:TEMPLATE_PATH" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "快速开始:" -ForegroundColor Cyan
Write-Host "  node src/index.js login" -ForegroundColor White
Write-Host "  node src/index.js init test-project" -ForegroundColor White
Write-Host "  node src/index.js --help" -ForegroundColor White
Write-Host ""

