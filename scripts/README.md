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
npm run test:ui-shell-native-mac -- --output /path/to/native-shell-evidence
```

`test:ui-shell-acceptance` 会启动临时 Vite 演示实例，使用隔离浏览器上下文，默认将证据写入 `artifacts/ui-shell-acceptance/run-<timestamp>/`，并生成唯一结果源 `result.json`、截图和 `SHA256SUMS`。该入口只覆盖 `W0-SHELL-P` 的壳层容器、页面承载、设置替换、错误/空态、主题/焦点和视口基线；截图前会核对目标菜单合同，但不打开菜单、不执行菜单命令。该守卫用于防止旧“文件”菜单污染新截图，不代替 `W0-SHELL-MENU-P/F` 专项验收。终端 stdout 只打印最终结论、结果路径、清单路径和 `exit=<n>`；逐用例状态与诊断写入 stderr。该 Playwright 层可在 macOS/Windows/Linux 执行 DOM 交互和视口验收，但不能代替 Tauri 原生窗口控制、macOS 交通灯或物理 DPI 验收。

`test:ui-shell-native-mac` 只在 macOS 执行真实 Tauri `W0-SHELL-P` 原生窗口验收：默认启动已安装的 `/Applications/Vinkey.app`，也可用 `--app /path/to/Vinkey.app` 指定其他应用，或用 `--dev` 启动 `npm run desktop:dev`。脚本通过 macOS Accessibility/System Events 操作交通灯、缩放、最小化、关闭和目标窗口尺寸，并写入截图、显示器元数据、`events.txt`、`automation-stderr.txt`、`native-automation.applescript`、`result.json` 与 `SHA256SUMS`。脚本会在截图前只读核对原生一级菜单合同，不展开或执行菜单命令；菜单业务证据仍由 `W0-SHELL-MENU-P/F` 单独归档。开发模式另有 `tauri-dev.log`。`result.json.exitCode`、终端 `exit=<n>` 和进程退出码保持一致，无需测试人员手工执行 `echo $?`。首次运行必须在系统设置中授予 Terminal/IDE“辅助功能”和“屏幕与系统音频录制”权限；若权限、应用或目标尺寸不可用，结果为 `BLOCKED`。

Windows 可使用 `npm run test:ui-shell-acceptance:win -- -Output C:\\vinkey-evidence`。`test:ui-shell-acceptance:sh` 在 macOS 默认验收 `/Applications/Vinkey.app`，加 `--browser` 可只执行 Playwright；Linux 默认执行 Playwright。首次安装 Playwright 后需执行 `npx playwright install chromium` 安装浏览器。

脚本自身必须根据所在路径解析仓库根目录，不能依赖调用者当前工作目录。专项测试放入 `tests/<domain>/`，共享素材及其完整性测试放入 `tests/fixtures/`。
