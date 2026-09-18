# Vinkey 配置持久化审计

## 结论

SQLite 应作为跨进程、跨平台业务配置的权威来源；WebView `localStorage` 只保留界面偏好、临时缓存和浏览器演示模式数据。这样桌面端与独立 Node CLI 可以读取同一份模型配置，不会因为 WebView 状态不可见而选择错误模型。

## 数据分类

| 数据 | 当前/目标来源 | 处理结论 |
| --- | --- | --- |
| `model_profiles` | SQLite | 已是权威来源 |
| `model_connections`、profile 关联 | SQLite + 系统 Keychain 保存密钥 | 已是权威来源；API Key 不进入 SQLite 明文 |
| `activeModelId` | 原为 WebView `localStorage`，现为 SQLite `app_preferences` 的 `activeModelId` | 已迁移；桌面启动时兼容旧值，CLI 可直接读取 |
| 会话、消息、工作区、任务、分析产物 | SQLite | 已是权威来源 |
| 主题、侧栏折叠、项目树展开状态 | WebView `localStorage` | 保留；属于设备/界面偏好，不需要 CLI 或 Rust worker |
| 模型探测结果缓存 | WebView `localStorage` | 保留；属于可失效缓存，不作为模型配置依据 |
| 首次提示、已读标记 | WebView `localStorage` | 保留；属于界面生命周期状态 |
| 浏览器演示模式的 profile/connection/会话 | WebView `localStorage` | 保留；演示模式没有 Tauri SQLite 后端 |

## `activeModelId` 迁移规则

1. Vinkey 启动后读取 SQLite `app_preferences.activeModelId`。
2. 如果 SQLite 没有值，检查旧的 `vinkey.activeModelId`，确认它仍指向现有 profile 后写入 SQLite。
3. 如果旧值不存在或已失效，使用第一个可用 profile 写入 SQLite。
4. 桌面模式完成迁移后删除旧 localStorage key；浏览器演示模式继续使用 localStorage。
5. 设置页切换模型时同时更新内存状态和 SQLite。
6. 独立 CLI 未指定 `--profile-id` 时读取 SQLite 当前值；没有已迁移值时拒绝执行，不按 `updated_at` 猜测。

## 验收检查

```bash
./scripts/run-intent-model-eval.sh --list-profiles
./scripts/run-intent-model-eval.sh --profile-id <profile-id>
```

列表中的 `（当前）` 标记来自 SQLite `app_preferences.activeModelId`。如果没有标记，先启动一次新版 Vinkey 或显式传入 profile ID；不要把列表第一项当作当前模型。
