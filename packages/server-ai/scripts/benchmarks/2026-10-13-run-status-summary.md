# 运行状态摘要查询：测试与性能记录

接口：`GET /api/ai/threads/:thread_id/runs/:run_id`

基线：`develop` 的 `ed912f37978517e5e48c301213a7e08e468bcf24`。本次改动在独立 worktree 完成，未部署。

提交 PR 前已快进到 `develop` 的 `fd9a8122cb` 并重新执行兼容性回归；被测新旧 Handler、序列化器及摘要转换函数的源码哈希保持不变。

## 修改内容

- GET 运行状态使用 `GetAgentExecutionRunSummaryQuery`，保留会话授权、受限 Assistant 会话检查及运行所属线程检查。
- 使用现有带租户、组织约束的 Service，读取响应需要的执行字段及 Assistant 头像。
- 不读取 checkpoint、消息、子执行树、模型用量、创建者详情、Assistant graph/draft。
- 显式关闭 eager relations，避免头像回退查询自动加载 Assistant 标签。
- 完整执行详情查询保持不变；取消、暂停、流式连接等入口不切换查询。

## 调用方与返回值兼容性核查

此次减少的是内部数据库读取和详情展开。原 HTTP 响应的七个顶层字段 `run_id`、`thread_id`、`assistant_id`、`created_at`、`updated_at`、`status`、`metadata` 均保留；metadata 仍完整透传，并用当前执行生成 `metadata.agentRun`。

检索范围包括本仓 Cloud、Desktop、服务端，以及本机 `chatkit-js`、`xpert-sdk-js` 和 `xpert-plugins` 源码。未发现调用方从本接口读取 checkpoint、messages、子执行树或模型用量；旧接口经过 `transformRun()` 后原本就不返回这些详情字段。无法穷举仓库之外的第三方客户端，因此以完整原响应契约的回归测试保护兼容性。

| 调用场景                                             | 实际依赖                                                                                   | 覆盖方式                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| SDK `client.runs.get(threadId, runId)`               | 原 Run 七个顶层字段及完整 metadata                                                         | 精确 JSON 契约断言、请求 run ID 检查、已安装 SDK 0.9.1 的 transport smoke test                            |
| ChatKit 首次加载历史 / 历史翻页 / 流结束后的消息补齐 | `metadata.resumedFromExecutionId`；通过共享 hydrator 追溯多次恢复运行                      | 后端真实 HTTP + TransformInterceptor 检查恢复字段和扩展 metadata；ChatKit ancestry 与 Stream history 回归 |
| 状态及运行摘要展示                                   | 六种状态、错误、耗时、输入、父执行、Assistant 头像、调用类型、tool call ID、模型、业务结果 | 原响应完整字段断言、全部状态参数化测试、旧 metadata 和头像回退测试                                        |
| 跨线程 / 租户 / 组织、受限 Assistant 凭证            | 保留原 403/404 行为和授权顺序                                                              | Controller、真实 scoped CRUD service、会话授权及受限凭证测试                                              |
| 取消 / 暂停 / 恢复 / SSE / 运行列表                  | 各自的原路径，不依赖此次 GET 的内部展开                                                    | 未替换 `ensureThreadRunAccess()` 或列表查询；已有线程控制与流接入回归                                     |

核查源码：[ChatKit 共享 ancestry hydrator](https://github.com/xpert-ai/chatkit-js/blob/ce2d8585d9394a2fd240610e6a8a2ef8604716a7/packages/chatkit-ui/src/lib/resumed-root-executions.ts)、[ChatKit 三处调用链](https://github.com/xpert-ai/chatkit-js/blob/ce2d8585d9394a2fd240610e6a8a2ef8604716a7/packages/chatkit-ui/src/providers/Stream.tsx)、[SDK `runs.get`](https://github.com/xpert-ai/xpert-sdk-js/blob/0d33f5c1043ee9e42dfe250a69dbff29c0982fcc/packages/core/src/client.ts)。SDK 源码检索与已安装 0.9.1 的运行检查分别记录，不假定两者构建版本相同。

SDK 类型另有 `multitask_strategy` 字段，旧接口并未输出；本次保持既有响应，不把这个既存差异算作优化导致的字段削减。

## 测量结果

测量时间：2026-10-13 12:41:59 北京时间。每个样本预热一轮，再采集五轮；新旧顺序交替。数值为各五轮的中位数。

| 样本         | 数据规模                                                  |     修改前 |   修改后 |   减少耗时 | 耗时降幅 |
| ------------ | --------------------------------------------------------- | ---------: | -------: | ---------: | -------: |
| A `d9091d67` | checkpoint 0.69 MB + pending writes 0.68 MB，8 个执行节点 | 139.445 ms | 0.999 ms | 138.446 ms |   99.28% |
| B `835bbb9c` | checkpoint 1.21 MB，1 个执行节点                          | 124.893 ms | 0.936 ms | 123.957 ms |   99.25% |
| C `d5bf6462` | checkpoint 1.74 MB，1 个执行节点                          | 152.379 ms | 0.818 ms | 151.561 ms |   99.46% |

五轮范围：

- A：修改前 131.040–167.861 ms，修改后 0.839–1.513 ms。
- B：修改前 123.363–133.676 ms，修改后 0.785–0.978 ms。
- C：修改前 151.509–154.541 ms，修改后 0.774–1.029 ms。

三个样本的所有轮次，新旧返回 JSON 均逐字相同。响应分别为 11,121 / 1,924 / 2,179 bytes。

原始逐轮结果及被测源码 SHA-256：[2026-10-13-run-status-summary.json](2026-10-13-run-status-summary.json)。

## 测量范围和限制

这是**查询处理部分的同数据对比**，不是完整 HTTP 压测，也不是上线后的 Prometheus 数据。不能据此宣称正式接口的 P95 已降至 1 ms，或整体 HTTP 延迟下降 99%。

- 使用工作区实际的新旧 Query Handler、CheckpointSaver、消息反序列化器及摘要转换函数；编译后通过 stdin 在已有 API 容器的临时 Node 进程执行，不写远程脚本，不替换服务。
- 数据库连接强制 `default_transaction_read_only=on`，使用单个 `REPEATABLE READ READ ONLY` 事务；每条 SQL 超时 5 秒，结束回滚并关闭连接。
- 仓储由同一套只读 SQL 适配器承接，不包含 TypeORM 实体水合、隐式分页查询、eager 关联的成本。查询计数仅代表探针，不代表实际 HTTP 内全部 SQL 次数。
- 不包含 HTTP 鉴权、会话权限查询、应用连接池等待、原 API 进程的事件循环/GC 排队、代理及网络往返。
- 三个样本是上次诊断选取的历史执行记录，并未关联到某一条昨日慢 HTTP Trace。样本的模型用量查询为空，探针对非空用量主动退出；不能外推非空用量聚合的耗时。
- 环境：Node `v20.20.2`，API 容器限制 2 CPU / 8 GiB；容器镜像 revision `a28db052f777d8077692818dbcfd309d9a559d7d`。新旧 Handler 在同一进程、同一数据库快照下执行。

## 测试先行证据

1. 修改实现前，原 `thread.controller.spec.ts` 的 18 个测试通过。
2. 先增加接口返回值、状态、旧数据、权限和不依赖完整详情的测试。旧实现为 **10 个失败、21 个通过**；失败源于仍调用完整执行详情，符合预期。
3. 摘要 Handler 测试先写，覆盖真实 scoped Service 的租户/组织条件、空组织范围、404、数据库错误、CQRS 注册和 PostgreSQL 投影。实现前新模块不存在，此阶段未计作行为失败证明。
4. 复核 Assistant eager tags 后，先增加 SQL 反例，确认生成 SQL 包含多余标签 JOIN；再用完整 FindOneOptions 关闭 eager relations，避免 ID 重载丢失该选项。
5. 实现阶段 **7 个测试套件、106 个测试全部通过**。提交 PR 前，调用方核查再补充请求 ID、恢复链与扩展 metadata 的真实 HTTP 回归后，最终 **7 套、108 个测试全部通过，本次共新增 25 个用例**。覆盖运行状态接口、摘要查询、历史运行摘要转换、受限 Assistant 凭证、线程范围、会话授权及执行控制器。
6. Prettier 检查、基准脚本语法检查及 `git diff --check` 通过；原始测量文件中全部源码哈希与最终实现一致。

验证命令：

```bash
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand --runTestsByPath \
  packages/server-ai/src/ai/thread.controller.spec.ts \
  packages/server-ai/src/xpert-agent-execution/queries/handlers/get-run-summary.handler.spec.ts \
  packages/server-ai/src/ai/conversation-agent-runs.service.spec.ts \
  packages/server-ai/src/ai/public-xpert-principal.spec.ts \
  packages/server-ai/src/ai/assistant-thread-scope.guard.spec.ts \
  packages/server-ai/src/chat-conversation/conversation.service.spec.ts \
  packages/server-ai/src/xpert-agent-execution/agent-execution.controller.spec.ts
```

上述测试使用仓库现有 ts-jest 类型诊断。全库 `tsc --noEmit` 曾启动，在实现继续调整后停止，未取得最终结果；未执行完整构建或浏览器验收。

提交 PR 前额外执行的调用方检查：

- ChatKit **2 个测试文件、55 个测试通过**，包含恢复链、多次恢复、跨线程缓存、查询失败重试、循环保护、普通消息无需查询，以及 Stream 历史加载回归。
- 已安装 SDK **0.9.1** 的 `client.runs.get()` smoke test 通过：验证 GET 路径和完整 JSON 透传，包括恢复字段、嵌套 metadata 与 `false` / `0` / `null`。
- 后端新增 HTTP 测试走真实 Nest 路由和 `TransformInterceptor`；身份守卫和 QueryBus 使用测试替身。SQL 投影测试使用 TypeORM 生成 SQL，租户/组织测试使用真实 scoped Service 加仓储替身；这些测试不等于真实 PostgreSQL + 完整鉴权的端到端测试。

ChatKit 验证命令（在 `chatkit-js/packages/chatkit-ui` 中执行，不修改该仓源码）：

```bash
corepack pnpm exec vitest run src/lib/resumed-root-executions.test.ts src/providers/Stream.history.test.tsx
```

## 复跑方法

先指定已获授权的 SSH 目标、密钥路径、现有 API 容器和三个代表性执行 UUID，再执行：

```bash
node packages/server-ai/scripts/benchmark-run-status-summary.cjs |
  ssh -i "$BENCH_SSH_KEY" "$BENCH_SSH_TARGET" \
    docker exec -i -w /srv/xpert "$BENCH_API_CONTAINER" \
    node - "$BENCH_RUN_A" "$BENCH_RUN_B" "$BENCH_RUN_C"
```

脚本只输出时间、计数、响应长度和哈希，不输出业务内容或凭证。最多三个样本，每个执行树最多 30 个节点。

上线后的验收应单独对比该路由的慢请求比例、P95、调用量，并保持相近数据规模与负载；现阶段没有线上完整 HTTP 提升结论。
