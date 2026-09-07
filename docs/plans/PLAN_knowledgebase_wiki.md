# 知识库 Wiki 功能实施方案

## 文档状态

- 状态：第 1–6 项已完成，发布环境验收与 typed 202 删除 saga 待完成。
- 基线：`develop@c44c964d974ae58f9e921a15d979da71333f171c`。
- 最后更新：2026-09-05。
- 产品确认：2026-09-05，27 项行为全部采用本文推荐方案 A。
- 本文定义 Wiki V1 的产品边界、领域模型、生成流水线、检索接入、界面、迁移与验收标准。
- 用户已授权按本文实施；仍未授权提交、推送或创建 PR。每个实施阶段开始前继续以最新 `develop` 复核受影响代码。

相关基线文档：[FAQ 方案](./PLAN_knowledgebase_faq.md)、[检索流水线重构方案](./PLAN_knowledge_retrieval_pipeline_refactor.md)、[GraphRAG V1](./graphrag-v1.mdx)。Wiki 复用其中已稳定的边界，但本文的 Wiki 状态、任务和页面契约是本功能的实施权威。

### 实施进度（2026-09-05）

第 1–6 项实现范围已经完成，发布级环境门禁仍保持关闭：

- [x] 固定 Wiki config、page、status、job、invocation、chunk metadata 和异步删除 receipt 公共合同。
- [x] 固定 summary / entity / concept / index 的稳定 page key 语义，以及有界 Map 输出结构校验。
- [x] 增加 Knowledgebase Wiki 配置与聚合状态列；历史缺失配置按 disabled 投影。
- [x] Standard 创建时校验 Wiki 专用模型或通用 LLM，并初始化空库 ready/fingerprint；FAQ/External 拒绝 Wiki 配置。
- [x] 增加可选 `wikiModel`（未设置时运行期回退 `chatModel`）以及提取粒度、Wiki 内容生成要求、Wiki 提取重点；配置指纹包含有效模型语义/参数和三项生成配置，新建时支持尚未落库、没有 relation ID 的模型选择结果。
- [x] 增加 `PUT /knowledgebase/:id/wiki/config` 专用写边界；通用 update 拒绝 Wiki config、Wiki model 与服务端状态字段。
- [x] 打通知识库创建弹窗和详情设置页：RAG 保持基础能力，Wiki 卡片作为附加能力启用，并显示专用模型与三项 Wiki 配置。
- [x] 通用 Knowledgebase update 拒绝 Wiki config 与服务端状态字段；detail 返回 reader-safe 状态和服务端计算的管理 capability。
- [x] 增加 canonical page、immutable version、contribution、evidence、link、Map result、Reduce input、source state、projection state、job 和 model invocation 实体。
- [x] 增加 `KnowledgeWikiModule` 与只读 status/pages/page API；reader 只能读取 active-ready 内容，writer 才能读取无正文诊断状态。
- [x] 增加 organization-over-tenant 的 Wiki feature gate；未 seed feature 或未配置 scope toggle 时 fail closed，本阶段不把该 feature 加入默认可配置功能清单。
- [x] 增加 `KnowledgeDocument.deletedAt`、`hardDeletePendingAt`、`publicationEpoch`、publication attempt、deletion intent 和 cleanup receipt schema；普通 document service 查询排除 hard-delete-pending 行。
- [x] 移除 pages/chunks 不受支持的 soft-remove/recover cascade，并在 Graph/Wiki/检索全部实现 fail-closed 前显式关闭 soft-remove。
- [x] 两条文档完成路径和手工 chunk CRUD 已共用 derived-index publication coordinator；Graph 与 Wiki 失败互相隔离，不回滚源文档 RAG 完成状态。
- [x] Graph entity/relation 已增加按来源 contribution，并在来源清理时重算 canonical 聚合字段；现有 Graph service 回归通过。
- [x] 实现独立 Bull worker、持久化 source-map/page-reduce/finalize DAG、dispatcher/reconciler、lease、revision/hash/config/publication-epoch fence、全量重建协调和确定性 index/link。
- [x] 实现来源 retract：入队前立即把受影响页面和投影置为不可服务，worker 物理删除相应 Wiki vectors，并在 Wiki enabled 时用剩余来源重算或归档页面。
- [x] 实现 system-managed 搜索投影、active-version/source-hash fail-closed、Knowledge Filter 跳过、每页最高分 section 去重和 Wiki citation URL。
- [x] 完成 Cloud 创建/编辑配置、独立 Wiki 模型回退、三项 Wiki 设置、Wiki 浏览器、重建/重试管理态和三个 locale；非空库付费重建改为保存前确认。
- [x] 增加共享计费 delivery receipt；authoritative ledger 成功后，membership/user/organization 汇总在同一事务中按 request receipt 幂等交付，已完成 replay/载荷冲突/单次 Wiki billing command 测试。
- [x] Wiki 模型调用通过已导出的 `AgentMiddlewareRuntimeService` facade 接入，并由 `KnowledgeWikiModule` 显式引入 runtime module；修复 Nest 启动时模型 runtime provider 无法解析的问题并增加模块装配回归测试。
- [ ] 把现有 document/KB hard delete 切换为 typed 202 saga，清除含源正文的历史 Wiki model output/version/input，并接通所有一方客户端 pending/failed/retry 管理态。
- [ ] 完成真实 PostgreSQL、PGVector/Milvus、模型、队列和浏览器验收后，再 seed/开启组织级 Wiki feature flag。

当前发布门禁保持关闭：前端、配置 API、Map/Reduce producer、浏览器和搜索投影已经接线，但没有 seed 默认 Wiki feature、没有把现有 DELETE 切换到未完成的 typed 202 saga，也没有开放 document soft-remove。只有显式创建内部 canary feature 与 tenant/organization toggle 后，已启用知识库的 API 才可用，供后续真实依赖验收。

当前验证：contracts、server-ai TypeScript no-emit、Cloud Angular 编译、Cloud development 完整构建和 API production 完整构建均通过；修复后的本地 Nest API 已启动，`/api/health` 返回 200 且 database/storage/cache 全部为 up，Cloud 4200 首页返回 200。`BaseToolset extends undefined` 模块循环已通过收窄 shared barrel import 修复，`knowledgebase.service.spec.ts` 已恢复通过；`ProjectToolset` 的剩余同类 shared barrel 循环也已改为直接模块导入，相应 subgraph 套件恢复通过。最新定向回归包括 contracts 1 个套件 / 5 个测试、server-ai 24 个套件 / 178 个测试、Cloud 6 个套件 / 117 个测试，覆盖 Wiki 配置、专用模型回退、模型语义指纹、模块装配、费用确认、详情 DTO、Map/Reduce、Graph contribution、来源 retract、搜索 scope、投影清理、计费 delivery receipt、单次 Wiki billing command 和 Assistant/ClawXpert Wiki citation 跳转。Cloud 完整构建需在已有 `nx serve cloud` 并行运行时用 `CI=1` 关闭共享 Angular LMDB 磁盘缓存，避免本机构建缓存并发崩溃；这不是源码编译错误。组件实例 Jest 仍受仓库已有 Milkdown/lodash-es ESM 转换配置阻断，不计作产品验收；真实 PostgreSQL 持久化、模型、Vector Store、队列与浏览器验收仍待后续阶段。

## 执行结论

Wiki 应当建模为标准文档知识库上的可选生成与索引能力，而不是新的知识库类型，也不是新的 Retriever。

- `Standard`、`FAQ`、`External` 表示知识库的内容和接入类型。
- `Vector`、`Keyword`、`Graph` 表示候选内容的召回来源。
- `Wiki` 表示从标准源文档生成关联页面、证据与链接的派生能力。
- Xpert V1 保留标准知识库现有 RAG 基线，不引入尚不存在的 `ragEnabled`，也不支持 Wiki-only 知识库。
- Wiki 与 GraphRAG 相互独立；Wiki 不能依赖 GraphRAG 已开启，也不直接复用 GraphRAG 的实体作为权威页面。
- Wiki 页面使用独立关系表作为 canonical 数据；现有 `knowledge_document` / chunk 只承载搜索投影。
- Wiki 搜索投影继续复用 Vector、Keyword、Weighted RRF、rerank、Top K 和统一 `Document[]` 输出，不新增 `WikiRetriever`。
- 源文档被更新、停用或删除时，必须先让相关 Wiki 投影失效，再异步重建或归档，不能继续返回已撤回内容。
- 带有效 Knowledge Filter V2 条件的查询在 V1 中跳过 Wiki 聚合投影，继续检索原始文档；不能用一个聚合页面绕过源文档过滤边界。

V1 的完整价值闭环是：启用能力、处理已有和新增文档、生成可浏览页面、查看来源与关联、供 Agent 检索、引用跳转、更新删除后正确收敛。

## 实施前问题与基线证据

以下内容保留实施前的代码基线，用于解释设计选择；当前完成状态以文首“实施进度”为准。

### 当前界面只是未接线的占位

- `apps/cloud/src/app/features/xpert/knowledge/new/new.component.html:77-106` 把 RAG 与 Wiki 画成互斥的“索引策略”卡片，Wiki 仍为 disabled。
- `apps/cloud/src/app/features/xpert/knowledge/new/new.component.ts:432` 只有瞬时 `model<'rag' | 'wiki'>('rag')`。
- `apps/cloud/src/app/features/xpert/knowledge/new/new.component.ts:664-701` 的 `buildPayload()` 不读取 `indexStrategy`，刷新或编辑后也无法恢复。
- `apps/cloud/src/assets/i18n/zh-Hans.json:6621` 明确写着 Xpert 当前没有 Wiki 索引浏览器。

因此，现有卡片不能视为已存在的公共契约；实施时应删除互斥死状态，并换成真实的附加能力配置。

### 当前公共领域没有 Wiki 身份

- `packages/contracts/src/ai/knowledgebase.model.ts:18-22` 只有 `Standard`、`FAQ`、`External`。
- 标准知识库创建仍要求 embedding model，并要求至少一个检索来源；没有关闭整个 RAG 的契约。
- `wikiConfig`、Wiki 页面、来源贡献、证据、链接、任务与状态都不存在。

因此不应增加 `KnowledgebaseTypeEnum.Wiki`，也不应通过页面标题、Markdown 格式或本地 UI copy 猜测 Wiki 内容。

### 当前 document soft-delete 路由缺少实体列

- `packages/server-ai/src/knowledge-document/document.controller.ts:273-282` 已暴露 soft-remove / recover。
- `packages/server-ai/src/knowledge-document/document.entity.ts:52-70` 继承的 `TenantOrganizationBaseEntity` 最终落到 `packages/server/src/core/entities/base.entity.ts:43-100`，当前没有 `@DeleteDateColumn`。
- chunk entity 也没有软删除列或软删除 API；手工 chunk delete 是破坏性生命周期事件。
- document 的 pages/chunks relation 当前声明 `soft-remove/recover` cascade，但两种 child entity 也没有 delete-date column；V1 不能依赖这组无落库语义的 cascade。
- `packages/server-ai/src/knowledgebase/filter/knowledge-graph-filter-scope.service.ts:78-101,152-171,237+` 的 Graph evidence SQL 没有 `d.deletedAt IS NULL`；`packages/server-ai/src/graphrag/graphrag.service.ts:539-548,771-795,1684-1765` 的 entity detail mentions、`listMentions()` 和 `resolveGraphChunks()` 也没有统一的 eligible-source scope。只修 Vector/Keyword 或 Graph Retriever 会让 Graph 浏览 API 成为撤回绕过。
- `packages/server-ai/src/graphrag/graphrag.service.ts:310-343,1380-1480,1567-1595` 的 `clearDocument()` 只删除 mentions；当多个文档共享一个 entity/relation 时，已删文档合并进 canonical 行的 aliases、description、summary、confidence/weight 仍会保留，`syncEntityVectors()` 还会继续用这些字段生成 Graph vectors。因此单纯过滤 mentions 也不能完成内容撤回。

因此 Wiki V1 若要承诺 document soft-delete/recover，必须先给 `KnowledgeDocument` 增加显式 `timestamptz` `@DeleteDateColumn`、移除 pages/chunks 不受支持的 soft-remove/recover cascade，并验证现有端点。V1 不给 child/chunk 发明软删除语义；chunk update/delete 走前述生命周期 coordinator，Vector、Keyword、Graph Retriever 和 Graph 浏览/统计 API 都必须以所属 document 未软删除为资格边界。Graph 还必须先补齐按来源的属性贡献，否则共享实体的生成字段无法在删除时可证明地重算。

### 当前有两条独立的文档完成路径

- `packages/server-ai/src/knowledge-document/document.job.ts:188-293` 负责常规文档任务。
- `packages/server-ai/src/knowledgebase/plugins/knowledgebase/strategy.ts:156-291` 在 Workflow Knowledge Base 节点内独立执行 chunk sync、embedding、Graph enqueue 和 `FINISH + contentHash` 更新。

只在 `document.job.ts` 增加 Wiki hook 会漏掉 Workflow 写入。实施必须先提取统一的服务端 publication seam，让两条路径共享 mutation prepare、最终状态提交和 derived-job outbox。

### 已有能力可以复用，但不能混淆权威数据

当前已经具备：

- 文档解析、chunk 持久化、向量写入和增量 content hash。
- Vector、Graph、Keyword Retriever 及 Legacy / Weighted RRF Fusion。
- rerank、threshold、跨知识库排序、diagnostics 和统一 `Document[]` 返回。
- system-managed document 模式和 FAQ 的关系库 / Vector Store 补偿经验。
- GraphRAG 的独立 Bull 队列、持久化 job、revision、status 与手动 rebuild 模式。
- `xpert://knowledgebase/chunk` 和 `xpert://knowledgebase/faq` 引用链路。

但 `KnowledgeDocument` 同时带有文件来源、解析配置、路径、处理状态和树结构。将 Wiki 页面直接存为普通文档会让“用户源文档”“生成页面”“搜索投影”成为同一个概念，删除、重处理、列表、计数和引用都会失去清晰边界。

## 产品目标

### In Scope

- 标准文档知识库创建时可启用 Wiki；已有标准知识库可在设置中启用或停用。
- 新建空知识库启用 Wiki 后状态为 ready；首个有效文档处理完成后自动开始生成。
- 已有知识库从 disabled 切换为 enabled 时，自动处理全部符合条件的已有文档。
- 为源文档生成 `summary`、`entity`、`concept`、`index` 四类 Wiki 页面。
- 页面具有稳定身份、标题、Markdown 正文、摘要、别名、来源证据、出链、反链和构建状态。
- Wiki 浏览器支持搜索、页面类型筛选、页面选择、来源定位、内部链接和深链接恢复。
- Wiki 页面按明确的搜索投影进入现有 Vector + Keyword + Weighted RRF 链路。
- Agent 检索命中 Wiki 后仍返回现有 `Document[]`，并生成 Wiki 页面引用。
- 文档新增、内容变化、启停和删除后的增量生成、撤回与孤儿页面归档。
- 作为 soft-delete/recover 承诺的前置，补齐 `KnowledgeDocument.deletedAt` 和 Graph 按源属性贡献/可逆聚合，防止共享 Graph 实体留存已删来源内容。
- 删除整个知识库时的 job 收口、关系数据级联和外部向量清理。
- 手动全量重建、任务状态、失败原因和安全重试。
- tenant、organization、knowledgebase、权限和 disabled 边界与现有知识库一致。
- 生成模型 token 记账、结构化日志和必要指标。
- `en`、`zh-Hans`、`zh-Hant` 前端文案及 `server-ai` 服务端错误文案。

### Out of Scope

- 新增 `KnowledgebaseTypeEnum.Wiki`。
- 新增 `WikiRetriever` 或改变 Vector / Keyword / Graph 的 source 定义。
- 关闭标准知识库 RAG，或创建 Wiki-only 知识库。
- FAQ、External 知识库启用 Wiki。
- 依赖 GraphRAG 才能生成 Wiki，或把 GraphRAG 数据作为 Wiki 唯一事实源。
- 用户手工新建、改名、合并、拆分或编辑 Wiki 页面。
- 页面历史版本浏览、人工回滚和多人协作编辑。
- 完整自定义系统 prompt、结构化输出协议、引用和防幻觉规则；V1 允许用户填写有界的“Wiki 内容生成要求”和“Wiki 提取重点”，但服务端版本化模板仍拥有协议与安全约束。
- 语义实体合并；V1 只按明确的规范化 key 合并，避免错误合并。
- 文件夹编辑器、拖拽目录、复杂首页布局和知识图可视化。
- 修复 `Knowledgebase` 自身当前同样缺少 `DeleteDateColumn` 的 soft-delete/recover；V1 支持现有 hard delete，若另行修复 KB soft delete，必须复用本文停用/清理边界。
- Wiki 页面独立权限；V1 继承所属知识库权限。
- 带源文档过滤条件时动态重写 Wiki 页面；V1 直接跳过聚合 Wiki 投影。
- 固定提高 Wiki 分数或照搬其他产品的加权常量。

## 用户确认的设计决策

以下行为已由用户在 2026-09-05 一次性确认，不再作为实施中的隐含默认值：

| 决策             | V1 选择                                                             | 原因                                                     |
| ---------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| 产品身份         | 标准知识库附加能力                                                  | 当前没有 Wiki-only / RAG-off 契约；避免破坏已有类型语义  |
| 配置入口         | `wikiConfig`，不使用互斥 `indexStrategy`                            | 与 `recall`、`graphRag` 保持单一职责                     |
| 生成模型         | 可选 `knowledgebase.wikiModel`，未设置时回退 `chatModel`            | 支持 Wiki 独立选模，同时保持零配置兼容                   |
| canonical 存储   | 独立 Wiki 表                                                        | 页面不是文件，也不是普通 chunk                           |
| 搜索接入         | system-managed document + typed chunks                              | 复用现有检索、向量和引用协议                             |
| 生成编排         | 独立 Bull 队列和持久化 job                                          | Wiki 是可重试的 Map / Reduce 流水线，不阻塞文档 RAG 完成 |
| 页面合并         | `pageType + normalized canonical name` 精确合并                     | 语义自动合并容易把同名概念错误合并                       |
| 删除语义         | 先失效投影并持久化 retract，再删除源文档                            | 防止删除后继续泄露派生内容                               |
| Graph 删除收敛   | 按源属性 contribution 可逆聚合                                      | 现有 mention 清理无法撤销共享对象的合并字段              |
| 停用语义         | 保留 canonical 页面，停止生成并排除检索                             | 停用不是数据删除；重新启用时全量重建                     |
| Knowledge Filter | 有有效过滤条件时跳过 Wiki 投影                                      | 聚合页面可能混合过滤范围内外的证据                       |
| 排名             | 不增加固定 Wiki boost                                               | 先通过真实质量样例决定，不把外部产品常量当合同           |
| 人工编辑         | V1 不开放                                                           | 避免生成更新覆盖人工内容及提前引入版本合并模型           |
| 页面语义         | summary 每源文档一页；entity/concept 精确跨源合并；index 确定性生成 | 固定页面身份、数量和目录职责                             |
| 付费触发         | 全量生成前确认；有界技术重试自动；不确定额外调用再确认              | 避免保存配置或后台升级产生意外费用                       |
| 后台计费主体     | 没有可审计执行用户时待授权，不回退 creator                          | 保持费用归属和权限可证明                                 |
| 页面可见性       | reader 只看 ready；writer 可看无正文诊断状态                        | 普通体验与运维诊断分离                                   |
| 状态信息权限     | reader 摘要、writer 管理详情                                        | 不向只读/Public 用户泄漏 job、invocation 和计费恢复信息  |
| 文档硬删除       | 全局异步 202 saga，逐项 receipt、可恢复重试                         | 跨数据库/向量/派生存储的完成语义一致                     |
| KB 硬删除        | KB 级异步 202 saga                                                  | 网络超时或部分清理后仍可查询和继续                       |
| 原始文件         | 无 typed ownership/ref-count 时保留 StorageFile                     | 防止误删共享文件                                         |
| 发布门禁         | foundation 先行，组织级 feature flag/canary 最后开放                | 不让半成品入口产生费用或暴露不完整生命周期               |

## 术语与领域边界

### Canonical 术语

| 术语                          | 定义                                                     | Owner                                      |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| 源文档（source document）     | 用户或连接器导入、已完成解析的标准知识文档               | `knowledge-document`                       |
| Wiki 页面（Wiki page）        | 多个来源贡献归并后发布的 Markdown 页面                   | `knowledge-wiki`                           |
| Map 结果（map result）        | 某一次 source job 从一个源文档提取、尚未发布的结构化候选 | `knowledge-wiki`                           |
| 来源贡献（page contribution） | 某个已生成页面版本实际采用的不可变来源贡献快照           | `knowledge-wiki`                           |
| 页面证据（page evidence）     | 已发布页面内容指向原始 document / chunk 的可审计引用     | `knowledge-wiki`                           |
| 页面链接（Wiki link）         | 两个 canonical Wiki 页面之间的有向关系                   | `knowledge-wiki`                           |
| 搜索投影（search projection） | 由页面生成、写入现有 chunk / Vector Store 的可检索副本   | `knowledge-wiki` 写入，现有 retrieval 读取 |
| 构建任务（Wiki build job）    | 文档增量、撤回或全量重建的一次可重试工作                 | `knowledge-wiki`                           |
| Wiki revision                 | 一次知识库级全量生成 epoch，用来阻止旧任务覆盖新结果     | `knowledge-wiki`                           |

### 应避免的术语

- “Wiki 知识库类型”：容易误导为 `KnowledgebaseTypeEnum.Wiki`。
- “Wiki 文档”：无法区分源文档、canonical 页面和搜索投影。
- “Wiki Retriever”：Wiki 不是第四路召回算法。
- “RAG / Wiki 索引策略二选一”：不符合 Xpert 当前能力和 V1 范围。
- “slug 就是页面身份”：slug 是 URL 展示字段，不能承担合并权威。

## 用户行为合同

### 启用

1. 只允许标准文档知识库启用。
2. 必须已配置可用的 `wikiModel` 或 `chatModel`；运行期优先使用 Wiki 专用模型，未设置时回退通用 LLM，服务端是最终校验边界。
3. 新建空知识库启用后直接进入 `ready`，页面数为 0，并在无模型调用的配置事务中把 active config/generator fingerprint 设为当前值，使首个来源可以走正常 incremental 路径。
4. 已有文档时先展示 eligible 文档数和模型费用提示；用户确认后进入 `indexing` 并创建带有界 spend envelope 的全量 rebuild job。
5. 已有文档包含 disabled、folder 或 system-managed document 时，这些记录不进入生成。

### 停用

1. 新的 source_map/page_reduce/rebuild 不再入队；已入队生成任务在开始和发布前重新检查 enabled / revision，并以 `cancelled` 收口。源失效标记和 retract/硬删除清理是安全例外，即使 Wiki disabled 也必须执行。
2. 所有 Wiki 搜索投影立即变成不可检索。
3. canonical 页面和来源贡献保留，授权用户在浏览器中看到“已停用，内容可能过期”的状态；若某来源随后更新、停用或删除，相关页面必须立即 stale 并隐藏正文/evidence，不能继续展示已撤回内容。
4. 再次启用总是先把保留页面视为不可服务并启动全量重建；projection container 在 staged revision 完成前保持 disabled，不能假设停用期间源文档没有变化。
5. V1 不提供“彻底删除 Wiki 数据”操作。

### 源文档资格

同时满足以下条件才可作为 Wiki 来源：

- `isDocumentKnowledgebaseType(type)` 为真。
- 文档不是 folder。
- `metadata.systemManaged !== true`。
- `disabled !== true`。
- document `deletedAt` 和 `hardDeletePendingAt` 都为空；软删除或已接受硬删除 intent 的文档不属于有效来源。
- `status === finish`。
- 至少有一个有效 chunk。

图片、音频、网页或表格不是按文件类型排除；只要现有解析链路已经产生可信文本 chunk，就可以进入 Wiki。

### 页面语言

- 知识库显式配置 `language` 时，生成页面跟随该语言。
- 未配置时保留来源主要语言，不在 V1 自动翻译。
- 不通过语言或显示标题自动合并页面；跨语言实体只保存 aliases，后续再评估人工合并。

## 状态模型

### 知识库级构建状态

```text
disabled
  └─ enable with no documents ───────────────> ready
  └─ enable with existing documents ─────────> indexing

ready
  └─ source change / manual rebuild ─────────> indexing
  └─ user config changed ───────────────────> indexing
  └─ deployed generator contract changed ──> rebuild_required
  └─ disable ─────────────────────────────────> disabled

indexing
  └─ no queued/running jobs and no failures ─> ready
  └─ any terminal job failure ───────────────> failed
  └─ disable ─────────────────────────────────> disabled

failed
  └─ retry / rebuild ─────────────────────────> indexing
  └─ disable ─────────────────────────────────> disabled

rebuild_required
  └─ authorized rebuild ───────────────────> indexing
  └─ disable ────────────────────────────────> disabled
```

推荐新增 `KnowledgeWikiStatus`：

```ts
export enum KnowledgeWikiStatus {
  DISABLED = 'disabled',
  INDEXING = 'indexing',
  READY = 'ready',
  FAILED = 'failed',
  REBUILD_REQUIRED = 'rebuild_required'
}
```

`wikiStatus` 是 control-plane 状态，不等同于是否仍有可服务页面；存在任务时只聚合 current desired-job set，不读历史失败。`rebuild_required` 是显式的无付费 job 状态：部署的 generator/schema 版本已超过当前发布版，但还没有带可审计 billing principal 的授权重建请求；后台 reconciler 只标记该状态，不自动调用付费模型。status API 另返回派生的 `availability: 'unavailable' | 'ready' | 'degraded'`：Wiki disabled，或初次构建尚无 active version 时 unavailable；enabled 且没有 eligible sources 的成功空库，以及 active 页面/投影健康时 ready；部分页面因源撤回/投影失败不可用但仍有安全 active 页面，或者 generator 待授权重建时 degraded。这样 staged rebuild failed 可以同时表达“当前构建失败”和“上一版仍可服务”。

Wiki disabled 时 `wikiStatus` 始终为 disabled；安全 retract/cleanup jobs 通过 status API 的独立计数和错误暴露，不把产品开关伪装成 indexing。重新启用后 current desired set 从新的 full rebuild root 开始。

### 页面级状态

```ts
export type KnowledgeWikiPageStatus = 'building' | 'ready' | 'stale' | 'failed' | 'archived'

export type KnowledgeWikiProjectionStatus = 'pending' | 'ready' | 'failed' | 'disabled'
```

- `ready + projection ready` 才能进入 Agent 检索。
- 普通 reader 的页面列表默认且只能返回 active-ready 页面；write-access 用户可显式筛选 `building/stale/failed/archived` 诊断状态，但源撤回产生的记录不返回旧正文或 evidence。
- 源内容更新、停用或删除使受影响页面先进入 `stale`，并立即排除旧投影。
- 对源失效导致的 `stale` 页面，普通页面 API 只返回状态和恢复提示，不返回可能包含已撤回事实的旧正文/evidence；Wiki 能力本身被停用时才允许授权用户查看保留快照并明确标注过期。
- 没有任何有效来源贡献的页面进入 `archived`。
- 新增来源属于增量补充时，旧页面可以继续浏览；新版本发布后原子替换页面正文和证据。
- granularity、chat model 或生成器版本变化触发的非撤回式全量重建使用 staged revision：旧 ready 页面继续服务，只有新 revision 全部完成后才原子切换；失败时保留上一 ready revision。
- 新页面版本正文生成成功但 Vector Store 投影失败时，该版本不能成为 active；已有 active 版本可继续浏览，新页面则只显示构建失败。全局状态和投影状态必须明确失败，不能伪装成检索已就绪。
- 知识库级 `indexing/failed` 描述最近一次构建，不直接禁用仍有效的 active page version；Retriever 以 Wiki enabled、canonical page ready、active version 和 projection ready 共同判定。初次构建失败时没有 active version，自然没有 Wiki 命中。

## 总体架构

```text
Standard Knowledgebase
  │
  ├─ Source KnowledgeDocument + chunks                 canonical source
  │      │
  │      ├─ publication epoch + durable writer attempts
  │      │       └─ hard-delete intent: quiesce -> purge -> external receipts -> final row delete
  │      │
  │      └─ content changed / disabled / deleted
  │              │
  │              ▼
  ├─ Knowledge Wiki queue + durable job
  │      │
  │      ├─ Map: document chunks -> durable map results
  │      ├─ Reduce: immutable input(map results + active contributions) -> page versions + evidence
  │      └─ Finalize: deterministic slugs, index pages, links, backlinks
  │
  ├─ knowledge_wiki_source_state / projection_state / page / page_version / map_result / page_reduce_input / contribution / evidence / link
  │      │
  │      ├─ Wiki browser API
  │      └─ system-managed search projection
  │              │
  │              ├─ knowledge_document_chunk / Keyword
  │              └─ Vector Store
  │
  └─ existing KnowledgeSearchQueryHandler
         └─ Vector / Keyword / Graph -> Fusion -> rerank -> Top K -> Document[]
```

### 模块 ownership

建议新增独立 `KnowledgeWikiModule`，路径为 `packages/server-ai/src/knowledge-wiki/`。它与 `GraphragModule` 一样拥有自己的实体、队列、controller、service、commands 和 job consumer，并通过知识库嵌套路由暴露 API。

`knowledge-document` 拥有通用 publication epoch/attempt 和 deletion saga，并在明确生命周期接缝发出 typed participant command；它不直接操作 Wiki/Graph 领域表。`knowledge-wiki` 和 `graphrag` 各自实现 prepare/fail-closed/purge/verify participant，向 saga 返回持久化 receipt；`knowledgebase` 只保存配置和聚合状态；`retrieval` 只消费 typed search projection。这样删除协调不需要让 document service 反向写每个派生模块的表。

不建议继续把所有 Wiki provider 塞进已经较大的 `KnowledgebaseModule`，也不建议让文档服务直接注入 Wiki service 形成新的循环依赖。

## 公共契约

### Knowledgebase 配置

V1 建议契约：

```ts
export type KnowledgeWikiExtractionGranularity = 'focused' | 'standard' | 'exhaustive'

export type KnowledgebaseWikiConfig = {
  enabled: boolean
  extractionGranularity: KnowledgeWikiExtractionGranularity
  contentGenerationRequirements?: string
  extractionFocus?: string
}

export const DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG = {
  enabled: false,
  extractionGranularity: 'standard',
  contentGenerationRequirements: '',
  extractionFocus: ''
} as const satisfies KnowledgebaseWikiConfig
```

为 `TKnowledgebase` 增加：

```ts
wikiConfig?: KnowledgebaseWikiConfig | null
wikiModel?: ICopilotModel | null
wikiModelId?: string | null
wikiStatus?: KnowledgeWikiStatus | null
wikiRevision?: number | null
wikiActiveRevision?: number | null
wikiStagedRevision?: number | null
wikiBuildError?: string | null
wikiRebuildRequiredReason?: 'generator_upgrade' | null
wikiGeneratorVersion?: string | null
wikiConfigFingerprint?: string | null
```

约束：

- 历史 `wikiConfig = null / undefined` 一律按 disabled 读取，不需要数据回填。
- FAQ 和 External 创建输入中的 `wikiConfig` 被拒绝，而不是静默保存无效配置。
- `wikiStatus`、`wikiRevision`、`wikiActiveRevision`、`wikiStagedRevision`、`wikiBuildError`、`wikiRebuildRequiredReason`、`wikiGeneratorVersion` 和 `wikiConfigFingerprint` 都是服务端只读字段。
- `wikiRevision` 是只增不减的 revision high-water mark；`wikiActiveRevision` 是当前对外服务的 full-build revision；`wikiStagedRevision` 只在全量重建期间存在，成功切换后写入 active 并清空。失败后下一次 rebuild 仍分配更高 revision，不能复用旧 job key。
- 创建时可以随知识库 payload 提交 `wikiConfig`；创建后的变更走 Wiki 专用配置命令/API。
- 通用知识库 update 必须拒绝客户端写入 Wiki 状态字段，不能依靠前端不发送。
- 提取粒度、内容生成要求、提取重点或有效生成模型变化，由当前授权用户请求直接触发 full rebuild；部署后的 generator/schema 变化只由 reconciler 标记 `rebuild_required`，等有 write access 的用户显式确认重建。它们都不改变知识库类型或 RAG 配置。
- config fingerprint 由服务端对 `schemaVersion + extractionGranularity + contentGenerationRequirements + extractionFocus + effective model identity + generatorVersion` 做稳定序列化和 hash 得到，客户端不能提交或自行计算。知识库的 `wikiConfigFingerprint` / `wikiGeneratorVersion` 表示最后成功发布的 active 版本；当前目标 fingerprint 由新 rebuild root 捕获，只在 Finalize 成功切换后写回聚合字段。

### 页面与任务契约

建议在 `packages/contracts/src/ai/knowledge-wiki.model.ts` 定义具体类型，而不是在下游读取任意 JSON：

```ts
export type KnowledgeWikiPageType = 'summary' | 'entity' | 'concept' | 'index'
export type KnowledgeWikiMappedPageType = Exclude<KnowledgeWikiPageType, 'index'>
export type KnowledgeWikiJobType = 'source_map' | 'page_reduce' | 'retract' | 'rebuild' | 'finalize'
export type KnowledgeWikiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale' | 'cancelled'

export type KnowledgeWikiPageContributionPayload = {
  schemaVersion: 1
  pageType: KnowledgeWikiMappedPageType
  canonicalName: string
  aliases: string[]
  summary: string
  facts: Array<{
    text: string
    sourceChunkIds: string[]
  }>
  suggestedLinks: Array<{
    targetType: KnowledgeWikiPageType
    targetCanonicalName: string
    label?: string
  }>
}
```

Map / Reduce 输出是外部模型信任边界，必须先通过字段级结构校验，才能转换为以上具体类型。不要引入 `as any`、通用 `asRecord()` 或根据显示文本猜测 page type。

status API 的模型恢复操作使用 typed contract，不让前端从 error message 猜测：

```ts
export type KnowledgeWikiRecoveryAction = {
  jobId: string
  invocationId: string
  reconciliationStatus: 'not_available' | 'pending' | 'recovered' | 'not_executed' | 'indeterminate'
  canRetry: boolean
  requiresAdditionalChargeConfirmation: boolean
  inputCurrent: boolean
  recommendedAction: 'wait' | 'retry_job' | 'full_rebuild'
}
```

`reconciliationStatus='pending'` 时 `canRetry=false/recommendedAction='wait'`；找回结果后 action 消失并自动继续 job。最终 indeterminate 且输入仍当前时才返回 `retry_job + requiresAdditionalChargeConfirmation=true`；输入已过期时返回 `full_rebuild + canRetry=false`。

### Wiki chunk metadata

```ts
export interface IKnowledgeWikiChunkMetadata extends IDocChunkMetadata {
  contentKind: 'wiki'
  wikiPageId: string
  wikiPageVersionId: string
  wikiPageKey: string
  wikiPageType: KnowledgeWikiPageType
  wikiRevision: number
  sectionAnchor: string
  projectionStatus: 'pending' | 'ready' | 'failed' | 'disabled'
}
```

- `contentKind: 'wiki'` 是强制 discriminator。
- 不从 system document 名称、路径或 Markdown 标题推断 Wiki。
- metadata 只携带检索和定位所需的有界字段；完整 evidence 由 Wiki API 读取，避免把大数组复制到每个 embedding。

## 关系库存储设计

### `knowledge_wiki_page`

canonical 页面身份表，建议字段：

- tenant / organization / knowledgebase FK。
- `pageKey`：`pageType + normalizedCanonicalName`，知识库内唯一。
- `slug`：知识库内唯一，只用于 URL 可读性，不作为引用权威。
- `pageType`、`status`、`activeVersionId`。
- `sourceCount`、`inboundLinkCount`、`outboundLinkCount`。
- `publishedAt` 和 TypeORM `VersionColumn`；页面 ID 在版本切换后保持稳定。

索引至少覆盖：

- unique `(knowledgebaseId, pageKey)`。
- unique `(knowledgebaseId, slug)`。
- `(tenantId, organizationId, knowledgebaseId, status)`。
- `(knowledgebaseId, pageType, updatedAt)`。

### `knowledge_wiki_page_version`

页面的一次不可变生成快照，供增量替换和 full rebuild staging 使用：

- knowledgebase / page / `producerJob` FK；普通页面 producer 是 `page_reduce`，确定性 index 页面 producer 是 `finalize`；`generationAttempt` 区分同一 job 在输入变化后的重新生成。
- `generationRevision`、`generatorVersion`、`configFingerprint`、`expectedPageVersion`；后者是 Reduce 输入快照时读取的 canonical page `VersionColumn`，仅 Finalize 用它做 CAS。
- 必填且有界的 `title`、`summary`、`contentMarkdown`、`aliases`、`contentHash`；page version 只在 Reduce/确定性 index 输出通过 typed boundary parser 后创建，不把“还没有生成正文的输入”伪装成 version。
- `status`、`projectionStatus`、`projectionEmbeddingRevision`、`projectionEmbeddingFingerprint`、`projectionError`、`publishedAt`。
- unique `(pageId, producerJobId, generationAttempt)`，并索引 `(knowledgebaseId, generationRevision, status)`；version 内容不可原地改写，新输入创建新 generation attempt，同输入的 execution retry 复用已持久化 invocation/output；building/failed 行也只允许状态和错误收口，不允许后续填充或替换正文。

页面 API 只读取 `page.activeVersionId` 指向的 ready snapshot。只有对应 root 的 Finalize 可以交换指针：普通增量 Finalize 只交换受影响页面；full rebuild 的所有 staged snapshots 和投影都 ready 后，Finalize 在一个关系库事务中批量交换全部指针并更新知识库 active revision。`page_reduce` 不允许修改 `activeVersionId`。失败 snapshot 可用于诊断，超出保留窗口后清理。

staged rebuild 创建但从未获得 active version 的 canonical identity 不进入普通页面列表；失败清理窗口结束后，若它仍没有 active version、引用和运行中 job，则一并回收，避免形成 ghost pages。普通失败快照可按有限保留期清理，但包含已硬删除来源内容的 snapshot/evidence 必须在安全替换或归档后优先清除，不能以调试留存绕过删除语义。

### `knowledge_wiki_source_state`

每个 source document 的 Wiki 生命周期游标，区分“同一事件重复投递”和“相同 hash 的新业务事件”：

- tenant / organization / knowledgebase 和 `sourceDocumentIdSnapshot`；可选 document relation 使用 `ON DELETE SET NULL`。
- `lifecycleGeneration` 单调递增，`lastEventType`、`lastContentHash`、`eligible`、`cleanupPending`、`generationPending`、`generationPendingReason`、`desiredRootJobId`。
- unique `(knowledgebaseId, sourceDocumentIdSnapshot)`。
- lifecycle coordinator 对该行加短事务锁；只有 content hash、disabled/deleted/eligible 状态发生真实迁移时才递增，幂等重复请求返回当前 generation/job。
- document 硬删除后保留 tombstone 到相关 retract/job retention 结束，防止相同 UUID 的历史事件失去幂等边界。

### `knowledge_document_deletion_intent`

硬删除是跨关系库、Vector Store 和文件存储的持久化 saga，不能以“文档行已删”代表完成：

- `KnowledgeDocument` 增加显式 `hardDeletePendingAt: timestamptz | null` 和单调 `publicationEpoch: int`；所有文档、chunk、Graph 和 Wiki 读取路径都要求 pending 字段为 null。这是 fail-closed 资格判断，不用 status 文案或是否存在 job 猜测。
- intent 保存 tenant / organization / knowledgebase、`sourceDocumentIdSnapshot`、可空 document FK `ON DELETE SET NULL`、expected document version、source lifecycle generation、requested/billing principal 和有界的受影响 page / Graph object / external artifact ID manifest；page manifest 除 source lineage 命中的普通页外，还必须在 quiescence 后冻结当前 KB 全部仍保留的 deterministic index versions（active/staged/superseded/failed）及投影 keys。intent 不保存源正文。
- `status: 'prepared' | 'quiescing' | 'retracting' | 'external_cleanup' | 'finalizing' | 'completed' | 'failed'`，并记录每个幂等步骤的 receipt、attempt、last error 和 lease。文档行上的短事务锁加 active-intent 唯一约束，保证重复 DELETE / bulk DELETE 复用同一 intent：第一次接受前按 expected version 拒绝并发修改，intent 存在后则先返回该 receipt，不因 `hardDeletePendingAt` 更新了 `VersionColumn` 而误创新 intent。
- 只有“源内容血缘物理清除 + 所有外部清理 receipt 成功”后，`finalizing` 事务才能删除 document/chunk/page 行、只增量一次地更新 `documentNum`，并把 intent 转 completed。intent/source-state tombstone 按有限 retention 保留，使文档行删除后仍能查询结果和证明幂等。
- intent 一旦进入内容 purge 便不可取消或恢复旧投影；中途失败时文档行保留为 hard-delete-pending 且全程不可读，只能从已持久化的步骤继续幂等重试。不允许在部分内容已清除后撤销 intent 并“恢复”不完整的文档。

### `knowledge_document_publication_attempt`

删除接受前已启动的处理、Workflow、Graph、Wiki 或 embedding writer 不能绕过 `hardDeletePendingAt`。V1 用一个共享发布 fence 管理所有可能为源文档写关系数据或外部 artifact 的任务：

- writer 开始前在文档短事务锁下捕获 `publicationEpoch`，创建 attempt，并确认 `hardDeletePendingAt IS NULL`。attempt 保存 document/source snapshot、producer kind、epoch、lease/heartbeat、关系发布状态，以及每个外部存储的 exact staged object/vector key、idempotency key 和 outcome。
- 多源 page-reduce、Graph aggregate 或 KB-wide embedding rebuild 通过 `knowledge_document_publication_attempt_source` 关联表持久化每个真正参与输入的 `documentIdSnapshot + publicationEpoch + contentHash`；不把来源集只埋在 JSON。hard delete 因而能查到并 quiesce 所有相关多源 writer。
- document processing 两条路径、手工 chunk mutation、Graph extraction/vector sync、Wiki projection 和 embedding collection rebuild 都必须使用该 attempt，不允许只在启动时读一次 document 就无条件发布。
- 关系库发布在同一事务中 CAS `publicationEpoch` 且再检查 pending 为 null。外部写入先进入包含 document ID + epoch 的 staged key/collection，只有 CAS 通过才提升为 active；fence 失效时 writer 必须用已登记的 exact key 补偿删除。
- hard-delete 接受事务同时递增 `publicationEpoch`、设置 pending 并关闭新 writer gate。saga 先进入 `quiescing`，将旧 epoch 任务置 stale/cancelled，等待每个已登记 attempt 给出可证明的 terminal outcome，然后才冻结受影响 manifest 并进入 lineage purge。lease 过期本身不能把“可能正在写外部存储”当成已停止；能按 deterministic key/provider status 确认并清理时才收口，无法判定则 intent 以 `external_write_indeterminate` failed，不删 document row。
- external cleanup 后、最终删行前，saga 在新事务中再次检查 publication epoch/gate、无非 terminal attempts、无 source-bearing 关系行，并按 manifest 复核所有 external receipts。任一不确定都回到 failed/retry，不用读侧 fail-closed 替代物理删除完成证明。
- document row 删除后，tombstone epoch 和 attempt/intent 保留到外部 stale-key GC 窗口结束；晚到 worker 无法通过 CAS，且其已登记 staged key 由补偿器重复清理。

### `knowledge_wiki_projection_state`

每个知识库唯一的搜索投影容器注册表：

- unique knowledgebase FK，unique `projectionDocumentId` FK。
- `projectionEpoch` 单调递增；任何 active page pointer/status 或 container 可用性变化都递增，供 embedding collection rebuild 检测快照漂移。
- writer 在短事务中锁定/创建该行，再创建或复用 system-managed document；数据库唯一约束是“每库一个容器”的最终保证，不能只靠当前 `KnowledgeDocument` 上非唯一的 source-key index。
- reconciler 检测到历史重复容器时先全部 disable，选择注册表权威容器并清理其他 chunks/vectors；普通文档 API 永远不能把任一候选容器暴露给用户。

### `knowledge_wiki_map_result`

Map 与 Reduce 之间的 durable seam；Map 不依赖一个尚未创建的 page version：

- tenant / organization / knowledgebase / sourceJob FK。
- `generationRevision`、`sourceLifecycleGeneration`、`sourceDocumentIdSnapshot`、`sourceContentHash`。
- 显式 `pageType`、`canonicalName`、`normalizedPageKey` 和 typed `payload` JSONB。
- unique `(sourceJobId, normalizedPageKey)`；同一文档同一 key 的批次结果在写入前先确定性合并。
- full rebuild 按 staged revision 汇总所有成功 source_map 结果；incremental root 只消费本次 source_map 结果，并与 active page version 中其他来源的 contributions 合并。
- result 在对应页面版本成功发布前保持可重试，之后按 job retention 清理；不得让模型内存对象成为跨 job 的唯一输入。

### `knowledge_wiki_page_reduce_input`

`page_reduce` 消费独立、不可变的输入快照，不在 worker 重启后重读可能已被撤回或删除的 active page version：

- input 保存 knowledgebase / page / root job / stage job、`generationAttempt`、`generationRevision`、`configFingerprint`、`generatorVersion` 和 `expectedPageVersion`；unique `(stageJobId, generationAttempt)`。
- 配套 `knowledge_wiki_page_reduce_input_source` 保存 input FK、`sourceDocumentIdSnapshot`、source lifecycle/publication epoch、source content hash、typed contribution payload 和仅引用该来源真实 chunks 的有界 evidence；unique `(inputId, sourceDocumentIdSnapshot)`。这是可查询的删除血缘，不只是一块无法按 source purge 的 JSON。
- 普通 incremental/retract 在创建 page-reduce child 的同一事务中，用当前有效 active contributions + 新 map results 构造 input；full rebuild 从当前 staged revision 的全部 map results 构造。worker 之后只从该 input 调 provider、写 invocation，并在输出校验通过后创建一个全新 page version/contributions/evidence。
- hard-delete saga 在 purge 旧 active version 前，为每个共享页创建只包含剩余 eligible sources 的 input 和 `dispatchAfter = null` child；该 input 不含被删源任何 payload/quote，因此旧 version 物理清除后仍能独立恢复。
- input 一经创建不再原地改写。同输入 execution retry 复用同一 input/invocation；CAS 冲突、任一剩余 source generation/hash/epoch 变化或 schema 变化时，旧 input 转 stale，递增 generation attempt，用旧 input 中仍有效的来源行和最新 map results 构造新 input。不得回退到已删旧 active version。
- source hard delete 先通过 input-source 血缘找到所有含该 source 的旧 input，使对应非终局 input/job stale，再物理删除该 input 的全部 source payload/evidence 行，而不原地改成一个“看似新输入”。只有删除 saga 另行创建、从一开始就只含剩余来源的新 input 可保留供后续 Reduce；旧 input 顶层行最多保留 ID/hash/status 无内容 tombstone。成功发布后按 job retention 清理 input，不当作页面历史。

### `knowledge_wiki_page_contribution`

保存某个页面版本实际采用的来源快照：

- knowledgebase / page / pageVersion FK；`sourceDocumentIdSnapshot` 保存入队时的源 ID，可选 sourceDocument relation 使用 `ON DELETE SET NULL`。
- `sourceLifecycleGeneration`、`sourceContentHash`、`wikiRevision`、`generatorVersion`。
- typed `payload` JSONB。
- unique `(pageVersionId, sourceDocumentIdSnapshot)`。

它是构造下一个不可变 page-reduce input 和源文档撤回的关键。增量更新先把当前版本仍有效的 contributions 复制到 reduce input，再用本次 map result 替换/移除发生变化的来源；Reduce 输出通过后才创建新 page version 及其 contributions/evidence，投影成功后仍由 Finalize 交换 `activeVersionId`。只有 evidence 而没有 contribution 时，删除一个来源后无法可靠地用剩余来源重建页面。

### `knowledge_wiki_page_evidence`

保存某一页面版本的可审计证据：

- knowledgebase / page / pageVersion FK；保存 `sourceDocumentIdSnapshot` / `sourceChunkIdSnapshot`，可选 source relations 使用 `ON DELETE SET NULL`。
- `quote`、`ordinal`、`sectionAnchor`、`sourceContentHash`。
- 所有 evidence 必须引用 Map 输入中真实存在的 chunk ID。
- source chunk 删除前先让关联的 active page/version 投影失效；不能只依赖 FK cascade，因为那会留下仍可检索但证据已丢失的正文。

### `knowledge_wiki_link`

- sourcePageVersion / targetPage FK；目标使用稳定 canonical page ID。
- `label`、`sectionAnchor`、`ordinal`。
- unique `(sourcePageVersionId, targetPageId, sectionAnchor)`。
- 只允许同一 knowledgebase 内链接；服务端拒绝跨库 page ID。
- 确定性 index page 每引用一个页面标题/摘要就必须产生对应 link 行，使 link 成为可查询的 page dependency；不允许把没有依赖边的页面内容复制进 index 正文。为覆盖历史缺边和代码回归，V1 的任一 source retraction 仍同步失效“当前 KB 全部 active index pages”；hard delete 的物理依赖闭包更严格，覆盖该 KB 全部 retained index versions（active/staged/superseded/failed），不假设历史 link 完整。

### `knowledge_wiki_index_job`

- knowledgebase FK；`sourceDocumentIdSnapshot` 为可空 UUID（rebuild / page_reduce / finalize 可为空），不因源文档硬删除而丢失。
- `rootJobId` / `parentJobId` 自关联，`pageKey` 对 page_reduce 有值；root 只依据自己的 current child manifest 聚合进度。
- `jobKey`、`type`、`status`、`revision`、`sourceLifecycleGeneration`、`sourceContentHash`、`sourcePublicationEpoch`、`publicationAttemptId`、`generatorVersion`、`configFingerprint`、`embeddingRevision`、`embeddingFingerprint`。
- `requestedById`、`billingPrincipalId`、`billingAuthorizationId`、受控 generation/spend envelope 和必要的 tenant/organization/model-access 快照；它们来自已通过授权的用户请求，不由 worker/reconciler 从 `createdById` 推测。
- typed `input` JSONB；retract 至少保存删除前解析出的 affected page IDs，不能等源记录删除后再反查。
- `totalChunks`、`processedChunks`、`totalPages`、`processedPages`。
- `expectedChildren`、`succeededChildren`、`failedChildren`；计数只是缓存，状态收口仍用 current child IDs/查询校验。
- `executionAttempt`、`maxExecutionAttempts`、`generationAttempt`、`maxGenerationAttempts`、`lockedAt`、`heartbeatAt`、`leaseExpiresAt`。execution attempt 只是同输入基础设施重试；generation attempt 只在 CAS/输入/prompt/schema 变化时递增。
- `dispatchAfter`、`dispatchedAt`、`dispatchError`；`dispatchAfter = null` 表示等待同一业务动作完成，dispatcher 不得投递。
- `errorStage`、`error`、`startedAt`、`completedAt`。
- unique `jobKey`，重试复用原 job；队列 payload 只携带 job ID 和捕获后的 request context。

启用、重建、文档完成、chunk 变更和撤回命令都必须先在各自的关系库状态事务中写入 durable job，再由统一 dispatcher 发 Bull 消息；禁止业务调用点直接创建一个没有数据库记录的队列任务。

所有 union、JSON 和数组字段的 `@Column` 必须显式声明 `varchar`、`int`、`jsonb` 或 `text` 类型，遵循项目实体规则。

### `knowledge_wiki_model_invocation`

Map/Reduce 模型调用的持久化边界，区分“同一输入的基础设施恢复”和“输入已变的新生成尝试”：

- knowledgebase / root job / stage job FK，`generationAttempt`、`stage: 'map' | 'reduce'`、`callOrdinal`、`inputFingerprint`、`modelIdentity`、`generatorVersion`。
- 配套 `knowledge_wiki_model_invocation_source` 血缘表：invocation FK、`sourceDocumentIdSnapshot`、`sourceContentHash`，unique `(invocationId, sourceDocumentIdSnapshot, sourceContentHash)`。Map 写入当前文档，Reduce 为每个真正进入 provider input 的 source contribution 写一行；不能只把 source IDs 埋在无法索引的 output JSON 中。
- `inputFingerprint` 是服务端对真正的 typed provider input 做稳定 hash：排序后的 source chunk/contribution ID 及 content hash、Reduce 的 immutable input ID/内容 hash、prompt template/schema/generator 版本、model identity 和受控配置都在内，secret、时间戳和运行时噪声不在内。不允许只用 page ID 或 batch 序号代表输入。
- `requestId = knowledge-wiki:{stageJobId}:{generationAttempt}:{stage}:{callOrdinal}:{inputFingerprint}`；unique `requestId`，并对上述逻辑键做唯一约束。
- `status: 'prepared' | 'running' | 'reconciling' | 'succeeded' | 'failed' | 'indeterminate'`、`reconciliationStatus`、provider request ID/idempotency key、lease/deadline、error、token usage、billing outbox state，以及通过 typed boundary parser 的有界 structured output。不保存无界原始 prompt/response 或 provider secret。
- provider 调用前先持久化 prepared/running invocation；返回成功后在一个 DB 事务中持久化 parsed output、usage 和 billing outbox，之后 Map/page-reduce worker 只从该成功 invocation 继续。使用 unique invocation ID 写计费账本，避免“输出已保存但记账重试”重复扣费。
- 同一 `generationAttempt + inputFingerprint` 的基础设施重试复用已成功 output，不再调 provider。若是 provider 明确未接收的前置/传输失败，或 provider 支持 idempotency key，可在同一 invocation/request ID 上安全重试；不创建新 invocation。
- running lease 过期且 provider 支持 request-status/result query 时，invocation 进入有界 `reconciling`，所属 stage/root job 保持不可 retry。找回成功结果后 invocation 转 succeeded，stage job 从持久化 output 继续；provider 确认请求未执行时，同一 invocation 可安全重投。reconciliation 有明确 deadline/attempt 上限，不允许永久占用 indexing。
- provider 不支持幂等/结果查询，或有界对账后仍无法判定时，“provider 已返回但 DB 成功提交前 worker 崩溃”无法保证 exactly-once。invocation 转 `indeterminate`，同一事务把所属 stage job/root job 收口为 `failed`，`errorCode=knowledge_wiki_model_invocation_indeterminate`；KB 根据 current desired tree 进入 failed，availability 仍由安全旧 active 页决定。自动 job retry 不再次调用；只有授权用户明确确认“可能产生额外费用”后才开新 generation attempt。
- CAS 冲突、源 contributions 变化、prompt/schema 修复都属于新输入：递增 `generationAttempt`，重新计算 `inputFingerprint`，产生新 request ID 并独立记账；不得复用旧 invocation 伪装成幂等重试。
- parsed output 只在 Map/Reduce 后续提交和有界恢复窗口内保留；页面已发布且不再可重试后将 output 清空，只保留 hash、usage、billing 和错误审计元数据。源文档 hard-delete intent 接受后读路径立即 fail closed，并且在 intent completed/document row 删除前物理清除所有相关 invocation output；不得借计费审计继续保留生成内容。

### 内部版本不是用户历史功能

`knowledge_wiki_page_version` 是为了 staging、失败恢复和跨存储切换，V1 不暴露历史列表、diff 或人工回滚 API。实现只保留 active、正在 staging 和有限失败快照；人工编辑与长期历史进入后续版本，避免把内部发布机制误建模成协作型 Wiki 历史。

## 页面身份与合并规则

### 稳定 key

1. `summary` 是每个 eligible source document 的稳定摘要页，身份包含 source document snapshot，不与其他文档的 summary 合并。
2. 模型为 `entity/concept` 返回显式 `pageType` 和 `canonicalName`；服务端对 canonical name 做 Unicode NFKC、trim、连续空白合并和大小写规范化。
3. entity/concept 的 `pageKey = pageType + ':' + normalizedCanonicalName`；aliases 只用于展示和检索，不改变 identity，也不触发跨语言合并。
4. `index` 不由模型创建；Finalize 确定性生成一个全库首页和按 page type 的目录页，identity 来自固定系统 key。
5. 页面 ID 一经创建保持稳定；slug 由规范化名称加短 hash 生成，可独立调整。

### V1 不做语义自动合并

- 同名同类型按 pageKey 合并。
- 同名不同类型不合并。
- aliases 只用于展示、搜索和生成链接候选，不自动改变 pageKey。
- canonical name 变化时，新 key 形成新页面；旧页面在失去全部来源后归档。
- 模糊实体消歧、人工 merge/split 和 alias 冲突处理放到后续版本。

这个规则可能产生少量重复页面，但比错误合并两个业务实体更可恢复。

## 生成流水线

### 触发接缝

#### 文档处理完成

新增 `KnowledgeDocumentPublicationService`（或等价 CQRS command），由 `document.job.ts` 和 `plugins/knowledgebase/strategy.ts` 共同调用：

- `prepareMutation(documentId)` 在 destructive chunk diff 前持久化 Wiki mutation intent/失效边界。
- `finalizeProcessedDocument(...)` 接收最终 chunks/contentHash、processing/source hash 和调用上下文，在同一事务提交 `FINISH`、source lifecycle state 与 Wiki durable root job。
- `failDocumentMutation(...)` 根据旧 evidence 是否仍完整决定安全恢复或保持 stale，并让两条入口产生相同状态。
- Graph 的现有 enqueue 也移动到最终 `FINISH` 提交之后的 derived-index dispatch 阶段；Wiki 不复制两套 hook 顺序。

不能机械复制当前 GraphRAG 在最终状态更新之前直接 `queue.add()` 的位置。文档最终状态写入应形成明确的发布边界：

1. 在同一关系库事务内持久化文档最终 `FINISH`、最终 `contentHash` 和唯一的 `knowledge_wiki_index_job` queued 记录；该 durable job 同时承担 outbox 角色。
2. 事务提交后再调用 `queue.add('process', { jobId }, { jobId: jobKey, attempts, backoff })`。
3. 队列调用失败时保留 queued 记录并记录 dispatch error，由 reconciler 重投，不能把它降级成一条 warning。
4. consumer 加载 durable job 后再次校验：

- 文档仍为 finish。
- 文档仍 enabled 且不是 system-managed。
- 文档未软删除也未 hard-delete-pending，输入 chunks 仍属于该 active document。
- job/publication attempt 捕获的 `publicationEpoch` 仍匹配 document，并且发布前 CAS 再次成功。
- content hash 与 job 一致。
- source_map/page_reduce 需要知识库仍启用 Wiki；retract/安全清理即使 Wiki disabled 也允许执行。
- job revision 仍是当前 revision。
- config fingerprint 和 generator version 仍与 job 一致。

文档未变化时不创建 Wiki job。

#### 文档、chunk 更新与删除恢复

以下所有入口先通过 `knowledge_wiki_source_state` 判定是否为真实状态迁移；真实迁移在同一事务递增 lifecycle generation 并把它写入 durable job，重复请求复用当前事件。

Wiki disabled 只停止内容生成，不停止来源治理。只要知识库仍保留 Wiki snapshots，source update/disable/soft-delete/hard-delete 就必须更新 source state、同步 stale 受影响页面；retract cleanup 可以继续执行，Map/Reduce 延迟到重新启用后的 full rebuild。

Wiki enabled 但当前服务端计算的 target config/generator fingerprint 与 `wikiConfigFingerprint` active 值不同时，也不允许增量 Map/Reduce：

- source add/update/recover 只更新最新 source snapshot，将 `generationPending=true` 和 reason 记为 `target_fingerprint_mismatch`；update 还要同步 stale/隐藏受影响旧页面。
- source disable/soft-delete 执行 fail-closed 失效和确定性 cleanup，hard-delete 继续清除包含该源的 snapshots/projections；不创建会调用新旧任一 generator 的 `page_reduce`。
- `wikiStatus` 保持 `rebuild_required`，安全 cleanup 只在独立计数中显示，不被 source mutation 覆盖为 indexing/failed。授权用户显式触发 full rebuild 时从当前全部 eligible source snapshots 构建单一 staged corpus，成功 Finalize 后统一清除各 source state 的 generation-pending 标记。

这个 fence 禁止同一 active corpus 混用两个 generator/schema。incremental root 在创建和每个 worker 发布前都必须证明 `targetFingerprint === wikiConfigFingerprint`；不匹配时不入队或转 stale。

任一 source update、disable、soft delete 或 hard-delete acceptance 只要同步失效了普通 Wiki 页，就必须在同一事务中把当前 KB 的全部 active deterministic index pages/projections 置为 stale/disabled 并递增 projection epoch。index 没有 source evidence，不能等待血缘查询自然命中；后续 Finalize 只从当下 ready + active 页面确定性重建。V1 接受这个短暂可用性缺口，优先保证撤回内容不经 index 泄漏。

| 前一状态   | 当前状态                          | 动作                                                         |
| ---------- | --------------------------------- | ------------------------------------------------------------ |
| ineligible | eligible                          | fingerprint fence 通过则 source_map，否则 generation pending |
| eligible   | eligible + content hash changed   | 先失效旧投影；fence 通过则 source_map，否则 pending          |
| eligible   | ineligible                        | retract；fingerprint 不匹配时只做确定性失效/清理             |
| eligible   | eligible + content hash unchanged | 取消 mutation intent，不创建 generation job                  |
| ineligible | ineligible                        | 幂等 no-op                                                   |

eligibility 必须由显式字段计算，不能用文件名、标题或模型输出猜测。处理失败或 0 chunks 使来源暂时 ineligible 时也要 fail closed；后续重处理恢复后再产生新的 lifecycle generation。

- 内容重处理：在任何会 update/delete 旧 chunks 的 diff 前先持久化 mutation intent、捕获关联 page IDs，并把这些页面/投影及 deterministic index dependency closure 置为 stale/disabled。最终 hash 未变、旧 evidence 仍完整且期间没有更新 projection epoch 时，才用 CAS 取消 intent 并恢复原页/index 投影，不创建 generation job；hash 变化时递增 source generation，并在最终文档事务持久化新 job。若中途失败且旧 evidence 已受损，则保持 fail closed 并进入可观察恢复，而不是重新开放旧正文。
- 手工 chunk create/update/delete：统一经过一个生命周期 coordinator。在关系库事务中完成 chunk 变更、`refreshDocumentContentHash`、durable job；update/delete 还要先捕获受影响 page IDs 并把 active 页面/投影标为 stale/disabled。不能只刷新 hash 而不触发派生索引。
- disabled `false -> true`：同步撤回该文档贡献并重建受影响页面。
- disabled `true -> false`：文档 finish 且 chunks 有效、并且 target/active fingerprint fence 通过时重新 Map；否则只标记 generation pending。
- 软删除：先落实 `KnowledgeDocument.deletedAt` schema 和下述 Graph 属性贡献模型；随后在文档变为 deleted 之前执行同步的 `KnowledgeWikiPrepareDocumentRetractionCommand`，并在同一关系库状态迁移中使该源的 Graph contributions ineligible、重算共享 canonical 字段。提交后对 Wiki/Graph vectors 执行可重试清理/重投；在外部 cleanup 完成前，所有 Retriever 与 Graph 浏览 API 也必须通过 document `deletedAt`、canonical ready 状态和内容 fingerprint 立即 fail closed。
- 恢复：只有文档恢复且仍为 finish、enabled、chunks 有效时重新 Map，不能复活旧投影。Graph 同样从当前 chunks 重新 extraction/rebuild，不直接恢复已清理的 mentions。
- 当前通用 CRUD soft-delete/recover 不知道派生索引；实现必须在 document controller/service 覆盖这两个入口并调用同一 lifecycle coordinator，不能只依赖 entity subscriber 或前端调用顺序。
- 硬删除改为 deletion saga：`DELETE /knowledge-document/:id` 不再先调用 `packages/server-ai/src/knowledge-document/document.service.ts:2214-2227` 的 artifact 清理并立即删行。接受事务锁定 document/version，同时关闭 writer gate/递增 publication epoch，写入 `knowledge_document_deletion_intent`、`hardDeletePendingAt`、source lifecycle generation、受影响 ID manifest 和 durable retract root；并把 source lineage 命中页以及当前 KB 全部 active deterministic index page/status/projection 同步置为 stale/disabled，递增 projection epoch。如果该事务失败，不会进入任何删除状态。
- `hardDeletePendingAt` 一旦提交，原文档 chunks、Wiki 普通页/索引页/投影和 Graph 对象立即通过 typed eligibility scope fail closed。saga 先完成 publication-attempt quiescence，然后冻结 manifest 并在关系库收敛源血缘：删除该 source snapshot 的 Wiki map results/page contributions/evidence、Graph entity/relation contributions 和旧 mentions；对所有血缘命中的旧 page-reduce inputs，物理删除其全部 source payload/evidence rows 并只保留无内容 input tombstone；删除所有仍包含该来源的 retained active/staged/superseded/failed page-version 正文、贡献、证据、links，以及它们在 system-managed projection document 中的关系库 chunk 正文和外部向量；通过 `knowledge_wiki_model_invocation_source` 找到 Map 及混合多源 Reduce 调用，物理置空 structured output。审计 job/invocation/source-lineage 只保留 ID/hash/usage/billing/status/error 等有界元数据，不保留源正文或生成正文。
- deterministic index 不依赖 source evidence，因此单独按 source lineage purge 不够。接受事务先同步失效全部 active index versions；quiescence 后的物理 dependency-closure purge 则不限于 active，必须清理该 KB 所有 retained active/staged/superseded/failed index versions 的正文、links、关系 chunks 和向量 keys，最多保留无内容 ID/hash/status tombstone。最终 document delete 后的 Finalize 只从当下 `ready + active` 页面确定性重建 index。被删源的唯一页面标题和链接从收到 202 开始就不得在 index 列表、详情、Keyword 或 Vector 中出现，不依赖后续 cleanup/Reduce 是否成功。
- 共享 Wiki 页在删除旧 active version 前，把仅属于剩余 eligible sources 的 typed contributions/evidence 复制到独立的 immutable `knowledge_wiki_page_reduce_input`；它不是 page version，不含生成正文，也不能被页面 API 读取。只有 Wiki enabled 且 target/active fingerprint fence 一致时，才预建 `dispatchAfter = null` 的 page-reduce child，并在 document 最终删除后解锁，用当次删除请求捕获的有界 billing authorization 消费该 input 并创建安全新 page version；成功前页面持续不可读/不可检索。Wiki disabled 或 fingerprint 不一致时不调用模型，归档受影响页并保持 generation pending/rebuild-required，之后由 full rebuild 恢复。
- Graph 对象在同一 retract 阶段从剩余 contributions 确定性重算；旧 fingerprint 对象和 vectors 先不可读，然后删除该源 contribution，没有剩余来源/人工 overlay 的对象删除。新 Graph vector 可在最终删除后幂等发布，但 ready + fingerprint hydration 在此前必须拒绝旧文本。
- 关系血缘 purge 完成后，saga 以确定性 key 幂等清理原文档 RAG vectors、旧 Wiki/Graph vectors 和确认由该 document 独占的 parser/staging artifacts，每个 receipt 记录 artifact kind、exact object/vector key、所有权/引用检查结果和 provider outcome。V1 默认保留原始 `StorageFile`：它是非唯一 `ManyToOne`，还可被其他 `KnowledgeDocument`、`FileAsset` 等引用，不在本 saga 中因“看起来独占”而删除。若未来要删原文件，必须先有独立的 typed owner/ref-count 契约，并检查所有引用者。任一必需步骤失败都使 intent 为 failed、文档行继续存在且不可读；重试从缺失 receipt 继续，不反向恢复已清除内容。
- 只有上述必需步骤全部成功，最终关系库事务才删除 document/chunks/pages、幂等更新 `documentNum`、将 intent 转 completed，并解锁符合 enabled/fingerprint fence 的剩余源 Wiki/Graph 重建 job。整个过程中不存在“document row 已删但 retract failed”这个被误称为完成的状态。

GraphRAG 当前清理失败只写 warning；Wiki 包含可读的派生正文，删除一致性要求更严格，不能直接照搬该 best-effort 行为。

#### Graph 属性来源收敛前置条件

新增 `KnowledgeDocument.deletedAt` 会让原有 Graph 的来源混合缺陷从“没有可用路由”变成真实泄漏，因此 soft-delete foundation 必须同时修正 Graph 的 canonical 属性所有权。V1 选择按源贡献，不接受“删 mention 但保留最后一次合并字段”：

- 新增 `knowledge_graph_entity_contribution` 和 `knowledge_graph_relation_contribution`，按 tenant / organization / knowledgebase / source document snapshot / source content hash / normalized entity-or-relation key 保存 aliases、description、confidence/weight 等 typed extraction payload；唯一键保证同一来源快照只有一份贡献。
- Graph extraction 先原子替换该 document 的 contributions/mentions，再用全部 eligible source contributions 确定性聚合 canonical entity/relation。聚合器使用稳定规则计算 aliases、description、summary、confidence、weight 和 evidence count，不再把模型结果不可逆地 merge 到共享行。
- `manual/curated` 字段是用户权威 overlay，与 extracted aggregate 分开持久化并最后应用；删除源文档不删除人工内容，但也不能让无 provenance 的历史 extracted description 借 `curated` 留存。历史混合行必须经过一次全量 Graph rebuild 分解后才能开放 soft delete。
- disabled/soft-deleted/hard-delete-pending document 的贡献先变为 ineligible。在同一关系库收敛中，重算所有受影响共享对象：有剩余来源时只保留剩余贡献；没有来源的 extracted 对象删除，只有 manual overlay 的对象恢复为纯人工内容。关系库重算失败则阻止 soft-delete 状态迁移；hard delete 则保持 intent/document 为 pending，并在最终 document row 删除前物理删除该 source 的全部 Graph contributions，不保留 ineligible payload。
- 为 canonical entity/relation 增加显式 aggregate/content fingerprint 和 projection status/revision。Graph vector metadata 携带该 fingerprint；搜索命中后必须 hydrate canonical 行并核对 ready + fingerprint，因此外部向量清理延迟也不会返回旧 description/summary。新向量发布前，受影响对象的旧向量不可见。
- 恢复文档时必须从当前 chunks 重新 extraction 并写新 content-hash contribution，不把旧 contribution/mention 直接改为 eligible。

这个 Graph 贡献模型是开放 document soft-delete 的前置条件，不是 Wiki 生成本身的依赖；如果希望把它拆成独立交付，则 Wiki V1 在该交付上线前不得宣称支持 soft-delete/recover。

#### Wiki 配置、有效生成模型与生成器变化

- enabled `false -> true`：校验 Standard 类型以及 Wiki 专用模型或通用 LLM 权限；保留 snapshots 只用于显示“历史内容待重建”，不进入普通正文 API/检索。空库直接 ready 并无模型调用地记录当前 active config/generator fingerprint；有符合条件的来源时在配置事务中分配 staged revision 和 rebuild durable job，projection container 到成功切换时才重新 enabled。
- enabled `true -> false`：同步禁用所有投影、取消 staged revision，并让 queued/running worker 通过 enabled fence 收口为 cancelled；active snapshots 保留供授权浏览。
- 提取粒度、内容生成要求、提取重点或 effective model identity 变化：更新目标 config fingerprint 并启动非撤回式 staged full rebuild；Wiki enabled 时可以清空专用模型，但此时必须仍有可用的通用 LLM。
- generator/schema version 变化：rate-limited reconciler 查找 active fingerprint 不匹配的 enabled KB。没有 eligible sources/active generated pages 的空库可无模型调用地前移 active fingerprint 并保持 ready；其他库仅持久化 `wikiStatus=rebuild_required` 和 `wikiRebuildRequiredReason=generator_upgrade`，不创建会调用付费模型的 rebuild。有 write access 的用户从 status/config/rebuild API 显式触发时，重新校验有效生成模型权限并把该用户作为 billing principal 写入 root job；若部署发生在运行中 build 期间，旧 fingerprint job 转 stale，同样回到 `rebuild_required`。
- Wiki 配置命令、Wiki 专用模型和 `KnowledgebaseService` 的通用 LLM 更新路径必须共享同一个 transition service；不能依赖前端记得额外调用 rebuild API。

#### Knowledgebase hard delete

`KnowledgebaseService.delete()` 升级为 KB 级持久化 deletion saga，并返回 `202 KnowledgebaseDeletionReceipt`。接受事务关闭所有 document/Graph/Wiki writer gate、记录 tenant/organization/knowledgebase snapshot 和精确 external key manifest；worker 随后取消/收口 active jobs、禁用 projection container、物理清理全部 Wiki/Graph/RAG vectors 和 relationship chunks，最后才删除 pipeline 和 knowledgebase row。status/retry 以 deletion intent 自身的 scope、请求人和删除时权限快照为锚点，不能依赖最终会消失的 knowledgebase relation。清理失败时保留不可读的 pending/failed 管理态并从缺失 receipt 幂等重试；不能先删 knowledgebase 后留下失去权限锚点的外部向量。

### Durable job DAG

Reduce 由明确的 `page_reduce` worker 执行，Finalize 保持无 LLM：

```text
incremental source change:
  source_map(root) -> page_reduce(one per affected pageKey) -> finalize

reversible source retraction (disable / soft delete):
  retract(root)
    -> if Wiki enabled: page_reduce(one per affected pageKey) -> finalize
    -> if Wiki disabled: deterministic stale/purge cleanup -> finalize (no LLM)

hard delete:
  deletion_intent(root)
    -> fail_closed(source pages + all active index pages) + writer_quiescence
    -> lineage_purge + deterministic_index_dependency_purge(all retained versions)
    -> external_cleanup(receipted)
    -> final_document_delete
    -> remaining-source page_reduce / Graph projection + deterministic index finalize

full rebuild:
  rebuild(root)
    -> source_map(one per eligible source snapshot)
    -> page_reduce(one per normalized pageKey after every source_map succeeds)
    -> finalize
```

- job dependency、expected child count 和 current child IDs 全部持久化；worker 重启后由数据库 DAG 恢复，不能依赖进程内 Promise。
- `page_reduce` 是唯一调用 Reduce LLM 并创建 page version 的 job；其 key 包含 root job、pageKey hash、revision 和 config fingerprint。
- full rebuild 只有全部 source_map terminal-succeeded 后才创建 page_reduce children；任一 source 失败则 parent failed/staged revision 不发布，retry 后继续同一 DAG。
- finalize 只在当前 root 的全部 page_reduce candidate-ready 后运行，是唯一的指针切换 owner，负责确定性链接/index、CAS 发布和状态收口，不调用 LLM。
- disabled 下的 retract 不创建 page_reduce：soft-delete/disable 只 stale 并隐藏相关页面，hard delete 还在 document row 删除前清除含该来源的 snapshots/projections；重新启用时由 full rebuild 从现有 corpus 恢复。
- hard-delete root 的“删除完成”只聚合 lineage purge、external receipts 和最终 document transaction；不要求删除请求等待剩余来源的付费 Reduce/embedding。后者使用不含已删源内容的 candidate，在成功前页面/对象不可读；失败只影响剩余内容可用性，不会伪装成源删除失败或恢复已清除数据。
- 新 source lifecycle generation 会把旧 incremental root 及其未发布 descendants 标记 stale；staged corpus 变化则废弃整个 rebuild root 并分配更高 revision。

### Map：从源 chunks 提取贡献

1. 按有效 Wiki 生成模型（`wikiModel ?? chatModel`）的 context 和服务端上限批处理 chunks。
2. 每批要求结构化输出：`summary/entity/concept` 候选类型、canonical name、aliases、summary、facts、source chunk IDs 和建议链接；模型返回 `index` 候选视为 schema 错误，index 只由 Finalize 确定性生成。
3. source chunk 文本视为不可信数据，不允许覆盖系统输出 schema、权限、知识库 ID 或模型工具规则。
4. 丢弃指向本批不存在 chunk ID 的 fact；如果 Map 候选没有任何有效 evidence，则不保存。Finalize 生成的 index 页面只聚合 ready page links，不需要伪造 source evidence。
5. 合并同一 source job 内相同 pageKey 的候选，完整 Map 成功后在事务中一次性替换该 job 的 `knowledge_wiki_map_result`。
6. Map 失败时删除/忽略本 job 未完成的 map results，保留 active page version 的 contributions 和已发布页面，不产生半份新来源。

需要设置并测试有界上限：单批字符/token、单文档候选数、单页面 facts、aliases、links、quote 长度和结构化重试次数。具体数值在实现前用真实模型样例校准，不写成前端可绕过参数。

### Reduce：从全部贡献生成页面

1. incremental root 取“新 map result keys ∪ 该 source document 在 active versions 的旧 contribution keys”；full rebuild 等同 staged revision 的全部 source_map jobs 成功后，再按 normalized pageKey 分组。
2. incremental 对每个 key 复制 active version 中其他仍有效来源的 contributions，并以本 job map result 替换当前来源；retract 则移除当前来源。full rebuild 只使用 staged revision 的 map results，不混入上一 revision。
3. 只将上述 typed contribution set 和必要 source snippets 交给模型。
4. 生成标题、摘要和 Markdown 内容；每个事实段至少保留一个可验证 evidence。
5. 对正文、证据和链接做长度、引用和同库校验。
6. 在关系库事务中写入新的 immutable page version、对应 contributions、evidence 和 links，同时记录生成输入时的 page `VersionColumn` 作为 `expectedPageVersion`；暂不交换 `activeVersionId`。
7. 为该 version 写搜索投影；投影成功后只标记为 candidate-ready，在 Finalize 之前页面 API 和 Retriever 仍不能把它当作 active。

### Finalize：确定性收口

Finalize 不再次调用 LLM：

- 生成确定性的 index page version 及页面类型分组，并用同一 projection writer 写其 embedding；不调用生成式 LLM。输入仅限当下 `page.status=ready` 且 `activeVersionId` 指向 ready/projection-ready 的页，不读 stale、hard-delete-affected、只有 reduce input 或只有未发布 candidate version 的页。
- 解析建议链接到真实 page ID。
- 计算出链、反链和 dead links。
- 对已无来源页面归档。
- 验证待发布 page versions、关系 chunks 和向量全部 candidate-ready，并用每个 candidate 记录的 `expectedPageVersion` 做 CAS；增量任务在一个事务中交换受影响页面指针，full rebuild 在一个事务中交换 staged revision 的全部页面指针，任一 CAS 失败都是全部不切换。
- CAS 冲突时，Finalize 把自己退回 `queued`，把冲突页面的 candidate 和未激活投影标记 stale。普通页对同一 logical `page_reduce` child 执行受控收敛重试：递增 `generationAttempt`、将旧 immutable reduce input 置 stale，用其中仍有效的 sources 和最新 map results/current contributions 创建新 input，再创建新 model invocation 和 page version；由 Finalize 自身生成的 index page 则在下一个 Finalize generation attempt 中重新读取 ready page set 并确定性生成。所有 candidate 重新 ready 后才再运行发布；超过有界 convergence attempts 则 root 明确 failed，不允许部分发布或永久 indexing。
- 更新知识库 page/job 聚合状态。
- hard-delete 的最终 document transaction 后先可发布一个只包含其他当前 ready pages 的确定性 index，不等待付费 page-reduce；剩余源 candidate 之后转 ready 时再触发新的 index finalize。两次都使用新 version/projection 和 CAS，绝不重新启用删除接受前的 index version。

模型只能建议链接目标；最终链接必须由服务端用同库 pageKey 解析。

## 幂等、并发与失败恢复

### Revision fence

- full rebuild 在事务中递增 high-water `wikiRevision` 并把新值写入 `wikiStagedRevision`，但在全部成功前不修改 `wikiActiveRevision`。
- source_map/retract root 记录创建时 revision、source lifecycle generation、source content hash、config fingerprint 和 generator version。
- consumer 在开始、Map 完成、Reduce 发布和 projection 发布前执行按 job type 区分的 fence：rebuild descendants 必须匹配当前 staged root/revision；incremental descendants 必须匹配 active revision、`source_state.lifecycleGeneration` 和 `desiredRootJobId`；只比较 revision 不足以淘汰旧增量任务。
- revision 或输入快照不再匹配的旧 job 标记 `stale`；用户停用或显式取消的 job 标记 `cancelled`，两者都不允许覆盖新页面。
- 非撤回式 full rebuild 写入 staged revision；Finalize、页面和全部投影成功后才切换 active revision，不能先清空当前 ready revision。
- staged full rebuild 期间任何源文档 hash/资格变化都会让该 staged revision 失效；只有当原授权 root 的受控 generation/spend envelope 仍允许时，才可以沿用同一 billing authorization 调度基于最新 corpus 的新 revision，并为新输入创建新 model invocations。超限则停在 `rebuild_required`、保留 generation-pending 标记并要求用户再次确认；不能让旧 corpus 的“完整重建”覆盖期间产生的增量结果。
- 源更新、停用、软删除或硬删除属于失效事件，受影响旧投影必须立即 disable；这里不为可用性保留已撤回内容。

### Job 去重

建议按 DAG 节点构造 job key：

```text
root:       wiki:{kb}:root:{type}:{revision}:{document-or-all}:{sourceGeneration-or-none}:{hash-or-none}:{configFingerprint}
source_map: wiki:{kb}:{rootJobId}:map:{documentId}:{sourceGeneration}:{hash}
page_reduce:wiki:{kb}:{rootJobId}:reduce:{pageKeyHash}:{configFingerprint}
finalize:   wiki:{kb}:{rootJobId}:finalize
```

- 同一业务事件重复 enqueue 返回已有 job；相同 hash 的 disable/recover/再次 disable 因 lifecycle generation 不同而形成新 key。
- 同输入的 failed/lease retry 复用同一持久化 job 并递增 `executionAttempt`，不创建重复贡献或新模型调用；输入已改变时递增 `generationAttempt`，不把它伪装成基础设施 retry。
- Finalize CAS 冲突是唯一允许把已 candidate-ready/succeeded 的 `page_reduce` 逻辑节点重新置为 queued 的状态迁移；在同一事务递增 `generationAttempt`、置旧 candidate stale，root 的 current child ID 不变。dispatcher 按 DB 状态移除或重建已 completed 的同 key Bull 记录，不把旧 success 当作 DAG 已收口。
- 同一 document 同 revision 只允许一个 active Map job。
- full rebuild 与增量 job 冲突时，以更高 revision 为准，旧输入任务标记 stale。

### 同页面并发收敛

两个文档可能同时贡献同一 pageKey。不能在 LLM Reduce 期间长期持有数据库锁，也不能让“最后写入者”覆盖另一个来源：

1. page-reduce child 创建事务短暂锁定 canonical page，读取 `VersionColumn`、当前有效 contributions/map results，并持久化完整 immutable reduce input 和 `expectedPageVersion`。
2. `page_reduce` worker 在事务外只消费该 input 完成 Reduce 和投影 staging，并创建新 page version；它不重读 active version、不改写 input/version，也不发布指针。
3. 唯一的 Finalize 发布事务用每个 candidate 的预期 `VersionColumn` 做 compare-and-swap，并在交换 `activeVersionId` 前重新验证 source hash/revision/fingerprint。full rebuild 对全部指针 all-or-nothing。
4. 任一 CAS 冲突时都不发布该 root 的任何候选指针；Finalize 按上述受控收敛重试把冲突 child 重新排队，为新 generation attempt 构造新 immutable input 后再次尝试。hard-delete 场景从保留的剩余源 input 行而不是已删 active version 继续。

这样同一 pageKey 不需要跨模型调用持锁，同时不会丢掉并发到达的来源贡献。

### Lease、补偿与状态聚合

- worker 获取 job 时写入 `lockedAt` / `leaseExpiresAt`，长阶段周期性更新 heartbeat；只有持有当前 lease 的 worker 可以提交状态。
- reconciler 只处理 `dispatchAfter <= now` 的 queued-but-not-dispatched 和 lease 已过期的 running job；`dispatchAfter = null` 的删除准备任务保持 blocked。在 execution attempts 未耗尽时重投，耗尽后才标记 failed；它不自动打开 indeterminate model invocation 的新 generation attempt。
- Bull job 使用 deterministic `jobId = jobKey`、有界 execution attempts 和指数 backoff；consumer 仍以数据库 job/invocation 状态为权威，不能以 Bull 历史记录替代领域状态。
- dispatcher 遇到同 key 的 active Bull job 时复用；DB retry 对应 failed Bull job 时调用受控 retry，若 Bull 显示 completed 但 DB 未 succeeded，则按不一致补偿流程移除该队列记录后重投。completed/failed 队列历史采用有限 retention，长期审计只看数据库 job。
- 知识库状态聚合“current desired-job set”，而不是 revision 下的全部历史：有 staged rebuild 时取当前 rebuild root 及其 current descendants；无 staged rebuild 时，只对 `eligible=true` 或 `cleanupPending=true` 的 source states 去重聚合其 `desiredRootJobId` current tree。full rebuild promote 在同一事务把 eligible snapshot 的 states 指向成功 rebuild root，并把已由新 corpus 淘汰干净的 ineligible states 标为 `cleanupPending=false`；被新 generation/full rebuild 取代的 failed job 只保留审计。
- target/active fingerprint 不匹配且尚无授权 staged root 时，`rebuild_required` 对普通 source job 聚合具有状态优先级；只运行安全失效/清理并以独立计数暴露，不得让它们把状态改成 indexing。
- `indexing` 且没有 queued/running job、或 running lease 过期，必须由 reconciler 收敛到 retry/failed，不能永久悬挂。

### 跨 PostgreSQL / Vector Store 一致性

不存在跨两个存储的原子事务。Wiki 投影复用 FAQ 已验证过的思路：

1. 生成确定性的逻辑 section ID 和物理 vector ID。
2. 新投影先记录为 pending / disabled。
3. 写入关系 chunk 与向量。
4. 全部成功后只把新 version/projection 标记为 candidate-ready，旧 active 向量仍保留。
5. Finalize 通过 CAS 切换关系库指针；Retriever 以 active pointer 判定哪组 candidate-ready 向量可见。
6. 指针切换后异步清理上一版关系 chunk/向量；在清理窗口依靠 active-version filter 排除它们。
7. 任一步失败都补偿本次未激活的 staging；补偿失败单独记录，不覆盖主错误，也不删除仍安全的旧 active 投影。
8. candidate/root 标记 failed；若旧 active 页仍安全则 canonical page 保持 ready/availability degraded，若属于源撤回则仍 fail closed。手动 rebuild 可恢复。

源文档失效场景必须先禁用旧投影；宁可暂时少召回，也不能继续返回已撤回内容。

非撤回式 staged rebuild 的物理 relation/vector ID 必须包含 generation revision，避免写入新版本时覆盖当前 ready 版本；Retriever 只 hydrate active revision 且 projection ready 的记录。切换 active revision 后再异步清理上一版物理投影，逻辑 citation 仍使用稳定的 page/section ID。

### Embedding collection rebuild 互锁

现有 `KnowledgebaseService.processEmbeddingRebuildJob()` 会遍历知识库全部 relation chunks 并默认一个 chunk 对应一个 vector ID。Wiki 必须接入这个既有 active/pending collection 生命周期：

- 新增纯函数 `buildWikiVectorWritesFromMetadata()`，与 FAQ builder 一样由日常 Wiki projection writer 和 embedding rebuild 共用；它按目标 embedding context 拆分一个逻辑 section，生成稳定的 segment key，再由现有 collection-scoped ID builder生成物理 ID。
- embedding rebuild 对普通/FAQ chunks 保持现有业务语义但显式排除 soft-deleted source documents；对 `contentKind=wiki` 只选择 enabled projection container、canonical page 当前 `activeVersionId` 且 page/version/projection ready 的 chunks，明确排除 staged、failed、stale 和 superseded versions。
- embedding rebuild job 捕获 `projection_state.projectionEpoch`、pending embedding revision/fingerprint；promote 前再次校验。epoch 变化说明期间有 Wiki source invalidation 或 active pointer 变化，本次 pending collection 不完整，必须进入 embedding 子系统自身的 stale / `REBUILD_REQUIRED` 并从最新 active set 重试，不能直接 promote；这与 Wiki generator 的 `wikiStatus=rebuild_required` 是两个独立状态机。
- embedding rebuild 启动与 Wiki page projection publish 使用同一个 KB-scoped 短事务/advisory lock。Embedding 状态进入 `REBUILDING` 后，新的 page_reduce 可以完成正文但 projection/pointer publish 保持 queued；已有 publisher 先完成或退出，避免 active/pending collection 交叉写入。
- source invalidation/retract 不被该锁长期阻塞：它仍同步把页面置 stale、递增 projection epoch 并 fail closed；这会让正在运行的 embedding rebuild 在 promote fence 处安全失效。
- embedding promote 完成后唤醒等待的 Wiki projection jobs，它们重新读取 active embedding revision/fingerprint 后投影；不得使用入队时已经过期的 embedding model。
- embedding rebuild 进入 failed、cancelled 或 stale 等任一 terminal 状态时也必须在 finally 路径释放 publish gate 并唤醒等待者：若旧 active collection 仍健康，Wiki job 重新读取它的 revision/fingerprint 后继续投影；若没有任何健康 active collection，则该 projection/root 以明确 terminal failure 收口。reconciler 要重投“仍 queued 但 embedding 已不是 REBUILDING”的等待任务，不允许它们永久 indexing。
- 切换 embedding model只重建 active Wiki vectors，不触发 Wiki Map/Reduce 或 wiki revision。关系 chunk 的 embedding metadata 只在对应向量确实写入并随 collection promote 后更新，不能把 inactive Wiki chunks 批量标成新 revision。

因此 Wiki job 的内容 fence（wiki revision/hash/config）与投影 fence（embedding revision/fingerprint/projection epoch）是两层独立契约。

### 文档主流程隔离

- Wiki 是派生异步能力，模型生成失败不能把已经成功的 RAG 文档改成 ERROR。
- enqueue/dispatch 失败不能只写日志；必须保留 queued job、`dispatchError` 和 `wikiStatus=indexing`，由 reconciler 重投。只有有界 dispatch attempts/age 耗尽后才把当前 job/build 标记 failed；availability 仍由 active 页面独立计算。
- 文档删除属于例外：若无法先安全撤回 Wiki，则阻止删除，以保证不存在删除后的派生泄漏。

## 搜索投影与检索

### System-managed projection document

每个启用 Wiki 的知识库创建一个内部文档：

```ts
{
  sourceKey: 'system:wiki-projection',
  metadata: {
    systemManaged: true,
    systemManagedType: 'wiki-projection'
  }
}
```

它只是 chunk / vector 的技术容器：

- 不计入 `documentNum`。
- 不出现在标准文档列表、下载、移动、重处理或删除操作中。
- 不能成为 Wiki Map 的源文档。
- 普通文档 preview/download、process/reprocess、move、update、soft/hard delete 和全部 chunk CRUD 都不允许读取或修改。
- 现有 Graph rebuild/subscriber、Wiki rebuild 和未来通用派生处理器都必须按 typed `systemManaged` discriminator 排除它，防止派生内容递归进入 Graph 或 Wiki。

`knowledge_wiki_projection_state` 的 unique knowledgebase/document 约束保证并发 enable/rebuild 不会创建两个容器。当前标准文档分页只在下载等局部操作中识别 system-managed document，不能靠客户端拿到一页后再过滤，否则 total、分页和首选项都会错误。实施时应在服务端用户文档列表查询边界默认排除 `metadata.systemManaged = true`，内部服务显式请求时才能包含。

### 页面分块

- canonical page 可以按标题 section 生成多个逻辑搜索 chunk。
- 逻辑 section ID 由 `wikiPageId + sectionAnchor` 确定，不能由正文随机生成。
- 超出 embedding context 时允许继续拆为物理向量，但 `metadata.chunkId` 回到逻辑 section。
- Vector / RRF 汇总后，每个 Wiki page 最多保留最高排名的一个 section，避免一个长页面占满 Top K。
- Keyword 搜索正文包含页面 title、aliases、heading 和 section body。
- 返回 Agent 的 `pageContent` 包含页面标题、当前 section 和必要上下文，但不复制完整 evidence JSON。

### 复用现有 pipeline

Wiki chunk 仍走：

```text
Vector / Keyword candidates
  -> existing Fusion
  -> existing rerank
  -> existing threshold / global Top K
  -> existing Document[]
```

约束：

- `contentKind = wiki` 是候选内容类型，不是 Retriever source。
- Keyword 原始 SQL、PGVector 查询、其他 Vector Store 查询和命中后的 chunk hydration 都必须显式约束 source document `deletedAt IS NULL AND hardDeletePendingAt IS NULL`；不能假设 ORM 默认 scope 会覆盖手写 SQL。V1 不为 chunk 增加软删除列，chunk hard delete/update 由生命周期 coordinator 处理。
- Graph seed、relation evidence 和 scoped chunk SQL 必须在每个 document join 上显式增加 `d.deletedAt IS NULL AND d.hardDeletePendingAt IS NULL`。`GraphragService` 的 entity/relation 列表、详情、mentions、chunks 和统计也要复用同一 eligible-source + canonical-ready scope：软删除或 hard-delete-pending document 的 mentions 不返回、不计数，canonical 属性只从剩余 eligible contributions 重算；没有剩余贡献的 extracted entity/relation 隐藏/删除，manual/curated overlay 可保留，但不携带已删来源的生成字段、mention 或 chunk。Graph vector 命中还必须 hydrate 并比对 canonical content fingerprint；后台物理清理不是读边界安全的唯一保障。
- Keyword/PGVector 能联表时，在 candidate SQL 就约束 `page.activeVersionId = chunk.metadata.wikiPageVersionId` 和 ready statuses。
- Milvus 等不能联表的 Vector Store 必须在进入 Fusion 前 hydrate 并剔除 inactive page versions，再做有界迭代 over-fetch 直到补足候选预算或达到上限；不能只取一次 Top K 后过滤，否则旧版本向量会挤掉有效结果。记录 stale-candidate ratio/underfill diagnostics，并给切换后的旧向量清理设置 SLO。
- 不修改 Vector / Keyword 原始 score 语义。
- 不增加固定 Wiki boost。
- 非 Wiki 文档的过滤、排序、diagnostics 和 citation 形状保持不变。
- 可以新增 `wikiHitCount` / `wikiSkippedReason` 诊断，但不得覆盖现有字段。

### Knowledge Filter V2 边界

一个 Wiki 页面可能同时聚合 HR 和 Finance 两个源文档。查询若固定过滤到 HR，仅验证“至少一个来源在 HR”仍会把页面中的 Finance 内容带回，属于过滤绕过。

V1 规则：

- prepared effective filter 为空：允许 Wiki 投影参与 Vector / Keyword。
- fixed、request 或 dynamic 任一有效过滤条件存在：Retriever 显式排除 `contentKind = wiki`，只搜索原始文档/FAQ，并记录 `wikiSkippedReason = 'active_filter'`。
- 不依赖 system-managed document 恰好不匹配某个 filter 的偶然行为。
- 后续若要支持 filtered Wiki，需要按 evidence 范围动态裁剪内容并重新构造引用，单独设计。

## 引用协议

### 服务端

扩展 `KnowledgebaseCitation`：

```ts
wikiPageId?: string
wikiSectionAnchor?: string
```

新增 URL：

```text
xpert://knowledgebase/wiki?knowledgebaseId={kbId}&wikiPageId={pageId}&section={anchor}
```

先把 metadata 收窄成 FAQ、Wiki、普通 chunk 的 discriminated union，再做 exhaustive URL 分派：显式 Wiki 走 Wiki，显式 FAQ 走 FAQ，其余才走普通 chunk；冲突 discriminator 直接拒绝，不能靠字段检查顺序猜测。Wiki citation 点击后先定位 Wiki 页面；页面右侧 evidence 再定位原始文档 chunk，形成两级可审计链路。

### Cloud / ChatKit 消费者

以下链路都必须支持 `wikiPageId`，不能只修改服务端 formatter：

- `apps/cloud/src/app/features/assistant/knowledgebase-citation-effect.ts`。
- `apps/cloud/src/app/features/xpert/assistant-shell/assistant.facade.ts`。
- `apps/cloud/src/app/features/chat/clawxpert/clawxpert-conversation-detail.component.ts`。
- `packages/server-ai/src/knowledgebase/plugins/knowledge-workbench/knowledge-workbench.service.ts`。
- `packages/server-ai/src/knowledgebase/plugins/knowledge-workbench/knowledge-workbench.middleware.ts`，序列化 effect 时保留 Wiki 字段。
- `packages/server-ai/src/knowledgebase/plugins/knowledge-workbench/remote-components/knowledge-workbench/src/{types,utils,main}.ts*`，识别并打开 Wiki target。

服务端 formatter、Workbench 和中间件目前存在相邻的 citation 映射责任；实施时提取或复用一个 typed citation builder，避免多条链路分别猜测 metadata 和 URL。remote component 的构建产物通过现有构建流程生成，不手改 `app.js`。

目标路由：

```text
/xpert/knowledges/:knowledgebaseId/wiki?wikiPageId=:wikiPageId&section=:anchor
```

不存在、已归档或无权限页面只显示可恢复提示，不能破坏已经加载的对话或 Wiki 列表。现有 FAQ/chunk 引用行为必须保持不变。

## API 设计

所有路由都嵌套在 knowledgebase ID 下：

| Method | Route                                       | 行为                                                      |
| ------ | ------------------------------------------- | --------------------------------------------------------- |
| `PUT`  | `/knowledgebase/:id/wiki/config`            | 更新 enabled / granularity 并执行状态迁移                 |
| `GET`  | `/knowledgebase/:id/wiki/status`            | 状态、revision、页面数、任务数、错误                      |
| `POST` | `/knowledgebase/:id/wiki/rebuild`           | 创建或复用 full rebuild                                   |
| `POST` | `/knowledgebase/:id/wiki/jobs/:jobId/retry` | 重试 current failed job；indeterminate 需显式确认额外调用 |
| `GET`  | `/knowledgebase/:id/wiki/pages`             | 分页、搜索、pageType/status 筛选                          |
| `GET`  | `/knowledgebase/:id/wiki/pages/:pageId`     | 页面正文、links/backlinks、evidence                       |

### API 约束

- ID 使用 UUID pipe；query DTO 限制 skip/take、search 长度和 enum。
- service 首先加载知识库并验证类型和 read/write 权限。
- page 查询同时约束 tenant、organization、knowledgebase 和 page ID；不能先按 page ID 查询再相信 relation。
- 配置与 rebuild 需要 write access；页面和 reader status summary 需要 read access。reader summary 只包含 enabled、availability、页面计数和用户可理解错误；job ID、invocation、billing recovery action、额外费用确认和内部失败阶段只对 write access 用户返回。
- document-deletion list/status/retry 全部要求 knowledgebase write access，并限制 tenant/organization/KB；它们是管理恢复面，不是向普通 read-only 访问者暴露历史 document IDs 的审计 API。
- `KnowledgebaseDetailDTO` 由服务端按当前请求主体计算只读 capability `canManageDocumentDeletions`，它不是客户端可回传的持久化设置。Cloud 只在该 capability 为 true 时请求 deletion-intent discovery；若权限在 detail 后变化导致 discovery 403，只关闭管理 overlay，不影响普通 document list、不弹出误导的页面级错误。
- `rebuild` 在 indexing 中返回已有 active job/status，不创建风暴。
- job retry 只接受 status recovery action 明确给出的、所属当前 knowledgebase/current desired tree 的 failed `jobId`；reconciling/pending 时拒绝 retry。普通 execution failure 可复用同 generation invocation；存在最终 indeterminate invocation 时 body 必须显式提交 `confirmAdditionalModelCharge: true`，服务端写审计事件并创建新 generation attempt/request ID。输入/fingerprint 已过期时该 action 为 full rebuild，服务端拒绝局部 retry。
- V1 没有页面 create/update/delete endpoint。
- reader status response 包含 enabled、build `wikiStatus`、派生 availability、ready page count、是否需要管理员处理和用户可理解错误。write-access management view 才额外包含 active/staged revision、active/target config fingerprint、`wikiRebuildRequiredReason`、queued/running/failed generation job count、indeterminate invocation 和 billing-recovery 计数、disabled-mode cleanup pending/failed count、stale/failed/projection-failed page count、最近有限数量任务，以及每个当前 reconciling/indeterminate invocation 的 `KnowledgeWikiRecoveryAction`；历史 revision 失败只用于审计。
- 详情接口 `KnowledgebaseDetailDTO` 暴露 Wiki 配置/状态；public list DTO 不因为编辑器缺字段而扩大成完整设置 DTO。

### 文档硬删除状态契约

为了让跨存储删除的“已接受”与“已完成”可区分，现有文档删除入口一并升级：

| Method   | Route                                                   | 行为                                                                      |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `DELETE` | `/knowledge-document/:id?version=...`                   | 接受或复用 deletion intent，返回 `202 KnowledgeDocumentDeletionReceipt`   |
| `DELETE` | `/knowledge-document/bulk`                              | 每个文档返回独立 receipt；不把部分接受冒充成全部删除完成                  |
| `GET`    | `/knowledgebase/:id/document-deletions`                 | 有界分页查询 active/failed/recent completed intents，用于刷新后恢复管理态 |
| `GET`    | `/knowledgebase/:id/document-deletions/:intentId`       | 读取 pending/running/failed/completed、步骤和 typed recovery action       |
| `POST`   | `/knowledgebase/:id/document-deletions/:intentId/retry` | 仅对属于当前 KB 的 failed intent 从缺失 receipt 处幂等继续                |

`KnowledgeDocumentDeletionReceipt` 至少包含 `intentId`、`documentId`、`status`、`acceptedAt`、`completedAt`、`failedStage`、可翻译 error code 和 `canRetry`。status/list/retry 以 intent 保存的 tenant/organization/knowledgebase 为权限锚点，不依赖可能已删除的 document relation。list DTO 对 status、skip/take 和 recent-completed 时间窗设上限；只在 pending/failed document row 仍存在时，可向 write-access 管理者返回有界的展示名，completed tombstone 不持久化名称/路径/正文。前端在 completed 前显示“正在删除”，failed 时保留基于 intent ID 的重试入口；不再收到 202 就从用户心智中宣称物理删除已完成。

### Knowledgebase 硬删除状态契约

| Method   | Route                                      | 行为                                                                   |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `DELETE` | `/knowledgebase/:id?version=...`           | 接受或复用 KB deletion intent，返回 `202 KnowledgebaseDeletionReceipt` |
| `GET`    | `/knowledgebase-deletions/:intentId`       | 按删除时 scope/请求人权限读取步骤、状态和 recovery action              |
| `POST`   | `/knowledgebase-deletions/:intentId/retry` | failed intent 从缺失的 cleanup receipt 继续                            |

`KnowledgebaseDeletionReceipt` 至少包含 `intentId`、`knowledgebaseIdSnapshot`、`status`、`acceptedAt`、`completedAt`、`failedStage`、可翻译 error code 和 `canRetry`。接受后知识库立即从普通读取、写入和 Agent 检索中 fail closed；进入 purge 后不可取消。完成后原 knowledgebase row 可以不存在，因此 status/retry 只依赖 intent 保存的 tenant/organization、请求人和删除时授权快照，不先加载 knowledgebase row。现有 Cloud、Workflow、plugin runtime 等一方调用方必须先升级为理解 202；若发布前发现无法协调的第三方同步完成合同，则提供版本化迁移，不能静默破坏。

## 前端实施

### 创建与配置

删除当前互斥的 `indexStrategy` 死状态，将区块改为“索引能力”：

- RAG 显示为标准知识库的现有基础能力，不新增关闭开关。
- Wiki 使用 Standard-only 的真实开关；启用后显示提取粒度、Wiki 内容生成要求和 Wiki 提取重点。
- 模型配置增加可选 Wiki 合成模型；未选择时明确提示回退使用 `LLM 大语言模型`。
- FAQ / External 隐藏 Wiki 配置。
- 启用 Wiki 但专用模型和通用 LLM 都没有时，表单阻止保存并定位到模型/Wiki 配置，显示翻译后的可执行错误。
- 非空知识库启用 Wiki，或修改有效模型/三项 Wiki 生成配置导致付费全量重建时，保存前显示 eligible 文档数、费用说明和有界预算；用户确认后才提交会创建 rebuild 的命令。空库启用不显示付费确认。
- 使用 `z-form`、`z-switch`、`z-select`、`z-input` 等既有组件和 Tailwind；不新增 SCSS。

建议提取可复用的 `KnowledgeWikiSettingsComponent`，供创建 dialog 和详情 configuration 共用，避免两套默认值和校验逐渐分叉。

### 所有入口必须一致

需要覆盖：

- workspace 知识库列表创建/编辑。
- workspace 知识库页面创建/编辑。
- 知识库详情 header 设置 dialog。
- personal/team knowledge workbench quick-create 和 `/configuration`。

当前 workspace 列表传给编辑 dialog 的是 `KnowledgebasePublicDTO` 局部对象。实施时编辑前必须调用 `KnowledgebaseService.getDetail(id)`，不能用缺失字段的 list item 初始化完整表单，否则 Wiki、模型或 recall 会被默认值覆盖。

当前 legacy configuration 使用 `omit(model, 'id')` 回传大对象。触碰该路径时必须改成显式 update allowlist；read-only 的 `wikiStatus`、revision、error、job/count 字段不得回传。

personal knowledge workbench 的 quick-create 当前只提交 name / permission / workspaceId。V1 确认统一打开完整创建 dialog，并预填原 permission，使用户在所有实际创建入口都能得到相同 Wiki 能力，而不是制造一个隐式永远关闭 Wiki 的入口。

### 文档删除体验

- `KnowledgeDocumentService` 和所有单删/批量删除调用点改为消费 typed deletion receipt；接口返回 202 后显示“正在删除”并按 intent ID 轮询，不立即显示成功 toast。页面初始化与路由重进时，只有服务端 detail 的 `canManageDocumentDeletions=true` 才按 knowledgebase ID 加载 active/failed deletion-intent 分页，并与普通 document page 按 `documentId` 合并成管理态 overlay；intent ID 不能只放在当前组件内存。
- hard-delete-pending 文档不能预览、搜索、处理、移动、编辑或再次创建删除 intent；管理列表可以显示一条有界的“删除中/删除失败”管理态记录，但不得通过该行返回原文正文、chunks 或预览 URL。
- failed receipt 只在 `canRetry=true` 时显示重试，重试使用 intent endpoint，不使用缓存的旧 document version 重发 DELETE。completed 后才从管理列表移除记录并刷新 document count。
- bulk delete 以每个 receipt 为独立状态；某一 intent 失败不把其他文档的 completed 回滚，也不显示一个模糊的“全部成功”。
- intent discovery 和 document list 必须是两个独立的加载/错误边界；管理 capability 为 true 时它们都是有限 HTTP 请求，可用 async/await + `Promise.allSettled` 并行，但 discovery 403/失败不能拒绝普通列表 promise 或弹页面级 error toast；不对会持续 emit 的 organization/store stream 盲用 `forkJoin`。轮询在离开页面时取消，重进靠 discovery API 恢复而不靠内存 subscription。只读用户始终可以加载普通文档，不请求/不显示 intent 和 retry。

### Wiki 浏览器

新增：

```text
apps/cloud/src/app/features/xpert/knowledge/knowledgebase/wiki/
  wiki.component.ts
  wiki.component.html
  wiki.component.spec.ts
```

布局：

- 左侧：搜索、page type 筛选、状态、页面列表。
- 中间：标题、摘要、经过 sanitizer 的 Markdown 正文、内部链接。
- 右侧或响应式 drawer：原始来源、证据片段、反链。

必须有独立状态：

- Wiki disabled + 启用 CTA。
- indexing + 进度和禁止重复 rebuild。
- rebuild required：显示 generator 升级原因和“授权重建”CTA，不伪装成后台已在调用模型。
- failed + unavailable：初次构建无可用页面，显示翻译后的错误和 retry。
- failed + ready/degraded：保留安全的上一 active 版本供浏览，同时显示“最新重建失败”、错误和 retry。
- reconciling/indeterminate model invocation：前端只按 `KnowledgeWikiRecoveryAction` 渲染。`recommendedAction=wait` 时显示正在对账且禁用 retry；最终 indeterminate 时显示“provider 可能已计费”，并只对 `canRetry=true` 的明确 `jobId` 调用 retry API。`requiresAdditionalChargeConfirmation=true` 时必须经 write-access 用户确认并发送 `confirmAdditionalModelCharge: true`；`recommendedAction=full_rebuild` 则不发局部 retry。
- ready 但 0 pages。
- ready + list loading / empty filter / no selection。
- deep link page 不存在或无权限。

模型生成 Markdown 必须保持 sanitizer 开启；页面标题、slug 和 aliases 不能作为 HTML 注入。不要使用嵌套 Card 组织页面，优先标题/分隔线、Tabs 或 Accordion。

### 路由与导航

- 在 `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/routing.ts` 增加 `path: 'wiki'`。
- 标准知识库显示 Wiki tab；disabled 时进入说明/启用态。
- FAQ / External 不显示 tab，直接访问仍由 API 类型和权限校验 fail closed。
- `getKnowledgebaseDefaultRoute()` 继续让 Standard 默认进入 documents，不因 Wiki enabled 改变。
- 页面选择写入 `wikiPageId` / `section` query params，并保留 `returnTo`。
- 异步列表和页面详情请求使用 request version 或等价取消机制，旧响应不能覆盖新选择。

### Client service

新增 `apps/cloud/src/app/@core/services/knowledge-wiki.service.ts` 并从 barrel 导出，负责 pages/status/rebuild/config。所有 URL 显式携带 knowledgebase ID；有限 HTTP 请求可通过 `firstValueFrom` 配合 async/await 使用。

## 权限与安全

- 继承现有知识库 read/write 权限，不新增页面级 ACL。
- 所有实体写入的 tenant / organization / knowledgebase 来自已授权 knowledgebase，不接受客户端覆盖。
- 所有 job 重新恢复并验证 request context；不能只相信 queue payload 中的 organizationId。
- 源 chunk 是 prompt data，不是 instruction；系统 schema、输出格式和权限约束不可被源文档文本覆盖。
- 模型输出必须做长度、enum、UUID、同库引用和 evidence 存在性校验。
- API 对 search、pagination、数组数量和 Markdown 大小设上限。
- 日志不记录完整源正文、生成正文、provider key 或大块模型原始输出。
- Wiki 页面渲染始终 sanitize；内部链接只允许明确的 page ID/slug，不执行任意 scheme。
- 文档/页面被 disabled 或删除后，旧搜索投影必须 fail closed。
- 带 Knowledge Filter V2 时跳过聚合 Wiki 投影，避免治理边界泄漏。

## 模型调用与计费

- 运行期解析 `wikiModel ?? chatModel`；专用模型为空时不复制通用 LLM 到 `wikiModelId`，确保后续通用 LLM 变化仍能正确改变 effective identity 和 config fingerprint。
- Map / Reduce 均通过 `knowledge_wiki_model_invocation` 记录模型、provider、model access、token usage、job/generation attempt、阶段、call ordinal 和 input fingerprint。
- 确定性 request ID 使用 `knowledge-wiki:{stageJobId}:{generationAttempt}:{stage}:{callOrdinal}:{inputFingerprint}`。基础设施 retry 复用同一 invocation；CAS/输入/prompt/schema 导致的合法重算使用新 generation attempt 和 request ID。request ID 只有在 provider 支持 idempotency/结果查询时才能帮助避免重复调用；本地计费另以 unique invocation ID 做幂等。
- Wiki 通过现有 server model-runtime adapter 取模型时必须显式传 `skipTokenRecord: true`。`packages/server-ai/src/shared/agent/middleware-runtime/model-runtime.service.ts:142-194` 默认会自动发 `CopilotTokenRecordCommand`；如果不关闭，它会与 Wiki billing outbox 双重记账。Wiki 的 usage callback 只把累计后的 provider usage 写入当前 invocation 事务/outbox，不直接更新用户或组织汇总。
- billing outbox 不能直接复用当前非端到端幂等的 token handler：`ModelUsageLedgerService.recordTokenUsage()` 虽然 `orIgnore` 并返回 `recorded`，但当前 `CopilotTokenRecordHandler` 仍无条件累加 legacy user/organization usage；只在 handler 外层判断 `recorded` 也无法覆盖“ledger 已写、rollup 未写就崩溃”的窗口。
- V1 增加共享 `model_usage_delivery_receipt`（或等价的权威-ledger 可重算方案），选定的 receipt 实现按 `(ledgerEntryId, consumerKind, targetId)` 唯一。对 membership charge、user rollup 和 organization rollup，“插入 receipt + 更新对应汇总”必须使用同一数据库事务/传入的 manager；只有 receipt insert 真正成功的 consumer 才累加。如果某个 downstream 不能共享事务，必须支持唯一 `sourceReference=wiki-invocation:{invocationId}:{consumerKind}` 的下游幂等写，不能用先写 receipt 后发非幂等请求的假 exactly-once。
- invocation billing outbox 只在 authoritative ledger 和全部必需 delivery receipts 都成功后 ack。ledger 写入后崩溃、任一 legacy rollup 成功后/ack 前崩溃、同一 outbox 任意次重放都必须只产生一份 ledger 和一次各级汇总增量。若不先完成这个共享计费幂等接缝，Wiki 不得开放会调用模型的开关。
- 每个会调用 Map/Reduce 的 root job 在创建时必须固化可验证 billing principal 和授权快照：文档增量沿用该文档处理请求的执行用户，配置/手动 rebuild 使用当前通过 write-access 校验的用户。worker 执行前再校验 tenant、model access 和可用账号；创建时无可验证 principal 则只持久化一条不会 dispatch 的 terminal audit job，以 `failed/missing_billing_principal` 暴露恢复动作；执行时授权失效也以同一错误收口，不静默代扣或退回 `createdById`。generator reconciler 不创建付费 job，因此不需要伪造后台发起人。
- 用户授权的 full rebuild 固化有界 generation/spend envelope，允许因技术错误或构建期 corpus 漂移进行可预期的重试；每个新输入 invocation 都记入该 envelope。超过上限或遇到 indeterminate 额外调用时停止自动生成，需要新的用户确认；不把一次点击解释为无限次付费重算授权。
- granularity 只改变受控的候选深度/上限，不允许客户端直接传任意 prompt。
- 超预算、模型无权限、结构化输出持续无效要形成明确错误阶段，并允许用户配置模型后重试。

## 可观测性

### 结构化日志字段

- `knowledgebaseId`、`documentId`、`deletionIntentId`、`deletionStage`、`cleanupReceiptKey`、`wikiPageId`、`wikiJobId`、`rootJobId`。
- `jobType`、`revision`、`sourceLifecycleGeneration`、`publicationEpoch`、`publicationAttemptId`、`generatorVersion`、`embeddingRevision`、`projectionEpoch`、`stage`、`executionAttempt`、`generationAttempt`、`invocationId`、`inputFingerprint`。
- `sourceChunkCount`、`candidateCount`、`affectedPageCount`。
- `durationMs`、`tokenUsed`、`errorCode`。

### 指标

- queued/running/succeeded/failed/stale/cancelled job 数、lease expiry 和 queue lag。
- Map / Reduce / projection 阶段耗时及失败率。
- pages ready/stale/failed/archived 数。
- 每文档 candidates、每页面 sources、dead links。
- Wiki projection Vector / Keyword 命中数与 active-filter skip 数。
- inactive-vector discard/underfill、embedding-rebuild wait/stale 和 projection cleanup lag。
- 模型 token 和估算成本。
- model invocation prepared/running/succeeded/failed/indeterminate 数、对账恢复数、计费 outbox lag 和用户确认的额外调用数。
- hard-delete intent 各阶段数、failed/retry/age、external cleanup lag 和 completed latency。

### 不允许的状态

- queue 没有任务但 knowledgebase 永久 indexing。
- 文档删除成功但 Wiki 旧投影仍 ready。
- 页面显示 ready 但 projection 实际失败。
- job failed 只存在日志，status API 没有错误。
- stale job 在新 revision 后重新发布旧页面。
- provider 结果未持久化的 indeterminate invocation 被自动重调，或输入已变但仍复用旧 request ID/output。
- document row 已删但 deletion intent 仍处于 retracting/external-cleanup/failed，或 hard-delete-pending document 仍能通过任一普通 API/SQL/Vector hydration 读取。

## 分阶段实施

### Phase 0：行为刻画与最终契约

目标：先锁定已有行为，避免 Wiki 改坏标准/FAQ/External。

- 为 legacy `wikiConfig` 缺失、Standard 默认路由、创建 payload、现有 citation，以及当前 document soft-delete 路由缺列的行为建 characterization tests；同时锁定 Graph 多文档 entity/relation 字段合并后 `clearDocument()` 不可逆的现状，以及当前 hard delete 先清外部 artifact、Graph 失败只 warning、再删 document row 的部分成功窗口。
- 刻画 `document.job.ts` 与 Workflow strategy 两条完成路径，以及现有 embedding active/pending collection rebuild 行为。
- 确认 `wikiModel ?? chatModel` 加载、授权和 token record 接缝。
- 用 characterization tests 固定 model runtime 默认 token command、ledger `orIgnore` 和 legacy user/org rollup 当前的非端到端幂等窗口。
- 固定 V1 config、page types、status、job types 和 API DTO。
- 用真实文档样例确定 Map/Reduce 上限，但不把样例文本写成类型判断。

完成标准：公共类型和 acceptance matrix 评审通过；未开启任何用户入口。

### Phase 1：契约、实体、状态和只读 API

- 新增 contracts、实体、显式列类型和索引。
- 新增 KnowledgeWikiModule、controller、service、status/pages API。
- 知识库 create/detail/config 边界支持 Wiki；通用 update 拒绝只读状态字段。
- 先新增 Graph entity/relation source-contribution、manual/curated overlay 和 canonical content-fingerprint/projection-state 契约，让 extraction/清理按 eligible contributions 可逆重算共享字段；历史 Graph 完成全量 rebuild 和 provenance coverage 验证前，不开放 soft-remove。
- 补齐 model usage delivery receipt 和可传 transaction manager 的 ledger/membership/user/org rollup 消费接缝，先用崩溃点/重放测试证明端到端幂等；Wiki model adapter 显式 `skipTokenRecord: true`。
- 为 `KnowledgeDocument` 增加真实 `DeleteDateColumn`、`hardDeletePendingAt` 和 `publicationEpoch`，新增 publication-attempt/deletion-intent/cleanup-receipt schema，移除 child relations 不受支持的 soft cascades 并验证 soft-remove/recover；标准文档列表默认排除 system-managed/soft-deleted/hard-delete-pending document，Keyword/Vector/hydration、Graph evidence SQL 及 Graph entity/relation/mention/chunk 浏览 API 共享 eligible-source + canonical-ready scope，显式排除无效 document 和过期 Graph fingerprint。全部 reader/writer 就绪前不开启新 saga producer。
- 增加 permissions、scope、DTO 和 schema sync 测试。

完成标准：历史 KB 读取为 disabled；FAQ/External 拒绝启用；空页面/status API 可用；前端仍不暴露开关。

### Phase 2：生成任务、贡献、证据和撤回

- 独立 queue、durable source_map/page_reduce/finalize DAG、outbox、dispatcher/reconciler、lease、Map、Reduce、Finalize。
- 两条 document path 共用 publication service；覆盖 finish/contentChanged/failure、manual chunk CRUD、enable/disable、soft delete/recover、hard delete/rebuild 接缝。
- revision/hash/config/source-generation fence、job dedupe、重试、stale/cancel、page CAS 和 current desired-job set 聚合。
- 实现所有 document-derived writer 共享的 publication epoch/attempt fence，再实现 typed hard-delete saga：接受事务立即关 writer gate 和 fail closed，quiescence 后执行 source/index dependency purge、receipted external cleanup、零残留复核和最终 document-row transaction；重复 single/bulk delete 复用 intent，失败不允许先删行或撤销已执行 purge。
- 模型计费、日志、指标和服务端 i18n。

完成标准：真实 queue worker + 有效 Wiki 生成模型能从至少两个重叠源文档生成合并页面；更新/删除后页面和 evidence 正确收敛；文档 RAG 状态不受 Wiki 失败影响。

### Phase 3：Wiki 浏览器与配置闭环

- 替换当前互斥 dead UI。
- 统一全部创建/编辑入口和 detail hydration。
- Wiki tab、列表、详情、links/backlinks、evidence、status/rebuild。
- loading/disabled/indexing/failed/empty/deep-link 状态。
- 所有文档单删/批量删除消费 typed 202 receipt，完成 pending/failed/retry/completed 管理态；后端切换到 saga 与前端理解 receipt 必须在同一发布门禁下。
- 三个 active locale 和前端行为测试。

完成标准：用户可以启用、观察生成、浏览并定位原始证据；此时仍可暂不让 Wiki 进入 Agent 检索。

### Phase 4：搜索投影、引用与发布门禁

- system-managed projection、逻辑 section / 物理 vector 生命周期。
- 共享 Wiki vector-write builder，并把 active Wiki versions 接入现有 embedding active/pending collection rebuild 与 projection-epoch interlock。
- Vector/Keyword/RRF 接入、每页 section 去重、active-filter skip diagnostics。
- Wiki citation URL 及 Assistant / ClawXpert / ChatKit / Workbench 导航。
- PostgreSQL Keyword、PGVector/Milvus 和失败补偿集成验证。
- 最终性能、成本和质量样例。

完成标准：Wiki 页面可被 Agent 命中并正确引用；现有 source/FAQ citations 和无 Wiki 知识库行为不变。对外正式开放开关必须等到本阶段通过发布门禁。

## 验收标准

### 配置与兼容

- **AC-01** Given 历史 Standard KB 没有 `wikiConfig`，When 读取详情或保存无关设置，Then Wiki 保持 disabled，且不创建 rebuild。Given 新空库启用 Wiki，Then 它无模型调用地 ready 并记录当前 active fingerprint；首个来源可增量生成，不会因 active fingerprint 为空被误标为 rebuild-required。
- **AC-02** Given Standard KB，When Wiki 专用模型和通用 LLM 均未配置就启用 Wiki，Then 前后端都拒绝并返回翻译后的可执行错误；只配置通用 LLM 时自动回退成功。
- **AC-03** Given FAQ 或 External KB，When payload 包含 enabled Wiki 或直接调用 Wiki API，Then 服务端拒绝且不产生任何页面/job。
- **AC-04** Given 任一实际创建/编辑入口，When 用户保存同一配置，Then persisted Wiki config 一致，局部 list DTO 不会覆盖完整设置。
- **AC-05** Given 非空 Standard KB 启用 Wiki 或授权用户修改有效模型/三项 Wiki 生成配置，When 尚未确认本次付费全量重建，Then 只展示 eligible 文档数、费用说明和有界预算，不更新配置、不创建 job；确认后才捕获该 billing principal、分配唯一 staged revision并启动一次 full rebuild，不能由两个 API 重复创建。Given 只是部署的 generator/schema 变化，Then reconciler 只标记 `rebuild_required`，上一 active 版可 degraded 服务；期间的 source mutation 只做失效/清理并标记 generation pending，不用新 generator 向旧 active fingerprint 发布增量页。直到有 write access 的用户显式触发当前 corpus 的 full rebuild 前都不调用付费模型。

### 生成与身份

- **AC-06** Given 两个文档并发贡献同一 entity/concept page type + canonical name，When 生成完成，Then 通过 page CAS/retry 合并为同一 page ID，且两份来源贡献和 evidence 都不丢失。Given 两个 source documents，Then 各自拥有按 source snapshot 定位的 summary page，不因同名标题而合并；index 只由 Finalize 生成固定全库/类型目录。
- **AC-07** Given 同名但 page type 不同，Then 不自动合并。
- **AC-08** Given 模型返回不存在的 chunk ID，Then 无效 evidence 不发布；没有有效 evidence 的候选不形成页面。
- **AC-09** Given 同一 lifecycle event 被重复投递、queue dispatch 失败、worker 重启或 lease 过期，Then durable job 被安全重投且结果幂等；同 generation attempt/input fingerprint 的技术 retry 复用已持久化 model output，计费账本只写一次。Given worker 在 provider 可能成功但 invocation 未提交时崩溃，When 有可用对账能力，Then 有界 reconciling 找回结果并继续，或确认未执行后安全重投；When 无法最终判定，Then invocation 进入 indeterminate，stage/root job 和 KB 进入 failed 而非永久 indexing，status 返回带 job/invocation ID、canRetry、inputCurrent 和额外费用确认的 typed action，且不自动再调。Given CAS 冲突后 contributions 已变，Then 新 generation attempt/input fingerprint 产生新 request ID 并独立记账。Given 相同 hash 的 disable/recover/disable 是三个真实迁移，Then lifecycle generation 使最后一次撤回仍产生新 job，不被旧 completed Bull 记录吞掉。Given Wiki billing outbox 在 ledger、membership、user/org rollup 的任意已写未 ack 点崩溃并重放，Then authoritative ledger 和每级汇总都只增加一次；model runtime 的默认 token command 没有再产生第二条记录。
- **AC-10** Given 旧 revision/hash/fingerprint job 晚于新 rebuild 完成，Then 旧 job 标记 stale，不能覆盖新页面；Given staged rebuild 期间 source 更新/删除，Then 整个 staged corpus 失效并用更高 revision 重建；历史失败不能污染当前 revision 的 ready 状态。

### 源生命周期

- **AC-11** Given content hash 未变化，When 文档重处理，Then 不创建 Wiki generation job；mutation intent 被取消，且仅在旧 evidence 完整时恢复原页面/投影。
- **AC-12** Given 文档内容变化，When 新 Map 尚未完成，Then 受影响旧投影不再检索；成功后发布新正文和证据。
- **AC-13** Given 一个页面有两个来源，When 删除其中一个，Then 页面保留、撤回该来源证据并由剩余来源重建。
- **AC-14** Given 页面最后一个来源被停用或删除，Then 页面 archived，搜索投影删除或 disabled。
- **AC-15** Given 硬删除接受事务失败，When 删除源文档，Then 不产生 intent 也不改变文档可见性。Given 事务已接受或同一 DELETE 重放，Then 返回同一 intent/202，document row 在 lineage purge、每个 external cleanup receipt 和最终事务成功前始终存在为 hard-delete-pending，所有普通读路径立即为 0 命中。Given 任一 purge/artifact/vector/finalize 步骤失败，Then intent 指出 failed stage 并从缺失 receipt 幂等重试，不删除 document row、不撤销已执行 purge。Given hard delete 的源同时参与共享 Wiki 页和 Graph 实体/关系，Then 旧共享内容先不可读，只保留不含该源的 immutable page-reduce input；在 intent completed 且 document row 删除前，数据库断言该源的 map/page/Graph contributions、reduce-input sources 和 evidence/mentions 为 0，受影响旧 page versions 及其关系库 projection chunks 为 0，所有血缘命中的 Map/共享 Reduce invocation structured output 为 null，只保留无内容的计费/状态审计元数据。剩余来源的新 Wiki/Graph 版本成功后才重新可读。
- **AC-16** Given Wiki generation 失败，Then 原始文档仍保持 finish/RAG 可用，Wiki status 明确 failed。
- **AC-17** Given 手工创建、更新或删除 chunk，When document content hash 改变，Then 触发同一 Wiki 失效/重建流程；hash 未变时不重复生成。
- **AC-18** Given 源文档被软删除，Then 贡献和投影先失效，所有 Retriever 都不返回其 chunks；恢复后基于当前内容重新 Map，而不是直接复活旧投影。Given Wiki disabled 后删除/停用一个旧来源，Then 相关保留页面也立即 stale 且详情不返回旧正文；chunk update/hard delete 走 AC-17，不引入 chunk soft delete。
- **AC-19** Given Wiki 持续 enabled 时因有效模型或三项 Wiki 生成配置变化，或授权用户确认 generator 升级而触发的非撤回式 full rebuild 失败，Then 上一 ready revision 继续可用；只有 staged revision 的页面和全部投影完成后才原子切换。Given 从 disabled 重新启用，Then 旧快照在 rebuild 完成前不恢复检索。

### 检索与过滤

- **AC-20** Given 无有效 Knowledge Filter，When Wiki projection 命中 Vector/Keyword，Then 继续通过现有 Fusion/rerank/Top K 返回 `Document[]`。
- **AC-21** Given fixed/request/dynamic filter 任一有效，Then Wiki projection 不参与候选，并记录 active-filter skip；原始文档过滤行为不变。
- **AC-22** Given 一个页面有多个 section 或旧 page-version vectors 物理命中，Then Fusion 前剔除 inactive versions 并有界补足候选，最终最多保留该页面最高排名的一个 active 逻辑 section。
- **AC-23** Given Wiki projection 写关系库成功但写 Vector Store 失败，Then 页面 projection 不标记 ready，失败和补偿均可观察。
- **AC-24** Given Wiki disabled/stale/archived，Then Vector、Keyword、rerank 后的最终结果都不能包含该页面。
- **AC-25** Given 文档 A/B 共享一个 Graph entity/relation，且 A 贡献了独有 alias/description/summary/confidence/weight，When A 被软删除，Then canonical 字段只由 B 的 eligible contribution 与明确 manual/curated overlay 重算；Keyword、PGVector/其他 Vector Store、hydration、Graph Retriever 及 Graph entity/relation 列表、详情、mentions、chunks/统计都不返回 A 的 chunk 或生成字段。即使物理 cleanup/vector rewrite 失败或延迟，canonical ready + content fingerprint hydration 也会 fail closed；若关系库贡献重算失败，A 的软删除状态迁移失败并可重试。该修正对 Wiki 未启用的 Standard KB 同样成立。
- **AC-26** Given Wiki 有 active/staged/superseded page versions，When 切换 embedding model，Then pending collection 只用共享 Wiki vector builder 重投 active-ready versions；并发 Wiki publish 等待，projection epoch 变化阻止旧快照 promote，成功后 Wiki citation 的逻辑 section ID 不变。Given embedding rebuild failed/cancelled/stale，Then publish gate 也会释放；有健康旧 active collection 时等待 job 继续，否则明确 failed，不会永久 indexing。

### UI 与引用

- **AC-27** Given disabled/indexing/rebuild-required/failed/ready-empty/ready-pages，Then `/wiki` 显示互不混淆的状态、CTA、错误和 retry；rebuild-required 只在用户确认后才创建带 billing principal 的付费 job。
- **AC-28** Given 快速连续搜索/切换页面，Then 旧 HTTP 响应不能覆盖新请求结果。
- **AC-29** Given `?wikiPageId=...&section=...`，When 刷新，Then 恢复对应页面和 section；无效页面只提示，不破坏列表。
- **AC-30** Given 生成 Markdown 含 HTML/script/危险 URL，Then UI sanitize 后不执行；合法内部 Wiki link 正常跳转。
- **AC-31** Given Wiki citation，When 在 Assistant、ClawXpert 或 Workbench 点击，Then 打开正确 Wiki 页面；现有 FAQ/chunk citation 保持原行为。
- **AC-32** Given Wiki 页面 evidence，When 点击，Then 打开有权限的原始文档和 chunk；失效 evidence 只提示不可定位。
- **AC-33** Given light/dark 和窄屏，Then 页面可用、键盘焦点清晰，使用 z-\* 与现有 design token。

### Scope 与权限

- **AC-34** Given page ID 属于其他 knowledgebase/organization/tenant，When 通过当前 KB 路由查询，Then 返回 not found/access denied，不泄露页面存在性或正文。
- **AC-35** Given 并发 enable/rebuild，Then unique projection registry 只产生一个 system-managed container；标准文档分页 items/total、documentNum、preview/download、process/reprocess、move、update/delete 和 chunk CRUD 都不能暴露或修改它。
- **AC-36** Given source document disabled/deleted/systemManaged/folder/not-finish，Then 它不进入 Map，也不贡献 searchable Wiki 内容。
- **AC-37** Given 删除整个 knowledgebase，When DELETE 被接受，Then 返回可重复查询的 202 KB deletion receipt，并立即关闭普通读写和检索；saga 先停止 Wiki/Graph/document jobs、禁用并物理清理全部关系/向量投影，再删除 pipeline 和 knowledgebase row。外部清理失败时 intent 保留 failed 管理态，status/retry 在 knowledgebase row 已不存在后仍按删除时 scope 工作且不会重复清理或删除。

### 删除 saga 持久性

- **AC-38** Given 文档 A 是页面 P 的唯一来源，active/staged/superseded/failed deterministic index versions 中存在 P 的标题或链接，When 删除 A 收到 202，Then 接受事务同步失效 P 和当前 KB 的全部 active index versions/projections；即使后续 cleanup、page Reduce 或 index rebuild 失败，Wiki 列表/详情、Keyword 和 Vector 从该 202 起都不再出现 P 的标题/链接。intent completed 前还必须断言所有 retained index versions 的内容/links/关系 chunks 已清空或删除，对应外部 vector keys 均有成功 cleanup receipt；后续 index 只从当下 ready + active 页面重建。
- **AC-39** Given 文档 processing、Workflow、Graph/Wiki 或 embedding worker 已捕获旧 epoch，并卡在 DB/vector/artifact 写入前后，When 硬删除被接受且该 worker 随后继续，Then 旧 worker 无法通过 publication CAS，已登记 staged key 被补偿删除；saga 在 writer outcome 不可判定时停在 failed/quiescing，不依靠 lease expiry 删除 document row。只有终局前零残留复核通过才 completed。
- **AC-40** Given 单删或批量删除返回 pending receipts，When 用户刷新、离开后重进或在另一个会话打开同一 KB，Then 页面通过 KB-scoped intent discovery 恢复每个 pending/failed 管理态，可精确重试失败 intent，completed 后移除 overlay 并刷新 count；bulk mixed states 不丢失或互相覆盖。
- **AC-41** Given 两个 KnowledgeDocument 和一个 FileAsset 共享同一 `StorageFile`，When 其中一个文档硬删除完成，Then 只清理该文档独占、有精确 object key/所有权证明的派生 artifacts，共享 `StorageFile` 与其他引用仍可用；默认 hard delete 不删原始 `StorageFile`。
- **AC-42** Given 用户对 Public/Organization KB 有 read access 但没有 write access，When 进入文档页或 Wiki 页，Then 服务端 detail 返回 `canManageDocumentDeletions=false`，Cloud 不请求 intent discovery、不显示删除管理态/retry，普通 document list 正常加载且没有错误 toast；Wiki status 只返回 reader summary，不包含 jobId、invocation 或 billing recovery action，页面列表只返回 active-ready 页面。Given write-access 用户显式请求诊断状态，Then 可读取无旧正文/evidence 的 stale/failed/archived 行和 management status。Given detail 后权限被收回而 discovery 返回 403，Then 只关闭 overlay，不清空或阻断已加载文档。

## 测试与验证

### Contracts

- Wiki config default/normalization。
- page/status/job enum 与 explicit metadata type guard。
- 历史 `wikiConfig` 缺失兼容。
- TypeScript typecheck。

### Server focused tests

- Knowledgebase create/update/detail DTO：类型限制、专用模型到通用 LLM 回退、read-only 字段、legacy 默认，以及 config/model 变化共享 transition service。
- Entity column type rule、unique/index 和 cascade。
- source state：真实迁移递增 generation，同一请求幂等；相同 hash 的 disable/recover/disable 产生不同业务事件；target/active fingerprint 不同时 add/update/recover 只标记 pending，delete/disable 只失效/清理，不创建 Map/Reduce。
- page key/slug normalization 与同名不同类型。
- Map output parser：非法 enum、超长字段、未知 chunk ID、重复候选，以及 durable map-result 原子替换/失败恢复。
- Reduce：多来源合并、immutable page-reduce input 构造/消费、同 pageKey 并发 CAS 冲突与新 generation input、证据约束、孤儿归档、link finalize。特别覆盖 hard-delete 在旧 active version purge 后、Reduce 前重启，以及 generation retry；worker 只消费独立 input，不碰 page-version 唯一键、不重读已删 active version。
- queue：事务内 outbox、`dispatchAfter` gate、dispatch 失败、dedupe、retry、restart、lease expiry、rate-limited reconciler、revision/hash/config fence、stale/cancel、Finalize CAS 重新排队 page_reduce generation attempt、execution/generation attempt 分离、当前 revision 聚合状态。
- model invocation：provider 调用前持久化、成功 output/usage/billing outbox 原子保存、已成功 output 重用、计费幂等、支持 idempotency 的恢复，以及不支持 provider 在返回后/DB 提交前崩溃的 indeterminate 人工确认路径。CAS 重算和 schema-repair call 必须有新 generation attempt/call ordinal/input fingerprint。
- billing：Wiki model runtime 调用确实传 `skipTokenRecord: true`，usage 只进 invocation outbox；generator fingerprint 漂移只标记 rebuild-required，不产生模型调用；授权用户触发时固化 principal，principal/model access 失效时 fail closed 且不使用 creator 回退。
- billing crash/replay：在 authoritative ledger insert 后、membership charge 后、user rollup 后、organization rollup 后和 outbox ack 前分别注入崩溃，再重放同一 outbox；每个 ledger/receipt 只一行，用户和组织汇总各只增加一次。
- document/KB lifecycle：两条 document publication path 的 unchanged/changed/failure、manual chunk create/update/delete、disable、enable、soft delete/recover（含 relations loaded 且 child 不做 soft cascade）、hard delete/retract、KB hard delete 和普通 API 保护 system-managed。hard delete 对共享 Wiki/Graph 场景断言 source map/page/Graph contributions、reduce-input sources、evidence/mentions、受影响 page versions 与关系库 projection chunks 全部物理清零，并对 invocation-source 血缘命中的 Map/Reduce output 做 `IS NULL` 断言。
- hard-delete saga：接受事务失败不留半状态；重复 single/bulk DELETE 复用 intent；在 writer quiescence、source/index dependency purge、每个外部存储 receipt、零残留复核、document row delete 和 `documentNum` update 前分别注入失败，断言行在 completed 前仍存在且普通读路径为 0；重试从已完成步骤继续，最终只删行/更新计数一次。document relation 置 null 后仍能通过 KB-scoped intent 查状态。
- publication fence race：分别把 document job、Workflow strategy、Graph/Wiki writer 和 embedding rebuild 卡在关系提交前、外部写入前/后再接受 DELETE；释放 worker 后旧 epoch CAS 失败、staged key 被补偿，outcome 不可判定时 intent 不 completed。终局扫描断言无 late DB/vector/artifact 残留。
- deterministic index closure：唯一来源页删除接受事务同步 stale 全部 active index pages/projections；quiescence 后冻结 active/staged/superseded/failed 全部 retained index-version manifest。在 cleanup/page-reduce 失败时仍断言 index list/detail、Keyword 和 Vector 不包含已删页标题/链接；intent completed 前逐个断言这些 retained versions 的正文/links/关系 chunks 已删除或只剩无内容 tombstone，所有外部 vector keys 都有成功 cleanup receipt。
- artifact ownership：两个 KnowledgeDocument 和 FileAsset 共享一个 StorageFile，删除任一文档都不删原文件；只对有 exact key 和 ownership proof 的 document-derived artifact 写 completed receipt。
- derived lifecycle：Graph/Wiki rebuild 和 subscriber 都排除 Wiki projection，避免递归生成。
- Graph provenance：两个文档共享 entity/relation 时按源保存属性贡献；disable/soft/hard delete 一个来源后 aliases/description/summary/confidence/weight 只从剩余贡献重算，manual/curated overlay 保留，无源 extracted 对象清理。
- projection：唯一 container、并发创建、普通 API 全面保护、pending/ready/failed、补偿失败、确定性 ID、长内容物理拆分。
- embedding rebuild：只选 active-ready Wiki versions、共享 split/ID builder、pending collection、KB-scoped publish lock、projection-epoch stale/retry、promote metadata，以及 success/failed/cancelled/stale 每个收口路径都释放并重投等待的 Wiki projection。
- retrieval：Wiki contentKind、active-version candidate filtering、bounded over-fetch/underfill、section 去重、无固定 boost、Filter V2 skip、Keyword/Vector/Graph soft-delete boundary、diagnostics。
- Graph read API：entity/relation 列表和详情、mentions、`entities/:entityId/chunks` 及统计在 cleanup 前后都排除 soft-deleted source 和 stale fingerprint；Graph vector 留有旧文本时也在 hydration 被丢弃；recover 重新 extraction，不复活旧 contribution/mention。
- citation：Wiki/FAQ/chunk 三种 URL、metadata discriminator、formatter/Workbench 共享 builder，以及 middleware/remote component 字段透传与跳转。
- permission：tenant/org/KB/page/source scope。
- deletion management permission：list/status/retry 只允许 KB write access，分页/状态/时间窗有上限，completed tombstone 不暴露 name/path/body，document relation 为 null 也不会越过 KB 权限锚点。
- i18next：新增错误 key 在 `en.json`、`en-US.json`、`zh-Hans.json` 都存在。

### Cloud focused tests

- 不再存在未持久化的 `indexStrategy`。
- Standard-only visibility、默认 disabled、专用模型/通用 LLM 校验、三项配置和 payload round-trip。
- 每个创建/编辑入口都加载完整 detail 或遵循相同创建路径。
- legacy configuration 显式 payload allowlist，不回传 read-only 字段。
- Wiki client service URL/params/status/rebuild。
- 页面 disabled/indexing/failed/empty/ready 状态。
- reconciling action 禁用 retry；indeterminate action 只向返回的 job ID 发送显式额外费用确认；input stale 改走 full rebuild。
- 文档单删/批量删除消费 202 receipt，pending 轮询、failed retry、completed 后移除；不用已过期 document version 重建 intent，不将部分成功显示为全部成功。删除后刷新/离开重进时用 KB-scoped discovery 恢复 active/failed overlays，覆盖 bulk mixed states 和 completed count refresh。
- 只读 KB detail 的 `canManageDocumentDeletions=false` 不发 discovery 请求；capability 过期导致的 discovery 403 只关闭 overlay，普通 document request 仍成功且无页面级 error toast。
- 搜索/filter/selection request race 和 deep link。
- sanitized Markdown、内部链接、evidence 跳转。
- Assistant facade、citation effect、ClawXpert fallback。
- `en`、`zh-Hans`、`zh-Hant` locale key parity 和 JSON parse。

不要只增加读取源码字符串的测试；配置、导航、异步状态和 payload 必须有 TestBed / HttpTestingController 行为测试。

### 集成验证

- 真实 PostgreSQL：`KnowledgeDocument.deletedAt` / `hardDeletePendingAt` / `publicationEpoch` schema、soft-remove/recover、publication attempt/deletion intent 状态转换、实体 FK/cascade、唯一键、分页排除 system-managed/soft-deleted/hard-delete-pending、Keyword FTS、Graph source-contribution 重算、manual overlay、evidence scope 与 Graph 全部浏览/统计 API。
- 真实 Bull/Redis worker：queue dispatch 失败、进程重启、lease 过期、reconciler、重试、重复投递、并发 rebuild/source_map/page_reduce job。
- 真实发布/删除竞态：发布任务已在 Vector Store 或 derived-artifact 调用中时接受 DELETE，验证 epoch fence、quiescence、provider outcome reconciliation、补偿和终局零残留；无法判定时不允许 intent completed。
- 至少一个真实有效 Wiki 生成模型：结构化 Map/Reduce、token 记账、错误恢复。
- PGVector 与 Milvus：投影写入、更新、删除、disabled、stale-vector over-fetch 补足、embedding model rebuild/promote、补偿和召回。
- 两个含重叠概念的文档：页面合并、证据、链接、源删除收敛。
- 带 Knowledge Filter V2 的查询：确认 Wiki 被显式跳过且原始范围不泄漏。

### 推荐命令

实现阶段按实际 project target 和 spec 路径收窄执行：

```bash
corepack pnpm@10.24.0 nx test contracts --runInBand
corepack pnpm@10.24.0 nx test server-ai --runInBand
corepack pnpm@10.24.0 nx test cloud --runInBand
corepack pnpm@10.24.0 nx build server-ai
corepack pnpm@10.24.0 nx build cloud --configuration=development
git diff --check
```

若 target 名称与当前 workspace 不一致，以 `corepack pnpm@10.24.0 nx show projects` 和现有 CI 为准，不为了匹配文档硬造命令。

### 手动浏览器验收

按项目约定由用户显式执行或验收，Codex 不自动打开浏览器：

1. 从每个真实入口创建 Wiki-enabled Standard KB。
2. 上传两个包含重叠实体/概念的文档，观察 indexing -> ready。
3. 检查合并页面、来源证据、内部链接、搜索和深链接刷新。
4. 在 Agent 与 ClawXpert 中命中 Wiki，并跳到准确页面；再从页面跳到原始 chunk。
5. 更新一个来源，再停用/删除它；检查 evidence 撤回、页面保留或归档。硬删除要观察 202 receipt 的 pending -> completed，在 pending/failed 时刷新或离开重进确认管理态能恢复，并注入一次外部清理失败验证 failed -> retry 收敛。
6. 模拟模型/queue/vector 失败，检查错误、retry、无重复及最终收敛。
7. 检查 FAQ/External 排除、跨库访问拒绝、light/dark 和窄屏。

自动化测试和 build 通过不能替代真实 PostgreSQL、queue、模型、Vector Store 与浏览器验收。

## Schema、部署与回滚

### Schema

- 当前项目以 TypeORM schema sync 为主要实体落库路径；Wiki 变更必须先在目标数据库执行并验证 schema sync。
- Graph soft-delete foundation 新增 entity/relation contribution tables，canonical/manual-overlay 和 content-fingerprint/projection-state 列；所有 union/JSON 列显式声明 TypeORM type。
- 计费基础增加 `model_usage_delivery_receipt` 唯一表（或证明等价的 ledger-derived rollup schema），receipt 与汇总更新必须可在同一 manager/transaction 中提交。
- `KnowledgeDocument` 增加 `@DeleteDateColumn({ type: 'timestamptz', nullable: true })`、`@Column({ type: 'timestamptz', nullable: true }) hardDeletePendingAt` 和显式 `int` 的 `publicationEpoch`；移除 pages/chunks relation 的 `soft-remove/recover` cascade，上线前验证现有路由和 tree relations。V1 不给 `KnowledgeDocumentPage/Chunk` 增加软删除列，document 的 deleted/pending 可见性作为 child 检索边界。
- 新增 `knowledge_document_publication_attempt`、`knowledge_document_deletion_intent` 和每个外部 cleanup receipt/步骤唯一约束；document FK 使用 `ON DELETE SET NULL`，attempt/intent 保留 KB 权限锚点、source ID snapshot、epoch 和 exact external keys。混合版本期间在全部 reader/writer 理解 `hardDeletePendingAt` / publication fence 且 saga worker 就绪前，不能开放新删除生产者。
- Wiki 历史 KB 不做合成数据回填；历史 Graph 也不能用无 provenance 的旧 canonical 字段反推 contribution，而是在打开 soft-delete 路由前用现有 eligible source documents 做受控全量 rebuild，并验证 contribution coverage。
- 上线前备份并记录 schema；验证 FK/cascade 不会删除源 document 以外的数据。
- 若大表索引需要 `CONCURRENTLY`，沿用 Keyword 索引的运维约束，在事务外独立执行，不交给普通应用启动隐式完成。

### 发布顺序

全部阶段先置于 organization-scoped feature flag/canary 后；Phase 4 的生成、浏览、检索、引用、费用和删除验收全部通过前，不对普通组织开放配置开关。

1. 先发布 Graph source-contribution 模型、聚合器、canonical fingerprint hydration 和全部 Graph read filter；生产 extraction 开始写 contribution，但 soft-remove 仍保持关闭。
2. 对已启用 GraphRAG 的历史知识库做受控全量 rebuild，确认所有 extracted canonical 字段都可从 eligible contributions 重算；无法证明 coverage 的库继续禁用 soft-remove。
3. 发布 `KnowledgeDocument.deletedAt` / `hardDeletePendingAt` / `publicationEpoch` schema/entity、publication-attempt/deletion-intent schema/worker、移除无效 child cascade，并覆盖所有 raw/read filter 和全部 derived writer。混合版本期间仍阻止新 soft-remove 和 saga 生产者；确认全部 reader 理解两个失效字段、全部 writer 使用 epoch/attempt fence、Graph fingerprint 和 intent discovery/status/retry 就绪后，再分别开放 soft-remove/recover 和新硬删除路径。
4. 发布 model-usage delivery receipt/事务化 rollup 接缝，用 ledger insert、每个 rollup 和 outbox ack 前的崩溃注入验证重放幂等。
5. Contracts + Wiki schema/entity。
6. API/worker 支持新 job 和 disabled 默认，但不暴露前端开关。
7. 生成与浏览 API 通过真实环境验证。
8. 搜索投影和 citation consumers 全部到位。
9. 最后开放 Cloud 配置入口。

生产者不能先于理解该 job payload 的 worker 发布。

### 回滚

- 先通过新版本停用 Wiki，禁用 projection container 并物理清理关系/向量投影，再回滚应用。
- 停止新 job 生产并等待/取消 active jobs。
- 回滚代码时保留新增表和列；旧版本会忽略它们，避免破坏性 schema rollback。
- 禁止在存在 pending/failed deletion intent 时回滚到不理解 `hardDeletePendingAt` 的 reader；先用新版本幂等收敛所有 intent，并证明旧路径不会重新暴露 pending 源内容。
- Wiki 回滚应保留已完成的 soft-delete foundation。若必须回到不理解 `KnowledgeDocument.deletedAt` 的旧版本，先证明没有 soft-deleted documents，或在备份后完成恢复/硬删除数据收敛；否则旧 reader 会重新暴露它们，禁止回滚。
- 不能只写新字段 `projectionStatus=disabled` 后回滚，因为旧版本不理解它。必须先把 projection container 的既有 `KnowledgeDocument.disabled` 置为 true，物理删除其关系 chunks 和全部 Vector Store vectors，并用旧版兼容检索路径确认 0 命中；任一步失败都阻止回滚。
- 如需清理数据，另写经过备份和目标确认的运维方案，不在应用回滚中自动删除。

## 预计文件与模块

### Contracts

- `packages/contracts/src/ai/knowledge-wiki.model.ts`
- `packages/contracts/src/ai/knowledge-graph.model.ts`
- `packages/contracts/src/ai/knowledgebase.model.ts`
- `packages/contracts/src/ai/knowledge-doc.model.ts`
- `packages/contracts/src/ai/knowledge-doc-chunk.model.ts`
- `packages/contracts/src/ai/index.ts`

### Server AI

- `packages/server-ai/src/knowledge-wiki/**`
- `packages/server-ai/src/app.module.ts`
- `packages/server-ai/src/index.ts`
- `packages/server-ai/src/core/entities/internal.ts`
- `packages/server-ai/src/graphrag/entities/knowledge-graph-{entity,relation}-contribution.entity.ts`
- `packages/server-ai/src/graphrag/entities/knowledge-graph-{entity,relation}.entity.ts`
- `packages/server-ai/src/graphrag/graphrag.service.ts`
- `packages/server-ai/src/graphrag/graphrag.service.spec.ts`
- `packages/server-ai/src/knowledgebase/knowledgebase.entity.ts`
- `packages/server-ai/src/knowledgebase/knowledgebase.service.ts`
- `packages/server-ai/src/knowledgebase/knowledgebase-rebuild-embedding.job.ts`
- `packages/server-ai/src/knowledgebase/embedding-state.ts`
- `packages/server-ai/src/knowledgebase/types.ts`
- `packages/server-ai/src/knowledgebase/vector-store.ts`
- `packages/server-ai/src/knowledgebase/dto/knowledgebase-detail.dto.ts`
- `packages/server-ai/src/knowledge-document/document.job.ts`
- `packages/server-ai/src/knowledge-document/knowledge-document-publication.service.ts`
- `packages/server-ai/src/knowledge-document/knowledge-document-publication-{attempt.entity,lease.service}.ts`
- `packages/server-ai/src/knowledge-document/knowledge-document-publication-lease.service.spec.ts`
- `packages/server-ai/src/knowledge-document/knowledge-document-deletion-{intent.entity,service}.ts`
- `packages/server-ai/src/knowledge-document/knowledge-document-deletion.service.spec.ts`
- `packages/server-ai/src/knowledge-document/document.entity.ts`
- `packages/server-ai/src/knowledge-document/document.service.ts`
- `packages/server-ai/src/knowledge-document/document.controller.ts`
- `packages/server-ai/src/copilot-usage/model-usage/model-usage-{delivery-receipt.entity,delivery.service}.ts`
- `packages/server-ai/src/copilot-usage/model-usage/model-usage-{ledger,delivery}.service.spec.ts`
- `packages/server-ai/src/copilot-usage/model-usage/model-usage-ledger.service.ts`
- `packages/server-ai/src/copilot-user/commands/handlers/token-record.handler.ts`
- `packages/server-ai/src/copilot-user/commands/handlers/token-record.handler.spec.ts`
- `packages/server-ai/src/shared/agent/middleware-runtime/model-runtime.service.ts` （已有 `skipTokenRecord` 契约，实施时复核而不重复发明）
- `packages/server-ai/src/knowledgebase/plugins/knowledgebase/strategy.ts`
- `packages/server-ai/src/knowledgebase/queries/handlers/knowledge-search.handler.ts`
- `packages/server-ai/src/knowledgebase/filter/knowledge-graph-filter-scope.service.ts`
- `packages/server-ai/src/knowledgebase/retrieval/**`
- `packages/server-ai/src/knowledgebase/citation.ts`
- `packages/server-ai/src/knowledgebase/plugins/knowledge-workbench/knowledge-workbench.service.ts`
- `packages/server-ai/src/knowledgebase/plugins/knowledge-workbench/knowledge-workbench.middleware.ts`
- `packages/server-ai/src/knowledgebase/plugins/knowledge-workbench/remote-components/knowledge-workbench/src/{types,utils,main}.ts*`
- `packages/server-ai/src/i18n/en.json`
- `packages/server-ai/src/i18n/en-US.json`
- `packages/server-ai/src/i18n/zh-Hans.json`

### Cloud

- `apps/cloud/src/app/@core/services/knowledge-wiki.service.ts`
- `apps/cloud/src/app/@core/services/knowledge-document.service.ts`
- `apps/cloud/src/app/@core/services/knowledge-document.service.spec.ts`
- `apps/cloud/src/app/@core/services/index.ts`
- `apps/cloud/src/app/features/xpert/knowledge/new/**`
- `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/wiki/**`
- `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/routing.ts`
- `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/knowledgebase.component.*`
- `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/configuration/**`
- `apps/cloud/src/app/features/xpert/knowledge/knowledgebase/documents/**`
- `apps/cloud/src/app/features/xpert/knowledge/home.component.*`
- `apps/cloud/src/app/features/xpert/workspace/knowledges/**`
- `apps/cloud/src/app/features/setting/knowledgebase/knowledgebase/documents/**`
- `apps/cloud/src/app/features/assistant/knowledgebase-citation-effect.ts`
- `apps/cloud/src/app/features/xpert/assistant-shell/assistant.facade.ts`
- `apps/cloud/src/app/features/chat/clawxpert/clawxpert-conversation-detail.component.ts`
- `apps/cloud/src/assets/i18n/en.json`
- `apps/cloud/src/assets/i18n/zh-Hans.json`
- `apps/cloud/src/assets/i18n/zh-Hant.json`

具体文件 manifest 在实施前以最新 `develop` 重新确认；不要为满足此预测列表修改无关文件。

## 风险与待实现前校准项

| 风险                                       | 处理                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 模型把同名实体错误合并                     | V1 精确 pageKey；不做语义 merge                                                          |
| 文档文本 prompt injection                  | 源文本作为 data；严格 schema 与 evidence 校验                                            |
| 删除后旧页面泄漏                           | 删除前同步失效 + durable retract，失败时阻止删除                                         |
| index 页无 source evidence 而泄漏标题/链接 | 接受事务失效全部 active index；hard delete 清理所有 retained index versions 后再 rebuild |
| 旧 worker 在 deletion purge 后晚到写入     | publication epoch/attempt fence、quiescence、staged-key 补偿、终局复核                   |
| 文档删除误删共享 StorageFile               | V1 默认保留原文件；派生 artifact 需 exact key + ownership proof                          |
| job 重试重复页面/计费                      | durable invocation、execution/generation attempt 分离、billing outbox                    |
| billing outbox 重放重复累加汇总            | `skipTokenRecord` + ledger/delivery receipt/汇总同事务，崩溃点重放测试                   |
| provider 成功后 worker 崩溃无法判定        | 幂等/结果查询优先；否则 indeterminate + 用户确认新调用                                   |
| DB 已提交但 queue dispatch 失败            | durable outbox job + reconciler 重投                                                     |
| worker 死亡后任务永久 running              | lease/heartbeat + expired-job recovery                                                   |
| PostgreSQL / Vector Store 部分成功         | pending 状态、确定性 ID、补偿和明确 failed                                               |
| embedding rebuild 漏掉/误收 Wiki 版本      | 共享 vector builder、active-only query、projection epoch fence                           |
| 并发来源 Reduce 丢贡献                     | durable map results + page CAS/retry                                                     |
| system-managed 文档污染文档列表            | 服务端分页默认排除，不能客户端事后过滤                                                   |
| Wiki 绕过 Knowledge Filter                 | V1 有 filter 时显式跳过 Wiki projection                                                  |
| 页面 sections 占满 Top K                   | 物理向量回到逻辑 section，最终每页保留最佳 section                                       |
| 生成成本和延迟失控                         | granularity、硬上限、metrics、真实样例校准                                               |
| 局部 DTO 覆盖完整配置                      | 编辑前 getDetail，update payload allowlist                                               |
| 旧任务覆盖新 rebuild                       | revision/hash 在多阶段校验                                                               |
| 历史 failed job 污染当前状态               | status 只聚合 current desired-job set                                                    |
| 手工 chunk 或文档删除绕过生成接缝          | lifecycle/deletion coordinator；读路径显式 deleted + pending scope                       |
| 先删 document row 后撤回失败               | 持久化 deletion saga；血缘和外部 receipt 完成后才最终删行                                |
| Graph 共享实体留存已删源属性               | 按源 contribution 可逆聚合 + canonical fingerprint hydration                             |
| 回滚后旧版本召回 Wiki                      | 既有 document disabled 总闸 + 物理清理 + 0 命中门禁                                      |

实施前仍需用真实模型和样例校准的数值，不改变上述架构边界：

- Map batch token/character 上限。
- 每文档最大候选页、每页 facts/links/aliases 上限。
- Reduce 最大来源数和过长页面 section 策略。
- worker concurrency、execution/generation attempt 上限、backoff、job/invocation/page-reduce-input/publication-attempt/deletion-intent retention。
- 页面正文和 quote 最大长度。
- `focused / standard / exhaustive` 的具体预算矩阵。

这些技术数值由真实 chat model、PostgreSQL、PGVector 和 Milvus 样例压测后固化为服务端常量或运维配置，不开放给普通客户端任意提交，也不再逐项等待产品确认。三档若在质量、时延和费用上无法形成可解释差异，正式 UI 先只开放 `standard`。

确认的 V1 retention/SLO 默认值如下；若 tenant 或财务政策更严格，以更严格者为准：

- hard delete 接受后立即清除所有含源正文或生成正文的 payload；成功 invocation 的内容在页面发布且不可重试后清除。
- 普通失败但不涉及 hard delete 的内容型诊断快照最多保留 7 天。
- terminal job、page-reduce input 和 publication attempt 保留 30 天。
- completed deletion receipt 和无内容 tombstone 保留 90 天。
- stale external vector 的物理清理 SLO 为 24 小时；读路径在失效事务提交后立即 fail closed，不能把 SLO 当可见性窗口。
- 计费账本和汇总按平台财务政策保留，不由 Wiki retention 删除。

## 外部产品参考

WeKnora 用于验证产品形态和失败场景，不是 Xpert 的契约权威。参考固定到已检查 commit `7c4b5f1bfef709ca27c5d36d252f498786659543`：

- [Wiki 功能说明](https://github.com/Tencent/WeKnora/blob/7c4b5f1bfef709ca27c5d36d252f498786659543/website-docs/03-features/14-wiki.md)
- [知识库创建/索引界面](https://github.com/Tencent/WeKnora/blob/7c4b5f1bfef709ca27c5d36d252f498786659543/frontend/src/views/knowledge/KnowledgeBaseEditorModal.vue)
- [索引策略类型](https://github.com/Tencent/WeKnora/blob/7c4b5f1bfef709ca27c5d36d252f498786659543/internal/types/indexing_strategy.go)
- [Wiki schema](https://github.com/Tencent/WeKnora/blob/7c4b5f1bfef709ca27c5d36d252f498786659543/migrations/versioned/000037_wiki_and_indexing.up.sql)

Xpert 选择复用自身的 `Document[]`、Knowledge Filter V2、Weighted RRF、权限和 system-managed projection，而不是逐字段复制 WeKnora。
