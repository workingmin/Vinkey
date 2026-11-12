# 基础编辑器专项验收报告

- 功能域：`D-EDITOR` 文件与编辑器基础链路
- 验收标识：`W0-EDITOR-F`
- 验收对象：[UI_DESIGN_EDITOR.md](../../design/ui/UI_DESIGN_EDITOR.md)
- 脚本入口：`UI-ACC-EDITOR-001`，命令 `npm run test:editor-acceptance`（macOS/Linux 加 `:sh`、Windows 加 `:win`）
- 目标平台 WebView 客观证据入口：`UI-ACC-EDITOR-WEBVIEW-001`，命令 `npm run test:editor-webview-native-mac`（`scripts/editor/run-editor-webview-native-macos.mjs`）
- 报告状态：**fixture / 文件桥接合同层本机已通过；目标平台 WebView 客观证据已采集**（CLI `EDIT-F-001`~`006` 6/6、合同测试 10/10；`EDIT-WV-001`~`006` 6/6）；人工 UI 观察仍待测试人员回传，**机器通过不等于人工观察或平台层综合通过**
- 更新日期：`2026-11-12`

## 1. 验收边界

`W0-EDITOR-F` 验收隔离工作区 fixture 下的基础文件与编辑器合同（文件分类、打开/读取、编辑保存、修改时间冲突、新建文档与路径越界保护），以及真实目标平台 WebView 中文件树、编辑器、保存状态栏与文档视图的客观结构证据。人工 UI 观察（视觉质量、交互手感、无障碍观感）仍待测试人员回传，不由机器判定。真实 AI 改稿、DiffProposal 与跨域文档冲突归 `W3-REVISION-E`；对话页与编辑器间的交叉状态归 `W4-NAV-R`。

## 2. 机器用例

| 用例 | 覆盖内容 | 当前结论 |
| --- | --- | --- |
| `EDIT-F-001` | Markdown/代码/环境文件/文本与图片/PDF/音视频/二进制分类；编辑扩展名守卫 | PASS |
| `EDIT-F-002` | 打开与读取；Unicode 路径、BOM、CRLF 归一化、二进制空内容快照、越界拒绝 | PASS |
| `EDIT-F-003` | 保存内容、LF/CRLF 行尾与 BOM 回写保真 | PASS |
| `EDIT-F-004` | 修改时间不匹配拒绝保存且原文件字节不变 | PASS |
| `EDIT-F-005` | 新建文档自动创建父目录；同名、二进制扩展名与越界拒绝 | PASS |
| `EDIT-F-006` | 只改动脚本自建 fixture；外部文件未被覆盖或写入 | PASS |

## 3. 执行证据

- 脚本核心：`scripts/editor/editor-acceptance.ts` 复刻 `src-tauri/src/lib.rs` 的 `classify_file`、`ensure_document_extension`、`read_document_at`、`save_document`、`create_document` 与路径校验合同。
- 合同测试：`tests/editor/editor-acceptance-cli.test.ts` 覆盖参数、分类、BOM/CRLF、保存冲突、新建越界、`--json` 单文档与退出码。
- 每次运行归档 `result.json`、`SHA256SUMS` 与逐用例日志；自动临时 fixture 默认清理，显式传入 `--workspace` 时不清理。
- 本机执行批次：`artifacts/editor-acceptance/run-*` 下最新 `result.json`（`conclusion=PASS`、`exitCode=0`、`6/6 passed`）；以该文件为准，报告不硬编码批次号与 Git SHA。工作树存在未提交改动时 `provenance.status=BLOCKED/REVIEW`，故提交后必须按最终 HEAD 复跑使 `repositoryClean=true`、`provenance.status=PASS`。
- 当前实现的路径与哈希合同，未放宽断言：
  1. `resolveExisting()` / `resolveForCreate()` 用 `safeRealpath(resolve(workspaceRoot))` 让目标与根使用同一归一基准，避免 macOS `tmpdir()` 返回的 `/var/folders/...` 与实际 `/private/var/folders/...` 不一致时把合法 fixture 误判为「路径超出已授权工作区」；`EDIT-F-002` / `EDIT-F-005` 的越界保护断言保持有效。
  2. `result.json` 定稿后不再改写、`SHA256SUMS` 在定稿文件上计算、`artifacts.sha256` 不自引用，避免 `shasum -c SHA256SUMS` 报 `result.json: FAILED`。
- 目标平台 WebView 证据批次另归档于 `artifacts/editor-webview-native-macos/editor-wv-*`，与 fixture 合同层分开，避免干扰 `UI-ACC-TITLE-BAR-FIXTURE-001` 对 `W0-EDITOR-F` 合同批次的最新批次解析。

### 3.1 目标平台 WebView 客观证据（`UI-ACC-EDITOR-WEBVIEW-001`）

- 脚本入口：`npm run test:editor-webview-native-mac`（`scripts/editor/run-editor-webview-native-macos.mjs`）；纯判据合同 `scripts/editor/editor-webview-verdicts.mjs`，合同测试 `tests/editor/editor-webview-verdicts.test.mjs`。
- 证据来自真实 `/Applications/Vinkey.app` 窗口：隔离 Profile + `navigation-acceptance.generateFixture()` 注入项目；原生「查看 > 项目文件」切换；`AXPress` 打开 `README.md`；ApplicationServices AX 树与文本快照；CoreGraphics 窗口截图；`app.start` 构建溯源日志。`tmpdir()` 经 `realpath` 归一，避免 macOS `/tmp` → `/private/tmp` 符号链接触发路径守卫误判。
- 六个客观用例：`EDIT-WV-001` 真实 `AXWebArea` 与原生导航、`EDIT-WV-002` 「文件列表」分组及 `README.md` 按钮、`EDIT-WV-003` `AXTextArea` 值与 fixture 文档逐字一致、`EDIT-WV-004` 保存状态栏连续读回、`EDIT-WV-005` 「编辑 / 分栏 / 预览」文档视图、`EDIT-WV-006` 构建溯源与两张原生截图。全部 PASS 时 `objectiveConclusion=PASS`。
- 批次归档 `result.json`、`SHA256SUMS`、`app-runtime.jsonl`、`fixture-document.txt`、`states/`、`screenshots/`；`cases[].status` 只用四态，`platformPass=false`、`humanUIObservation.returned=false`、`DEFER-UI-001` 只登记不判定。

## 4. 当前结论

- `W0-EDITOR-F` 机器层：**PASS（fixture / 文件桥接合同）**。该结论已作为 `W0-SHELL-MENU-F` 的硬依赖，被 `UI-ACC-TITLE-BAR-FIXTURE-001` 从最新 `result.json` 真实读取，用于解锁 F 子门槛。
- `W0-EDITOR-F` 目标平台 WebView 客观证据：**PASS（`UI-ACC-EDITOR-WEBVIEW-001` 6/6）**，见 §3.1；文件树、`AXTextArea` 编辑器、保存状态栏、文档视图与原生截图均由真实目标应用窗口读回。
- **人工 UI 观察仍待测试人员回传**：视觉质量、交互手感、无障碍观感不由机器判定；`platformPass=false`，`W0-EDITOR-F` 平台层综合结论保持未判定。机器通过不等于人工观察或目标平台综合通过，也不代表 `W3-REVISION-E` / `W3-CONTEXT-E` 通过。
- `DEFER-UI-001` 按总计划 §8.3 保留登记，Alpha 内不判定、不写成 PASS、不删除。

## 5. 测试人员回填区

- 机器证据：`<UI-ACC-EDITOR-001 acceptance: PASS (6/6)；artifacts/editor-acceptance/ 最新批次 result.json + SHA256SUMS>`
- 目标平台 WebView 客观证据：`<UI-ACC-EDITOR-WEBVIEW-001 objectiveConclusion=PASS (6/6)；artifacts/editor-webview-native-macos/ 最新批次 result.json + SHA256SUMS + states/ + screenshots/>`
- 人工 UI 层：`<TBD（视觉质量 / 交互手感 / 无障碍观感，待测试人员回传）>`
- 问题列表：`<人工 UI 观察材料待回传；DEFER-UI-001 按总计划 §8.3 保留登记>`
- 综合结论：`<fixture/合同层 PASS；目标平台 WebView 客观证据 PASS；人工 UI 观察未回传，W0-EDITOR-F 平台层综合结论未判定>`
- 下一次复审：`<人工 UI 观察材料回传、Vinkey 版本发布，或文件桥接合同变更时>`
