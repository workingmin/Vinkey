# 基础编辑器专项验收报告

- 功能域：`D-EDITOR` 文件与编辑器基础链路
- 验收标识：`W0-EDITOR-F`
- 验收对象：[UI_DESIGN_EDITOR.md](../../design/ui/UI_DESIGN_EDITOR.md)
- 脚本入口：`UI-ACC-EDITOR-001`，命令 `npm run test:editor-acceptance`（macOS/Linux 加 `:sh`、Windows 加 `:win`）
- 报告状态：**fixture / 文件桥接合同层本机已通过**（CLI `EDIT-F-001`~`006` 6/6、合同测试 10/10）；目标平台 WebView/人工材料仍待回传，**机器通过不等于目标平台通过**
- 更新日期：`2026-11-10`

## 1. 验收边界

`W0-EDITOR-F` 只验收隔离工作区 fixture 下的基础文件与编辑器合同：文件分类、打开/读取、编辑保存、修改时间冲突、新建文档与路径越界保护。真实 AI 改稿、DiffProposal 与跨域文档冲突归 `W3-REVISION-E`；对话页与编辑器间的交叉状态归 `W4-NAV-R`。

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
- 本版修复两处真实缺陷，未放宽断言：
  1. `resolveExisting()` / `resolveForCreate()` 的 `resolvedRoot` 只做 `resolve()` 未做 `realpath()`；macOS `tmpdir()` 返回 `/var/folders/...`，实际路径为 `/private/var/folders/...`，导致合法 fixture 被误判「路径超出已授权工作区」。改为 `safeRealpath(resolve(workspaceRoot))` 后目标与根使用同一归一基准，`EDIT-F-002` / `EDIT-F-005` 的越界保护断言保持有效。
  2. `result.json` 自引用 hash 循环：把自身哈希写回结果文件再重写，导致 `shasum -c SHA256SUMS` 报 `result.json: FAILED`。改为结果文件定稿后不再改写、`SHA256SUMS` 在定稿文件上计算、`artifacts.sha256` 不自引用。

## 4. 当前结论

- `W0-EDITOR-F` 机器层：**PASS（fixture / 文件桥接合同）**。该结论已作为 `W0-SHELL-MENU-F` 的硬依赖，被 `UI-ACC-TITLE-BAR-FIXTURE-001` 从最新 `result.json` 真实读取，用于解锁 F 子门槛。
- 目标平台 WebView 证据（文件树、编辑器、保存状态栏、预览）与人工 UI 截图仍需测试人员另行回传；机器通过不等于目标平台通过，也不代表 `W3-REVISION-E` / `W3-CONTEXT-E` 通过。

## 5. 测试人员回填区

- 机器证据：`<UI-ACC-EDITOR-001 acceptance: PASS (6/6)；artifacts/editor-acceptance/ 最新批次 result.json + SHA256SUMS>`
- 平台证据：`<PASS/FAIL/BLOCKED + ARTIFACTS>`（待回传）
- 人工 UI 层：`<TBD>`
- 问题列表：`<目标平台 WebView / 人工 UI 材料待回传>`
- 综合结论：`<fixture/合同层 PASS；目标平台层未判定>`
- 下一次复审：`<目标平台 WebView/人工材料回传、Vinkey 版本发布，或文件桥接合同变更时>`
