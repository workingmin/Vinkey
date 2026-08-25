$ErrorActionPreference = "Stop"

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
  throw "Windows .exe/NSIS 安装包必须在 Windows 构建机上生成。"
}

foreach ($CommandName in @("npm", "cargo", "rustc")) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "缺少必需命令 ${CommandName}。"
  }
}

npm ci --include=dev
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run desktop:build:win
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "构建产物位于 src-tauri/target/release/bundle/nsis。"
