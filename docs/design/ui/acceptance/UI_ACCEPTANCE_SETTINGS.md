# 模型设置专项验收报告

- 功能域：模型设置
- 验收对象：[UI_DESIGN_SETTINGS.md](../UI_DESIGN_SETTINGS.md)
- 执行日期：2026-09-22
- 代码基线：`main`，版本 `0.1.0`
- 结论：**条件通过（平台执行结果待测试人员回填）**

条件通过的含义是：模型设置的前端、桌面桥接、浏览器演示存储和自动化测试链路已通过；Windows/macOS 真机上的系统凭据库、窗口尺寸和真实服务连接仍需要发布前手工执行。测试人员执行后请使用[本地验收执行回填模板](./UI_ACCEPTANCE_SETTINGS_RUN_TEMPLATE.md)补充机器结果和人工 UI 观察；在回填完成前，本报告不能升级为完整平台通过。

## 1. 功能范围与业务入口

| 功能点 | 入口 | 验收目标 | 结果 |
| --- | --- | --- | --- |
| `BF-SETTINGS-001` | `EP-SETTINGS-001` | 从侧栏或平台应用菜单进入设置，返回时保留页面状态；未保存表单退出需确认 | 代码已实现，自动化覆盖待补充 Escape/未保存确认的专项手工场景；当前旧“查看”菜单归属待移除 |
| `BF-MODEL-001` | `EP-MODEL-001` | 在应用级唯一活动模型中选择可用模型，显示服务和检查状态 | 通过 |
| `BF-MODEL-002` | `EP-MODEL-002` | 添加/编辑 Ollama 或 OpenAI-compatible 服务，保存后发现模型 | 通过 |
| `BF-MODEL-003` | `EP-MODEL-003` | 确认删除服务；显式勾选后删除已保存密钥；活动模型自动校正 | 通过 |
| `BF-MODEL-004` | `EP-MODEL-004` | 获取目录、检查全部模型、缓存结果并展示失败/待检查/不可用状态 | 通过 |
| `BF-HARDWARE-001` | `EP-HARDWARE-001` | 读取本机硬件档位；不足或未知时进入远程服务表单 | 通过 |
| `BF-MODEL-005` | `EP-MODEL-005` | 从硬件建议打开预填远程服务表单，但不提前保存 | 通过 |

## 2. 竞品证据与设计决策

正式名称和产品层级遵循[竞品术语规范](../../../competitors/TERMINOLOGY.md)。以下分类防止把竞品存在误写成 Vinkey 必须集成：

| 设计事项 | 证据来源 | 证据类别 | Vinkey 决策 | 追踪 |
| --- | --- | --- | --- | --- |
| 服务配置、当前模型、连接测试分离 | Cherry Studio；SoloMD（设计来源/观察对象） | 直接参考 + 组合改造 | 连接配置与活动模型分离；“保存并检查”把保存、发现、准入结果串成可观察链路 | `CF-002`；`UI-CONNECTION-FORM`、`UI-MODEL-PICKER` |
| 多提供商和模型目录 | Cherry Studio | 直接参考 | 支持 Ollama/OpenAI-compatible，但首版不复制其多模型工作台复杂度 | `CF-002`；`BF-MODEL-002`/`004` |
| 统一会话/多 CLI 控制面 | CloudCLI（仓库名 `claudecodeui`，原 Claude Code UI） | 生态观察，不是设置页直接参考 | 只观察适配层和状态控制；不把 CloudCLI、Claude Code Router 或 CLIProxyAPI 当作模型设置 UI 组件 | `CF-017`/`CF-018` |
| 本地 Provider 路由和协议兼容 | Claude Code Router、CLIProxyAPI | 暂不采用/安全观察 | 不代理第三方账号，不让路由层隐式接管凭据和正文；当前只保留 Provider 抽象 | `CF-018` |
| 复合连接身份（规范化地址 + API Key） | 无单一竞品证据；源于重复连接和密钥安全风险 | Vinkey 原创 | 同地址同密钥只能有一条；同地址不同密钥可共存；名称不参与去重 | `models.rs`、`modelPrivacy.test.ts`、`SettingsPage.test.tsx` |
| 检查结果缓存、上下文自动配置和失效重检 | 竞品做法的组合改造，结合 Vinkey 模型准入合同 | 组合改造 | 缓存目录但不盲信旧准入；新检查版本要求重新检查；上下文长度由检查结果设置 | `vinkey.modelProbeCache`；`modelEvaluation.test.ts` |
| 硬件档位和远程服务建议 | Vinkey 本地隐私/可用性要求 | Vinkey 原创 | 硬件未知或不足时给出远程服务入口，不上传硬件信息，不把档位当作模型适配保证 | `hardwareProfile.ts`、`hardwareProfile.test.ts` |

## 3. 实现追踪

| 层级 | 实现位置 | 本轮核对内容 |
| --- | --- | --- |
| 前端页面 | [`SettingsPage.tsx`](../../../../src/components/SettingsPage.tsx) | 入口、模型选择器、服务表单、目录状态、删除确认、硬件信息和响应式布局 |
| 桌面/演示桥接 | [`desktop.ts`](../../../../src/lib/desktop.ts) | 浏览器模拟数据、模型发现、准入检查、连接和模型持久化调用 |
| 本机硬件 | [`hardwareProfile.ts`](../../../../src/lib/hardwareProfile.ts)、`src-tauri/src/hardware.rs` | 统一内存/独立显存、最低/标准/推荐档位、未知硬件状态 |
| 后端模型边界 | `src-tauri/src/models.rs` | 地址规范化、凭据指纹、唯一索引、密钥系统凭据库、删除和模型关联 |
| 应用状态 | [`store.ts`](../../../../src/store.ts) | 活动模型、运行中锁定、删除后的活动模型校正和会话状态 |

## 4. 测试矩阵与执行结果

### 4.1 自动化测试

| 层级 | 测试文件 | 覆盖内容 | 结果 |
| --- | --- | --- | --- |
| UI 组件/业务链路 | [`SettingsPage.test.tsx`](../../../../src/components/SettingsPage.test.tsx) | 硬件档位、远程表单、发现与选择、删除校正、失败/缓存、上下展开、去重和密钥不落浏览器存储 | 14/14 通过 |
| 硬件纯逻辑 | [`hardwareProfile.test.ts`](../../../../src/lib/hardwareProfile.test.ts) | 统一内存、独立显存、未知与低配、回环服务策略 | 通过 |
| 模型准入 | [`modelEvaluation.test.ts`](../../../../src/lib/modelEvaluation.test.ts) | 延迟、吞吐、质量基线和回归约束 | 通过 |
| 隐私 | [`modelPrivacy.test.ts`](../../../../src/lib/modelPrivacy.test.ts) | 正文/密钥不进入不应持久化或发送的边界 | 通过 |
| Store/桌面数据 | [`store.test.ts`](../../../../src/store.test.ts)、[`desktop.test.ts`](../../../../src/lib/desktop.test.ts) | 活动模型和连接/会话数据行为 | 通过 |
| Rust 数据层 | `src-tauri/src/models.rs`、`database.rs` 内置测试 | 凭据指纹、迁移、唯一身份、历史重复连接处理 | `cargo test --manifest-path src-tauri/Cargo.toml` 被宿主系统库阻断；列为目标平台待办 |

### 4.2 命令执行

| 命令 | 结果 |
| --- | --- |
| `NODE_ENV=production npm test -- --run src/components/SettingsPage.test.tsx` | 14/14 通过；项目测试配置已固定 `NODE_ENV=test`，不再依赖调用者环境 |
| `NODE_ENV=test npm test` | 37 个测试文件、249 个测试全部通过 |
| `npm run build` | TypeScript 和 Vite 构建通过；仅有产物 chunk 大小提示 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 未完成：宿主 `glib-2.0` 为 2.68.4，依赖要求 ≥2.70；同时缺少 `gdk-3.0` pkg-config 条目 |

此前直接执行 `npm test` 在外部 `NODE_ENV=production` 下触发 `React.act is not a function`，属于 React 生产构建与 Testing Library 的环境兼容问题，不是业务断言失败。新增 [`vitest.config.ts`](../../../../vitest.config.ts) 和 [`src/test/setup.ts`](../../../../src/test/setup.ts) 固定测试环境后，复核通过。

## 5. UI 业务链路验收

| 场景 | 操作链路 | 预期 | 结果 |
| --- | --- | --- | --- |
| 首次/浏览器演示 | 打开设置 → 保存并检查模型 → 打开当前模型选择器 → 选择模型 | 活动模型更新，提示成功，运行期间控件禁用 | 通过 |
| 本机低配 | 硬件低于最低配置 → 添加远程服务 | 打开未保存的 OpenAI-compatible 表单；连接数量不增加 | 通过 |
| 硬件未知 | 硬件检测失败 → 查看服务模型列表 | 显示“硬件未确认”，仍允许远程 Ollama 检查 | 通过 |
| 连接失败 | 刷新/发现目录失败 | 保留已保存模型，显示失败原因并标记“需要检查” | 通过 |
| 旧缓存失效 | 读取旧准入缓存 → 展开模型列表 | 保留目录但不把旧结果当作新检查通过 | 通过 |
| 结构化输出失败 | 检查全部模型 → 模型返回不稳定结构 | 显示失败细节，模型不可用，数量不增加 | 通过 |
| 同址不同密钥 | 保存同地址密钥 A/B，再重复 A | A/B 共存，重复 A 被拒绝 | 通过 |
| 删除活动服务 | 选择第二服务模型 → 确认删除服务 | 活动模型自动切换到剩余合法模型，连接和模型关联删除 | 通过 |

## 6. 遗留风险与发布前动作

1. 在 Windows 和 macOS 真机执行系统凭据库读写、删除密钥、窗口缩放和键盘导航；浏览器模拟不能替代这些验证。
2. 在配置完整 GTK/GLib 依赖的 Linux CI 或目标 Windows/macOS 构建环境执行 `cargo test --manifest-path src-tauri/Cargo.toml`，确认迁移、唯一索引和凭据指纹测试通过；当前宿主阻断原因已记录在上表。
3. 以真实 Ollama 与 OpenAI-compatible 服务各执行一次目录发现、准入检查、失败恢复和超时；记录服务版本、模型名和是否有正文外发。
4. 补充未保存表单按 Escape/返回按钮退出时的确认交互自动化测试，并确认对话生成、分析运行期间的禁用范围。
5. 发布前复核 `CF-002`、`CF-018` 的竞品证据链接和产品名称；竞品变化不能直接改变 Vinkey 的权限或凭据边界。

## 7. 测试人员本地执行结果（待回填）

> 本节是平台和真实服务证据的占位区。请按[回填模板](./UI_ACCEPTANCE_SETTINGS_RUN_TEMPLATE.md)填写；占位符不代表通过。

### 执行元数据

- 执行人：`<TESTER_NAME>`
- 执行日期：`<YYYY-MM-DD HH:mm TZ>`
- 操作系统：`<macOS VERSION / Windows VERSION>`
- CPU/架构：`<ARCH>`
- Vinkey 版本 / Git SHA：`<VERSION> / <GIT_SHA>`
- Node.js / Rust / Ollama：`<NODE_VERSION> / <RUST_VERSION_OR_NA> / <OLLAMA_VERSION>`
- 模型 / Profile ID：`<MODEL_NAME> / <PROFILE_ID>`
- 测试脚本：`<SCRIPT_PATH>`
- 命令：`<COMMAND>`
- 退出码：`<EXIT_CODE>`
- 机器结果 JSON：`<RESULT_JSON_FILE>`
- 诊断日志：`<LOG_FILE>`
- SHA-256：`<OUTPUT_SHA256>`

### 脚本机器结果

```json
{
  "schemaVersion": "<SCHEMA_VERSION>",
  "caseCount": "<COUNT>",
  "passed": "<COUNT>",
  "failed": "<COUNT>",
  "blocked": "<COUNT>",
  "conclusion": "<PASS|FAIL|BLOCKED>"
}
```

### 人工 UI 观察

| 用例 | 预期 | 实际结果 | 截图/录屏 | 结论 |
| --- | --- | --- | --- | --- |
| 设置页打开并返回 | 入口可达，返回路径和未保存提示符合设计 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 添加 Ollama 服务 | 地址校验、表单状态和未保存行为正确 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 保存并检查模型 | 发现、检查、失败和重试状态可解释 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 当前模型切换 | 活动模型更新，运行期间控件禁用 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 删除服务/密钥 | 二次确认，显式删除密钥，活动模型自动校正 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 低配/未知硬件远程入口 | 打开预填表单但不提前保存 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| 键盘和窗口缩放 | 焦点、Escape、窄窗口布局无重叠 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |

完整问题列表、截图索引和脱敏规则见回填模板。

## 8. 结论

“功能域 → 竞品证据 → 设计决策 → 前后端实现 → 自动化测试代码 → 本地环境验收脚本 → 测试人员执行与证据回传 → 验收报告 → 遗留项复审”适合作为当前版本所有功能域的统一验收流程。原六阶段作为设计和代码追踪仍然合理，但模型设置专项证明：真实 Ollama、macOS/Windows 平台行为和人工 UI 观察必须成为独立证据节点。后续功能域应复用本报告结构、脚本规范和回填模板，但不能复制模型设置的结论或测试数量。
