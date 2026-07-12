# Xpert UserGroup 授权与工作空间运行权限设计

> 状态：已落地，2026-07 更新运行时权限桥接设计。

## 背景

已发布智能体通过 `UserGroup` 向组织用户授权。审批通过后，用户会加入该智能体绑定的访问组，因此用户可以在智能体广场看到并打开智能体。

运行智能体时还会读取工作空间内的工作流、技能包和连接器。此前这些内部调用复用了创作态的 `read` 校验，而被授权用户通常不是工作空间 owner/member，因此即使已获得智能体使用权，运行链路仍会报：

```text
Access denied to workspace
```

问题不是智能体 ACL 没有生效，而是存在两层独立权限，且第二层错误地使用了创作态权限：

1. `PublishedXpertAccessService` 判断用户是否可以使用目标已发布智能体。
2. `XpertWorkspaceAccessService` 判断运行过程是否可以读取该智能体依赖的工作空间资源。

## 权限模型

### 智能体入口 ACL

`PublishedXpertAccessService` 是已发布智能体的入口边界。查询必须同时满足 tenant、organization、发布状态和资源授权范围。

普通组织用户可以通过以下任一关系访问目标智能体：

- 智能体创建者；
- 工作空间 owner/member；
- 用户属于该智能体在当前组织绑定的任一 `UserGroup`；
- 智能体位于 tenant-shared 工作空间。

API key、client secret 和公开 Chat App 继续使用各自的绑定范围。资源不存在或未发布返回 404；资源存在但无权访问返回 403。

### 工作空间能力

智能体入口 ACL 通过后，运行时仍要访问工作空间资源。工作空间能力明确拆分为 `read`、`run`、`write` 和 `manage`：

| 身份                                                          | canRead | canRun | canWrite | canManage |
| ------------------------------------------------------------- | ------- | ------ | -------- | --------- |
| 当前组织工作空间 owner                                        | 是      | 是     | 是       | 是        |
| 当前组织工作空间 member                                       | 是      | 是     | 是       | 否        |
| 当前组织中，属于该工作空间内任一已发布智能体 UserGroup 的用户 | 否      | 是     | 否       | 否        |
| 无上述关系的组织用户                                          | 否      | 否     | 否       | 否        |

UserGroup 只补充 `canRun`，绝不提升 `canRead`、`canWrite` 或 `canManage`。因此被授权用户能够执行智能体，但不能进入工作空间查看、编辑或管理其资源。

`canRun` 是工作空间级运行能力，因为技能、连接器等依赖资源以 `workspaceId` 为边界。它不替代目标智能体的入口 ACL：用户即使因某个智能体获得该工作空间的 `canRun`，也不能绕过 `PublishedXpertAccessService` 去启动同工作空间内未向其授权的其他智能体。

## UserGroup 到运行权限的桥接

`XpertWorkspaceAccessService.hasPublishedXpertRunAccess()` 查询当前工作空间中是否存在满足全部条件的智能体：

- `xpert.tenantId` 等于当前 tenant；
- `xpert.organizationId` 等于当前 organization；
- `xpert.workspaceId` 等于目标工作空间；
- `xpert.publishAt IS NOT NULL`；
- 智能体绑定的 `UserGroup` 同属当前 tenant 和 organization；
- 当前用户是该组成员。

查询使用 `xpert_to_user_group`、`user_group` 和 `user_group_to_user` 三张关联表。TypeORM 原生表名查询中的 alias 保持全小写，避免 PostgreSQL 对未加引号标识符折叠后出现 `missing FROM-clause entry`。

审批通过或管理员把用户加入智能体绑定的 UserGroup 后，不需要把用户加入工作空间，也不需要复制一份工作空间权限；下一次权限计算会直接获得 `canRun`。

## 创作态与运行态 API 分离

`XpertWorkspaceBaseService` 保留两组语义不同的方法：

- 创作态：`findOne()`、`getAllByWorkspace()`，要求 workspace `read`/authoring 权限；
- 运行态：`findOneForRuntime()`、`getAllByWorkspaceForRuntime()`，要求 workspace `run` 权限。

本次已将以下运行链路切换到运行态方法：

- `XpertChatHandler`：加载主智能体和 follow-up 智能体；
- `GetXpertWorkflowHandler`：编译运行所需工作流；
- `RuntimeCapabilitiesService`：列出工作空间技能包；
- 连接器与技能中间件继续通过 `assertCanRun()` 校验。

`getAllByWorkspaceForRuntime()` 在完成一次 `run` 校验后，直接使用带 tenant、organization、workspace 条件的 repository 查询。这里不能再调用通用 `findAll()`，因为后者会对 workspace 条件执行第二次 `read` 校验，从而再次拒绝只有 `canRun` 的用户。

所有编辑、保存、删除、发布和工作空间管理入口仍使用创作态方法或 `write/manage` 校验，不能为了复用运行逻辑而改成 `run`。

## 运行调用链

一次组织用户聊天请求的授权顺序如下：

1. Assistant 查询/运行入口通过 `PublishedXpertAccessService` 校验目标智能体 ACL。
2. `XpertChatHandler` 通过 `findOneForRuntime()` 加载智能体。
3. `GetXpertWorkflowHandler` 通过 `findOneForRuntime()` 加载并编译工作流。
4. `RuntimeCapabilitiesService` 通过 `getAllByWorkspaceForRuntime()` 读取技能包。
5. 连接器和技能执行通过 `assertCanRun()` 读取运行依赖。
6. 任一步发现 tenant、organization、发布状态、UserGroup 成员关系或工作空间范围不匹配，立即拒绝。

## 安全不变量

- 智能体授权和工作空间授权必须分层校验，不能只保留其中一层。
- UserGroup 授权只适用于已发布智能体；未发布智能体不能产生 workspace `canRun`。
- UserGroup、用户、智能体和工作空间必须属于同一 tenant/organization 范围。
- 运行态查询仍必须附加 tenant、organization 和 workspace 条件，不能在权限校验后做无作用域查询。
- 普通 `findOne()`/`findAll()` 保持创作态语义；只有真实运行调用链可以使用 Runtime 方法。
- 获得 `canRun` 不代表可以列出、查看、编辑或管理工作空间。

## 回归测试

关键测试覆盖：

- UserGroup 中的用户对包含已发布智能体的组织工作空间仅获得 `canRun`；
- 未发布、跨 tenant、跨 organization 或非成员关系不会产生 `canRun`；
- SQL 关联使用兼容 PostgreSQL 的小写 alias；
- `findOneForRuntime()` 使用 `run` 而不是 `read`；
- `getAllByWorkspaceForRuntime()` 只做一次运行权限校验，并执行带完整 scope 的查询；
- Chat、工作流编译和 Runtime Capabilities 使用运行态 service 方法；
- 原有创作态读取仍要求 workspace authoring 权限。

## 相关实现

- `packages/server-ai/src/xpert/published-xpert-access.service.ts`
- `packages/server-ai/src/xpert-workspace/workspace-access.service.ts`
- `packages/server-ai/src/xpert-workspace/workspace-base.service.ts`
- `packages/server-ai/src/xpert/commands/handlers/chat.handler.ts`
- `packages/server-ai/src/xpert/queries/handlers/get-xpert-workflow.handler.ts`
- `packages/server-ai/src/ai/runtime-capabilities.service.ts`
