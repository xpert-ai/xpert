# 知识库 Retriever 与 Fusion 第一阶段重构方案

## Summary

- 先把内置知识库当前的 Vector 与 GraphRAG 检索分支抽成两个内部 Retriever adapter。
- 把 Hybrid 模式已有的去重、加权和排序逻辑抽成纯计算的 `LegacyWeightedFusion`。
- 本阶段只调整 `xpert-develop` 的 `server-ai` 内部实现，不修改公共配置、数据库、Cloud UI、Plugin SDK、外部知识库协议或最终 `Document[]` 输出。
- 第一阶段不实现 Keyword 或 RRF；Phase 2 已实现纯计算的 N 路 Weighted RRF，但尚未接入 Handler。Keyword Retriever 仍留待后续阶段实现。

## Problem

当前 `KnowledgeSearchQueryHandler` 同时负责：

- 加载知识库与区分内置/外部知识库。
- 准备 Knowledge Filter V2。
- 选择 Vector、Graph 或 Hybrid 分支。
- 执行 Vector 检索、编译后端过滤条件、回填 chunk 与 parent/child 数据。
- 执行 GraphRAG 检索及 Hybrid 降级。
- Hybrid 去重、线性加权、排序和 rerank。
- score threshold、跨知识库排序、日志和失败诊断。

Vector、Graph 和融合算法缺少可替换 seam。直接在 handler 中加入 Keyword 会继续扩大条件分支，并迫使 BM25/全文分数与 Vector/Graph 分数进入同一段硬编码逻辑。

## Scope

### In Scope

- 新增 server-internal `KnowledgeCandidateRetriever` interface。
- 新增 `VectorKnowledgeCandidateRetriever` 与 `GraphKnowledgeCandidateRetriever` adapter。
- 新增 server-internal `KnowledgeCandidateFusion` interface。
- 新增 `LegacyWeightedFusion` adapter，逐项复刻当前 Hybrid 算法。
- `KnowledgeSearchQueryHandler` 保留 application orchestration，并通过上述 adapter 执行当前三种 mode。
- 补充 characterization tests，锁定重构前后的结果、顺序、分数、fallback、rerank、threshold 和 diagnostics。

### Out Of Scope

- Keyword 索引、Keyword Retriever 与检索质量调优。
- RRF 算法与新的 retrieval 配置。
- 修复现有 Hybrid 双 rerank、score threshold 分数域或跨知识库排序语义。
- 修改 `TKBRetrievalSettings`、`GraphRagConfig`、数据库字段或 Cloud UI。
- 修改 `@xpert-ai/plugin-sdk` 的旧 `IRetrieverStrategy`。
- 修改 xpert-plugins、xpert-sdk-js、chatkit-js、xpert-pro 或 installer。
- 外部知识库参与内置 Retriever/Fusion。

## Target Structure

```text
KnowledgeSearchQueryHandler
  ├─ load knowledgebases / keep external branch unchanged
  ├─ prepare Knowledge Filter V2 once per internal knowledgebase
  ├─ resolve legacy mode
  ├─ VectorKnowledgeCandidateRetriever
  ├─ GraphKnowledgeCandidateRetriever
  ├─ LegacyWeightedFusion
  ├─ preserve legacy hybrid rerank
  └─ threshold / log / cross-KB sort / global topK
```

Retriever 和 Fusion 是 handler 的内部 seam，不是新的公共插件扩展点。

## Internal Interfaces

### Retriever

```ts
type KnowledgeRetrieverSource = 'vector' | 'graph' | 'keyword'

type KnowledgeRetrievalRequest = {
  knowledgebase: IKnowledgebase
  query: string
  k?: number
  retrieval?: TKBRetrievalSettings
  scope: {
    tenantId: string
    organizationId: string
  }
  modelContext: {
    xpertId?: string
    threadId?: string
  }
  preparedFilter: PreparedKnowledgeFilter
}

type KnowledgeRetrievalBatch = {
  source: KnowledgeRetrieverSource
  candidates: Array<{
    document: DocumentInterface<DocumentMetadata>
    rank: number
  }>
  diagnostics: KnowledgeFilterDiagnostics
  failed?: boolean
  error?: string
}

interface KnowledgeCandidateRetriever {
  readonly source: KnowledgeRetrieverSource
  retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalBatch>
}
```

`keyword` 当前只是为三路融合测试和后续 Keyword Retriever 预留的显式 source，还没有对应生产实现。

`KnowledgeRetrievalRequest` 使用一个已准备好的 filter。各 Retriever 只能把 effective filter 编译成自己的查询，不能重新合并或放宽 filter。

### Fusion

```ts
interface KnowledgeCandidateFusion<TOptions> {
  fuse(batches: readonly KnowledgeRetrievalBatch[], options: TOptions): DocumentInterface<DocumentMetadata>[]
}
```

Fusion 必须是纯计算：不访问数据库、不调用模型、不写日志、不处理 fallback，也不应用最终 threshold 或 topK。

## Ownership

### KnowledgeSearchQueryHandler

- 知识库和 scope 加载。
- external/internal 分流。
- filter preparation。
- mode 与 graphWeight 解析。
- Retriever 执行顺序和 required/optional 失败策略。
- Hybrid 融合后的旧 rerank 行为。
- score threshold、最终 diagnostics、日志、跨知识库排序与 global topK。

### VectorKnowledgeCandidateRetriever

- 获取当前 active vector store。
- 编译 PGVector/Milvus filter。
- 执行 Vector search。
- 把 distance 转换为当前 `score = 1 - distance`。
- 回填关系库 chunk、document 与 parent/child 结构。
- 暂时保留 Vector 分支现有的 branch-local rerank，保证行为不变。

### GraphKnowledgeCandidateRetriever

- 构造并执行现有 `KnowledgeGraphSearchQuery`。
- 根据公共 scope 和 prepared filter 编译 Graph filter scope。
- 原样返回 Graph 文档、诊断、失败状态和错误信息。
- 不决定 graph-only 的硬失败或 Hybrid 的软降级；该策略仍属于 handler。

### LegacyWeightedFusion

- 按 `metadata.chunkId -> doc.id -> pageContent` 解析旧去重 key。
- Vector 先写入、Graph 后写入，保持现有 metadata 覆盖顺序。
- 分别解析旧 `vectorScore` 与 `graphScore`。
- clamp graph weight 到 `[0, 1]`。
- 缺失分支分数按 `0` 处理，不按实际命中分支重新归一化。
- 写回当前 `vectorScore`、`graphScore`、`score` 与 `relevanceScore`，并按融合分降序排序。

## Compatibility Invariants

重构前后必须保持：

1. mode 优先级仍是 request retrieval mode、KB graphRag mode、默认 vector。
2. Vector 与 Graph 在 Hybrid 中仍按先 Vector、后 Graph 的顺序执行。
3. graph-only 失败仍使请求失败；Hybrid Graph 失败仍只退回已过滤的 Vector 结果。
4. Graph 成功但无结果不是失败；Hybrid 仍按原 graphWeight 衰减 Vector 分数。
5. Dynamic filter 非法时仍允许 dynamic fallback；fixed/request filter 非法仍失败。
6. Vector 和 Graph 使用同一份 prepared effective filter 与 tenant/organization/knowledgebase scope。
7. Vector distance、parent/child 回填、disabled document/chunk 过滤和 token metadata 保持不变。
8. Hybrid 去重 key、metadata 覆盖顺序、默认 graphWeight `0.35` 和 clamp 行为保持不变。
9. 配置 rerank model 时，Vector-only 仍 rerank 一次，Graph-only 仍不 rerank，Hybrid 仍保留现有两次 rerank。
10. score threshold 仍比较 `metadata.score`，不改为 `relevanceScore`。
11. 每 KB hit count、retryableWithoutDynamic、日志字段和错误码保持不变。
12. 外部知识库、跨知识库排序、global topK 和调用方看到的 `Document[]` 形状保持不变。

这些规则只用于保证第一阶段是结构重构，不代表所有旧行为都是后续推荐语义。

## Files

- `packages/server-ai/src/knowledgebase/retrieval/types.ts`
- `packages/server-ai/src/knowledgebase/retrieval/document.ts`
- `packages/server-ai/src/knowledgebase/retrieval/vector-knowledge-candidate.retriever.ts`
- `packages/server-ai/src/knowledgebase/retrieval/graph-knowledge-candidate.retriever.ts`
- `packages/server-ai/src/knowledgebase/retrieval/legacy-weighted.fusion.ts`
- `packages/server-ai/src/knowledgebase/retrieval/weighted-rrf.fusion.ts`
- `packages/server-ai/src/knowledgebase/retrieval/index.ts`
- `packages/server-ai/src/knowledgebase/queries/handlers/knowledge-search.handler.ts`
- `packages/server-ai/src/knowledgebase/queries/handlers/knowledge-search.handler.spec.ts`
- Retriever/Fusion 对应的 focused spec 文件。
- `packages/server-ai/src/knowledgebase/knowledgebase.module.ts`

## Test Plan

### Handler Characterization

- vector、graph、hybrid 路由与 Hybrid 调用顺序。
- request mode 覆盖 KB mode。
- graph disabled、empty、failed 的不同语义。
- Hybrid Graph 失败只退回 filtered Vector。
- Vector-only 一次 rerank、Graph-only 零次、Hybrid 两次 rerank。
- threshold 使用 `metadata.score`，即使存在更高的 `relevanceScore`。
- diagnostics、日志失败不阻断、跨 KB global topK 保持不变。

### LegacyWeightedFusion

- overlap/non-overlap 去重。
- graphWeight 默认值、边界和 clamp。
- 缺失分支记零且不重新归一化。
- `chunkId/doc.id/pageContent` key fallback。
- Graph metadata 覆盖 Vector metadata。
- 稳定输出顺序与分数字段。

### Vector Retriever

- model billing context 继续传给 active vector store。
- PGVector/Milvus filter 编译路径。
- distance 转 score。
- leaf 与 parent/child 回填。
- disabled document/chunk 过滤。
- branch-local rerank 与 diagnostics。

## Validation

- Focused handler、Retriever 和 Fusion Jest suites。
- `server-ai` typecheck。
- `git diff --check`。
- 本阶段不进行浏览器验证，因为没有 UI 或公共行为变更。

## Next Phase

后续按“先稳定融合算法，再增加新召回来源，最后接入生产”的顺序推进。不要同时实现 Keyword 和 RRF，否则结果异常时无法判断是召回问题还是融合问题。

### Gate 0：完成第一阶段真实冒烟

- 在同一测试知识库、相同 query、`k`、score threshold、filter 和 retrieval mode 下，对比重构前后的结果。
- 分别覆盖 Vector、Graph、Hybrid，以及 Graph empty、Graph failed、rerank 和 fixed/request filter。
- 对比 `chunkId`、顺序、`score`、`relevanceScore`、branch hit count 和 fallback reason。
- 自动化成功只证明代码路径可执行；真实冒烟需要确认结果与旧版本一致，不在本阶段评价召回质量是否足够好。

### Phase 2：已实现 Weighted RRF（未接入生产）

目标：提供一个纯计算、支持 N 路候选列表的 `WeightedRrfFusion`，但不切换当前生产路径。

实现约束：

- 实现现有 `KnowledgeCandidateFusion` interface，不访问数据库、模型、配置服务或日志。
- 使用各 Retriever 返回结果的名次计算融合分，不直接比较 Vector、Graph 或未来 Keyword 的原始分数。
- 每条 candidate 显式携带 1-based `rank`；Fusion 不从 candidate 数组位置推断名次。
- 使用 1-based rank，计算形式为 `sum(weight[source] / (rankConstant + rank))`。
- 支持每个 source 的非负权重和内部 `rankConstant`；公共默认值与产品配置推迟到接入阶段确定。
- 继续使用 `metadata.chunkId -> doc.id -> pageContent` 去重，并明确重复文档的 metadata 合并规则。
- 输出稳定、确定的全量排序；最终 score threshold、rerank 和 topK 仍由 Handler 负责。
- 不修改 `TKBRetrievalSettings`、数据库、Cloud UI，也不替换 `LegacyWeightedFusion`。
- 任一输入 batch 标记 `failed: true` 时立即报错；调用方必须在进入 Fusion 前完成可选分支的 fallback。

纯单测必须覆盖：

- 两路和三路候选的 overlap/non-overlap 去重。
- 调整 source weight 后排序发生预期变化。
- 某一路为空、所有路为空，以及同分时的稳定顺序。
- 原始分数尺度完全不同时，结果仍只由 rank 和 weight 决定。
- candidate 数组顺序与显式 rank 不一致时，结果仍由显式 rank 决定；非法 rank 和 failed batch 必须报错。
- 输入 batch 和 document metadata 不被原地修改。
- Handler 仍默认调用 `LegacyWeightedFusion`，证明新增 RRF 不改变生产行为。

完成标准：`WeightedRrfFusion` 的固定候选单测通过，当前 Handler/Legacy Fusion 回归测试继续通过，生产配置中没有启用入口。

### Phase 3：再实现 Keyword Retriever

目标：增加独立的 `KeywordKnowledgeCandidateRetriever` 和全文索引生命周期，先单独证明关键词召回有效，不立即参与生产融合。

实现约束：

- 明确全文索引的创建、文档新增/更新/删除、chunk 重建和知识库重建生命周期。
- Keyword 与 Vector/Graph 使用同一 tenant、organization、knowledgebase、prepared filter 和 disabled document/chunk 约束。
- 返回按关键词相关度排序的 `KnowledgeRetrievalBatch`；原始全文分仅用于分支诊断，不接入 `LegacyWeightedFusion`。
- 单独验证中文关键词、英文标识符、精确编号、FAQ 问句和 Wiki 标题/正文等场景。
- 记录索引延迟、候选数量、命中数量和失败原因，便于区分“没有索引”“没有匹配”和“检索执行失败”。

完成标准：Keyword 单路召回测试和真实知识库质量样例通过，但默认 Vector/Graph/Hybrid 行为仍不改变。

### Phase 4：通过 RRF 接入并开放配置

- 将 Vector、Graph、Keyword 的候选列表交给 `WeightedRrfFusion`，不混合三种原始分数。
- 新模式先显式 opt-in；旧配置继续走 `LegacyWeightedFusion`。
- 定义每个 Retriever 的 required/optional 和失败降级策略，并补充诊断字段。
- 此阶段才修改公共 retrieval contract、持久化配置和 Cloud UI。
- 对比 Legacy 与 RRF 的离线样例、真实查询和延迟，再决定默认模式与权重。

最终顺序：

1. 第一阶段真实冒烟。
2. 纯 `WeightedRrfFusion` 与固定候选测试。
3. Keyword Retriever 与全文索引生命周期。
4. Keyword 通过 RRF 接入。
5. Keyword + RRF 一起开放产品配置，Legacy 继续作为兼容默认值。
