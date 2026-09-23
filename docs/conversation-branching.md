# ChatKit: Branch in new chat

从一条已完成的 AI 消息创建独立 conversation，包含源 thread 根节点到该消息的完整祖先路径。它与 `threads.copy()` 的同 conversation 分支不同；已有 copy API 保持原语义。

## 契约

`POST /api/ai/conversations/:conversationId/branch`

```json
{
  "sourceThreadId": "source-thread",
  "afterMessageId": "<message UUID>",
  "requestId": "<UUID generated once per user attempt>"
}
```

返回 `ChatConversation`，包含新 `id`、`threadId`、`branchSource`。沿用现有 AI API 认证和组织上下文；要求对源会话具有 contribute 权限，并再次校验公开 Assistant、项目和文件访问。`requestId` 在同一用户、源 thread 下持久化去重，网络重试须复用；同一标识改变消息参数返回 409。

AI 消息通过 `branching: { available, reason? }` 暴露能力。内部 outputCheckpoint 不出现在历史 DTO 或 SSE 中。原因包括 `message_not_complete`、`checkpoint_unavailable`、`graph_changed`、`state_not_supported`；endpoint 另外可返回 `message_not_in_thread`、`request_conflict`。访问撤销按现有 403 处理。

## 状态边界与数据所有权

- 根图完成且没有待执行任务时捕获准确 checkpoint，以及当时子图 namespace 的 checkpoint；先保存不可分叉的临时锚点，待外层流处理完 steer 事件、最终 AI 消息入库后，仅对同一 execution 的最终 head 消息封存能力。steer 中间消息没有独立边界，不开放分叉。
- 消息最终入库后封存内容与祖先路径校验值、Agent 展示快照、文件授权列表及 conversation options。完成事件和历史 DTO 使用相同能力判定。后续修改了祖先文本的路径不能再冒充原图状态。
- 在源 thread 行锁和数据库事务内，复制消息、TypeORM closure tree、文件关联及所需 checkpoint 祖先；目标使用新的 conversation/thread/message ID。来源是 JSON 审计信息，没有跨 conversation parentThread 外键。
- 工作流和文件权限查询在写事务前完成；锁定源 thread 后重新读取并核对消息、checkpoint 和附件快照，事务内的数据库操作仅使用当前事务的 manager。校验期间发生修改会拒绝复制，源 thread 在所选消息之后追加消息不影响分叉；并发重试仍在锁内去重。
- 复制的历史消息保留原始 `createdAt` 和 `updatedAt`，新 conversation 和 thread 使用新的创建时间。
- Serializer 保留模型消息类型、tool-call/result 配对和子图状态。只重绑已知平台身份字段及摘要消息导航 ID；不猜测任意业务 JSON 中字符串的含义。持有不可迁移知识任务或无法解析的状态会被拒绝。图版本变化也会被拒绝。
- 不复制 pending writes、排队输入、runControl、审批、运行进程、runtime context 或执行外键。目标 idle，第一次 human 输入通过正常发送路径继续，不重放旧工具。历史 MCP App 只展示保存的 toolResult，不复活源 appInstance；旧执行信息作为历史展示快照保存。
- 历史消息的 input/output checkpoint 引用迁移到目标 thread，支持后续编辑历史输入或再次分叉。清理任务保留 output anchor 及祖先依赖。删除源 conversation 不级联删除目标消息或 checkpoint。

**历史对话状态可分叉，工作文件保持共享当前状态。** 分叉沿用项目/Assistant 的工作目录和共享文件，双方后续文件写入可能互相可见；不会复制或回滚文件字节。会话专属 session 目录重新解析为新 conversation。文件资产仅在重新验证访问后建立目标 ConversationFileLink。

## 发布顺序

1. 在 Xpert 数据库执行 `packages/server-ai/src/chat-conversation/migrations/20260922-conversation-branch.sql`，再部署后端。迁移可重复执行，新增字段可空，不补造旧消息锚点。回滚应用时可保留新增列。
2. 使用已发布的 `@xpert-ai/xpert-sdk@0.4.0`，ChatKit UI 的 SDK 依赖为 `^0.4.0`。
3. Xpert 宿主升级到已发布的 `@xpert-ai/chatkit-types@0.6.1` 和 `@xpert-ai/chatkit-ui@0.6.1`，并更新锁文件。旧服务端不返回 branching 时不显示分叉按钮；宿主可设置 `threadItemActions.branch: false` 关闭。

依赖从 npm registry 安装，锁文件记录已发布包的完整性校验值，不依赖本地 tarball。ClawXpert 已设置 `messagePresentation.collapseProcess: true`。更新依赖不会自动执行数据库迁移，部署时仍须先完成第 1 步。

## 验证与观测

新增测试覆盖精确祖先路径、A1 状态续聊不带入 H2、工具不重放、源 checkpoint 删除后的目标恢复、文件授权复制、幂等、回滚、导航竞态、快照开放时机、旧消息、历史 UI 和共享目录真实读写。PostgreSQL 测试只使用显式 `CHATKIT_BRANCH_TEST_DATABASE_URL`，在随机 schema 内验证迁移重复执行及实际清理 SQL，并清理该 schema；不读取平台数据库配置。

```sh
CHATKIT_BRANCH_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:PORT/postgres \
  corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand \
  --runTestsByPath packages/server-ai/src/chat-conversation/conversation-branch.postgres.spec.ts
```

Prometheus 增加 `xpert_conversation_branches_total{outcome,reason}`、`xpert_conversation_branch_duration_seconds`、`xpert_conversation_branch_items{kind}`。可据此统计成功率、失败原因、耗时、复制规模；不记录正文、checkpoint 内容或用户/会话 ID 标签。幂等返回计为 `idempotent_retry`，不会重复统计复制规模。

仍需在发布环境完成真实 Assistant、子图插件、附件权限和宿主嵌入的端到端验收；本地测试与构建不代表已部署验收。
