# 知识库 FAQ 功能实施方案

## 文档状态

- 状态：FAQ V1 已在当前未提交工作区完成实现与 focused 自动化验证；仍待真实 PostgreSQL/Vector Store 集成验证及用户手动浏览器验收。
- 基线：`origin/develop@8f167a3742cbc3b6e7496d557dd3674e90042173`；当前实现分支为 `update/knowledgebase-settings-ui@1acc9b9c103ce1da017f6e208ec46308a392eb5e`，另有未提交实现。
- 最后更新：2026-09-04。
- 本文定义 FAQ V1 的产品边界、当前实施状态、领域模型、存储方式、检索接入、界面与验收标准。

## 结论

FAQ 应当被建模为一种新的知识库类型，而不是第四种 Retriever。

- `Vector`、`Keyword`、`Graph` 是“怎样找到候选内容”的检索算法。
- `FAQ` 是“知识以什么结构录入和管理”的内容类型。
- FAQ V1 复用现有 chunk、Vector、Keyword 和 Weighted RRF 链路，不新增 `FaqRetriever`。
- FAQ 知识库采用“一条问答对应一个业务 chunk”的结构化存储，并用明确的 `contentKind: 'faq'` 标识内容，不从标题、正文格式或旧字段猜测类型；选择“分别索引”时，一个业务 chunk 可以派生多个向量记录。
- FAQ 默认执行 Vector + Keyword 的 Weighted RRF，Graph 权重为 `0`，因此不要求 FAQ 用户配置 GraphRAG。
- V1 使用独立 FAQ 知识库，不支持在同一个知识库里混放普通文档和 FAQ。

这能先解决 FAQ 的核心闭环：结构化录入、可靠管理、可检索、可引用，同时避免复制一套新的权限、向量索引和检索框架。

## 当前实施状态

截至 2026-09-04，当前分支已经完成 FAQ V1 的代码闭环：

- [x] 增加 `KnowledgebaseTypeEnum.FAQ`，创建知识库时可选择“问答”。
- [x] 增加并持久化 `KnowledgebaseFAQConfig`，创建时校验、补默认值，并通过详情/公开 DTO 返回。
- [x] FAQ 创建界面只显示“基本信息、模型配置、向量存储、检索设置、FAQ 设置”五个菜单。
- [x] FAQ 使用只包含 Vector、Keyword、Hybrid 的专用检索设置，不显示 Graph；同时隐藏通用“索引策略”、解析、分块、图像、音频、高级和存储引擎配置。
- [x] “向量存储”页面准确展示当前“系统默认”能力；选项禁用，不伪装成知识库级可选配置。
- [x] 新建 FAQ 时可选择两组索引配置和反例匹配方式；已有 FAQ 中配置只读，服务端拒绝更新 `faqConfig`。V1 只允许精确排除，语义排除仅作为 disabled 预留项。
- [x] FAQ entry/metadata 契约、托管文档、CRUD API、长度校验和重复校验。
- [x] FAQ 反例录入、校验、管理展示和检索后精确排除；反例不参与 Vector/Keyword 索引。
- [x] FAQ 投影、一个业务 chunk 到一个或多个向量记录的生命周期管理、可观察的失败补偿，以及替换导入的先暂存后切换与失败回滚。
- [x] FAQ 默认检索 mode、Vector + Keyword Weighted RRF、canonical 去重与结果补全。
- [x] FAQ 管理页、独立编辑弹窗、批量导入导出与重处理、重建状态轮询、类型化默认路由和引用跳转。
- [x] FAQ 相关服务端/前端 focused 单元测试与类型检查。
- [ ] 真实 PostgreSQL Keyword 索引、PGVector/Milvus adapter 集成验证。
- [ ] 用户手动浏览器验收：创建、CRUD、启停、检索及引用定位。

当前代码已具备 FAQ 录入和检索能力，但在完成上述两项运行环境验收前不应标记为可发布。

## 背景与现状

### 当前已经具备的能力

当前内置知识库已经具备：

- Vector、Graph、Keyword 三种候选召回器。
- Legacy Fusion 和 Weighted RRF 两套融合策略。
- tenant、organization、knowledgebase、document、chunk 的统一访问边界。
- chunk 创建、更新、删除时同步向量数据的服务能力。
- `metadata.enabled = false` 时从 Vector、Keyword、Graph 检索中排除 chunk 的约定。
- `xpert://knowledgebase/chunk` 引用链接。
- system-managed document 的既有实现模式。

因此 FAQ 不缺少底层检索能力，缺少的是稳定的 FAQ 身份、字段、管理 API、管理界面和默认检索策略。

### 不能复用的旧概念

`KnowledgeStructureEnum.QA` 是已经标记为 deprecated 的知识库级 `structure` 值，当前也没有对应的 QA splitter 实现。FAQ V1 不复活该字段，原因是：

- 它没有形成完整的数据、API 和检索契约。
- 它把内容解析方式和知识库产品类型混在一起。
- 继续扩展 deprecated 字段会使新旧配置优先级不清楚。

新的稳定身份应当是 `KnowledgebaseTypeEnum.FAQ = 'faq'`。

### 外部产品参考

WeKnora 当前也把 FAQ 建模为 `faq` 类型知识库，将每条问答存成 FAQ chunk，并为问题、相似问法和回答提供结构化字段。它还提供导入导出、负向问题、多回答与回答策略等更大的功能面。

本方案借鉴其已经验证的“FAQ 是知识库内容类型、每条问答独立索引”模型，以及“反例不索引、命中后精确排除”的语义。V1 支持 WeKnora 兼容的批量导入导出，但标签和回答策略仍不进入 V1：

- [WeKnora FAQ API](https://github.com/Tencent/WeKnora/blob/main/docs/api/faq.md)
- [WeKnora 文档处理流水线](https://github.com/Tencent/WeKnora/blob/main/website-docs/02-architecture/03-document-pipeline.md)
- [WeKnora 知识库 API](https://github.com/Tencent/WeKnora/blob/main/docs/api/knowledge-base.md)

## V1 产品范围

### In Scope

- 创建 `FAQ` 类型的内置知识库。
- FAQ 列表、分页、搜索、loading 和 empty state。
- 新增、编辑、删除、启用和停用 FAQ 条目。
- WeKnora 兼容的 JSON、CSV、TSV、XLSX、XLS 导入，支持导入前预览、追加和替换；CSV/JSON 支持全部或选中条目导出。
- 批量启用、停用、重处理、导出和删除；重处理期间持续展示重建中、成功或失败状态。
- 每条 FAQ 包含：
  - 必填标准问题，最多 500 个 Unicode code points。
  - 最多 10 条相似问法，每条最多 500 个 Unicode code points。
  - 最多 10 条反例，每条最多 500 个 Unicode code points。
  - 1～5 个回答块，合计最多 10,000 个 Unicode code points。
- 标准问题和相似问法的精确重复校验。
- 反例内部不得重复，也不得与本条 FAQ 的标准问题或相似问法重复。
- 反例不进入 Vector/Keyword 索引；查询与反例规范化后完全一致时，从候选结果中排除该 FAQ。
- FAQ 内容进入现有 Vector + Keyword + Weighted RRF 检索。
- 创建时可选择 FAQ 索引内容：`仅标准问/相似问` 或 `标准问 + 答案`。
- 创建时可选择问题向量组织方式：`合并索引` 或 `分别索引`。
- FAQ 创建完成后两组索引配置只读，避免已有向量与配置失配。
- FAQ 创建界面固定为“基本信息、模型配置、向量存储、检索设置、FAQ 设置”五个菜单。
- FAQ 检索设置只允许 Vector、Keyword 和 Hybrid，Graph 相关模式与配置不出现，服务端始终将 Graph 权重归零并禁用 GraphRAG。
- 向量存储沿用系统默认配置，界面只读展示，不提供知识库级存储选择。
- FAQ 命中后继续返回当前统一的 `Document[]` 结果，不修改 Agent、SDK、Plugin 或 ChatKit 的消费协议。
- FAQ 引用可跳回对应 FAQ 条目。
- 沿用现有租户、组织、知识库读写权限和删除语义。

### Out of Scope

- 标签、推荐优先级。
- 回答块随机选择、优先级或其他回答策略；V1 将多个回答块一并提供给 Agent。
- 图片或附件型回答。
- 绕过 Agent 的 FAQ 直接回答。
- 专用 `FaqExactRetriever`。
- 普通知识库与 FAQ 在同一知识库内混合管理。
- 外部 FAQ Provider。
- Wiki 内容类型。
- 知识库级向量存储选择、绑定、迁移或在线重建索引。
- FAQ 创建后的索引模式切换和自动重建。

这些能力应在 V1 有真实使用数据后分别评估，避免把录入、召回和回答策略一次性耦合在一起。

## 领域模型

### 共享契约

建议在 `packages/contracts/src/ai` 增加明确契约：

```ts
export enum KnowledgebaseTypeEnum {
  Standard = 'standard',
  FAQ = 'faq',
  External = 'external'
}

export type KnowledgebaseFAQIndexMode = 'question_only' | 'question_answer'

export type KnowledgebaseFAQQuestionIndexMode = 'combined' | 'separate'

export type KnowledgebaseFAQNegativeMatchMode = 'exact' | 'semantic'

export type KnowledgebaseFAQConfig = {
  indexMode: KnowledgebaseFAQIndexMode
  questionIndexMode: KnowledgebaseFAQQuestionIndexMode
  negativeMatchMode?: KnowledgebaseFAQNegativeMatchMode
}

export const DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG = {
  indexMode: 'question_only',
  questionIndexMode: 'separate',
  negativeMatchMode: 'exact'
} as const satisfies KnowledgebaseFAQConfig

export type KnowledgeRetrievalMode = 'vector' | 'keyword' | 'graph' | 'hybrid'

export interface IKnowledgeFAQEntry {
  id: string
  knowledgebaseId: string
  standardQuestion: string
  similarQuestions: string[]
  negativeQuestions: string[]
  answerBlocks: string[]
  enabled: boolean
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface IKnowledgeFAQChunkMetadata extends IDocChunkMetadata {
  contentKind: 'faq'
  standardQuestion: string
  similarQuestions: string[]
  negativeQuestions?: string[]
  answerBlocks: string[]
  faqVectorIds: string[]
  vectorSyncStatus?: 'pending' | 'ready' | 'failed'
}
```

约束：

- `TKnowledgebase.faqConfig` 只对 `type = faq` 生效；FAQ 创建时缺省为 `question_only + separate + exact`，非 FAQ 输入中的 `faqConfig` 会被移除。
- 两组索引配置和反例匹配方式只能在创建时选择。已有 FAQ 的设置页只读，服务端更新接口也必须拒绝 `faqConfig`，不能只依赖前端 disabled。
- FAQ 类型由知识库的 `type` 和 chunk 的 `contentKind` 共同显式表达。
- `id` 直接使用现有 chunk ID，不再创建另一套 FAQ item ID 与 chunk ID 映射。
- API 不把整个 chunk metadata 原样暴露为可写对象；请求 DTO 只接受 FAQ 业务字段。
- `standardQuestion`、`similarQuestions`、`negativeQuestions`、`answerBlocks` 在服务端统一 trim、规范化和校验长度；规范化后为空的输入返回字段错误，不静默丢弃。
- 不通过 `name`、`pageContent` 文本格式、`category` 或文件扩展名推断 FAQ。

### 检索 mode 的归属修正

当前检索 mode 同时出现在请求级 `TKBRetrievalSettings.mode` 和知识库 `graphRag.mode`，但 Vector/Keyword/Hybrid 并不属于 Graph 配置。

FAQ 实现前应把持久化默认值补到 `TKBRecallParams.mode`，并复用同一个 `KnowledgeRetrievalMode` 类型。解析优先级为：

```text
request retrieval.mode
  > knowledgebase.recall.mode
  > knowledgebase.graphRag.mode   // 只作为旧数据兼容
  > vector
```

这样 FAQ 默认召回策略可以由 `recall` 正确拥有，同时旧知识库行为保持不变。

## 存储设计

### 一库一个托管文档，一条 FAQ 一个业务 chunk

每个 FAQ 知识库创建一个不可由普通文档页面管理的 system-managed document：

```ts
{
  systemManaged: true,
  systemManagedType: 'faq'
}
```

每条 FAQ 对应该文档下的一个 chunk：

- 关系库中只有一个 canonical chunk，保存业务 metadata、版本、状态和检索投影。
- `faqId` 直接等于 canonical chunk ID，列表、编辑、权限和引用均以它为业务身份。
- `questionIndexMode = combined` 时，该 chunk 派生一个向量记录。
- `questionIndexMode = separate` 时，该 chunk 按“标准问题 + 每条相似问法”派生多个向量记录；每个向量记录都必须显式携带 `faqId/sourceChunkId` 并能回到 canonical chunk。
- Keyword Retriever 只检索 canonical chunk 的问题集合投影，不因“分别索引”复制关系库行。
- 反例只保存在 canonical chunk 与派生向量的结构化 metadata 中，不生成自己的 Keyword/Vector 搜索文本或向量记录。
- 更新、停用和删除 FAQ 时，必须作用于该 FAQ 派生的全部向量记录；删除知识库时仍沿用 document/chunk/vector 清理链路。

这一方案比单独新建 FAQ 表更适合 V1：它直接复用已经存在的权限、过滤、引用、向量生命周期和检索返回协议，也避免 FAQ 数据与 chunk 投影之间形成双份身份。

### 检索投影与结果内容

FAQ 结构化字段是事实来源，检索文本和返回给 Agent 的内容都由纯函数生成，UI 不允许直接编辑投影。

向量投影矩阵：

| `indexMode`       | `questionIndexMode = combined`                   | `questionIndexMode = separate`                     |
| ----------------- | ------------------------------------------------ | -------------------------------------------------- |
| `question_only`   | 标准问题和全部相似问法合并为一个向量             | 标准问题、每条相似问法各生成一个向量               |
| `question_answer` | 标准问题、全部相似问法和全部回答块合并为一个向量 | 每个问题分别生成向量，每个回答块再独立生成一次向量 |

Keyword 仍按一个 canonical chunk 建索引：

- `question_only`：Keyword 搜索投影只包含标准问题和相似问法。
- `question_answer`：Keyword 搜索投影包含标准问题、相似问法和回答。
- `questionIndexMode` 只改变向量记录的组织方式，不复制 Keyword 的关系库记录。
- `negativeQuestions` 在四种组合下都不进入 Keyword/Vector 搜索投影，也不增加逻辑向量数量。

检索命中后，无论使用哪种索引模式，返回给 Agent 的最终 `Document.pageContent` 都必须包含回答。`question_only` 不能因为索引正文没有回答而让 Agent 拿不到答案；应从结构化 metadata 补全结果内容。例如：

```text
Question: 如何申请退款？
Similar questions:
- 退款怎么操作？
- 怎样退钱？
Answer: 在订单详情中选择申请退款……
```

要求：

- 创建和更新必须调用同一组 projection/renderer 函数。
- `metadata` 是恢复 FAQ 编辑表单的结构化来源。
- 所有向量记录必须带稳定的 UUID 派生身份和 canonical `faqId/sourceChunkId`；超长 embedding 拆段也使用确定性 UUID，RRF 去重时按 canonical FAQ 身份合并。
- 创建、更新、启停和删除必须覆盖同一 FAQ 的全部派生向量，不能遗留旧问题的向量。
- 精确的派生 vector ID 编码由 Phase 2 在适配具体 Vector Store 时固定，并补迁移与清理测试；不得从文本内容猜测归属。

因此，“一条 FAQ 一个 chunk”指一条业务记录和一个 canonical 关系库身份，不等于永远只有一个向量。选择“分别索引”时，一条 FAQ 会有多个可检索向量，但这些向量不成为新的 FAQ 条目。

### 重复规则

同一个 FAQ 知识库内，标准问题和所有相似问法组成唯一正向问题集合。服务端对正向问题和反例使用同一套稳定 normalize 规则进行精确重复校验：

- Unicode normalization。
- trim 首尾空白。
- 合并连续空白。
- 英文大小写不敏感。
- 不进行语义相似度判重。

创建和更新时必须检查：

- 当前条目内部不能有重复问题。
- 不能与其他启用或停用条目的标准问题/相似问法重复。
- 当前条目的反例内部不能重复，也不能与本条 FAQ 的标准问题/相似问法重复。
- 反例不进入全库正向问题唯一性集合；同一句话可以是另一条 FAQ 的正向问题，表达“该问题不应命中当前 FAQ”。

为了避免并发写入绕过校验，FAQ mutation 应在知识库粒度的数据库事务锁内执行“读取规范化问题集合 -> 校验 -> 写入”。不要只依赖前端校验。

## 后端设计

### 模块边界

在 `packages/server-ai/src/knowledgebase/faq` 下建立 FAQ 业务模块：

```text
faq/
  faq.controller.ts
  faq.service.ts
  faq.module.ts
  dto/
  faq-search-projection.ts
  faq-result.renderer.ts
  faq-vector-identity.ts
  faq-question.normalizer.ts
```

职责：

- Controller：路由、DTO 校验和当前用户上下文。
- FAQ Service：权限、知识库类型校验、托管文档、重复规则和 mutation 编排。
- Search Projection：按两组索引配置生成 canonical Keyword 投影和一个或多个向量投影。
- Result Renderer：检索完成后把结构化 FAQ 补全为 Agent/citation 使用的内容。
- Vector Identity：从 canonical FAQ ID 和问题 slot 生成稳定 logical vector ID。
- Normalizer：精确问题判重的纯函数。
- 现有 Document Service：实际 chunk 与 vector 创建、更新、删除。
- Retriever/Fusion：保持通用，不解析 FAQ 文本格式；编排层只把 FAQ 配置转换成通用 candidate limit，并在最终输出边界调用 Result Renderer。

### API

建议提供面向 FAQ 业务的 API，而不是让前端直接调用通用 chunk API：

```text
GET    /knowledgebase/:knowledgebaseId/faqs
GET    /knowledgebase/:knowledgebaseId/faqs/:faqId
POST   /knowledgebase/:knowledgebaseId/faqs
PUT    /knowledgebase/:knowledgebaseId/faqs/:faqId
DELETE /knowledgebase/:knowledgebaseId/faqs/:faqId
```

列表参数：

```ts
{
  search?: string
  enabled?: boolean
  skip?: number
  take?: number
}
```

写入参数：

```ts
{
  standardQuestion: string
  similarQuestions?: string[]
  answerBlocks: string[]
  enabled?: boolean
  version?: number
}
```

接口规则：

- 读接口要求知识库 read 权限，写接口要求 write 权限。
- 每次操作同时限定 tenant、organization 和 knowledgebase ID。
- 只接受 `type = faq` 的内置知识库，拒绝 Standard 和 External。
- FAQ 索引配置属于知识库创建契约，不属于 FAQ 条目 DTO；知识库更新接口拒绝修改 `faqConfig`。
- 更新和删除使用现有 chunk version 做乐观并发控制。
- 错误消息使用 `i18next` 的 `server-ai` namespace，并同步三个当前资源文件。
- 删除保持现有永久删除语义；V1 不新增回收站。

### 索引一致性

FAQ Service 复用现有 chunk mutation 的数据库与 Vector Store 同步约定，不在 V1 引入新的消息队列或 outbox。

必须补充失败路径测试并保证：

- 创建失败时不向列表暴露只有关系数据、没有可检索向量的半成品。
- 更新失败时不会把旧可检索内容静默替换为未完成投影。
- 删除失败必须返回明确错误，不能报告成功后仍保留可检索向量。

如果现有 Document Service 无法满足上述回滚边界，实现时应先在该服务内补齐可复用的一致性处理，而不是在 FAQ Controller 中复制 vector 操作。

## 默认检索策略

### FAQ 默认值

FAQ 创建时由服务端写入默认召回设置：

```ts
{
  mode: 'hybrid',
  fusion: {
    mode: 'weighted_rrf',
    rankConstant: 60,
    weights: {
      vector: 0.7,
      keyword: 0.3,
      graph: 0
    }
  }
}
```

原因：

- Vector 负责口语改写和语义相近问题。
- Keyword 负责产品名、编号、缩写和精确词。
- Graph 对独立短问答不是 V1 必需能力。
- 当前 Weighted RRF 已会跳过权重为 `0` 的来源，不需要 FAQ 专属分支。

默认召回值放在共享的后端配置构造函数中。FAQ 创建和设置界面复用检索设置组件，但通过明确的 FAQ 能力约束只开放 Vector、Keyword、Hybrid 及其参与参数，不显示 Graph。服务端负责校验并兜底配置，强制 Graph 权重为 `0`、GraphRAG 为 disabled。

### 运行前提

Keyword Retriever 依赖既有 PostgreSQL FTS 和 trigram 索引。FAQ 上线检查必须包含生产索引状态；缺失索引时保持当前明确失败行为，不能静默退化为全表扫描。

### 为什么 V1 不做专用 FAQ Retriever

精确 FAQ Retriever 只有在产品明确需要下列策略时才成立：

- 命中某个阈值后绕过 Agent，直接返回配置答案。
- 推荐/置顶规则优先于统一检索排序。
- 多回答选择策略。

V1 的反例只需要在统一检索完成后，对规范化查询做精确匹配并排除对应 FAQ；它不产生候选，也不改变排序。因此 V1 仍由 Agent 消费统一检索结果，新增专用 Retriever 只会重复 Keyword/Vector 的查找能力。

## 前端设计

### 创建知识库

当前创建界面已经启用共享枚举中的 `KnowledgebaseTypeEnum.FAQ`，并提交真实选择的 `type` 和 `faqConfig`。目标行为固定为：

- Standard 保留当前完整配置区。
- FAQ 左侧只显示五个菜单：`基本信息`、`模型配置`、`向量存储`、`检索设置`、`FAQ 设置`。
- FAQ 基本信息页不显示通用“索引策略”。
- FAQ 检索设置只显示 Vector、Keyword 和 Hybrid，不显示 Graph、GraphRAG 或图检索参数；解析引擎、分块、图像、音频、高级设置和存储引擎也保持隐藏。
- FAQ 设置提供 `indexMode`、`questionIndexMode` 和 `negativeMatchMode`；新建时可选，编辑已有 FAQ 知识库时 disabled 并显示“创建后不可修改”的说明。V1 中 `negativeMatchMode` 只能取 `exact`，`semantic` 仅以 disabled 选项预留。
- FAQ 的默认值为“仅标准问/相似问 + 分别索引”。
- FAQ 创建成功后跳转到 `/faq`，Standard 仍跳转当前文档页。

当前创建期 FAQ 设置规模较小，可以先沿用创建组件现有的 `switch` 页面结构。新增 FAQ 管理表单时再提取独立 standalone 组件，避免继续扩大现有组件职责。新 UI 使用 Zard、Reactive Forms 和 Tailwind，不新增 SCSS 文件。

### 向量存储

当前仓库只有系统级 `VECTOR_STORE`/运行环境选择，没有知识库级向量存储绑定字段或 API。因此 V1 的“向量存储”菜单表达的是运行约束，不是一个可写配置：

- 下拉框显示“系统默认”并禁用。
- 文案说明创建后不可修改；若未来支持迁移，应创建绑定到目标存储的新知识库并重建索引。
- 不把模型配置、存储引擎或环境变量伪装成当前知识库的向量存储选择。
- 后续若要支持每库选择，必须先补共享契约、后端路由、迁移语义和重建任务，再开放控件。

### FAQ 管理页

在知识库详情下增加 `faq` lazy route 和独立页面：

```text
knowledgebase/faq/
  faq.component.ts
  faq.component.html
  faq-editor.component.ts
  faq-editor.component.html
```

页面能力：

- 表格或列表展示标准问题、相似问法数量、反例数量、状态、更新时间和操作。
- 搜索和启用状态筛选。
- 新增/编辑使用页面右侧 inspector，使用 `z-form`、`z-input`、textarea/对应 Zard 控件。
- 相似问法和反例使用可重复输入控件，并显示条数、长度、重复及正反冲突错误。
- 删除二次确认。
- 首次加载、保存中、空列表和失败重试状态。

导航按知识库类型显示：

- FAQ：FAQ、配置、测试。
- Standard：文档、Pipeline、Graph、配置、测试，保持当前条件规则。
- External：保持当前行为。

FAQ 的 system-managed document 不应出现在普通文档管理入口。

### Client service

在 `apps/cloud/src/app/@core/services` 新增 `knowledge-faq.service.ts`，并通过现有 barrel 导出。服务只封装 FAQ API，不向组件暴露通用 chunk metadata。

## 引用与跳转

FAQ 仍然返回标准 knowledge document/chunk 结果，因此 Agent 引用生成主链路不变。

在生成引用时，根据显式的 `metadata.contentKind === 'faq'` 生成 FAQ 目标，例如：

```text
xpert://knowledgebase/faq?knowledgebaseId=...&faqId=...
```

打开后进入 FAQ 管理页并定位相应条目。现有 `xpert://knowledgebase/chunk` 格式必须继续支持，普通文档引用不能改变。

## 兼容性约束

- 历史知识库缺少 `type`（`null`/`undefined`）时按 Standard 文档知识库处理；不能因为新增 FAQ 类型而隐藏原有文档、知识过滤器或完整检索设置。
- Standard 和 External 知识库的创建、导航、检索和引用行为不变。
- 旧 `structure = qa` 数据不自动迁移为 FAQ；先统计真实数据，确认映射后再单独设计迁移。
- 知识库创建后 `type` 不允许直接切换，避免现有文档和 FAQ 托管数据失去归属。
- FAQ 的 `faqConfig` 创建后不允许修改；未来如需切换索引模式，必须先定义重建流程，而不是只改 JSON 配置。
- V1 使用系统级向量存储，不新增知识库级绑定字段；“向量存储”页面为只读说明页。
- 请求级 retrieval mode 继续覆盖知识库默认值。
- `graphRag.mode` 只作为旧知识库 fallback，不删除、不批量回写。
- 检索对外仍返回 `Document[]`，不要求 `xpert-plugins`、`xpert-sdk-js` 或 `chatkit-js` 同步发布。
- 现有 Keyword 索引部署要求不变。

## 分阶段实施

### Phase 1：契约与检索配置归属

- [x] 增加 `KnowledgebaseTypeEnum.FAQ`。
- [x] 增加 `KnowledgebaseFAQConfig`、默认值、持久化字段和公开/详情 DTO。
- [x] 创建时规范化 FAQ 配置，已有知识库中保持只读。
- [x] 增加共享 `KnowledgeRetrievalMode`。
- [x] 在 `TKBRecallParams` 增加 `mode`。
- [x] 实现新旧 mode 解析优先级及回归测试。
- [x] 增加 FAQ entry、metadata 和 DTO 契约。
- [x] 定义 FAQ 默认召回配置及单元测试。

验收：FAQ 创建配置可完整 round-trip 且创建后不可修改；Standard/External 的现有 mode 行为不变；FAQ 可以表达 Vector + Keyword RRF 且不调用 Graph。

### Phase 2：后端 FAQ 垂直切片

- [x] 增加 FAQ controller/service 并注册到 Knowledgebase module。
- [x] 实现托管文档的并发安全 `ensure`。
- [x] 实现 renderer、normalizer、重复规则和索引投影矩阵。
- [x] 实现 canonical FAQ chunk 到派生向量记录的稳定 UUID 身份映射。
- [x] 按确认后的共享上限校验问题、相似问法数量和回答长度。
- [x] 增加最多 10 条、每条最多 500 字的反例；不生成索引，并在查询完全命中反例时排除 FAQ。
- [x] 实现列表、单条读取与 CRUD API。
- [x] 复用 chunk/vector mutation，并覆盖多个向量记录的失败补偿、同步状态和完整清理。
- [x] 为 `separate` 模式增加从逻辑向量上限起步的自适应 candidate 扩容、canonical 去重和最佳 score/rank 保留；当 embedding context 导致物理拆段超过逻辑上限时继续倍增，直到得到足够 canonical FAQ 或后端结果耗尽。
- [x] 在最终输出边界补全 FAQ 回答内容，不让索引投影泄漏为 Agent 的最终上下文。
- [x] 增加类型、重复、乐观并发、失败补偿与 Controller 参数测试。
- [ ] 用真实 PostgreSQL/PGVector/Milvus 环境补齐 adapter 和并发 integration tests。

验收：只通过 API 即可完成 FAQ 全生命周期，启停、更新和删除会正确改变检索结果。

### Phase 3：创建与管理 UI

- [x] 启用 FAQ 创建入口并提交真实 type。
- [x] FAQ 创建时只显示“基本信息、模型配置、向量存储、检索设置、FAQ 设置”。
- [x] 增加 FAQ 两组创建期索引配置和反例匹配方式，并在已有知识库中 disabled。
- [x] FAQ 检索设置只开放 Vector、Keyword、Hybrid，隐藏 Graph；Standard/External 继续保留原有完整检索设置。
- [x] 增加“系统默认”的只读向量存储页面。
- [x] FAQ 创建成功后跳转到 FAQ 管理页。
- [x] 增加类型化默认 route、FAQ 导航、列表和编辑 dialog。
- [x] 增加 FAQ client service、翻译和前端测试。
- [x] 增加导入预览、追加/替换导入、模板下载、CSV/JSON 全量与批量导出，以及批量启停、重处理和删除。
- [x] FAQ 重处理后轮询重建状态直到成功或失败；失效的 citation `faqId` 只提示定位失败，不破坏已加载列表。

验收：用户无需接触通用文档/chunk 页面即可创建 FAQ 知识库并管理问答。

### Phase 4：检索、引用与回归

- [x] 用 focused 测试验证 FAQ 默认只执行 Vector + Keyword。
- [x] 用表驱动测试验证四种索引配置组合的 Vector/Keyword 投影和结果回答补全。
- [x] 验证 Vector 来源内 canonical 去重、最佳 score/rank、停用过滤和 Weighted RRF 接入。
- [x] 增加 FAQ 引用目标和 Cloud 定位行为。
- [x] 回归请求级 mode 优先级、旧 `graphRag.mode` fallback 与普通 citation。
- [x] 补充运维发布检查项。
- [ ] 在真实多知识库数据与浏览器中完成排序、导航和交互验收。

验收：Agent 可检索并引用 FAQ，普通知识库行为不回退。

## 预计修改位置

### Contracts

- `packages/contracts/src/ai/knowledgebase.model.ts`
- `packages/contracts/src/ai/knowledge-doc-chunk.model.ts`
- `packages/contracts/src/ai/xpert.model.ts`
- 新增 FAQ contract/DTO 文件及 barrel export。

### Server

- `packages/server-ai/src/knowledgebase/faq/**`
- `packages/server-ai/src/knowledgebase/knowledgebase.module.ts`
- `packages/server-ai/src/knowledgebase/queries/handlers/knowledge-search.handler.ts`
- `packages/server-ai/src/knowledgebase/retrieval/vector-knowledge-candidate.retriever.ts`
- `packages/server-ai/src/knowledgebase/vector-store.ts`
- `packages/server-ai/src/knowledgebase/citation.ts`
- 必要时收敛 `knowledge-document/document.service.ts` 的 mutation 一致性能力。
- `packages/server-ai/src/i18n/en.json`
- `packages/server-ai/src/i18n/en-US.json`
- `packages/server-ai/src/i18n/zh-Hans.json`

### Cloud

- `apps/cloud/src/app/features/xpert/knowledge/new/**`
- `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/routing.ts`
- `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/knowledgebase.component.*`
- 新增 `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/faq/**`
- 新增 `apps/cloud/src/app/@core/services/knowledge-faq.service.ts`
- 对应 i18n 文件。

## 验收测试矩阵

以下条件均为发布门槛；“Then”必须由自动化测试或明确的人工验收步骤证明，不能以代码存在代替行为通过。

### Contract 与创建配置

| ID     | Given                                                | When                                                  | Then                                                                                               |
| ------ | ---------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| AC-C01 | 创建请求为 `type = faq` 且未传 `faqConfig`           | 服务端创建知识库                                      | 持久化并返回 `question_only + separate`                                                            |
| AC-C02 | 创建请求为 `type = faq` 且传入四种合法组合中的任一种 | 经 create DTO、entity、公开 DTO 和详情 DTO round-trip | 两个枚举值保持不变，不丢失、不被替换                                                               |
| AC-C03 | `faqConfig` 缺字段或包含非法枚举值                   | 服务端校验创建请求                                    | 返回明确的 4xx 国际化错误，不创建知识库                                                            |
| AC-C04 | 创建请求为 Standard/External 且携带 `faqConfig`      | 服务端规范化输入                                      | 不持久化 FAQ 配置，原类型行为不变                                                                  |
| AC-C05 | 任意已有知识库                                       | 更新请求携带 `type` 或 `faqConfig`                    | 服务端拒绝不可变字段修改；只绕过前端调用 API 也不能修改                                            |
| AC-C06 | 请求和知识库分别配置了 retrieval mode                | 执行检索                                              | 按 `request > recall > legacy graphRag > vector` 解析；旧 Standard 未配置 `recall.mode` 时结果不变 |

### 创建与设置界面

| ID     | Given                             | When                    | Then                                                                                                           |
| ------ | --------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| AC-U01 | 打开新建知识库弹窗                | 选择“问答”              | 左侧恰好显示“基本信息、模型配置、向量存储、检索设置、FAQ 设置”五个菜单                                         |
| AC-U02 | 新建 FAQ                          | 浏览五个页面            | 检索设置只包含 Vector、Keyword、Hybrid；不出现 Graph、通用索引策略、解析、分块、图像、音频、高级或存储引擎配置 |
| AC-U03 | 新建 FAQ                          | 修改两组 FAQ 设置并提交 | 请求携带所选 `type` 和 `faqConfig`，合法配置可创建成功                                                         |
| AC-U04 | 打开已有 FAQ 的设置弹窗           | 进入基本信息或 FAQ 设置 | 知识库类型及两组 FAQ 配置显示已保存值但不可交互，并显示创建后不可修改说明                                      |
| AC-U05 | 新建或编辑 FAQ                    | 进入“向量存储”          | 只显示 disabled 的“系统默认”和准确说明，不向 API 发送不存在的知识库级存储配置                                  |
| AC-U06 | 打开 Standard/External 创建与设置 | 完成原有操作            | 原菜单、校验、请求 payload 和落地页行为不回退                                                                  |
| AC-U07 | 新建或查看已有 FAQ                | 进入 FAQ 设置           | 精确排除为当前有效值；语义排除可见但 disabled，不能写入未支持的配置                                            |

### FAQ API、权限与关系数据

| ID     | Given                                                               | When                                 | Then                                                                 |
| ------ | ------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| AC-A01 | 同一 FAQ 知识库尚无托管文档                                         | 两个请求并发创建首条 FAQ             | 最终只存在一个 `systemManagedType = faq` 文档，两条 FAQ 均归属该文档 |
| AC-A02 | 有合法 FAQ 写权限                                                   | 创建、读取、编辑、启停和删除一条 FAQ | 每个操作都只改变一个 canonical chunk，version 按现有乐观锁语义递增   |
| AC-A03 | 当前条目或库内其他条目已有规范化后的同一问题                        | 创建或编辑标准问题/相似问法          | 服务端拒绝重复；停用条目仍参与判重                                   |
| AC-A04 | 请求来自错误 tenant、organization、knowledgebase 或没有对应权限     | 调用 FAQ API                         | 不泄露条目是否存在，并按现有权限约定拒绝请求                         |
| AC-A05 | 目标知识库为 Standard 或 External                                   | 调用 FAQ API                         | 返回明确类型错误，不创建托管文档或 chunk                             |
| AC-A06 | 客户端持有过期 version                                              | 更新或删除 FAQ                       | 返回冲突，数据库和向量数据均保持较新版本                             |
| AC-A07 | 知识库中有多条启用/停用 FAQ                                         | 按搜索词、状态、skip/take 查询       | total、分页顺序和 items 只包含当前 scope 且结果稳定                  |
| AC-A08 | 反例为空、超过 10 条、单条超过 500 字、内部重复或与本条正向问题重复 | 创建或编辑 FAQ                       | 服务端按共享约束拒绝无效输入，不写入 canonical chunk 或向量          |
| AC-A09 | 上传 WeKnora JSON/CSV/TSV/XLSX/XLS 文件                             | 预览或导入                           | 字段正确映射，预览不写数据；非法行显示行级错误，单次最多 1000 条     |
| AC-A10 | 当前库已有 FAQ，替换导入的新集合在暂存或切换阶段失败                | 执行替换导入                         | 不报告部分成功；清理新暂存记录并恢复旧 canonical 与向量集合          |
| AC-A11 | FAQ 文本以 `= + - @` 开头                                           | 导出 CSV 后再导入                    | 表格打开时不执行公式，重新导入仍恢复原 FAQ 文本                      |

### 投影、向量生命周期与一致性

| ID     | Given                                                      | When                                  | Then                                                                                        |
| ------ | ---------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| AC-I01 | `question_only + combined`                                 | 创建含标准问题和相似问法的 FAQ        | 只有一个派生向量，文本含全部问题且不含回答                                                  |
| AC-I02 | `question_answer + combined`                               | 创建同一 FAQ                          | 只有一个派生向量，文本包含全部问题和回答                                                    |
| AC-I03 | `question_only + separate`                                 | 创建含 N 条相似问法的 FAQ             | 产生 `N + 1` 个派生向量，每个只含一个问题且不含回答                                         |
| AC-I04 | `question_answer + separate`，含 N 条相似问法和 M 个回答块 | 创建 FAQ                              | 产生 `N + 1 + M` 个派生向量：每个问题一个、每个回答块一个；回答不会随每个问题重复向量化     |
| AC-I05 | 同一 FAQ 的多个派生向量同时命中                            | Vector Retriever 输出候选并进入 RRF   | 在 Vector 来源内先按 canonical `chunkId` 保留最佳候选，再参与跨来源融合；最终只返回一个 FAQ |
| AC-I06 | `separate` 模式下多个 FAQ 都有大量相似问法或物理拆段       | 请求 top K 个候选                     | 从逻辑向量上限起步自适应扩容，去重后尽量返回 K 个不同 FAQ；后端结果耗尽时停止，不做无界查询 |
| AC-I07 | 已存在旧标准问、相似问和回答                               | 编辑 FAQ 成功                         | 新投影全部可检索，所有旧派生向量均删除，Keyword 不再命中旧文本                              |
| AC-I08 | FAQ 已启用                                                 | 停用后分别执行 Vector 和 Keyword 检索 | 两路均不返回该 FAQ；重新启用后按原配置恢复                                                  |
| AC-I09 | FAQ 存在 canonical chunk 和多个派生向量                    | 删除 FAQ 或整个知识库                 | 关系数据及全部派生向量均被清理，无 orphan vector                                            |
| AC-I10 | 任一步骤发生 Vector Store 写入、删除或数据库提交失败       | 执行创建、编辑、启停或删除            | API 不报告成功；补偿后旧可用版本保持一致，或条目保持不可检索的明确失败状态，不出现半成品    |
| AC-I11 | FAQ 含 N 条反例                                            | 任一索引配置下创建或更新 FAQ          | 逻辑向量数量和搜索投影与不含反例时相同；任何索引文本都不包含反例                            |
| AC-I12 | 已有 FAQ 含反例且知识库切换 embedding 模型                 | 后台重建 pending 向量集合             | 使用 pending 模型 context 拆段，完整保留反例与其他 canonical metadata，成功后再切换集合     |
| AC-I13 | 主操作失败且任一补偿步骤再次失败                           | 创建、编辑、删除或替换导入            | API 返回独立恢复失败错误并记录失败阶段；不得吞掉补偿错误后伪装成普通业务失败                |

### 检索结果与引用

| ID     | Given                                                 | When                                            | Then                                                                                                   |
| ------ | ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AC-R01 | FAQ 为 `question_only`，回答中的独有词未出现在问题中  | 用该独有词检索                                  | Vector 和 Keyword 均不能仅因回答命中                                                                   |
| AC-R02 | FAQ 为 `question_answer`，回答中有独有词              | 用该独有词检索                                  | Keyword 可命中；语义相关查询可由 Vector 命中                                                           |
| AC-R03 | 任一索引模式下 FAQ 被召回                             | 完成融合、阈值和 rerank 后生成最终 `Document[]` | `pageContent` 包含标准问题和回答，Agent 不需要读取私有 metadata 才能回答                               |
| AC-R04 | FAQ 使用默认 recall 配置                              | 执行检索                                        | Vector 和 Keyword 执行，Graph Retriever 不执行，diagnostics 正确记录实际来源                           |
| AC-R05 | FAQ 与 Standard 同时被某次请求检索                    | 合并候选并 rerank                               | 对外仍为现有 `Document[]`/retrieval tool output，Standard 的排序、metadata 和内容不被 FAQ 补全逻辑改写 |
| AC-R06 | FAQ 结果生成引用                                      | 用户打开引用                                    | 进入对应知识库的 FAQ 页面并定位 `faqId`；普通 chunk 仍使用原 `xpert://knowledgebase/chunk` 路径        |
| AC-R07 | 某 FAQ 已被候选召回且查询规范化后与其任一反例完全一致 | 完成当前知识库的候选检索                        | 从最终结果中排除该 FAQ；非 FAQ 文档和其他 FAQ 不受影响                                                 |

### 管理页面

| ID     | Given                              | When                               | Then                                                                    |
| ------ | ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| AC-M01 | FAQ 知识库无条目、加载中或加载失败 | 进入 FAQ 页面                      | 分别显示 empty、loading 和可重试错误状态                                |
| AC-M02 | FAQ 知识库已有条目                 | 搜索、筛选、翻页或刷新             | 列表状态与 API total/items 一致，URL 定位参数不会丢失                   |
| AC-M03 | 用户新增或编辑 FAQ                 | 前端校验失败、服务端判重或保存成功 | 错误显示在可操作位置；成功后关闭编辑器并刷新到确定状态                  |
| AC-M04 | 用户删除或启停 FAQ                 | 操作进行中或失败                   | 防止重复提交，失败恢复原状态，成功结果与后端检索状态一致                |
| AC-M05 | 用户新增、编辑或查看含反例的 FAQ   | 操作反例列表                       | 可增删并显示字数，最多 10 条且每条最多 500 字；保存后详情和列表数量正确 |
| AC-M06 | 用户重处理一条或多条 FAQ           | 后端状态仍为 rebuilding            | 页面每 3 秒刷新并持续显示重建中；状态进入 ready 或 failed 后停止轮询    |
| AC-M07 | URL 中的 `faqId` 已删除或无权访问  | FAQ 列表已成功加载                 | 仅提示无法定位该 FAQ，列表继续可用且不进入全页错误状态                  |

## 验证命令与交付门槛

### 可观察行为 seam

- 创建配置：`CreateKBDto -> KnowledgebaseService.create -> Knowledgebase entity -> public/detail DTO`。
- FAQ 业务：FAQ Controller/Service 的 HTTP 输入输出，以及 canonical chunk 和托管文档的持久化状态。
- 向量：`KnowledgeDocumentStore.addKnowledgeChunks(..., { ids })`、`deleteChunks(ids)` 与各 Vector Store adapter 的真实读写结果。
- Keyword：PostgreSQL `knowledge_document_chunk.pageContent` 的真实 FTS/trigram 查询与索引执行计划。
- 融合：Vector 来源内 canonical 去重，再由 `KnowledgeSearchQueryHandler` 和 `WeightedRrfFusion` 完成跨来源融合。
- 最终输出：`Document[]`、retrieval tool output、citation URL 和 Cloud 路由定位。

### 自动化验证要求

- Contracts/DTO 单元测试覆盖 AC-C01 至 AC-C05 的所有合法和非法配置。
- Service/controller 测试覆盖权限、scope、并发托管文档、重复规则、version 冲突和失败补偿。
- Projection 采用表驱动测试，四种配置组合逐项断言向量数量、向量文本、Keyword 投影和最终回答内容。
- Vector Store contract 测试至少覆盖当前支持的 PGVector 与 Milvus：显式 logical vector ID、collection scope、canonical `chunkId` 恢复、批量删除。
- PostgreSQL integration test 使用真实索引验证 `question_only/question_answer` 的 Keyword 命中差异，并对代表性数据量执行 `EXPLAIN ANALYZE`，禁止退化为无界全表扫描。
- Retriever/Fusion 测试覆盖同一 FAQ 多个派生向量命中、来源内折叠、top K 多样性、Graph 跳过和 diagnostics。
- Angular 测试应操作组件状态并断言可见菜单、disabled 状态和提交 payload；不能只用字符串搜索模板作为最终验收。
- Citation/route 测试覆盖 FAQ deep link、刷新后定位和旧 chunk link 兼容。

实现阶段优先执行目标 package 的 focused tests，再执行相关 typecheck/build：

```bash
corepack pnpm exec nx test contracts --runInBand
corepack pnpm exec nx test server-ai --runInBand
corepack pnpm exec nx test cloud --runInBand
corepack pnpm exec nx build server-ai
corepack pnpm exec nx build cloud
git diff --check
```

实际 target 名称应在实现时通过当前 `project.json`/Nx graph 核实，不机械照抄。若仓库已有更窄的测试入口，优先使用 focused runner。

### 2026-09-04 当前验证结果

- Server FAQ/检索/引用 focused：9 个测试文件、84 个测试通过，覆盖投影/边界校验/向量拆段 UUID/CRUD 与可观察补偿/两阶段替换导入及单调版本恢复/WeKnora 传输/Controller/citation/retrieval mode/自适应 candidate 扩容/canonical 去重。
- Cloud FAQ/检索设置/路由与引用 focused：13 个测试文件、166 个测试通过，覆盖 client service、表单边界、编辑器、导入弹窗、管理页重建轮询与失效深链、类型化路由、创建配置、citation、Assistant 与 Claw 跳转。
- Contracts FAQ recall focused：1 个测试文件、3 个测试通过。
- `corepack pnpm nx build server-ai`：通过；构建生成的非本任务 remote-component bundle 已恢复为构建前内容。
- `corepack pnpm nx build cloud --configuration=development`：通过。
- 本次修复涉及文件的 ESLint：0 error、11 个既有 warning；`git diff --check` 及前后端 i18n JSON 解析：通过。
- `knowledgebase.service.spec.ts` 尚未执行到断言：测试模块加载时被仓库当前 `_BaseToolset` 为 `undefined` 的既有依赖问题阻断；FAQ create/default/immutable 代码仍已通过服务端类型检查，但该套 Service 回归必须在基线修复后补跑。
- 现有完整 `new.component.spec.ts` 会被 `@milkdown/crepe` 内部 `lodash-es` 的 Jest ESM 解析问题阻断；当前用创建配置静态契约测试覆盖菜单/payload，真实交互留给浏览器验收。
- 未主动打开浏览器，也未启动、停止或替换用户的本地 API 进程。

自动化通过后，由用户手动完成浏览器验收：分别检查新建 FAQ、已有 FAQ 设置、四种索引配置、反例精确排除、导入预览与替换、批量操作、重建状态、列表 CRUD、停用/启用、检索和引用跳转。本实现流程不主动打开浏览器。

## 发布与运维检查

- 确认目标 PostgreSQL 已安装 `pg_trgm`，并存在当前 Keyword 所需 FTS/trigram 索引。
- 确认数据库 schema 同步后索引没有被移除。
- 先在测试环境创建 FAQ，验证创建、编辑、停用、删除、检索和引用。
- 观察 FAQ CRUD 错误率、Vector 写入错误与 Keyword 索引健康状态。
- FAQ 是新增 enum 值；任何按知识库类型做 exhaustive switch 的位置都必须在发布前审计。
- 不需要跨仓库 SDK 发布，因为公共搜索结果协议不变；若后续把 FAQ 管理 API 暴露到 SDK，再独立版本化。

## 已确认的产品决策

当前已确认：

1. V1 回答由 1～5 个 Markdown/plain-text 文本块组成，全部返回给 Agent；不支持图片附件或回答选择策略。
2. 停用条目仍参与重复校验，避免重新启用时产生冲突。
3. FAQ 知识库创建后不能转换成 Standard，Standard 也不能转换成 FAQ。
4. V1 不做“精确命中后绕过 Agent 直接回答”。
5. 新建 FAQ 可选择 `question_only/question_answer` 和 `combined/separate`；默认 `question_only + separate`，创建后只读。
6. FAQ 创建与设置只显示五个菜单，不复用普通文档知识库的通用索引策略；检索设置只开放 Vector、Keyword、Hybrid，Graph 及图检索参数保持隐藏。
7. V1 向量存储使用系统默认值，页面只读；暂不支持知识库级选择或迁移。
8. 标准问题最多 500 字符；相似问法和反例各最多 10 条、每条最多 500 字符；回答最多 5 条、合计最多 10,000 字符，均按 Unicode code points 计数。
9. `question_answer + separate` 下，每个问题和每个回答块分别生成一次向量，避免把同一回答重复附加到每个问题向量。
10. 反例不参与索引；查询与反例按同一规范化规则完全一致时排除该 FAQ。反例内部不得重复，也不得与本条 FAQ 的正向问题重复。
11. 反例匹配方式 V1 固定为精确排除；语义排除只保留 disabled 配置入口，未实现前不得写入运行配置。
12. FAQ 导入兼容 WeKnora JSON/CSV/TSV/XLSX/XLS；导出支持 CSV/JSON。替换导入必须先暂存完整新集合，失败时保留或恢复旧集合。

## Phase 2 决策落地状态与发布前验证

以下决策已经在实现和 focused 测试中固化。表中仍标记的集成或浏览器项属于发布前验证，不再阻塞当前代码实现。

| 决策              | 主要 owner          | 当前状态                                                        | 发布前剩余验证                     |
| ----------------- | ------------------- | --------------------------------------------------------------- | ---------------------------------- |
| D1 向量身份       | Server/Vector Store | 已固定为 deterministic UUID v5，并覆盖 embedding 拆段           | PGVector/Milvus 真实 adapter 验证  |
| D2 搜索与结果投影 | Retrieval           | 已实现 Keyword/Vector 搜索投影与最终结果 materializer           | PostgreSQL FTS integration test    |
| D3 多向量 top K   | Retrieval           | 已从最大逻辑向量数起步自适应扩容并做 canonical 最佳命中去重     | 代表性数据量下的召回质量和成本验证 |
| D4 跨存储一致性   | Server/Vector Store | 已实现创建清理、更新/删除恢复、替换导入两阶段切换及恢复失败上报 | 外部存储恢复失败时的运维修复演练   |
| D5 输入上限       | Product + Contracts | 已确认并写入共享常量、服务端校验和 Cloud 校验                   | 浏览器边界提示验收                 |
| D6 路由与引用     | Cloud + Citation    | 已实现类型化默认路由、全部创建入口与 FAQ citation               | 浏览器刷新后定位验收               |

### D1：canonical FAQ ID 与派生 vector ID

当前约束：

- `KnowledgeDocumentStore` 默认从 logical chunk ID 生成 collection-scoped physical vector ID，同时已经支持 `addKnowledgeChunks(..., { ids })` 和 `deleteChunks(ids)`。
- Vector Retriever、Weighted RRF 和 citation 都优先使用 `metadata.chunkId` 作为逻辑内容身份。
- `separate` 要求一条 FAQ 写入多个物理向量，但关系库仍只有一个 canonical chunk。

已实现：

- `faqId = canonical chunk ID`，所有派生向量的 `metadata.chunkId` 仍写该 `faqId`。
- 为派生向量增加显式 metadata：`contentKind: 'faq'`、`faqVectorKey`、`faqQuestionKind`，不得从 `pageContent` 猜测。
- logical vector ID 使用固定 namespace 的 UUID v5，从 `faqId + slotKey` 确定性生成；`slotKey` 分为 `combined`、`question:<index>` 和 `answer:<index>`。
- 现有 collection scope 可再从 logical vector ID 生成最终 physical ID，不改变 canonical FAQ 身份。
- embedding 输入超限拆段时，再从该 logical vector ID 和拆段序号生成确定性 UUID，避免 PGVector UUID 主键不兼容。
- 更新时删除旧、新 ID 的并集后完整重写新投影；问题或回答重排会复用对应序号的 ID，数量变化会增删尾部 ID。删除和停用必须覆盖全部派生 ID。

当前产物：无 I/O 的 UUID v5 identity 函数、投影表驱动测试和 embedding 拆段 UUID 测试，证明 ID 稳定且不同 FAQ/slot/拆段不碰撞。

### D2：Keyword 搜索投影与 Agent 最终内容

当前约束：

- 现有向量链路认识 `metadata.searchContent`，但 Keyword SQL 和现有 FTS/trigram 索引仍直接使用 `knowledge_document_chunk.pageContent`。
- `question_only` 必须保证回答不会被 Vector 或 Keyword 用于匹配，同时命中后 Agent 又必须拿到回答。
- Retriever/Fusion 应保持通用，不应理解 FAQ 文本格式。

已实现：

- canonical chunk 的 `pageContent` 保存当前 `indexMode` 对应的搜索投影；结构化问题和回答保存在显式 FAQ metadata 中。
- `separate` 的临时向量文档使用各自的搜索投影，但都携带相同 canonical `chunkId` 和完整 FAQ metadata。
- 在融合、阈值和 rerank 完成后、生成 citation/tool output 之前，统一执行 `FAQResultMaterializer`，用结构化 metadata 生成包含标准问题和回答的最终 `Document.pageContent`。
- V1 不改 Keyword SQL 与生产索引表达式；若后续统一让 Keyword 使用 `searchContent`，必须另做索引迁移和 Standard/Spreadsheet 行为回归。

当前产物：FAQ projection/result 纯函数和四种模式的表驱动测试；“回答不参与 question-only 匹配但最终结果含回答”的真实 PostgreSQL integration test 仍是发布门槛。

### D3：同一 FAQ 多向量命中与 top K 多样性

当前约束：

- 现有 Vector Retriever 会按 `metadata.chunkId` 回查 canonical chunk，Weighted RRF 也只计算同一来源中的最佳 rank。
- 但 Vector Store 的 top K 发生在 canonical 去重之前；同一 FAQ 的多个相似问法可能占满候选窗口，挤掉其他 FAQ。
- 当前 `chunkMap.set()` 还需确保重复命中时保留最佳 score，而不是被后出现的较差结果覆盖。

已实现：

- FAQ Vector Retriever 以 `请求 top K × 最大逻辑向量数` 作为首轮 `candidateK`，按 canonical `chunkId` 保留最佳 rank/score 后再截断到请求 top K。
- 若首轮窗口已填满但 canonical FAQ 仍不足，则将 `candidateK` 倍增重查；得到足够 canonical FAQ 或后端返回数小于窗口、表明结果耗尽时停止。这样兼容 embedding context 造成的额外物理拆段，又不会因固定 16 倍窗口漏掉后续 FAQ。
- 不改变 Standard/External 的现有 top K 计算和排序。

当前产物：最大相似问法/回答数量、自适应 candidate 扩容，以及“一个 FAQ 的逻辑向量继续物理拆段并占满首轮窗口”时仍可召回后续 canonical FAQ 的回归测试。

### D4：数据库与 Vector Store 的失败一致性

当前约束：

- 数据库事务不能原子提交外部 Vector Store。
- 一次 FAQ 更新可能同时删除旧向量并增加多个新向量，简单的“先删再加”会在失败时损坏旧可用版本。
- V1 不引入新的消息队列或 outbox，但不能把半成品报告为成功。

已实现：

- FAQ Service 是唯一 mutation owner，在知识库粒度锁内完成重复校验和 version 检查。
- 创建先写不可检索的 canonical chunk，再写全部向量，全部成功后激活；失败时补偿删除 chunk 与已写向量。
- 更新期间保留旧 canonical 内容和旧投影快照；先删除旧、新 ID 并集，再写入新向量，最后以 version 乐观锁提交 canonical chunk。任一步失败都删除新 ID 并用旧快照重建旧向量。
- 替换导入先完整校验文件，再以 disabled/pending 状态暂存全部新记录及向量；只有暂存全部成功后才切换集合。切换失败时清理新记录并按原 ID 恢复已删除的旧记录。
- 停用和删除采用幂等清理；重试同一请求不会增加重复向量。补偿步骤用 `Promise.allSettled` 汇总，任一恢复动作失败都会记录阶段与原因并返回独立恢复失败错误，不能被原始业务错误掩盖。
- embedding 重建从 canonical metadata 构造写入，保留反例，并使用 pending embedding 模型的真实 context size 拆段；普通 CRUD 使用 active 模型 context。

当前状态流：

```text
ready(old)
  -> delete old/new vector id union
  -> insert new vectors
  -> canonical chunk commit
  -> ready(new)

任一步失败
  -> compensate from old snapshot
  -> delete new vectors + restore old vectors
  -> ready(old)
```

当前产物：`vectorSyncStatus` 契约、创建/更新/删除/替换导入失败注入测试、恢复失败独立错误，以及 embedding 重建 metadata/context 回归测试。尚无 outbox/repair worker；发生恢复失败后仍需要通过日志定位并由运维重建，这是 V1 的剩余风险。

### D5：FAQ 输入上限

当前约束：`separate` 会把相似问法数量直接放大为向量数量和检索候选量，因此只做非空校验不足以控制成本。

已确认并写入共享契约：

- 标准问题：1～500 个 Unicode code points。
- 相似问法：最多 10 条，每条 1～500 个 code points。
- 反例：最多 10 条，每条 1～500 个 code points；不计入逻辑向量数量。
- 回答：1～5 个回答块，合计 1～10,000 个 code points。
- 规范化后为空或重复的相似问法/反例返回字段级错误，不静默丢弃；反例与本条正向问题冲突时同样拒绝。

当前产物：共享常量、create/update DTO、服务端二次校验、Cloud 字数/条数提示和边界测试。前后端复用同一组上限常量。

### D6：详情默认路由与 FAQ 引用

当前约束：知识库详情当前静态重定向到 `documents`，创建弹窗只返回 knowledgebase，由各调用方负责导航；现有 citation URL 固定为 `xpert://knowledgebase/chunk`。

已实现：

- 新增 `/xpert/knowledges/:knowledgebaseId/faq`，创建 FAQ 成功后所有入口都直接导航到该路由。
- 直接访问 `/xpert/knowledges/:knowledgebaseId` 时，在知识库类型加载完成后执行类型化默认导航：FAQ 到 `faq`，Standard 保持 `documents`，External 保持现状。
- FAQ 引用使用 `xpert://knowledgebase/faq?knowledgebaseId=...&faqId=...`；解析后进入 FAQ 路由并通过 query param 定位条目。
- 旧 `xpert://knowledgebase/chunk` 的解析与跳转保持不变。

当前产物：路由表、全部创建入口、citation parse/build 测试和 FAQ 页面按 query param 定位逻辑；刷新后的浏览器定位仍待人工验收。

## 风险与未决问题

- D4 仍是 Phase 2 最大运行风险。代码已让替换导入先暂存后切换，并让补偿失败可观察且返回独立错误；仍需在真实 PGVector/Milvus 上验证多 ID upsert/delete 的幂等恢复，并制定恢复失败后的运维重建流程。
- D3 已兼容 embedding 物理拆段超过逻辑向量上限，但极端同一 FAQ 大量拆段时会增加 Vector Store 查询次数；需要在代表性长文本和真实 adapter 上验证延迟。反例不生成向量，不扩大 candidate K。
- D2 的推荐方案保持现有 Keyword 索引不变，但引入结果 materializer；其执行位置必须保证 rerank 使用搜索投影、citation/Agent 使用完整回答。
- D6 涉及多个创建入口和自定义 citation scheme，漏改任一入口都会让 FAQ 落到空的 documents 页。
- 若未来增加直接回答、回答选择策略或语义型反例，应另建决策文档，再决定是否引入 `FaqExactRetriever`，不能把这些策略塞进当前通用 Fusion。
