# Tests 目录约定

`tests/` 保存跨模块专项测试、测试素材和非前端语言的测试 harness。与单个 TypeScript 模块紧密相关的单元测试继续和源码共置于 `src/**/*.test.ts`。

| 目录 | 职责 |
| --- | --- |
| `fixtures/` | 可复用的固定测试素材、清单及素材完整性测试 |
| `intent-router/` | IntentRouter CLI、SQLite 配置读取和跨模块验收合同测试 |
| `worker-harness/` | Rust worker 独立测试 harness |

边界约定：

- `tests/` 下的代码由测试运行器执行，不作为人工命令入口。
- `scripts/` 下的代码可由开发者或 npm 命令直接执行，不包含 `*.test.*`。
- fixture 生成器位于 `scripts/fixtures/`，生成结果和 SHA-256 清单位于 `tests/fixtures/`。
- IntentRouter 的测试方法与本地模型验收命令见 `docs/design/agent/intent-router/TEST_ACCEPTANCE.md`。
