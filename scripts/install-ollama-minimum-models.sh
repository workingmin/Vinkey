#!/usr/bin/env bash
set -euo pipefail

MODELS=(
  "openbmb/minicpm4.1:latest"
  "qwen3:8b"
)

if ! command -v ollama >/dev/null 2>&1; then
  echo "错误：未找到 ollama。请先从 https://ollama.com/download 安装 Ollama。" >&2
  exit 1
fi

if ! ollama list >/dev/null 2>&1; then
  echo "错误：无法连接本机 Ollama 服务。请先启动 Ollama。" >&2
  exit 1
fi

echo "开始安装 Vinkey 最低配置中文创作模型组（约需 10.2 GB，建议预留 18 GB）。"
for model in "${MODELS[@]}"; do
  echo "正在拉取 ${model}"
  ollama pull "$model"
done

echo
echo "模型组安装完成。当前 Ollama 模型："
ollama list
echo
echo "文本质量测试请将 Ollama 与 Vinkey 的上下文窗口都设为 16384。"
echo "发送首条请求后运行 'ollama ps'，确认 CONTEXT=16384 且 PROCESSOR=100% GPU。"
