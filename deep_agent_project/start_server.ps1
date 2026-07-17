# 启动 DeepAgents API（Windows UTF-8 安全模式）
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
Set-Location $PSScriptRoot
python -X utf8 -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
