$ErrorActionPreference = "Stop"

$Models = @(
  "openbmb/minicpm4.1:latest",
  "qwen3:8b"
)

if (-not (Get-Command "ollama" -ErrorAction SilentlyContinue)) {
  throw "未找到 ollama。请先从 https://ollama.com/download 安装 Ollama。"
}

ollama list | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "无法连接本机 Ollama 服务。请先启动 Ollama。"
}

Write-Host "开始安装 Vinkey 最低配置中文创作模型组（约需 10.2 GB，建议预留 18 GB）。"
foreach ($Model in $Models) {
  Write-Host "正在拉取 ${Model}"
  ollama pull $Model
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "模型组安装完成。当前 Ollama 模型："
ollama list
Write-Host ""
Write-Host "文本质量测试请将 Ollama 与 Vinkey 的上下文窗口都设为 16384。"
Write-Host "发送首条请求后运行 'ollama ps'，确认 CONTEXT=16384 且 PROCESSOR=100% GPU。"
