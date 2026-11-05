# 基础编辑器专项验收报告

- 功能域：`D-EDITOR` 文件与编辑器基础链路
- 验收标识：`W0-EDITOR-F`
- 验收对象：[UI_DESIGN_EDITOR.md](../../design/ui/UI_DESIGN_EDITOR.md)
- 脚本入口：`UI-ACC-EDITOR-001`，命令 `npm run test:editor-acceptance`（macOS/Linux 加 `:sh`、Windows 加 `:win`）
- 报告状态：fixture 脚本已就绪（机器层 6/6）；目标平台 WebView/人工材料待回传
- 更新日期：`2026-11-05`

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

## 4. 当前结论

- `W0-EDITOR-F` 机器层：**通过（fixture/合同）**。
- 目标平台 WebView 证据（文件树、编辑器、保存状态栏、预览）与人工 UI 截图仍需测试人员另行回传；机器通过不等于目标平台通过。

## 5. 测试人员回填区

- 平台证据：`<PASS/FAIL/BLOCKED + ARTIFACTS>`
- 人工 UI 层：`<TBD>`
- 问题列表：`<ISSUES>`
- 综合结论：`<通过/条件通过/不通过/阻断>`
- 下一次复审：`<NEXT_REVIEW>`
