# 一键启动 DeepAgents（后端 + 前端）
$root = $PSScriptRoot

Write-Host "启动后端 API (8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\deep_agent_project'; .\start_server.ps1"
)

Start-Sleep -Seconds 2

Write-Host "启动前端页面 (5173)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\frontend'; npm run dev -- --host 127.0.0.1 --port 5173"
)

Write-Host ""
Write-Host "请在浏览器打开: http://127.0.0.1:5173/" -ForegroundColor Green
Write-Host "后端 API 文档: http://127.0.0.1:8000/docs" -ForegroundColor Green
