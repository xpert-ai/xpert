# Xpert App 运行态导出 Agent Plugin 与 Assistant MCP Tasks 改造计划

> 文档状态：架构与实施计划  
> 日期：2026-09-04  
> 适用范围：Xpert Plugin App、Assistant Template 初始化、MCP Publication、Agent Plugin 导出、Assistant 异步调用  
> 目标：让已初始化的 Xpert Plugin App 可以导出符合 Agent Plugins 规范的客户端插件，并通过标准 MCP Tool 将 Xpert Assistant 作为远程子 Agent 调用；长时间运行的 Assistant 调用通过 MCP Tasks 扩展异步执行。

## 一、背景与问题定义

Xpert Plugin 是服务端插件，能够提供 Assistant Template、Skills、MCP Servers、MCP Tools、MCP Apps、Agent Middleware、Workbench View 和业务服务。Agent Plugins 则主要面向客户端 Agent，是由 manifest、Skills 和 MCP Server 配置组成的可分发能力包。

两者不能在插件构建阶段直接一一转换，原因是构建阶段还没有以下运行态信息：

- App 是否已在目标组织初始化。
- Assistant Template 对应的真实 Assistant 实例。
- Assistant 是否已经发布，以及当前发布版本。
- 哪些 MCP 能力已由管理员启用。
- 对外可访问的 MCP HTTPS Endpoint。
- OAuth、权限、限流和审计策略。

因此，本方案把 Agent Plugin 定义为 **Plugin App 安装实例的运行态导出物**，而不是原始服务端 Plugin Package 的静态构建产物。

核心链路：

```text
安装 Xpert Plugin
  → 初始化 Plugin App
  → 从 Assistant Template 创建并发布 Assistant
  → 启用 App MCP Gateway
  → 校验外部访问和授权条件
  → 导出 Agent Plugin ZIP
  → 客户端 Agent 安装并通过 MCP 调用
```

## 二、目标

### 2.1 产品目标

1. 在 Plugin App 展示页面提供“用于外部 Agent”入口。
2. 只有 App 初始化完成、Assistant 可调用、MCP Gateway 已启用后，才允许导出。
3. 导出的 Agent Plugin 包含可移植的 Skills 和 MCP 连接配置，不包含服务端代码和秘密信息。
4. 平台自动为初始化后的 Assistant 生成一个标准 MCP Tool，让客户端 Agent 能以“远程子 Agent”方式委托任务。
5. Assistant 长任务通过 MCP Tasks 扩展持久化执行，支持查询、取消，并为后续人工输入恢复预留协议。
6. 一个 App 对外只暴露一个稳定的 MCP Gateway URL，由 Gateway 聚合 Assistant Tool 和管理员允许的其他 MCP 能力。
7. App、Assistant、MCP、OAuth、任务和导出版本具有完整的组织隔离、审计和失效机制。

### 2.2 非目标

第一阶段不包含：

- 把整个 Xpert 服务端 Plugin Package 转换成可在客户端执行的插件代码。
- 让客户端直接获得 `xpertId`、`tenantId`、`organizationId`、`agentKey` 或内部执行实体。
- 让外部 Agent 直接控制 Xpert Assistant Graph 内部节点。
- 把 MCP Tool 自动注册为客户端原生 Agent Tree 中的真正子 Agent。
- 在导出 ZIP 中写入 API Key、OAuth Access Token 或其他凭据。
- 第一阶段支持任意文件上传、Workspace 内部文件路径或复杂 HITL 恢复。

## 三、现状基础

当前 Xpert 已具备本方案的大部分基础能力。

### 3.1 Plugin App 安装实例

`packages/contracts/src/plugin.ts` 中的 `IPluginApplicationInstallation` 已保存：

- `pluginName`
- `appName`
- `pluginVersion`
- `templateId` / `templateVersion`
- `workspaceId`
- `xpertId`
- `resourceRefs`

这组数据可以作为运行态导出主体的身份和来源证明。

### 3.2 Assistant 初始化与发布

`packages/server-ai/src/plugin-resource/plugin-application.service.ts` 已负责：

- 创建独立 Workspace。
- 初始化知识库等依赖资源。
- 复用或安装 Assistant Template。
- 保存创建后的 `xpertId` 和资源引用。

`InstallTemplateCommand` 的 App 初始化路径会传入 `publish: true`，并由 `install-template.handler.ts` 发布 Assistant。

当前健康检查主要验证 Workspace、Assistant 和知识库是否存在。Agent Plugin 导出前仍需补充：

- Assistant 当前是否处于已发布状态。
- 发布版本是否与安装记录、模板版本匹配。
- Assistant 的主 Agent 是否存在且可执行。
- 导出所需能力是否仍然有效。

### 3.3 MCP Publication 与 MCP Tasks

平台已有：

- MCP Capability Catalog。
- MCP Publication 和 Streamable HTTP Endpoint。
- API Key 与 OAuth 认证基础。
- Toolset 到 MCP Capability 的绑定。
- 持久化 `McpTask`。
- Managed Queue 执行。
- `tasks/get`、`tasks/update`、`tasks/cancel` 协议处理。
- Tool `taskMode` 和最大生命周期声明。

当前协议常量已经使用 `2026-07-28` 和扩展 ID `io.modelcontextprotocol/tasks`。实现时应以正式 Tasks Extension 为目标，并把旧式 `execution.taskSupport` 仅作为必要的兼容信息，而不是新版协商依据。

### 3.4 Assistant Task Runtime

`AssistantTaskRuntimeCapability` 已提供：

- `startTask`
- `getTaskStatus`
- `cancelTask`
- Assistant 绑定和执行记录查询

`assistant-task-runtime.service.ts` 已能创建 Conversation、Execution，启动 Xpert Chat 执行，并立即返回运行句柄。因此，新的 Assistant MCP Tool 应复用该运行时能力，而不是再实现一套 Assistant 调用链路。

### 3.5 现有 App 页面

`apps/cloud/src/app/features/explore/app-detail/app-detail.component.html` 已展示 App 状态、初始化入口和 MCP Providers，可在现有 MCP 区域下增加 Agent Plugin Export 卡片，不需要新建独立管理页面。

## 四、核心架构决策

### 4.1 导出主体是 App Installation

每份导出物绑定以下服务端对象：

```text
pluginName
+ appName
+ installationId
+ pluginVersion
+ templateId/templateVersion
+ xpertId
+ Assistant published version
+ App MCP Gateway publicationId
```

导出 API 的客户端参数只需要 `pluginName` 和 `appName`，或明确的 `installationId`。`xpertId`、组织和发布对象必须由服务端根据当前身份解析，不能由浏览器或外部 Agent 指定。

### 4.2 使用 App MCP Gateway

为每个 App Installation 建立一个组织级 App MCP Gateway Publication，而不是把组织级 Assistant 绑定到租户共享的 Plugin MCP Provider Publication。

Gateway 聚合：

- 平台生成的 Assistant 虚拟 MCP Tool。
- 管理员选择公开的 Plugin MCP Tools。
- 可选 MCP Apps、Resources 和 Prompts。
- OAuth Scope、RBAC、限流、计费和审计策略。

导出的 `mcp.json` 只指向该 Gateway 的稳定 HTTPS URL。

这样可以：

- 避免跨组织泄露 Assistant 实例。
- 保持客户端配置稳定。
- 在服务端调整能力绑定而无需更换 Endpoint。
- 统一 OAuth、Tasks、审计、限流和能力失效处理。

### 4.3 Assistant 以虚拟 MCP Tool 对外暴露

Assistant Tool 由平台自动生成，不要求每个插件开发者重复实现。开发者通过 Assistant Template 提供 Assistant 行为、Skills、Tools 和提示词，平台负责把初始化后的实例投影为 MCP Tool。

客户端看到的是标准 MCP Tool；Xpert 内部启动的是独立的远程 Assistant Execution。它具有“委托给子 Agent”的使用体验，但不承诺进入客户端原生 Agent Tree。

### 4.4 Skills 指导能力选择，Slash Commands 由客户端决定

Agent Plugin 导出的 Skill 应描述：

- 什么时候调用该远程 Assistant。
- 应如何组织 instruction 和 context。
- 什么时候直接使用同一 Gateway 中的原子 MCP Tools。
- 支持 MCP Tasks 时如何等待结果。
- 不支持 MCP Tasks 时如何使用兼容工具。
- 哪些任务需要用户确认或不能委托。

Skill 名称可以让支持 Slash Commands 的客户端生成 `/skill-name` 或其他命令入口，但 Xpert 不应把 Slash Command 当作跨客户端的强制协议。命令展示和触发方式仍由客户端决定。

## 五、总体架构

```text
┌───────────────────────────────────────────────────────┐
│ Client Agent                                          │
│ Agent Plugin: plugin.json + skills/ + mcp.json       │
└───────────────────────────┬───────────────────────────┘
                            │ MCP Streamable HTTP + OAuth
                            ▼
┌───────────────────────────────────────────────────────┐
│ App MCP Gateway                                      │
│                                                       │
│ Assistant virtual tool                               │
│ Selected plugin tools / apps / resources / prompts   │
│ Auth / RBAC / quota / audit / task negotiation       │
└──────────────────────┬────────────────────────────────┘
                       │ tools/call
                       ▼
┌───────────────────────────────────────────────────────┐
│ MCP Task                                              │
│ durable state + Managed Queue + idempotency          │
└──────────────────────┬────────────────────────────────┘
                       │ persisted task link
                       ▼
┌───────────────────────────────────────────────────────┐
│ Xpert Assistant Task                                 │
│ Conversation + Thread + Agent Execution              │
└──────────────────────┬────────────────────────────────┘
                       │ safe result projection
                       ▼
                  MCP CallToolResult
```

## 六、导出资格与状态机

### 6.1 导出资格

导出前必须同时满足：

1. App Installation 状态为 `READY`。
2. `xpertId` 存在，并且严格属于当前 Tenant/Organization。
3. Assistant 存在且已发布。
4. Assistant 发布版本与当前 App/Template 来源一致，或已明确接受兼容升级。
5. App MCP Gateway Publication 状态为 `ACTIVE`。
6. Gateway 至少包含 Assistant 虚拟工具；其他 Plugin MCP Tools 为可选能力。
7. Gateway Endpoint 是可由目标客户端访问的绝对 HTTPS URL。
8. 已配置可用于外部客户端的 OAuth；开发环境可显式允许 API Key，但导出包不得包含 Key。
9. 所有导出的 Skills 通过 Agent Skills 格式、路径、大小和安全校验。
10. 所有导出能力都能在外部上下文执行，不依赖无法恢复的浏览器、Workbench 或内部请求状态。

### 6.2 推荐状态

```text
NOT_INITIALIZED
ASSISTANT_UNPUBLISHED
GATEWAY_DISABLED
AUTH_REQUIRED
READY_TO_EXPORT
EXPORT_STALE
DEGRADED
```

`EXPORT_STALE` 表示已有导出记录，但 App、Template、Assistant 发布版本、MCP Capability 或授权策略发生变化，需要重新生成导出包。

### 6.3 生命周期失效条件

以下事件应重新计算导出状态：

- Plugin 升级或回滚。
- App Template 升级。
- Assistant 重新发布、取消发布或删除。
- App MCP Gateway 启用、禁用或更换授权策略。
- Gateway 能力绑定发生变化。
- Tool Schema、Skill 内容或 MCP Endpoint 发生变化。
- App Installation 被禁用、删除或健康检查失败。

重新导出通常只更新 ZIP 和导出版本，不应重新创建 Gateway Endpoint。

## 七、Assistant 虚拟 MCP Tool 合约

### 7.1 工具命名

平台生成稳定、可预测且避免冲突的名称，例如：

```text
delegate_to_<app_slug>
```

工具标题可以本地化，工具名称保持稳定英文标识。

### 7.2 输入

第一阶段建议保持严格、最小和有界：

```ts
interface DelegateToAssistantInput {
  instruction: string
  context?: Record<string, JsonValue>
  conversationHandle?: string
  clientRequestId?: string
}
```

约束：

- 根对象和嵌套业务对象严格校验未知字段。
- `instruction` 去除首尾空白并设置长度上限。
- `context` 限制深度、键数、字符串长度和总序列化大小。
- `conversationHandle` 只能是服务端签发的不透明句柄。
- `clientRequestId` 用于幂等，设置固定格式和长度上限。
- Tenant、Organization、User、Workspace、Assistant、Agent、Token 等身份字段不能出现在模型输入中。
- 第一阶段不接受 Base64、服务器路径或 Workspace 内部文件 ID。

附件后续通过受治理的 Artifact、Resource 或便携文件引用协议单独扩展。

### 7.3 服务端绑定

Gateway 根据当前 Publication 和 App Installation 固定解析：

- `xpertId`
- 默认 `agentKey`
- Workspace
- Plugin/App/Template 来源
- 调用者 Tenant/Organization/User
- 可用 Skills 和 Tool 权限

调用者不能通过工具参数切换 Assistant 实例或组织。

### 7.4 输出

对外只返回白名单 DTO：

```ts
interface AssistantInvocationResult {
  status: 'completed' | 'failed' | 'cancelled'
  answer?: string
  artifacts?: Array<{
    id: string
    name: string
    mediaType?: string
  }>
  warnings?: Array<{
    code: string
    message: string
  }>
  error?: {
    code: string
    retryable: boolean
    message: string
  }
}
```

标准 MCP 返回：

- `structuredContent` 保存稳定 DTO。
- `content` 仅保存简短文本回退。
- 内部任务、会话和执行句柄不进入模型可见正文；确有客户端恢复需要时，通过服务端不透明句柄或受控 `_meta` 返回。
- 不返回原始 Agent Execution、Checkpoint、完整消息历史、平台日志、内部路径或私有 URL。

## 八、MCP Tasks 与 Assistant Tasks 桥接

### 8.1 必须增加持久化桥接

现有 `startAssistantTask()` 会异步启动 Assistant 并立即返回 `running`。如果普通 MCP Task Processor 直接调用它，Processor 会把“已启动”误判成“已完成”。

应增加独立关联模型，示意如下：

```ts
interface McpAssistantTaskLink {
  id: string
  tenantId: string
  organizationId: string
  publicationId: string
  mcpTaskId: string
  assistantTaskId: string
  conversationId: string
  threadId: string
  executionId: string
  appInstallationId: string
  xpertId: string
  agentKey: string
  attempt: number
  status: string
  createdAt: Date
  updatedAt: Date
}
```

数据库实体必须遵守 Tenant/Organization 隔离并具有唯一约束，防止重复队列投递启动多个 Assistant Execution。

### 8.2 执行流程

```text
1. 客户端调用 tools/call。
2. 服务端确认客户端和服务端均协商 io.modelcontextprotocol/tasks。
3. 持久化创建 McpTask 后返回 CreateTaskResult。
4. Managed Queue Processor 恢复调用者身份和 App Installation。
5. Processor 幂等启动 Assistant Task。
6. 保存 McpTask 与 Assistant Task 的全部关联句柄。
7. Processor 结束本次执行，不长期占用 HTTP 请求或工作线程。
8. 后续监督任务或状态查询对 Assistant Execution 进行协调。
9. Assistant 终止后，读取安全结果投影并完成 McpTask。
10. 客户端通过 tasks/get 获取状态和最终 CallToolResult。
```

### 8.3 状态映射

| Xpert Assistant 状态 | MCP Task 状态                | 处理规则                        |
| -------------------- | ---------------------------- | ------------------------------- |
| `queued`             | `working`                    | 返回排队阶段和有限进度          |
| `running`            | `working`                    | 更新阶段、进度和轮询建议        |
| `succeeded`          | `completed`                  | 必须先取得安全最终结果          |
| `failed`             | `failed`                     | 返回稳定错误码和可重试信息      |
| `interrupted`        | `input_required` 或 `failed` | 取决于是否已支持输入恢复        |
| 已确认取消           | `cancelled`                  | MCP 和 Assistant 均完成取消协调 |
| `unknown`            | `working` 或可恢复失败       | 不得推断成功                    |

### 8.4 结果投影能力

现有 Assistant Task Status 主要返回状态和句柄，不能直接满足外部工具结果。需要增加平台级只读能力，例如：

```ts
getTaskResult(input: AssistantTaskResultInput): Promise<AssistantTaskResultProjection>
```

该能力负责：

- 从权威 Execution/Conversation 状态确定最终结果。
- 选择最终 Assistant 答案而不是返回全部消息。
- 提取受治理 Artifact 摘要。
- 限制文本和集合大小。
- 过滤内部字段、敏感上下文、工具原始输出和堆栈。
- 当 Assistant 虽然结束但没有有效结果时返回明确失败，不得伪造成功。

### 8.5 取消

MCP Queue Job 和 Assistant Execution 是两个取消面：

- 尚未启动 Assistant 时，取消 Managed Queue Job。
- 已启动 Assistant 时，调用 `AssistantTaskRuntimeCapability.cancelTask()`。
- 取消属于协作式、最终一致操作；只有 Assistant Execution 已停止或进入确定终态后，MCP Task 才标记为 `cancelled`。
- 每次取消请求都重新验证当前 OAuth Subject 对该 Task 的权限。

### 8.6 人工输入

正式 MCP Tasks Extension 支持 `input_required` 和 `tasks/update`。当前 Assistant Task Capability 尚缺少清晰的 `provideInput` 或 `resumeTask` 合约。

分阶段处理：

1. v1 只允许无需 HITL 的 Assistant 对外导出，或在发生中断时返回 `assistant_input_required_not_supported`。
2. v2 为 Assistant Task Runtime 增加受控输入恢复能力。
3. `tasks/update` 校验输入请求 ID、Revision、调用者身份和输入 Schema 后恢复 Assistant Execution。
4. 输入不得直接覆盖内部 State 或 Graph Checkpoint。

### 8.7 客户端兼容

Agent Plugin manifest 不负责声明 MCP Tasks 支持。Tasks 必须在 MCP 初始化阶段由客户端和服务端动态协商。

建议同时提供：

- 标准工具：`delegate_to_<app_slug>`，优先声明 `taskMode: 'required'`。
- 兼容工具：
  - `assistant_run_start`
  - `assistant_run_get`
  - `assistant_run_cancel`

导出的 Skill 根据客户端能力选择调用方式。对于确定可以快速完成的 Assistant，可后续支持 `taskMode: 'optional'` 和同步回退；不应让不可控的长任务长期占用 HTTP 请求。

## 九、Agent Plugin 导出物

### 9.1 推荐目录

```text
<app-slug>/
├── plugin.json
├── mcp.json
└── skills/
    └── <assistant-skill-name>/
        └── SKILL.md
```

可以按目标客户端增加可选扩展字段或安装说明，但核心目录必须保持便携。

### 9.2 `plugin.json`

包含：

- 稳定插件 ID。
- 名称、描述、版本和作者。
- Skills 与 MCP Server 的相对路径引用。
- 必要的 Agent Plugins 扩展元数据。
- Xpert 导出来源的非敏感版本信息。

不包含：

- `installationId`
- `xpertId`
- Tenant/Organization ID
- Access Token、Refresh Token、API Key
- 内部服务地址或数据库标识

### 9.3 `mcp.json`

只包含 App MCP Gateway 的外部 URL 和非秘密客户端配置。例如：

```json
{
  "mcpServers": {
    "xpert-sales-assistant": {
      "url": "https://xpert.example.com/api/mcp/p/sales-assistant"
    }
  }
}
```

安装后由客户端执行 OAuth 授权。开发模式使用 API Key 时，也只能生成不含 Key 的配置模板。

### 9.4 `SKILL.md`

Skill 内容由以下来源生成并经过验证：

- App 描述和业务能力。
- Assistant Template 的角色与 Starter Prompts。
- Assistant 可使用的 Skills 摘要。
- Gateway 当前公开的 Tools。
- 同步、MCP Tasks 和兼容工具调用规则。
- 安全限制、确认要求和失败恢复说明。

Skill 不能内嵌服务端秘密、内部 ID、完整系统提示词或用户业务数据。

### 9.5 导出版本

导出版本应由稳定输入计算，例如：

```text
pluginVersion
+ templateVersion
+ assistantPublishedVersion
+ capabilityCatalogHash
+ skillBundleHash
+ gatewayPolicyRevision
+ exporterVersion
```

保存导出哈希、生成时间和导出器版本，支持判断是否需要重新导出。

## 十、Contracts、数据模型与 API

### 10.1 App Detail 合约

建议在 `PluginApplicationDetail` 中增加：

```ts
interface AgentPluginExportSummary {
  status:
    | 'not_initialized'
    | 'assistant_unpublished'
    | 'gateway_disabled'
    | 'auth_required'
    | 'ready'
    | 'stale'
    | 'degraded'
  eligible: boolean
  blockers: Array<{ code: string; message?: string }>
  warnings: Array<{ code: string; message?: string }>
  publicationId?: string
  endpoint?: string
  protocolVersion?: string
  taskExtension?: {
    id: 'io.modelcontextprotocol/tasks'
    supported: true
  }
  exportVersion?: string
  exportedAt?: string
}
```

后端返回稳定 Code；UI 负责本地化显示文本。

### 10.2 Installation 持久化

第一阶段可以把以下引用放入受类型约束的 `resourceRefs`：

- `agentPluginPublicationId`
- `agentPluginExportVersion`
- `agentPluginExportHash`
- `agentPluginExportedAt`

长期建议增加明确字段或独立 `PluginApplicationAgentExport` 实体，避免 `resourceRefs` 演变为无约束状态容器。

### 10.3 后端 API

建议端点：

```text
GET  /plugin-applications/:pluginName/:appName/agent-plugin
POST /plugin-applications/:pluginName/:appName/agent-plugin/enable
POST /plugin-applications/:pluginName/:appName/agent-plugin/validate
POST /plugin-applications/:pluginName/:appName/agent-plugin/export
POST /plugin-applications/:pluginName/:appName/agent-plugin/disable
```

语义：

- `GET`：返回资格、阻断项、警告和当前导出版本。
- `enable`：创建或启用 App MCP Gateway，默认只绑定 Assistant 虚拟工具。
- `validate`：重新执行 Assistant、Gateway、Auth、Skill 和能力检查。
- `export`：在再次验证后生成 ZIP，并写审计记录。
- `disable`：关闭 Gateway 外部访问，不删除 Assistant 和 App Installation。

所有接口都必须从 RequestContext 获取 Tenant、Organization 和 User，并执行 App 管理权限校验。

## 十一、App 页面设计

在现有 MCP Providers 区域下增加“用于外部 Agent”卡片。

### 11.1 状态展示

- 未初始化：显示“初始化 App 后可导出”。
- Assistant 未发布：显示修复或重新发布入口。
- Gateway 未启用：显示“启用外部访问”。
- 未配置 OAuth：显示授权配置阻断项。
- 可导出：显示验证、下载 ZIP、复制安装说明。
- 已过期：显示版本差异和重新导出。
- 降级：显示不可用能力和安全的修复动作。

### 11.2 能力预览

导出前展示：

- Assistant 委托工具。
- 选中的 Plugin MCP Tools。
- 导出的 Skills。
- MCP Tasks 支持情况。
- Endpoint、认证方式和权限 Scope。
- 不支持的客户端功能及兼容方式。

涉及启用公网访问、扩大 Tool Scope 或降低认证要求时使用明确确认；普通验证和下载不增加多余确认。

## 十二、安全、治理与审计

### 12.1 身份和授权

- 生产默认使用 OAuth。
- 每次 Tool Call、Task Get/Update/Cancel 都重新验证授权。
- MCP Task 必须绑定创建它的授权主体或允许的服务主体。
- Gateway 根据 App Installation 固定组织和 Assistant，模型输入不能修改作用域。
- Tool Scope、Assistant 调用权限和用户权限取交集。
- Task ID 和 Conversation Handle 必须不可猜测。

### 12.2 数据最小化

- 导出包不包含任何 Secret。
- Tool 输出使用白名单 DTO。
- 不暴露完整对话、Checkpoint、日志或内部 Entity。
- Skill 不复制完整 System Prompt 或私有知识内容。
- Context、Result、Artifact 列表和错误消息均设置大小上限。

### 12.3 限流、配额与计费

Gateway 应支持：

- 按 Tenant、Organization、OAuth Client、User、App 和 Tool 限流。
- Assistant 并发限制和最大运行时长。
- Token、模型、工具与任务资源用量归集。
- 失败和取消任务的计费规则。
- 防止外部 Agent 无界循环委托。

### 12.4 审计

至少记录：

- 外部 Client 和 OAuth Subject。
- Plugin/App Installation。
- Plugin、Template、Assistant 发布和导出版本。
- Publication、Capability 和 Tool。
- MCP Task ID 与 Assistant Execution ID 的关联。
- 启动、状态转换、输入、取消和终止原因。
- 用量、时长、错误码和结果摘要。

审计视图可以显示授权后的内部关联，但不得进入 MCP Tool 的模型可见结果。

## 十三、协议兼容与现有实现修正

1. 以 MCP `2026-07-28` Tasks Extension 为目标协议。
2. 初始化时协商 `io.modelcontextprotocol/tasks`，不能只依赖 Tool 元数据。
3. 服务端不得向没有声明该扩展的客户端返回 Task Handle。
4. `taskMode: 'required'` 在客户端不支持 Tasks 时应返回标准能力缺失错误。
5. 当前 `missingTaskExtensionCapability()` 使用的 `-32003` 应按现行 SEP-2663 核对并调整为 `-32021`。
6. 保留旧客户端兼容层时，应隔离在协议 Adapter，不让旧字段成为新业务 Contract。
7. 任务必须先持久化，再返回 CreateTaskResult。
8. 客户端轮询必须遵守服务端给出的 Poll Interval。
9. Task Cancel 是最终一致、协作式取消，不能在收到请求时立即伪造终态。

相关规范：

- Agent Plugins Specification：https://agent-plugins.org/specification
- OpenAI Plugins Documentation：https://developers.openai.com/plugins
- MCP Tasks Extension：https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2663-tasks-extension.md
- MCP Tasks Overview：https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/tasks/overview.mdx

## 十四、实施阶段

### Phase 0：协议与边界固化

- 确认 Agent Plugin manifest 目标版本和兼容矩阵。
- 确认 `2026-07-28` Tasks Extension 实现要求。
- 固化 Assistant Tool 输入、输出、错误码和安全边界。
- 确认 App Gateway 是组织级 Publication。
- 建立 Architecture Decision Record。

交付条件：Contract、状态机、实体关系和安全评审通过。

### Phase 1：导出资格和 App UI

- 扩展 `PluginApplicationDetail`。
- 增加导出资格计算服务。
- 校验 Assistant 发布状态和版本。
- 在 App Detail 增加 Agent Plugin Export 卡片。
- 增加国际化文案、阻断项和恢复入口。

交付条件：用户能够清楚看到为什么可以或不能导出。

### Phase 2：App MCP Gateway

- 创建 App Installation 级 Gateway Publication。
- 绑定平台生成的 Assistant Capability。
- 支持选择额外 Plugin MCP Capabilities。
- 接入 OAuth、RBAC、限流和审计。
- 保持 Endpoint 稳定并支持能力增量更新。

交付条件：外部 MCP Client 能列出 Assistant Tool，并且不能跨组织访问。

### Phase 3：同步 Assistant Tool 原型

- 实现平台级 Assistant Tool Provider/Adapter。
- 从 App Installation 服务端绑定 Assistant。
- 增加严格输入 Schema 和安全结果 DTO。
- 增加 `getAssistantTaskResult` 投影能力。
- 对受控短任务完成端到端验证。

交付条件：外部 Agent 能调用 Assistant 并获得准确、有限、无敏感字段的结果。

### Phase 4：MCP Tasks 桥接

- 新增 `McpAssistantTaskLink`。
- 使用 Managed Queue 启动和监督 Assistant。
- 实现幂等、防重复启动、重启恢复和状态映射。
- 协调 MCP 与 Assistant 两个取消面。
- 结果完成前验证 Assistant 的权威终态。
- 修正 Tasks Extension 错误码和协议兼容边界。

交付条件：长任务跨 HTTP 请求和服务重启后仍可查询、完成或取消。

### Phase 5：Agent Plugin 生成器

- 生成 `plugin.json`、`mcp.json` 和 `skills/**/SKILL.md`。
- 验证路径、Schema、大小、秘密扫描和 ZIP 完整性。
- 生成稳定导出版本和哈希。
- 保存导出审计记录。
- 增加下载和安装说明。

交付条件：导出包能被至少一个标准 Agent Plugin 客户端和 OpenAI Codex 客户端安装，并成功完成 MCP 调用。

### Phase 6：兼容与 HITL

- 增加 `assistant_run_start/get/cancel` 兼容工具。
- 为 Assistant Task Runtime 增加 `provideInput/resumeTask`。
- 将 `tasks/update` 映射到受控 Human-in-the-loop 恢复。
- 扩展 Artifact、Resource 和便携附件支持。
- 建立多客户端兼容测试矩阵。

交付条件：支持 Tasks 和不支持 Tasks 的客户端均有明确、可恢复的调用路径。

## 十五、测试计划

### 15.1 单元测试

- 导出资格状态与所有阻断条件。
- App Installation、Assistant 和 Publication 的组织隔离。
- Assistant Tool 严格 Schema、长度和集合上限。
- 服务端绑定忽略或拒绝调用者伪造的内部身份字段。
- Assistant 结果 DTO 白名单和敏感字段排除。
- 导出版本哈希稳定性。
- Skill 生成与秘密扫描。
- MCP/Assistant 状态映射。

### 15.2 集成测试

- 初始化 App 后自动发布 Assistant。
- 启用 Gateway 后创建正确 Capability Binding。
- OAuth Subject 调用和跨主体访问拒绝。
- 幂等请求只启动一次 Assistant Execution。
- Queue 重复投递不产生重复任务。
- API 进程重启后 Task 可以恢复监督。
- `tasks/get/update/cancel` 按当前主体鉴权。
- Assistant 失败、中断、超时和无最终结果的处理。
- Gateway 禁用后已有导出包立即失去调用能力。

### 15.3 端到端测试

1. 安装 Plugin。
2. 打开 App Detail 并初始化 App。
3. 验证 Assistant 已发布。
4. 启用 App MCP Gateway。
5. 完成 OAuth 配置。
6. 下载 Agent Plugin ZIP。
7. 在目标客户端安装。
8. 发现 Skill 和 Assistant Tool。
9. 发起短任务并获得同步或快速完成结果。
10. 发起长任务，观察 `working → completed`。
11. 取消长任务，验证 Xpert Assistant Execution 同步取消。
12. 升级 Template 或重新发布 Assistant，验证导出状态变为 `stale`。
13. 禁用 Gateway，验证旧客户端不能继续调用。

### 15.4 安全测试

- 修改或猜测 Task ID、Conversation Handle。
- 在输入中伪造 Tenant、Organization、User、Workspace 和 `xpertId`。
- 跨组织查询、取消和恢复任务。
- ZIP Secret 扫描。
- Tool 输出敏感字段回归测试。
- Context 深度、大小和恶意嵌套限制。
- OAuth Scope 缩减和撤销后的访问行为。
- 超时、并发和循环委托防护。

## 十六、验收标准

本计划完成的最低验收标准：

1. 只有满足运行态条件的 App Installation 可以导出 Agent Plugin。
2. 导出包不包含任何秘密或内部作用域标识。
3. 客户端通过一个稳定 MCP Gateway URL 发现并调用 Assistant Tool。
4. Assistant 实例和 Agent Key 完全由服务端绑定。
5. 外部调用与 Xpert 原生调用复用同一 Assistant Task Runtime。
6. 长任务拥有持久化 MCP Task 和 Assistant Task 关联，服务重启不丢失。
7. 状态、结果、取消和错误均有明确协议映射。
8. 每个请求都执行 Tenant、Organization、User 和 OAuth Scope 校验。
9. 导出物可被标准 Agent Plugin 客户端安装；Slash Command 是否显示由客户端能力决定。
10. App、Assistant、Capability 或授权发生变化时，导出状态能够失效或降级。
11. 具备单元、集成、端到端和安全测试覆盖。
12. 管理员可以禁用 Gateway，从而立即撤销所有已导出副本的远程调用能力。

## 十七、主要风险与应对

| 风险                                      | 影响                        | 应对                                                |
| ----------------------------------------- | --------------------------- | --------------------------------------------------- |
| 不同客户端对 Agent Plugins 字段支持不一致 | 安装或命令展示差异          | 核心包保持标准，客户端差异放扩展字段和安装说明      |
| MCP Tasks 客户端支持不完整                | 长任务无法标准轮询          | 提供 `start/get/cancel` 兼容工具和 Skill 分支       |
| Assistant Task 结束但没有稳定最终结果     | MCP Task 被错误标记成功     | 增加安全结果投影，缺少结果时显式失败                |
| 重复队列投递启动多个 Assistant            | 重复计费和副作用            | Operation ID、唯一约束、原子 Claim 和执行句柄持久化 |
| App 或 Assistant 升级后导出包过时         | Skill/Schema 与运行态不一致 | 导出哈希、失效状态和重新导出提示                    |
| 共享 Publication 绑定组织 Assistant       | 跨组织泄露                  | 每个 App Installation 使用组织级 Gateway            |
| 导出包携带 API Key                        | 凭据泄露                    | ZIP 永不包含 Secret，生产只生成 OAuth 连接配置      |
| Assistant 递归委托外部 Agent              | 无限循环和成本失控          | 调用深度、并发、预算和来源链限制                    |

## 十八、最终设计结论

本次升级不需要重建 Xpert 的 MCP 或 Assistant 执行基础。应在现有能力之上增加四个核心模块：

1. **App MCP Gateway**：把某个 App Installation 的外部能力集中发布。
2. **Assistant Virtual MCP Tool**：把已初始化、已发布的 Assistant 投影为标准 MCP Tool。
3. **MCP Task—Assistant Task Bridge**：持久化关联、监督、恢复和取消两类任务。
4. **Agent Plugin Exporter**：从运行态生成标准 `plugin.json + mcp.json + skills/` 导出包。

这使 Xpert 的服务端 Plugin 保留完整的业务、权限和运行时能力，同时可以向 Codex 等客户端导出轻量、标准、可撤销、可审计的 Agent Plugin。
