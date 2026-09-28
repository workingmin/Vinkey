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

`test:ui-shell-native-mac` 只支持 macOS 15+，用于执行真实 Tauri `W0-SHELL-P` 原生窗口验收。它要求 Xcode Command Line Tools 提供 `swiftc`，运行时编译 ScreenCaptureKit helper，通过 `SCScreenshotManager` 和 `SCContentFilter.desktopIndependentWindow` 只截取目标应用的最大可见窗口；不捕获整个桌面，也不降级到 `screencapture`。默认启动已安装的 `/Applications/Vinkey.app`，也可用 `--app /path/to/Vinkey.app` 指定其他应用，或用 `--dev` 启动 `npm run desktop:dev`。脚本启动的应用默认使用临时隔离 Profile；可用 `--profile-dir` 指定目录，`--no-launch` 必须同时指定由调用方管理的 Profile。默认启动拒绝复用已有可见窗口；已有零窗口安装包进程会先正常退出再重启，并最多等待 30 秒让主窗口进入 Accessibility 树。

脚本通过 macOS Accessibility/System Events 操作交通灯、缩放、最小化、关闭和目标窗口尺寸；安装包模式还会通过系统 `open` 验证关闭后的 Reopen 恢复并再次隐藏窗口作为清理。`display-metadata.json` 枚举全部活动显示器，记录 `NSScreen.backingScaleFactor`、逻辑点尺寸、物理像素、物理毫米尺寸、有效缩放、物理 DPI、主屏/内置/镜像状态；物理尺寸不可得时对应用例为 `BLOCKED` 并要求人工 fallback，不再从截图画布推断缩放。归档前脚本递归脱敏文本、重建清单并执行 `SHELL-P-ARTIFACT-PRIVACY`，通过后默认生成固定 owner 且不含 helper 缓存的 `run-<timestamp>.tar.gz`；隐私扫描命中时结果为 `FAIL` 且不生成 tar。`--no-archive` 可关闭 tar 生成，`--tester-id` 只接受非个人安全标识。脚本会在截图前只读核对原生一级菜单合同；除明确记录为 `menu-recovery` 的系统窗口恢复外，不展开或执行菜单命令，菜单业务证据仍由 `W0-SHELL-MENU-P/F` 单独归档。`result.json.exitCode`、终端 `exit=<n>` 和进程退出码保持一致。首次运行必须授予 Terminal/IDE“辅助功能”和“屏幕与系统音频录制”权限；运行期权限、应用、窗口、显示探针或物理 DPI 不可用时结果为 `BLOCKED`。

Windows 可使用 `npm run test:ui-shell-acceptance:win -- -Output C:\\vinkey-evidence`。`test:ui-shell-acceptance:sh` 在 macOS 默认验收 `/Applications/Vinkey.app`，加 `--browser` 可只执行 Playwright；Linux 默认执行 Playwright。首次安装 Playwright 后需执行 `npx playwright install chromium` 安装浏览器。

脚本自身必须根据所在路径解析仓库根目录，不能依赖调用者当前工作目录。专项测试放入 `tests/<domain>/`，共享素材及其完整性测试放入 `tests/fixtures/`。
