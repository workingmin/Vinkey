# 模型设置本地验收执行回填模板（macOS）

本文件供测试人员在 macOS + Ollama（或 OpenAI-compatible 服务）环境执行后填写。复制本模板内容或直接将结果填入[模型设置专项验收报告](./UI_ACCEPTANCE_MACOS_SETTINGS.md)的“测试人员本地执行结果”区。Windows 平台请使用 [UI_ACCEPTANCE_WINDOWS_SETTINGS_RUN_TEMPLATE.md](../windows/UI_ACCEPTANCE_WINDOWS_SETTINGS_RUN_TEMPLATE.md)。

> 占位符 `<...>` 不是通过结果。任何字段未填写时，报告结论必须保持“待回填”或“条件通过”。

> **归口口径**：本模板第 4 节的人工 UI 观察（设置页观感、交互手感、无障碍观感、键盘与窗口缩放目视、发布前截图目视确认等主观/人工项）已按 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理) 集中至人工复核统一批次，待所有自动化验收脚本跑完后由测试人员统一回填；不在[模型设置专项报告](./UI_ACCEPTANCE_MACOS_SETTINGS.md)内回填，不得写成 `PASS` 或删除。客观项（Escape/返回确认、运行态禁用、密钥显式删除、系统凭据库读写删、双协议真实模型链路）由 `UI-ACC-SETTINGS-001`、`UI-ACC-SETTINGS-KEYCHAIN-001` 与组件自动化测试覆盖，机器证据链不受人工复核归口影响。

## 1. 执行元数据

- 执行人：`<TESTER_NAME>`
- 执行日期：`<YYYY-MM-DD HH:mm TZ>`
- 操作系统：`<macOS VERSION>`
- CPU/架构：`<arm64|x64>`
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

### 3.1 macOS

```bash
<COMMAND_USED>
```

- 进程退出码：`<0 / 1 / 2 / OTHER>`（应与 `result.json.exitCode` 一致）
- stdout 最终四行：`<CAPTURE_OR_TERMINAL_REFERENCE>`（脚本不生成 `stdout.txt`）
- stderr/诊断：`<CAPTURE_OR_TERMINAL_REFERENCE>`
- 机器结果 JSON：`<RESULT_JSON_FILE>`
- 诊断日志：`<LOG_FILE>`
- SHA-256 清单：`<SHA256SUMS_FILE>`

### 3.2 机器结果摘要

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

> 本节的观感/目视/手感类条目属 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理) 人工复核统一批次，统一后置、不在专项报告内回填。表中「入口可达」「焦点顺序」「Escape/返回确认」「运行期间控件禁用」「二次确认」「显式勾选」等客观读回已由自动化断言覆盖，不在此重复判定。

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
- 最终结论：`<专项通过（Alpha 客观范围）/通过/条件通过/不通过/阻断>`
- 遗留项：`<FOLLOW_UP_ITEMS>`
- 下一次复审版本/日期：`<NEXT_REVIEW>`

### 判定规则

- Alpha 客观范围内所有适用用例 PASS、机器证据链可核验、无客观遗留阻断：`专项通过（Alpha 客观范围）`；不代表视觉/体验已验收、功能完备或完整发布通过。
- 所有必需层级通过、无 P0/P1 阻断：`通过`。
- 代码和自动化通过，但目标平台执行、真实模型链路或客观遗留项未完成：`条件通过`，不能写成完整发布通过；人工/主观项按 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理) 统一后置，不作为 Alpha 客观范围的阻断项。
- 业务断言失败或隐私/数据边界失效：`不通过`。
- 环境、依赖或外部服务使测试无法获得业务结论：`阻断`。
