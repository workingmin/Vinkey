# 模型设置专项验收报告（macOS）

> **平台说明**：本文档是 macOS 平台版；Windows 平台验收见 [UI_ACCEPTANCE_WINDOWS_SETTINGS.md](../windows/UI_ACCEPTANCE_WINDOWS_SETTINGS.md)。两版共享同一验收合同、测试矩阵与设计断言，仅平台真机执行与证据按平台分别记录。**Windows 独立专项未执行（`NOT_EXECUTED`）**，本报告只给 macOS 结论，不得据此宣称跨平台发布通过。

- 功能域：`D-MODEL` 模型设置与本地模型准入
- 验收标识：`W1-MODEL-E`（真实端到端门槛）
- 验收对象：[UI_DESIGN_SETTINGS.md](../../../design/ui/UI_DESIGN_SETTINGS.md)
- 验收计划：[UI 验收工作计划](../UI_ACCEPTANCE_PLAN.md)、[UI 验收脚本编写计划](../UI_ACCEPTANCE_SCRIPT_PLAN.md)
- 版本：`0.1.0`（Alpha）；执行日期：2026-11-13
- 结论：**专项通过（Alpha 客观范围）**

「专项通过」只指 **Alpha 客观自动化范围**：下列客观用例全部 `PASS`，机器证据链（`result.json`、`SHA256SUMS`、`provenance`、退出码）可核验；需要人工观察、专家判断或用户意见的验收项已按 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理) 摘除并集中后置，Windows 独立专项不计入本 macOS 结论。本报告**不代表视觉/体验已验收、功能完备、完整发布通过或跨平台发布通过**。

## 1. 功能范围与业务入口

| 功能点 | 入口 | 验收目标 | 结果 |
| --- | --- | --- | --- |
| `BF-SETTINGS-001` | `EP-SETTINGS-001` | 从侧栏或平台应用菜单进入设置，返回时保留页面状态；未保存表单退出需确认 | 通过；Escape/返回按钮的未保存确认与无修改静默关闭已由组件自动化断言覆盖，设置入口归属已由标题栏专项结清 |
| `BF-MODEL-001` | `EP-MODEL-001` | 在应用级唯一活动模型中选择可用模型，显示服务和检查状态；运行期间禁用 | 通过；对话请求与分析运行两种运行态的禁用范围已补自动化断言 |
| `BF-MODEL-002` | `EP-MODEL-002` | 添加/编辑 Ollama 或 OpenAI-compatible 服务，保存后发现模型 | 通过 |
| `BF-MODEL-003` | `EP-MODEL-003` | 确认删除服务；显式勾选后删除已保存密钥；活动模型自动校正 | 通过；「删除已保存的密钥」默认不勾选、显式勾选才传 `clearApiKey` 已补自动化断言 |
| `BF-MODEL-004` | `EP-MODEL-004` | 获取目录、检查全部模型、缓存结果并展示失败/待检查/不可用状态 | 通过 |
| `BF-HARDWARE-001` | `EP-HARDWARE-001` | 读取本机硬件档位；不足或未知时进入远程服务表单 | 通过 |
| `BF-MODEL-005` | `EP-MODEL-005` | 从硬件建议打开预填远程服务表单，但不提前保存 | 通过 |

## 2. 竞品证据与设计决策

正式名称和产品层级遵循[竞品术语规范](../../../competitors/TERMINOLOGY.md)。以下分类防止把竞品存在误写成 Vinkey 必须集成：

| 设计事项 | 证据来源 | 证据类别 | Vinkey 决策 | 追踪 |
| --- | --- | --- | --- | --- |
| 服务配置、当前模型、连接测试分离 | Cherry Studio；SoloMD（设计来源/观察对象） | 直接参考 + 组合改造 | 连接配置与活动模型分离；「保存并检查」把保存、发现、准入结果串成可观察链路 | `CF-002`；`UI-CONNECTION-FORM`、`UI-MODEL-PICKER` |
| 多提供商和模型目录 | Cherry Studio | 直接参考 | 支持 Ollama/OpenAI-compatible，但首版不复制其多模型工作台复杂度 | `CF-002`；`BF-MODEL-002`/`004` |
| 统一会话/多 CLI 控制面 | CloudCLI（仓库名 `claudecodeui`，原 Claude Code UI） | 生态观察，不是设置页直接参考 | 只观察适配层和状态控制；不把 CloudCLI、Claude Code Router 或 CLIProxyAPI 当作设置页 UI 组件 | `CF-017`/`CF-018` |
| 本地 Provider 路由和协议兼容 | Claude Code Router、CLIProxyAPI | 暂不采用/安全观察 | 不代理第三方账号，不让路由层隐式接管凭据和正文；当前只保留 Provider 抽象 | `CF-018` |
| 复合连接身份（规范化地址 + API Key） | 无单一竞品证据；源于重复连接和密钥安全风险 | Vinkey 原创 | 同地址同密钥只能有一条；同地址不同密钥可共存；名称不参与去重 | `models.rs`、`modelPrivacy.test.ts`、`SettingsPage.test.tsx` |
| 检查结果缓存、上下文自动配置和失效重检 | 竞品做法的组合改造，结合 Vinkey 模型准入合同 | 组合改造 | 缓存目录但不盲信旧准入；新检查版本要求重新检查；上下文长度由检查结果设置 | `vinkey.modelProbeCache`；`modelEvaluation.test.ts` |
| 硬件档位和远程服务建议 | Vinkey 本地隐私/可用性要求 | Vinkey 原创 | 硬件未知或不足时给出远程服务入口，不上传硬件信息，不把档位当作模型适配保证 | `hardwareProfile.ts`、`hardwareProfile.test.ts` |

本次复核 `CF-002`、`CF-018` 的竞品名称与设计决策链接，与 [FEATURE_DECISIONS.md](../../../competitors/FEATURE_DECISIONS.md) 及[竞品名录](../../../competitors/COMPETITOR_CATALOG.md) 一致；竞品变化不直接改变 Vinkey 的权限或凭据边界。

## 3. 实现追踪

| 层级 | 实现位置 | 本轮核对内容 |
| --- | --- | --- |
| 前端页面 | [`SettingsPage.tsx`](../../../../src/components/SettingsPage.tsx) | 入口、模型选择器、服务表单、目录状态、删除确认、硬件信息、未保存确认、运行态禁用和密钥显式删除 |
| 桌面/演示桥接 | [`desktop.ts`](../../../../src/lib/desktop.ts) | 浏览器模拟数据、模型发现、准入检查、连接和模型持久化调用 |
| 本机硬件 | [`hardwareProfile.ts`](../../../../src/lib/hardwareProfile.ts)、`src-tauri/src/hardware.rs` | 统一内存/独立显存、最低/标准/推荐档位、未知硬件状态 |
| 后端模型边界 | `src-tauri/src/models.rs` | 地址规范化、回环地址判定、凭据指纹、唯一索引、系统凭据库、删除和模型关联 |
| 应用状态 | [`store.ts`](../../../../src/store.ts) | 活动模型、运行中锁定、删除后的活动模型校正和会话状态 |

本轮修复 `is_loopback_base` 对 IPv6 字面量 `[::1]` 的判定：`Url::host_str()` 保留方括号，原先无法解析为 `IpAddr`，会把本机 IPv6 回环模型误判为远程并拒绝 `local-excerpts` / `local-chunks` 正文来源策略；修复后与前端 `isLoopbackModelEndpoint` 一致。断言未放宽，原测试用例保持并转为通过。

## 4. 测试矩阵与执行结果

### 4.1 自动化测试

| 层级 | 测试文件 | 覆盖内容 | 结果 |
| --- | --- | --- | --- |
| UI 组件/业务链路 | [`SettingsPage.test.tsx`](../../../../src/components/SettingsPage.test.tsx) | 硬件档位、远程表单、发现与选择、删除校正、失败/缓存、上下展开、去重、密钥不落浏览器存储，以及本轮新增的未保存确认、运行态禁用、密钥显式删除 | 17/17 通过 |
| 硬件纯逻辑 | [`hardwareProfile.test.ts`](../../../../src/lib/hardwareProfile.test.ts) | 统一内存、独立显存、未知与低配、回环服务策略 | 通过 |
| 模型准入 | [`modelEvaluation.test.ts`](../../../../src/lib/modelEvaluation.test.ts) | 延迟、吞吐、质量基线和回归约束 | 通过 |
| 隐私边界 | [`modelPrivacy.test.ts`](../../../../src/lib/modelPrivacy.test.ts) | 回环地址判定（含 IPv6 字面量），正文/密钥不进入不应持久化或发送的边界 | 通过 |
| Store/桌面数据 | [`store.test.ts`](../../../../src/store.test.ts)、[`desktop.test.ts`](../../../../src/lib/desktop.test.ts) | 活动模型和连接/会话数据行为 | 通过 |
| Keychain 验收脚本合同 | [`model-keychain-acceptance-cli.test.mjs`](../../../../tests/model/model-keychain-acceptance-cli.test.mjs) | 参数、四态结论、成功/写入失败/删除未生效链路、非 macOS 归口、明文不落证据、`SHA256SUMS` 一致性 | 8/8 通过 |
| Rust 数据层 | `src-tauri/src/models.rs`、`src-tauri/src/database.rs` 内置测试 | 凭据指纹、迁移、唯一身份、回环地址判定、历史重复连接处理 | `models::tests` 10/10、`database::tests` 5/5 通过（目标平台 macOS 实测） |
| 前端合同测试全量 | `npm test -- --run` | 全仓自动化测试 | 60 个测试文件、438 个测试全部通过 |

### 4.2 命令执行

| 命令 | 结果 |
| --- | --- |
| `npm run test:model-acceptance:sh` | `UI-ACC-SETTINGS-001` 双协议 10/10 PASS，退出码 0；归档 `artifacts/model-acceptance/run-*` 的 `result.json` + `SHA256SUMS` |
| `npm run test:model-keychain-acceptance:sh` | `UI-ACC-SETTINGS-KEYCHAIN-001` 5/5 PASS，退出码 0；归档 `artifacts/model-keychain-acceptance/run-*` |
| `cargo test --manifest-path src-tauri/Cargo.toml models::tests` | 10/10 通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 全量结果见 §6.2；其余失败不属本功能域 |
| `npm test -- --run src/components/SettingsPage.test.tsx` | 17/17 通过 |
| `npm test -- --run tests/model/model-keychain-acceptance-cli.test.mjs` | 8/8 通过 |

### 4.3 机器验收批次与证据链

| 批次 | 用例 | 结论 | 证据 |
| --- | --- | --- | --- |
| `UI-ACC-SETTINGS-001`（`W1-MODEL-E`） | `MODEL-E-001`~`005`（Ollama 原生协议）、`MODEL-E-OAI-001`~`005`（OpenAI-compatible 协议） | 10/10 PASS，退出码 0 | `artifacts/model-acceptance/run-*`：`result.json`、`SHA256SUMS`、逐用例诊断日志、`provenance=PASS` |
| `UI-ACC-SETTINGS-KEYCHAIN-001`（macOS 系统凭据库） | `MODEL-KC-001`~`005` | 5/5 PASS，退出码 0 | `artifacts/model-keychain-acceptance/run-*`：写入、读回一致、显式删除、删除后不可读、构建溯源；`provenance=PASS` |

两批均按最终 HEAD 复跑，`result.json` 定稿后计算 `SHA256SUMS`（清单不自引用），逐文件重算全部校验通过；`cases[].status` 只用 `PASS` / `FAIL` / `BLOCKED` / `NOT_APPLICABLE` 四态。测试凭据为一次性随机值，无论成功失败均清理，明文不写入 `result.json`、诊断日志或仓库。

## 5. UI 业务链路验收

| 场景 | 操作链路 | 预期 | 结果 |
| --- | --- | --- | --- |
| 首次/浏览器演示 | 打开设置 → 保存并检查模型 → 打开当前模型选择器 → 选择模型 | 活动模型更新，提示成功，运行期间控件禁用 | 通过 |
| 运行态禁用 | 对话请求中 / 分析任务运行中 → 查看当前模型选择器 | 两种运行态均禁用；运行结束后恢复 | 通过（组件自动化断言） |
| 未保存表单退出 | 修改表单 → Escape / 返回按钮 → 取消确认 → 再确认 | 取消时保留表单并留在设置页；确认时关闭；无修改时不弹确认 | 通过（组件自动化断言） |
| 密钥显式删除 | 选中已保存密钥的服务 → 不勾选保存 → 勾选后保存 | 默认不删除；仅显式勾选才传 `clearApiKey`；反馈与存储不泄露密钥 | 通过（组件自动化断言） |
| 本机低配 | 硬件低于最低配置 → 添加远程服务 | 打开未保存的 OpenAI-compatible 表单；连接数量不增加 | 通过 |
| 硬件未知 | 硬件检测失败 → 查看服务模型列表 | 显示「硬件未确认」，仍允许远程 Ollama 检查 | 通过 |
| 连接失败 | 刷新/发现目录失败 | 保留已保存模型，显示失败原因并标记「需要检查」 | 通过 |
| 旧缓存失效 | 读取旧准入缓存 → 展开模型列表 | 保留目录但不把旧结果当作新检查通过 | 通过 |
| 结构化输出失败 | 检查全部模型 → 模型返回不稳定结构 | 显示失败细节，模型不可用，数量不增加 | 通过 |
| 同址不同密钥 | 保存同地址密钥 A/B，再重复 A | A/B 共存，重复 A 被拒绝 | 通过 |
| 删除活动服务 | 选择第二服务模型 → 确认删除服务 | 活动模型自动切换到剩余合法模型，连接和模型关联删除 | 通过 |
| 双协议准入 | Ollama 原生 `/api/*` 与 `/v1/*` 兼容端点各做目录发现与最小推理 | 两套协议均发现目标模型并完成一次真实推理 | 通过（`W1-MODEL-E` 机器批次） |

## 6. 证据边界与客观遗留

### 6.1 证据边界（如实标注，不得外推）

- **OpenAI-compatible 协议证据**取自本机 Ollama 的 `/v1` 兼容层（`/v1/models`、`/v1/chat/completions`），是真实服务与真实模型推理，**不是独立第三方 OpenAI-compatible 服务**；外部独立服务的真实验收仍按 [总计划 §8.2](../UI_ACCEPTANCE_PLAN.md) 如实列为客观遗留，见 §6.2。
- `MODEL-E-003`/`005` 与 `MODEL-E-OAI-003`/`005` 是 blackhole 地址**注入**的连接失败与超时用例，验证脚本优雅降级，**不是真实服务故障恢复**。
- **系统凭据库证据**是 macOS Keychain 在 Vinkey 生产代码同一 service/account 命名空间下的**通道级**写入、读回、删除与删除后不可读；脚本不通过 Vinkey UI 或 Rust command 调用，也不读取真实用户凭据。Rust 生产路径（`keyring` apple-native）由 `models.rs` 实现、凭据指纹/唯一索引/迁移测试与前端 `clearApiKey` 断言共同覆盖；真实 app 内端到端删除连接→删除密钥的人工确认归 §8.5。
- 组件自动化测试运行于 jsdom + 浏览器演示桥接层，**不冒充** Tauri 原生窗口、系统菜单栏或物理 DPI 证据。

### 6.2 客观遗留项（逐项列出，不因专项通过而消失）

| 项目 | 归属 | 状态 |
| --- | --- | --- |
| 外部独立 OpenAI-compatible 服务的目录发现、准入检查、失败恢复与超时 | `D-MODEL` 跨平台扩展 | 未执行；需测试人员提供经批准的外部服务与临时凭据，脚本不读系统凭据库 |
| `cargo test` 全量 95 passed / 3 failed（退出码 101），失败均为 `worker_service` 测试（quote 修复、源文档变化拒绝、证据快照校验） | `W4-TASK-E` 长任务/日志中心专项 | 已如实登记，**不计入本 macOS 模型设置专项判定**；本功能域 `models::tests` 10/10 与 `database::tests` 5/5 独立全绿。旧报告记录的 GTK/GLib 宿主阻断在目标平台 macOS 上不成立 |
| Windows 平台系统凭据库、窗口尺寸与真实服务连接 | Windows 独立专项 | `NOT_EXECUTED`，不计入本 macOS 结论 |
| 真实 app 端到端删除连接→删除密钥、设置页键盘/窗口缩放的人工确认 | [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理) 人工复核统一批次 | 统一后置，不得写成 `PASS` 或删除 |

### 6.3 已摘除的人工复核项

设置页视觉观感、交互手感、无障碍观感、窗口缩放目视判断、发布前截图目视确认等需人为主观判断、专家评审或用户调研的验收项，已按 [总计划 §8.2/§8.5](../UI_ACCEPTANCE_PLAN.md) 从本专项验收范围摘除，集中至人工复核统一批次，待所有自动化验收脚本跑完后由测试人员统一回填；不删除、不回溯改写功能域 `result.json`、不计入本专项结论。

### 6.4 发布口径

本专项仅达成 macOS 单平台的 **专项通过（Alpha 客观范围）**。整体仍不宣称跨平台发布通过 / 完整发布通过（Windows 独立专项 `NOT_EXECUTED` + 人工复核统一后置 + §6.2 客观遗留项）。

## 7. 测试人员本地执行结果

### 7.1 执行元数据

| 项目 | 值 |
| --- | --- |
| 平台 | macOS（arm64），目标平台本机执行 |
| 版本 | Vinkey `0.1.0`；批次按最终 HEAD 复跑，`provenance=PASS`、工作树干净，不在此固化 Git SHA 与批次号 |
| 真实模型服务 | 本机 Ollama，模型 `qwen3:8b`；原生 `/api/*` 与兼容 `/v1/*` 两套协议 |
| 系统凭据库 | macOS Keychain，service `com.vinkey.desktop`，一次性随机账号，运行后清理 |
| 验收脚本 | `npm run test:model-acceptance:sh`、`npm run test:model-keychain-acceptance:sh` |
| 合同测试 | `npm test -- --run`（全量）、`cargo test --manifest-path src-tauri/Cargo.toml models::tests` |
| 退出码 | 两个机器批次均为 0 |
| 归档 | `artifacts/model-acceptance/run-*`、`artifacts/model-keychain-acceptance/run-*`（`result.json` + `SHA256SUMS` + 逐用例诊断日志）；逐文件重算全部校验通过 |

### 7.2 机器结果摘要

| 批次 | 用例数 | PASS | FAIL | BLOCKED | 结论 | `provenance` |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-ACC-SETTINGS-001`（双协议） | 10 | 10 | 0 | 0 | `PASS` | `PASS` |
| `UI-ACC-SETTINGS-KEYCHAIN-001` | 5 | 5 | 0 | 0 | `PASS` | `PASS` |

原始 JSON 与诊断日志按受控归档位置提供；粘贴前须删除 API Key、Authorization header、完整正文、系统用户名和未脱敏绝对路径。

### 7.3 人工 UI 观察

人工 UI 观察表（设置页打开并返回、键盘与窗口缩放、截图目视确认等主观/人工项）**不在本报告回填**，已按 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理) 集中至人工复核统一批次，由测试人员在所有自动化验收脚本跑完后统一处理。客观部分（Escape/返回确认、运行态禁用、密钥显式删除、Keychain 读写删）已在 §4/§5 由机器判据完成，不以人工观察代替。

## 8. 结论

「功能域 → 竞品证据 → 设计决策 → 前后端实现 → 自动化测试代码 → 本地环境验收脚本 → 测试人员执行与证据回传 → 验收报告 → 遗留项复审」继续作为各功能域的统一验收流程。模型设置专项证明：真实模型链路必须区分协议与证据边界，系统凭据库必须有目标平台的客观证据，人工/主观判断必须与客观机器判据分层归口。

本专项在 **Alpha 客观自动化范围**内达成**专项通过**：`W1-MODEL-E` 双协议 10/10 `PASS`、系统凭据库 5/5 `PASS`、组件与脚本合同测试全绿、Rust 模型域数据层全绿、构建溯源 `provenance=PASS`、`SHA256SUMS` 全部校验通过；人工复核项已集中至 §8.5，Windows 独立专项 `NOT_EXECUTED` 不计入本 macOS 结论。整体仍不宣称跨平台发布通过 / 完整发布通过，§6.2 的客观遗留项继续按原门槛逐项跟踪。
