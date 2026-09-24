# 模型设置本地验收执行回填模板

本文件供测试人员在 macOS/Windows + Ollama（或 OpenAI-compatible 服务）环境执行后填写。复制本模板内容或直接将结果填入[模型设置专项验收报告](./UI_ACCEPTANCE_SETTINGS.md)的“测试人员本地执行结果”区。

> 占位符 `<...>` 不是通过结果。任何字段未填写时，报告结论必须保持“待回填”或“条件通过”。

## 1. 执行元数据

- 执行人：`<TESTER_NAME>`
- 执行日期：`<YYYY-MM-DD HH:mm TZ>`
- 操作系统：`<macOS VERSION / Windows VERSION>`
- CPU/架构：`<arm64 / x64>`
- Vinkey 版本：`<VINKEY_VERSION>`
- Git SHA：`<GIT_SHA>`
- Node.js：`<NODE_VERSION>`
- Rust：`<RUST_VERSION_OR_NA>`
- Ollama：`<OLLAMA_VERSION>`
- Ollama/兼容服务地址：`<REDACTED_BASE_URL>`
- 模型：`<MODEL_NAME>`
- Profile ID：`<PROFILE_ID>`
- SQLite 路径（脱敏）：`<REDACTED_DB_PATH>`
- 测试套件版本：`<SUITE_ID>@<SUITE_VERSION>`

## 2. 前置检查

| 检查项 | 结果 | 备注/证据 |
| --- | --- | --- |
| Vinkey 已启动并完成模型设置页加载 | `<PASS/FAIL/BLOCKED>` | `<EVIDENCE>` |
| 目标 profile 与 connection 已确认 | `<PASS/FAIL/BLOCKED>` | `<PROFILE_ID>` |
| Ollama 服务正在监听且模型已下载 | `<PASS/FAIL/BLOCKED>` | `<OLLAMA_CHECK>` |
| 系统凭据库可用（如本次需要） | `<PASS/FAIL/BLOCKED/NA>` | `<EVIDENCE>` |
| 测试工作区和 fixture 已准备 | `<PASS/FAIL/BLOCKED>` | `<WORKSPACE>` |

## 3. 脚本执行记录

### 3.1 macOS/Linux

```bash
<COMMAND_USED>
```

### 3.2 Windows PowerShell

```powershell
<COMMAND_USED>
```

- 进程退出码：`<0 / 1 / 2 / OTHER>`（应与 `result.json.exitCode` 一致）
- stdout 最终四行：`<CAPTURE_OR_TERMINAL_REFERENCE>`（脚本不生成 `stdout.txt`）
- stderr/诊断：`<CAPTURE_OR_TERMINAL_REFERENCE>`
- 机器结果 JSON：`<RESULT_JSON_FILE>`
- 诊断日志：`<LOG_FILE>`
- SHA-256 清单：`<SHA256SUMS_FILE>`

### 3.3 机器结果摘要

```json
{
  "schemaVersion": "<SCHEMA_VERSION>",
  "suite": "<SUITE_ID>@<SUITE_VERSION>",
  "selectedModel": "<MODEL_NAME>",
  "caseCount": "<COUNT>",
  "passed": "<COUNT>",
  "failed": "<COUNT>",
  "blocked": "<COUNT>",
  "exitCode": "<EXIT_CODE>",
  "conclusion": "<PASS|FAIL|BLOCKED>"
}
```

如需粘贴完整 JSON，请先删除 API Key、Authorization header、完整正文、系统用户名和未脱敏绝对路径；原始文件通过附件或受控归档位置提供。

## 4. 人工 UI 观察

| 用例 | 预期 | 实际结果 | 截图/录屏 | 结论 |
| --- | --- | --- | --- | --- |
| 打开设置页并返回 | 设置入口可达；返回后页面状态符合设计 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 添加 Ollama 服务 | 表单默认值、地址校验和未保存状态正确 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 保存并检查模型 | 保存、发现、检查状态可解释；失败可重试 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 查看/刷新模型目录 | 加载、空态、失败和逐模型结果不跳动 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 切换当前模型 | 应用级活动模型更新；运行期间控件正确禁用 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 删除服务 | 二次确认；关联模型删除；活动模型自动校正 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 删除已保存密钥 | 必须显式勾选；反馈不泄露密钥 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 低配/未知硬件入口 | 远程服务表单打开但不提前保存 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 键盘与窗口缩放 | 焦点顺序、Escape/返回确认和窄窗口无重叠 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |

## 5. 问题与证据

| 编号 | 类型 | 复现步骤 | 影响 | 原始证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `<ISSUE_ID>` | `<BUG/BLOCKER/OBSERVATION>` | `<STEPS>` | `<P0/P1/P2>` | `<LOG_OR_SCREENSHOT>` | `<OPEN/FIXED/WAIVED>` |

补充说明：`<NOTES>`

## 6. 回填后的结论

- 自动化层：`<PASS/FAIL/BLOCKED>`
- 本地环境脚本层：`<PASS/FAIL/BLOCKED/待回填>`
- 人工 UI 层：`<PASS/FAIL/BLOCKED/待回填>`
- 最终结论：`<通过/条件通过/不通过/阻断>`
- 遗留项：`<FOLLOW_UP_ITEMS>`
- 下一次复审版本/日期：`<NEXT_REVIEW>`

### 判定规则

- 所有必需层级通过、无 P0/P1 阻断：`通过`。
- 代码和自动化通过，但平台、真实 Ollama 或人工 UI 尚未执行：`条件通过`，不能写成完整发布通过。
- 业务断言失败或隐私/数据边界失效：`不通过`。
- 环境、依赖或外部服务使测试无法获得业务结论：`阻断`。
