# Xpert Pro 多实例整改计划

## 计划状态

- 建立日期：2026-08-19
- 当前状态：第一阶段代码整改已完成（NsJail 探针、独立 Schema Sync、XpertTask 执行租约、规范化 occurrence、Redis Session）；线上发布和受控回归待确认
- 线上范围：`106.14.81.250`，`/srv/xpert-pro`
- 相关仓库：`xpert-installer`、`xpert-develop`
- 变更原则：先备份和止血，再修改代码；没有完成第一阶段验证前，不再次重启全部 API。

## 已确认问题

### P1：XpertTask 多实例重复执行

线上已经复现：三个 API 重启后都从数据库加载 `scheduled` 任务，并在各自进程内创建 `CronJob`。同一任务在 09:50 被三个实例分别执行，并产生三条 `chat_conversation` 记录。

根因代码：

- `xpert-develop/packages/server-ai/src/xpert-task/xpert-task.service.ts` 的 `onModuleInit()` 会在每个 API 进程加载全部活动任务。
- `scheduleCronJob()` 使用进程内 `SchedulerRegistry`，没有跨实例执行门闩。

当前已改为独立的 `xpert_task_execution` 执行记录：唯一键为 `(taskId, occurrenceKey)`，并记录计划时间、`pending/running/succeeded/failed`、owner、lease、attempt、预分配的会话/运行 ID 和错误信息。API 只有成功领取有效 lease 后才会创建会话和执行；每分钟恢复扫描会重新领取过期记录，实例在占位或执行期间退出后可由其他实例接管。`chat_conversation` 不再承载调度幂等字段。

线上任务快照：

```text
/srv/xpert-pro/backups/scheduled-task-restart-20260819-0937/xpert-task-before.txt
```

在修复前，测试任务必须保持暂停或归档状态。

### 已完成：NsJail 多实例部署探针

NsJail 实际运行正常，三个 API 均可通过认证健康检查访问 Runner。失败原因是探针默认执行：

```text
docker exec xpert-api ...
```

多实例后的实际容器名为 `aliyun-api-1`、`aliyun-api-2`、`aliyun-api-3`。`xpert-installer/docker/nsjail-runner.sh` 已修改为按 Compose API 标签和 `NSJAIL_RUNNER_URL` 自动发现并检查所有 API，`bash docker/tests/nsjail-runner.test.sh` 已通过。该项不再作为第一阶段的代码整改；只需在发布 installer 后确认线上部署使用了新脚本。

### P1：Express Session 当前部署配置不完整

当前代码已经让 `apps/api` 入口使用 Redis-backed Session Store，并在 Session middleware 之前配置可信反向代理。Store 的 `touch()` 续期失败会通过回调传播给 Session middleware，不再静默报告成功；两个 Store 实例共享同一 Redis 数据源的单元测试已覆盖。

修复前线上运行的 `main.js` 没有 `connect-redis` 或 `RedisStore`，`express-session` 没有传入 `store`，默认使用 `MemoryStore`。

修复前的 `apps/api` 入口没有配置 `trust proxy`。测试机通过 HTTPS Nginx 访问 `/api/auth/login` 时没有返回 `Set-Cookie`，说明 Secure Cookie 没有正常下发。登录接口会写入 `@Session()`，因此 `saveUninitialized: false` 不会阻止该登录请求保存 Session。

历史上存在 Redis Session 提交 `04593c4c1`，但它位于 `origin/copilot/fix-k8s-request-failures`，没有进入当前线上镜像，且修改的是旧的 `packages/server` 入口。

### P1：API 故障时终端 Session 丢失

Sandbox terminal 的 session 保存在 API 进程内 `Map`，API-1 重启后 WebSocket 断开，原 terminal session 无法由 API-2 恢复。sticky session 和 Socket.IO adapter 都不能恢复已经消失的 API 进程内状态。

### P1（恢复能力）：Chat Socket.IO 连接重建但不会恢复原连接

线上实际为 WebSocket-only。API-1 重启后，原连接以 `1006` 断开，API-2 可以建立新连接，但 Engine.IO 和 namespace session 都是新值。是否能从 Redis Stream 或数据库补回长 Chat 响应，尚未完成真实登录测试。

### 潜在问题：MCP SSE 当前未启用

线上 `/api/mcp/sse` 返回 404，`/mcp/sse` 没有进入 MCP 路由，因此当前不是线上故障。源码中的 `activeTransports` 仍是进程内状态，只有启用该模块并置于多实例入口后才需要处理。

## 2026-08-19 代码审查结论

自动化检查已通过：XpertTask 服务和 Coordinator 共 10 个测试、API Bootstrap 相关 10 个测试，以及 `apps/api`、`packages/server-ai` TypeScript 检查均通过。这些检查只能证明当前代码可编译并覆盖了状态机单元分支，不能替代测试机上的真实多实例回归。

### 已解决项 1：任务占位成功后可能永久不执行

已通过 `ScheduledTaskExecutionCoordinator` 和 `xpert_task_execution` 实体解决。Coordinator 使用数据库唯一键和条件更新实现领取、续租、完成及过期接管；会话和 Agent execution ID 在领取时预分配，恢复扫描使用同一组 ID 重入，避免把 `ChatConversation` 唯一冲突当作调度状态机，也避免占位后崩溃造成永久跳过。

### 已解决项 2：执行键不是规范化的计划触发时刻

`resolveScheduledOccurrence()` 根据任务时区和 Cron 表达式计算最近一个规范化计划槽位，再由 `buildScheduleOccurrenceKey()` 生成 occurrence key。三个实例即使回调延迟或跨过分钟边界，也会使用同一个计划槽位，而不是各自回调时刻。

### 第一阶段 CR 项处理结果

- [x] Redis Session Store 的 `touch()` 失败会向 middleware 回调传播，并有失败路径测试。
- [x] 两个 Store 实例通过共享 Redis 数据源读取同一 SID。
- [x] 新增测试不使用 `as any`。
- [x] `scheduleExecutionKey` 已从 `ChatConversation` 移除，调度幂等字段归属独立执行实体。
- [ ] HTTPS 反向代理登录响应的 `Secure` Cookie 仍需在测试机完成真实认证集成验证；代码已配置可信代理和 Redis Store。

### 已完成代码修改：独立 Schema Sync Job

`apps/api` 的实体定义仍保留 TypeORM `synchronize: true` 语义，但多实例部署不再让 API 启动过程直接执行 DDL：

- 新增 `node main.js --command schema-sync`，复用完整的 core、持久化插件和代码插件实体注册流程，只在一个短生命周期进程中显式执行一次 `DataSource.synchronize()`。
- Schema Sync 加载任一插件失败时直接终止，不允许漏掉插件实体后继续启动 API。
- installer 的 Aliyun 和本地启动流程都调整为：启动数据库、确认 pgvector、运行 `schema-sync`、同步成功后再启动或重建全部服务。
- API 容器设置 `DB_SCHEMA_SYNC_MODE=external`。预启动插件发现阶段打开的直接数据库连接和 Nest `DatabaseModule` 初始化都会跳过启动同步，防止绕过独立 Job。
- API 数据源初始化完成后恢复原 `synchronize` 配置，保持运行期安装插件实体时的既有同步行为。
- `schema-sync` 返回非零状态时，部署脚本因 `set -e` 立即停止，不会继续启动三个新 API。

该项代码和自动化检查已完成，仍需将包含 `schema-sync` 命令的新 API 镜像与 installer 同步发布。旧镜像不支持该命令，installer 会在启动 API 前失败，这是预期的发布保护。

## 第一阶段：止血与正确性修复

### 1. 备份和冻结测试条件

- [ ] 暂停或归档重复执行测试任务。
- [ ] 完成 PostgreSQL 全量备份，并记录备份文件校验值。
- [ ] 完成 Redis 备份或确认可恢复策略。
- [ ] 保留任务快照和当前容器/Compose 配置快照。
- [ ] 在下面的代码修复验证完成前，不重启全部 API。

### 2. 修复 XpertTask 执行幂等

责任仓库：`xpert-develop`

当前实现已完成：

- Cron 回调按任务时区计算规范化 occurrence key。
- `xpert_task_execution` 用唯一 `(taskId, occurrenceKey)` 和 owner/lease/attempt 状态机控制跨实例执行。
- 只有领取 lease 的实例创建会话和 Agent execution；会话和 execution ID 在领取时预分配，重试接管时复用已有 ID。
- 每分钟扫描旧的过期执行记录，避免原 Cron 已结束后无人再次触发接管。
- 测试覆盖并发领取、过期 lease 接管、完成 occurrence 去重和恢复扫描。
- `ChatConversation` 不再保存内部调度幂等字段。

验收标准：

- 三个 API 同时启动时，同一计划时间最多创建一条执行记录。
- 重复投递不会产生第二条业务执行；持有者退出后，lease 过期可由其他实例接管。
- 失败任务的重试策略有明确记录，不依赖进程内计数器。

### 3. 修复 Express Session 代理和共享存储

责任仓库：`xpert-develop`

- 在当前实际 `apps/api` 启动入口配置可信反向代理，使 `X-Forwarded-Proto: https` 能被正确识别。
- 使用 Redis-backed `express-session`，不在生产环境静默回退到 `MemoryStore`。
- 保留 JWT 认证行为，不改变现有 API Token 合同。

当前实现已新增 `apps/api/src/bootstrap/redis-session-store.ts`，复用现有 Redis 客户端实现 Session 的 `get/set/destroy/touch`。

已完成代码级修复：

- [x] `touch` 失败时向 Session middleware 传播 Redis 错误。
- [x] 两个 Store 实例通过同一个 Redis 客户端数据源读写相同 SID。
- [x] 移除新增测试中的 `as any`。
- [ ] HTTPS 反向代理登录响应包含 `Secure` Cookie 的集成测试。

验收标准：

- HTTPS 登录响应包含 `Set-Cookie`，并带有 `Secure` 属性。
- 相同 cookie 在 API-1、API-2、API-3 都能读取同一 Session。
- Redis 不可用时有明确失败或告警，不悄悄退回单实例内存 Session。

### 4. 第一阶段受控回归

- [ ] 恢复一个测试任务，记录任务 ID、计划时间和数据库快照。
- [x] 代码层增加独立 `schema-sync` owner，并禁止三个 API 在启动阶段并发 DDL。
- [ ] 发布包含 `schema-sync` 命令的 API 镜像和对应 installer，核验 Job 成功日志及新增表、列和唯一索引。
- [ ] 在维护窗口重启 API 实例。
- [ ] 检查三个 API 日志，只允许一个实例执行该任务。
- [ ] 检查 `chat_conversation` 和执行记录，只允许一条业务记录。
- [ ] 验证 API 健康、Runner 认证、数据库和 Redis 状态；如果 installer 已发布，同时确认多实例探针通过。
- [ ] 失败时按备份和任务快照恢复，不继续扩大测试范围。

## 第二阶段：故障恢复和架构治理

### 1. Chat Socket.IO 长响应恢复

- [ ] 用已登录账号跑一次真实长 Chat 响应。
- [ ] 中途停止一个 API，确认断线和重连行为。
- [ ] 基于 `threadId`、`runId`、最后事件位置从 Redis Stream 补回消息。
- [ ] 明确客户端重连后的重复消息、缺失消息和完成状态处理。
- [ ] 只有确认存在跨节点 room 广播需求时，才引入 Socket.IO Redis adapter。

### 2. 终端重新附着

- [ ] 将终端进程和生命周期的权威状态放到 NsJail Runner。
- [ ] API 只保存可重新附着的 session token 和权限上下文。
- [ ] API 故障后，客户端可连接新 API 并通过 token attach 原终端。
- [ ] 明确 Runner 重启、终端超时和租户隔离的恢复语义。

### 3. MCP SSE（启用后）

- [ ] 先确认启用的路由和客户端协议。
- [ ] 优先评估专用 MCP 网关或 Streamable HTTP。
- [ ] 如果继续使用 SSE，保证 GET 与 POST 命中同一连接拥有者，并定义实例故障后的恢复行为。
- [ ] 不把包含活动 HTTP response 的 `SSEServerTransport` 直接序列化到 Redis。

### 4. Docker Socket 和 Runner 高可用

- [ ] 评估将 Docker Socket 权限集中到专用 Worker。
- [ ] 确认 Docker runtime 迁移完成前不删除 API Socket 挂载。
- [ ] 评估单 Runner 故障时 Sandbox、terminal 和 proxy 的恢复策略。
- [ ] 为 Runner 的 privileged、cgroup、AppArmor 和共享 workspace 建立独立安全审查。

## 当前不做的变更

- 不因 Chat 当前为 WebSocket-only 就盲目增加 sticky session。
- 不因 MCP 源码存在风险就修改未启用的 MCP 路由。
- 不在没有备份的情况下停止全部 API 或删除运行中的容器。
- 不把 Redis 已被其他模块使用误认为 Express Session 已经接入 Redis。

## 参考文件

- `docker/nsjail-runner.sh`
- `docker/tests/nsjail-runner.test.sh`
- `xpert-develop/apps/api/src/bootstrap/index.ts`
- `xpert-develop/apps/api/src/schema-sync.ts`
- `xpert-develop/packages/server/src/database/application-data-source.ts`
- `xpert-develop/apps/api/src/bootstrap/redis-session-store.ts`
- `xpert-develop/apps/api/src/bootstrap/redis-session-store.spec.ts`
- `xpert-develop/apps/api/src/bootstrap/session.ts`
- `xpert-develop/apps/api/src/bootstrap/trust-proxy.ts`
- `xpert-develop/apps/api/src/bootstrap/schema-sync-bootstrap.ts`
- `xpert-develop/packages/server-ai/src/chat-conversation/conversation.entity.ts`
- `xpert-develop/packages/server-ai/src/xpert-task/xpert-task.service.ts`
- `xpert-develop/packages/server-ai/src/xpert-task/scheduled-task-execution.entity.ts`
- `xpert-develop/packages/server-ai/src/xpert-task/scheduled-task-execution.coordinator.ts`
- `xpert-develop/packages/server-ai/src/xpert-task/scheduled-task-execution.coordinator.spec.ts`
- `xpert-develop/packages/server-ai/src/chat/chat.gateway.ts`
- `xpert-develop/packages/server-ai/src/sandbox/sandbox-terminal.gateway.ts`
- `xpert-develop/packages/server-ai/src/mcp/transport/sse-transport.ts`
- `xpert-installer/docker/compose/docker-compose.yml`
- `xpert-installer/docker/aliyun/stack.sh`
- `xpert-installer/docker/data-x/stack.sh`
- `xpert-installer/docker/tests/schema-sync.test.sh`
