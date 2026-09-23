# Scripts 目录约定

`scripts/` 只保存可执行的开发、验收、素材维护和打包入口，不放 Vitest 测试文件。

| 目录或入口 | 职责 |
| --- | --- |
| `build/` | macOS、Windows 桌面应用构建与打包 |
| `fixtures/` | 生成或更新固定测试素材；生成结果写入 `tests/fixtures/` |
| `intent-router/` | IntentRouter 本地模型验收实现及 macOS/Linux、Windows 入口 |
| `ui-shell/` | 应用壳层 Playwright 浏览器验收、截图和结果 JSON |

推荐从仓库根目录通过 `package.json` 中的 npm 命令执行脚本，例如：

```bash
npm run test:intent-router-acceptance -- --list-profiles
npm run fixtures:chinese-fiction
npm run package:mac -- --no-install
npm run test:ui-shell-acceptance -- --output /path/to/shell-evidence
```

`test:ui-shell-acceptance` 会启动临时 Vite 演示实例，使用隔离浏览器上下文，默认将证据写入 `artifacts/ui-shell-acceptance/run-<timestamp>/`。该 Playwright 层可在 macOS/Windows/Linux 执行 DOM 交互和视口验收，但不能代替 Tauri 原生菜单、窗口控制、macOS 交通灯或物理 DPI 验收。

Windows 可使用 `npm run test:ui-shell-acceptance:win -- -Output C:\\vinkey-evidence`；macOS/Linux 可使用 `npm run test:ui-shell-acceptance:sh -- --output /tmp/vinkey-evidence`。首次安装 Playwright 后需执行 `npx playwright install chromium` 安装浏览器。

脚本自身必须根据所在路径解析仓库根目录，不能依赖调用者当前工作目录。专项测试放入 `tests/<domain>/`，共享素材及其完整性测试放入 `tests/fixtures/`。
