# IntentRouter 三层架构与本地模型补强

- 适用项目：Vinkey 本地 AI 文学创作工作台
- 状态：设计方案，尚未替换当前 `TaskPlan` 合同
- 关联实现：[IntentRouter 专项设计](README.md)
- 关联验收：[IntentRouter 候选路由测试计划](TEST_PLAN.md)

## 1. 结论先行

本地 7B/8B 模型不应独自决定最终 Agent、Skill、文件范围和正文权限。推荐把 IntentRouter 拆成三个可观测阶段：

```text
TaskRequest
  -> Layer 0: 事实预处理与候选集构造
  -> Layer 1: 对比式 Prompt / Skill 约束
  -> Layer 2: 本地模型候选式结构化输出
  -> Layer 3: 候选校正、拒答与 TaskPlan 签发
```

用户所说的“三层”对应 Prompt 框定、模型输出、后置校正；这里额外把不可由模型推断的目标数量和权限事实单列为 Layer 0。这样可以避免把事实校正误称为模型能力，也避免后置代码悄悄扩大文件访问权限。

当前 Vinkey 已具备：

- `classifyTask` 的确定性路由、目标数量推导和低置信澄清门；
- `intent-token-dict-2` 词元证据和注册表映射；
- 本地模型严格 JSON Schema、SQLite 当前 profile 读取；
- 评测层的 `summary`（模型原始 top-1）与 `effectiveSummary`（工程化结果）双层统计，并额外记录候选合同解析率、Top-2 召回率和澄清比例。

当前缺口是：候选输出合同和校正器已经接入专项评测，但生产 `routeTask` 尚未消费候选列表、拒答状态和缺失事实；评测层的 resolver 也尚未抽成运行时统一的 `resolveCandidates` 服务。因此 `effectiveSummary` 只能证明评测修正有效，不能代替运行时路由合同。旧单对象输出会标记为 `legacy-single`，不会被计入候选合同解析率。

## 2. 公开方案调研与取舍

| 方案 | 公开实现 | 可借鉴点 | Vinkey 取舍 |
| --- | --- | --- | --- |
| Semantic Router | [aurelio-labs/semantic-router](https://github.com/aurelio-labs/semantic-router) | dense route、sparse route、HybridRouter、分数阈值、无匹配时返回 `None`、阈值优化 | 作为可选的 Layer 0/1 候选召回器；不让 embedding 直接授予正文权限 |
| LlamaIndex Selector | [pydantic_selectors.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/selectors/pydantic_selectors.py)、[base_selector.py](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/base/base_selector.py) | 单选/多选、结构化 `index + reason`、`max_outputs` | 采用 top-k 候选和可解释 reason；不把 reason 当作权限依据 |
| Haystack LLM Router | [LLMMessagesRouter](https://github.com/deepset-ai/haystack/blob/main/haystack/components/routers/llm_messages_router.py)、[ConditionalRouter](https://github.com/deepset-ai/haystack/blob/main/haystack/components/routers/conditional_router.py) | classifier/router 分离、正则或条件路由、unmatched fallback、输出类型校验 | 保留 `unknown/clarify` 分支；所有未知枚举和不完整输出都不能直接执行 |
| 本地混合路由 | [agentflow](https://github.com/venkatapgummadi/agentflow)、[pi-model-router](https://github.com/yeliu84/pi-model-router) | 规则优先、轻量模型可选、能力/成本/上下文条件参与路由、可修正最近一次决策 | 规则和事实优先；模型只在规则无法确定时参与，不引入在线自学习改变安全边界 |

这些方案共同支持三点：路由应有显式阈值和拒答；分类结果与执行路由应分离；多候选比单一字符串更适合处理相近意图。它们没有证明“模型 token attention 手工调权”是可靠工程方案，Vinkey 不采用运行时修改注意力或伪造概率的做法。

## 3. Layer 0：事实预处理与候选集构造

这一层不调用模型，输入只包含元数据和结构化上下文：

- 解析并去重 `targets`，计算 `none/single/multiple`；
- 读取显式 `actionId`、编辑器选区、workspace 标志和请求副作用；
- 移除 `@path` 后再做词元匹配，防止文件名触发路由；
- 通过 Registry 生成合法 Intent/Agent/Skill 候选，禁止模型发明类别；
- 运行轻量召回：规则词元 + 可选本地 embedding/BM25，相似度不足则保留 `unknown`；
- 为相近类别生成对比对，例如 `document-analysis` vs `character-analysis`、`workspace-overview` vs `workspace-analysis`、`general-chat` vs `document-analysis`。

Layer 0 可产生最多 3 个语义候选，但必须把 `documentSelection`、`documentAccess`、`scope` 的事实约束单独保存。候选召回分数只用于排序，不是最终置信度。

## 4. Layer 1：对比式 Prompt 与 Skill 约束

Prompt 不再把全部枚举平铺给小模型，而是注入候选集和最小的反例边界：

```text
候选 A: character-analysis / character-arc-extraction
  正例：人物关系、人物命运、角色弧光
  反例：仅要求故事主线或情节结构
候选 B: document-analysis / long-text-analysis
  正例：故事主线、情节结构、叙事视角
  反例：只问单个人物的关系或命运
```

Prompt 必须要求：

1. 只能从候选集选择，不得创建新值；
2. 输出 1-3 个候选，按优先级排序，并给出 `reasonCodes`；
3. 只有缺少事实或第一、第二候选确实无法区分时输出 `needsClarification=true`；候选数量大于 1 不等于需要澄清；
4. `documentSelection` 由 targets 数量决定，`scope` 和访问权限由事实合同决定；
5. 不读取正文，不输出自由文本解释，不把概率当作校准后的数学事实。

对小模型而言，候选缩小、正反例并列和固定 reason code 比增加长篇领域说明更有效，也更容易回归测试。

## 5. Layer 2：候选式结构化输出

当前使用版本化合同 `intent-router-output-2`：

```json
{
  "candidates": [
    {
      "intent": "character-analysis",
      "agent": "StoryDeconstruction",
      "skill": "character-arc-extraction",
      "modelScore": 0.72,
      "reasonCodes": ["character-fate", "character-relationship"]
    },
    {
      "intent": "document-analysis",
      "agent": "StoryDeconstruction",
      "skill": "long-text-analysis",
      "modelScore": 0.28,
      "reasonCodes": ["story-structure"]
    }
  ],
  "needsClarification": false,
  "missingFacts": []
}
```

合同规则：

- `candidates` 长度为 1-3，重复 `intent + skill` 路由、未知 Registry 值、越界分数、额外字段均拒绝；同一 Intent 的不同 Skill 路由允许并存；
- `modelScore` 只表示模型排序信号，不宣称校准概率；后置层可归一化，但不能把它当作统计置信度；
- 候选必须携带 Agent/Skill，但后置层始终通过 Registry 重算映射；
- `missingFacts` 非空时不得读取正文；模型的 `needsClarification` 是后置层的输入信号，不得覆盖强词元证据或明显领先候选的工程化放行结果；
- 旧模型只能输出单对象时，适配器把它转换为一个候选并标记 `legacy-single`，不伪造第二候选。

## 6. Layer 3：候选校正、拒答与 TaskPlan 签发

后置层使用可解释的分数合成，而不是修改模型权重：

```text
effectiveScore = modelScore
               + lexicalEvidenceWeight
               + semanticSimilarityWeight
               + deterministicFactBonus
               - contradictionPenalty
```

建议决策顺序：

1. 过滤未知/重复/越界候选；全部无效则 `invalid-model`；
2. 用 Registry 重算 Agent/Skill/Tool；模型不能覆盖注册映射；
3. 用 targets 数量重算 `documentSelection`，用请求类型重算 `scope`；
4. 对词元、embedding 和模型候选做加权合成，并记录证据来源；
5. 缺少事实、真实语义冲突且没有强词元证据，或与第二名的 margin 不足时进入 `clarify`；当前评测基线 margin 为 `0.12`，后置层允许强词元证据和明显领先候选覆盖模型的过度澄清标记；
6. 只有通过 `TaskPolicy`、正文访问和副作用校验后才签发 `TaskPlan`。

三种结果必须区分：

| 结果 | 含义 | 行为 |
| --- | --- | --- |
| `route` | 高置信且事实一致 | 生成 TaskPlan |
| `clarify` | 候选接近、事实缺失或冲突 | 询问最小澄清问题，不读正文 |
| `reject` | 输出非法、越权或无法映射 | 记录诊断并安全回退，不执行 Tool |

“后置矫正”只能修正可证明的合同字段和高信号证据。它不能把低置信的复合请求静默改成任意单一意图；这正是当前 `single-long-file-analysis` 可修正、而“人物命运和情节结构”应澄清的边界。

## 7. Vinkey 分阶段落地

### Phase A：先统一合同，不改变安全边界

- 抽取 `IntentCandidate[]`、`resolveCandidates` 和 `ClarificationReason` 类型；
- 让评测层和运行时共享同一个后置 resolver；
- 保持旧的单对象模型适配器，继续输出 raw/effective 双层指标；
- 增加 `unknown/clarify`，禁止低置信候选进入正文读取。

### Phase B：引入本地候选召回

- 先使用现有词元词典和 BM25/TF-IDF；
- 若本地已具备 embedding 模型，再增加 HybridRouter 式 dense+sparse 召回；
- 通过固定验证集校准每个路由的阈值和 margin，不在生产运行时自动学习。

### Phase C：候选式模型评测（评测侧首轮已完成）

- 使用 `intent-router-eval-3` 版本化套件、`intent-router-prompt-5` 提示合同和 `intent-router-output-2` 候选合同；
- 同时统计 top-1、top-2 命中率、候选召回率、澄清准确率、事实合同准确率和越权拒绝率；
- 把原始模型能力、候选 resolver 增益和最终 TaskPlan 结果分开报告。

## 8. 不采用的方案

- 不用模型输出的自由文本理由直接执行 Agent；
- 不把 top-1 的任意小数当作校准概率；
- 不依赖模型自己决定文件数量、正文权限、Tool allowlist 或副作用；
- 不通过手工“调整 token attention”伪造模型能力；
- 不用在线反馈自动修改词元权重后立即生效，词典变更必须版本化并重新验收。
