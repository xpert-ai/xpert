# 执行环境中的模型访问

ModelExecution 让 CLI 和受管 Agent 使用当前 Assistant 已获授权的模型，并把实际用量记到调用用户。它管理短期执行授权、模型协议入口、预算准入和结算，不负责调度任务或取得桌面控制权。功能默认关闭。

本文描述当前源码中的设计，不作为客户端版本验收或已发布证明。Computer 安装及真实执行记录由 xpert-pro 的对应文档维护。

## 模块边界

| 层                 | 职责                                                               | 扩展入口                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| contracts / SDK    | 执行上下文、授权模型、用量和运行器协议                             | [ModelExecution 类型](../packages/contracts/src/ai/model-execution.model.ts)、[运行器能力](../packages/plugin-sdk/src/lib/agent/runtime/execution-runner.ts) |
| 公共 server-ai     | Assistant / 用户授权、短期凭证、预算、协议转换、实际用量与幂等结算 | [ModelExecution 模块](../packages/server-ai/src/model-execution/model-execution.module.ts)                                                                   |
| 模型 Provider 插件 | 供应商连接、凭据、模型目录、原生客户端和价格能力                   | [NativeModelClient](../packages/plugin-sdk/src/lib/ai-model/native-model.ts)                                                                                 |
| 执行环境宿主       | 验证环境所有者和实例，提供启动、观察、取消及文件收集能力           | [ModelExecutionEnvironmentCapability](../packages/plugin-sdk/src/lib/agent/runtime/model-execution.ts)                                                       |
| Agent runtime 插件 | 具体工具启动约定、状态与结果规范化                                 | [Agent Invocation runtime](../packages/server-ai/src/agent-invocation/README.md)                                                                             |

公共授权层通过能力接口验证环境，不依赖 Computer / Docker 实现。Computer 适配器在 xpert-pro；SDK 声明 Computer、Sandbox 或 remote 类型，不代表对应执行器已经安装。平台按协议和模型目录中的能力路由，不根据供应商名称猜测兼容性。CLI 的精确版本兼容要求与供应商实现分开维护。

## 一次执行的授权范围

一个 `ModelExecutionGrant` 绑定一个 CLI session 或一个 Agent Invocation，同时固定 tenant、运行组织、用户、Assistant 及其发布版本、conversation、执行环境实例（或 remote binding revision）、工具和版本。它属于一次执行，不是整个用户、Assistant 或容器的通用模型 Key；同一容器中的不同执行分别授权和计量。

1. 平台从当前身份及其拥有的会话解析作用域。付款人与执行用户一致；客户端不能靠请求体或任意组织请求头选择另一位付款人。
2. 取已发布 Assistant 的模型候选与用户模型权限的交集，再按工具及协议策略筛选。默认模型依次取当前 thread 最近父执行的模型选择、用户 Assistant 偏好、Assistant 默认候选；已移除的显式选择不会静默回退。
3. 保存 Copilot ID、Provider 配置 ID 及所属组织、模型类型、模型 ID、能力和协议快照。`assistant-default` 映射到签发时固定的默认模型，不向 guest 暴露供应商凭据。
4. 签发随机短期执行凭证，数据库只保存哈希。它只用于模型入口，不是平台登录令牌，也没有自行签发授权或无限续租的权限。
5. 每次请求及续租重新检查账号和组织成员关系、已发布版本、模型权限、执行状态、Binding / 环境实例和工具版本。旧快照只能收紧；放宽策略不增加已签发授权的模型、协议或额度。固定默认模型失效后拒绝继续使用。

授权持续时间由租期和不可延长的绝对时限共同限制。普通浏览器 / Desktop 退出登录、断开观看或释放桌面控制权，不自动全量撤销模型授权。任务完成、明确取消、过期、权限或绑定失效仍需按执行生命周期处理。

`POST /api/model-execution/revoke-mine` 是独立的显式撤销入口：撤销**当前 tenant 下本人所有 active 执行授权**，不是只撤销当前组织、Assistant 或会话。它阻止后续授权校验通过，不证明已经发出的模型请求或 guest 文件操作立即停止；停止进程仍须取消并确认终态。详见 [授权服务](../packages/server-ai/src/model-execution/execution-grant.service.ts) 和 [执行来源校验](../packages/server-ai/src/model-execution/execution-source.service.ts)。

## 预算准入与计量

[策略 schema](../packages/server-ai/src/model-execution/execution-policy.schema.ts) 使用显式开关；未配置时为关闭。启用需要网关地址、允许的工具绝对路径和精确版本，以及以下整数限制：

| 字段                                          | 含义                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tokenBudget`                                 | 单个执行授权的累计 Token 预算                                                                                |
| `userTokenBudget`                             | 同 tenant、同付款人的执行调用：最近 24 小时实际用量，加全部未释放预占；查询范围为 `source='execution_grant'` |
| `maxInputTokens` / `maxOutputTokens`          | 输入、输出上限；另以 UTF-8 请求字节长度作保守输入检查                                                        |
| `maxConcurrentRequests` / `requestsPerMinute` | 单授权和同 tenant 付款人的执行调用两层并发 / 速率限制                                                        |
| `leaseSeconds` / `maxDurationSeconds`         | 可续租时长和执行总时限                                                                                       |

这些是执行入口的 Token 限额，不等同于全平台个人用量上限，也不承诺严格金额预算。费用来自有效用量和定价结果；金额未知与免费必须区分。

[准入服务](../packages/server-ai/src/model-execution/execution-admission.service.ts) 在数据库内先按 tenant / 付款人串行化，再锁定授权，预占 `maxInputTokens + 本次输出上限`。调用派发前持久化一次性派发标记，同一 attempt 不能二次派发。超出限制直接拒绝，不偷偷缩小请求；不明结果不自动重发。

用量事实先落库，再经现有 `CopilotTokenRecordCommand` 交付到账本。同一 attempt 沿用同一 requestId 和交付回执，失败重试不会另建一笔消费。父 Assistant 与子 Invocation 可分别展示，但同一次模型调用只能扣费一次。实现见 [计量服务](../packages/server-ai/src/model-execution/execution-metering.service.ts)。

| 调用证据                             | 状态与预占                                             | 结算行为                                            |
| ------------------------------------ | ------------------------------------------------------ | --------------------------------------------------- |
| 未派发且无实际用量                   | `failed`，释放预占                                     | 无消费事实，不扣费                                  |
| 已派发但缺失有效实际用量，或只有估算 | `settlement_pending`，保留预占                         | 估算仅供诊断，等待权威证据                          |
| 已取得有效实际用量                   | 保存不可变用量事实，释放预占；交付完成前仍可为 pending | 按原 attempt 幂等交付；模型调用失败也可能已产生用量 |
| 已确认零消费的人工核对               | `failed` / `reconciled_no_usage`，释放预占             | 不伪造一笔实际用量账单                              |

Prompt 包含缓存读写子集，Completion 包含推理子集，不能重复相加。全零、负数、非有限值或不一致的总数不构成有效消费事实。[用量 schema](../packages/server-ai/src/model-execution/execution-usage-schema.ts) 将实际事实与估算分开；`priced`、`free`、`unpriced` 描述事实定价状态，查询还会返回尚未确定的 `pending`。

后台每 30 秒重试交付和未完成的消费核对。失联调用自 `startedAt` 超过 15 分钟后按派发标记处理：未派发可释放预占，已派发保留未知消费预占。管理员只能凭权威证据核对；操作步骤、指标和告警见 [运行手册](operations/model-execution-runbook.md)。

## 模型协议

| 策略 / 能力           | 入口与执行方式                                                                    | 边界                                                                        |
| --------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 普通 Chat             | `openai_chat`，共用平台 Chat 执行器                                               | 仍受授权模型及工具能力约束                                                  |
| `nativeProtocols`     | `openai_responses`、`anthropic_messages`，使用 Provider 的 `getNativeModelClient` | 默认未开启；模型目录还须显式声明 `native_protocols`                         |
| `chatBridgeProtocols` | 同样的 Responses / Messages 入口，转换为平台 Chat 请求                            | 默认未开启；快照分别记录 `openai_responses_chat`、`anthropic_messages_chat` |

授权签发时固定传输方式；同时具备两种方式时优先原生。原生失败不会重试到 Chat，也不会因此扩大授权。见 [工具模型筛选与版本清单](../packages/server-ai/src/model-execution/execution-tool-model.ts) 和 [原生 Provider 解析](../packages/server-ai/src/model-execution/execution-native-provider.service.ts)。

原生入口保留支持范围内的原生消息、工具结果和推理内容；SDK 的 Messages transport 可转发 `anthropic-*` 特性头。Responses 强制 `store: false`，拒绝后台请求及服务端会话引用。当前输入边界为内联文本与客户端工具，多媒体 / 文件引用和托管工具未开放。未实现 Responses 存储查询、compact、WebSocket 或 Messages count_tokens。接口存在不代表相应真实模型与 CLI 已验收，启用前须单独验证。

Chat 转换支持文本、系统消息、客户端 function 工具及多轮结果、流式文本和工具调用。纯文本 custom tool 使用显式 `{input: string}` 包装；Responses 单层 namespace 映射成不冲突的 function 名，再还原工具名、namespace 和调用 ID。不能等价转换的原生思考、签名 / 加密推理、多媒体、托管工具、嵌套 namespace、grammar、strict JSON schema、effort 和服务端安全扩展等字段，在供应商调用前拒绝。具体字段以 [转换 schema](../packages/server-ai/src/model-execution/execution-chat-bridge-request.ts) 为准。

Chat 转换的 CLI 版本由兼容清单精确限制；模型还须具备流式工具调用能力，Codex 另需并行工具调用能力。运行器必须使用与该版本验收一致的启动配置。增加版本需验证请求形状、多轮工具调用、取消及逐笔计量，不能仅修改显示版本或根据供应商名称放行。

转换层采用原始 / 转换后较大的请求字节数检查输入上限，取消传播到同一个上游调用；转换不产生第二笔消费。缓存提示不保证上游采用相同缓存规则，缓存 Token 仍取实际回执。仅有估算时返回失败并保留待核对记录；CLI 自带的费用估算不能替代平台账本。

## API 与身份边界

以下路径包含平台 `/api` 前缀。

| 接口                                                       | 调用身份                              | 用途                                       |
| ---------------------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| `GET/PUT /api/model-execution/admin/policy`                | tenant 范围、`MODEL_GATEWAY_MANAGE`   | 查看 / 更新灰度策略                        |
| `GET /api/model-execution/admin/pending`                   | tenant 范围、具有同一权限的平台管理员 | 分页查询待核对消费                         |
| `POST /api/model-execution/admin/calls/:id/reconcile`      | 同上                                  | 持久化证据并核对原调用                     |
| `POST /api/model-execution/admin/calls/:id/retry-delivery` | 同上                                  | 重试已有事实的账本交付                     |
| `GET /api/model-execution/openai/v1/models`                | 执行凭证                              | 当前授权的可用模型别名                     |
| `POST /api/model-execution/openai/v1/chat/completions`     | 执行凭证                              | 普通 Chat                                  |
| `POST /api/model-execution/openai/v1/responses`            | 执行凭证                              | 原生 Responses 或显式 Chat 转换            |
| `POST /api/model-execution/anthropic/v1/messages`          | 执行凭证                              | 原生 Messages 或显式 Chat 转换             |
| `GET /api/model-execution/call-options`                    | 平台用户、组织范围                    | 本人的 Assistant 筛选项                    |
| `GET /api/model-execution/calls`                           | 平台用户、组织范围                    | 本人的调用、估算及结算状态                 |
| `POST /api/model-execution/revoke-mine`                    | 平台用户                              | 显式撤销本 tenant 下本人的 active 执行授权 |

`calls` 与 `call-options` 都限定当前 tenant、organization、user，不接受 ChatKit client secret 或其他 API principal。查询可按入口、状态、Assistant、conversation、执行 ID、工具、模型、环境、用量来源、定价状态和时间筛选；参数由 [查询 schema](../packages/server-ai/src/model-execution/execution-query.schema.ts) 及共享 `ZodValidationPipe` 在 HTTP 边界转换验证。普通用户不能通过筛选参数查询别人的消费。

个人执行用量页展示实际用量、估算、预占及定价状态；管理员账本视图沿用既有管理权限，并可导出当前页。管理员核对路径的 `:id` 是 `items[].id`（数据库记录 UUID），不是 `callId` 或 `attemptId`。`applied` 仅表示证据已应用，不等于账本已投递；应检查 `delivered`，零消费核对则不需要实际用量投递。

Computer 的启动、停止通过其受控 View Action；受管任务使用 Agent Invocation 能力。ChatKit 面向用户的业务 API 集中在 `AIModule` 的 `/api/ai`，执行模型入口使用专门的执行凭证校验，不能复用登录身份或把管理接口开放给 client secret。

## 与长任务及结果的关系

模型授权服务不决定父 Agent 如何等待。普通长任务采用 [有界观察](../packages/server-ai/src/runtime-task/README.md)：启动后返回 task handle，Agent 通过统一的 `task_status({taskIds, timeoutMs, mode})` 观察同一任务。默认等待 30 秒、默认上限 60 秒，设 0 即时查询；到期返回普通 `pending`，不 interrupt，也不重复启动任务。后端窗口内检查状态，不在每次检查时调用模型。

真正需要用户确认的交互才可挂起。取消观察不等于取消子任务，持久化子任务回执也不保证 API 重启后父回合自动恢复。结果可包含分析、变更、测试、文件等类型；默认不打包 ZIP，显式请求 `files` / `archive` 才收集交付，导出失败与执行失败分别记录。结果工具通过 ChatKit 资源卡片展示，卡片自身不授予访问权，详见 [结果与运行器约束](../packages/server-ai/src/agent-invocation/README.md) 及 [资源卡片协议](../packages/plugin-sdk/RESOURCE-CARDS.md)。

## 部署、回退与验证

先在功能关闭状态下部署。contracts、SDK、host、ChatKit 和运行插件必须使用同一轮兼容构建；正式版本号以实际发布包及发布回执为准，不能把本地预发布编号当作 npm 已发布事实。旧 SDK 不包含本文的新能力，不能只升级运行插件。

现有基础模型网关表具备后，确认以下增量迁移已按依赖顺序应用，再启动完整新版 API / worker：

1. [Agent Invocation 基础表](../packages/server-ai/src/agent-invocation/migrations/20260922-agent-invocation.sql)。
2. [ModelExecution 基础表和用量字段](../packages/server-ai/src/model-execution/migrations/20260930-model-execution.sql)。
3. [执行消费审计](../packages/server-ai/src/model-execution/migrations/20261001-execution-operations.sql)。
4. [历史等待记录](../packages/server-ai/src/agent-invocation/migrations/20261001-invocation-wait.sql)，随后 [等待分组兼容](../packages/server-ai/src/agent-invocation/migrations/20261002-task-wait-groups.sql)。新普通等待不写这些记录，但历史监控器仍依赖完整 schema。

确认旧 worker 已退出，再以专门测试账号 / 空间、小 Token 预算和明确环境实例验收；普通 Chat、原生协议和 Chat 转换分别灰度。安装或策略保存成功不代表真实执行、计量和文件交付已经通过。

回退先设置 `{ "enabled": false }` 并停止新任务派发。关闭准入不删除历史事实或未知消费预占；保留查询、显式取消及补偿能力，按 [运行手册](operations/model-execution-runbook.md) 处理消费与历史等待后再停止相关 worker。撤销授权不能证明进程退出，状态无法确认时保留 `unknown`，不重启原任务猜测恢复；增量迁移回退不 DROP 历史数据。

从仓库根目录执行基础构建 / 类型检查：

```sh
NX_DAEMON=false corepack pnpm nx run-many -t build -p contracts plugin-sdk --skip-nx-cache
corepack pnpm exec tsc -p packages/server-ai/tsconfig.lib.json --noEmit --incremental false
corepack pnpm exec ngc -p apps/cloud/tsconfig.app.json --noEmit
```

按变更运行 ModelExecution、model-gateway、Invocation factory 和用量账本的定向测试；插件需验证构建产物与 host 的兼容性。PostgreSQL 集成测试只接受显式配置的 `XPERT_EXECUTION_TEST_DATABASE_URL`，且数据库名以 `xpert_execution_test_` 开头，不能指向应用库。真实环境验收另需覆盖多 Assistant / 多账号隔离、取消、运行中重启、未知状态、逐笔计量及最终安装包；单元测试不替代这些验收。
