# Xpert MCP 平台架构实现文档

> 文档状态：架构方案（2026-08-24 实现审查后修订）
> 日期：2026-08-19
> 目标：让当前租户或组织管理范围内的宿主原生能力能够安全地发布为 MCP，同时逐步补齐第三方 MCP 接入 Xpert 时缺少的能力。
> 本方案不新增 Roots、Sampling、Logging，也不为新功能使用旧式 HTTP+SSE。

> 2026-08-24 范围校正：MCP Publication 是租户/组织级管理对象，不归属于工作空间。具体能力仍绑定真实 `toolsetId`；只有该 Toolset 的业务执行本身需要工作区时，执行上下文才携带 `workspaceId`。最初 Cut 四工具 stdio 试点已被宿主原生能力声明方案取代，相关实现已删除，历史验证记录不再代表当前交付物。

---

# 一、这次到底要建设什么

## 1. 产品名称建议

这项能力不要叫“插件 MCP”。

建议叫：

```text
Xpert MCP 发布
```

或者：

```text
MCP 服务
```

原因是以后发布出去的不一定只有插件 Tool，还可能有：

- OpenAPI Tool。
- 外部 MCP Tool。
- 知识库检索。
- Workflow。
- Agent。
- Resource。
- Prompt。
- MCP App。

## 2. 用户最终看到的操作

有管理权限的用户进入全局 MCP 管理页：

```text
管理
  ↓
MCP 管理
  ↓
新建 MCP 服务
```

填写：

```text
名称：研发工具
地址标识：dev-tools

开放能力：
✓ GitHub 搜索代码
✓ GitHub 创建 Issue
✓ 飞书搜索文档
✓ PostgreSQL 查询

认证方式：
✓ API Key
△ OAuth（仅 Xpert Pro；开源版不可用）
```

平台生成：

```text
https://api.xpert.example.com/api/mcp/p/dev-tools
```

然后用户把这个地址接入 Codex 或 WorkBuddy。

## 3. 本方案的核心原则

### 原则一：插件不自己启动公共 MCP Server

不做：

```text
飞书插件自己开一个端口
GitHub 插件自己开一个端口
数据库插件自己开一个端口
```

正确方式：

```text
所有插件提供能力
      ↓
Xpert 统一发布
      ↓
一个租户或组织可以组合多个宿主能力
```

### 原则二：接入别人的 MCP 与发布自己的 MCP 分开

```text
MCP 接入：Xpert 是客户端，去调用别人
MCP 发布：Xpert 是服务端，给别人调用
```

两个功能共用底层协议工具，但配置、权限和业务对象不能混在一起。

### 原则三：Agent 和 MCP 必须共用同一个工具执行入口

不应该出现：

```text
Agent 调插件一套代码
MCP 调插件又复制一套代码
```

应该是：

```text
Agent ─────┐
           ├──> ToolRuntimeService ──> Plugin Tool
MCP ───────┘
```

### 原则四：插件只声明“可以发布”，平台决定“是否发布”

插件可以说：

```text
search_document 具备 MCP 发布资格
```

但插件不能自动把工具暴露到公网。

最终要由当前管理范围内有权限的管理员明确选择。

### 原则五：MCP App 是增强，不是 Tool 的唯一返回方式

支持 MCP Apps 的客户端显示交互界面。

不支持的客户端仍然要拿到可读的文字或结构化结果。

---

# 二、总体架构

## 4. 总体结构图

```text
┌─────────────────────────────────────────────────────────────┐
│ xpert-plugin                                                │
│                                                             │
│ Tool / Resource / Prompt / App / 长任务业务                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ 使用 plugin-sdk 声明
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ plugin-sdk                                                  │
│                                                             │
│ 能力定义、执行上下文、统一结果、变化事件接口                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Xpert                                                       │
│                                                             │
│  能力目录 ──> Tool Runtime ──> MCP Publication             │
│                                  │                          │
│                                  ├── API Key                │
│                                  ├── OAuth                  │
│                                  ├── RBAC                   │
│                                  ├── Audit                  │
│                                  ├── MCP Apps               │
│                                  └── Tasks                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ Streamable HTTP MCP
                            ▼
                   Codex / WorkBuddy / ChatGPT / Claude


外部 MCP Server
      │
      ▼
Xpert MCP Consumer
      │
      ├── Tools
      ├── Resources
      ├── Prompts
      ├── Apps
      └── Tasks
      │
      ▼
Xpert Agent / ChatKit
```

## 5. “同内核、不同入口”

Xpert 里最终有两个业务模块：

```text
mcp-consumer
    负责接入外部 MCP

mcp-publication
    负责把 Xpert 能力发布成 MCP
```

它们共用：

```text
mcp-core
    MCP 协议类型
    结果转换
    错误转换
    Transport 公共工具
    MCP Apps 公共类型
```

它们不共用：

```text
外部 MCP 连接配置
MCP Publication 配置
OAuth 方向
凭证模型
生命周期
```

---

# 三、四个项目分别实现什么

## 6. `xpert-plugin`

插件负责实际业务。

### 应该实现

- Tool 的执行逻辑。
- Resource 的读取逻辑。
- Resource Template 的参数读取逻辑。
- Prompt 内容。
- Completion 候选查询。
- MCP App HTML、JavaScript、CSS。
- 长任务实际处理逻辑。
- 业务变化事件。
- 工具的事实属性：只读、写入、删除、是否幂等。

### 不应该实现

- 公共 MCP HTTP Endpoint。
- API Key 验证。
- MCP OAuth。
- 租户/组织权限治理。
- 审计数据库。
- 全局限流。
- MCP App iframe Host。

## 7. `plugin-sdk`

`plugin-sdk` 是插件和 Xpert Host 之间的稳定接口。

它提供统一写法，但不真正运行 MCP Server。

### 应增加的能力

```text
defineXpertTool
defineMcpResource
defineMcpResourceTemplate
defineMcpPrompt
defineMcpApp
ToolExecutionContext
XpertToolResult
CapabilityChangeEvent
```

### 不要把平台内部对象直接暴露给新插件

当前 `BuiltinToolset` 可以直接拿到：

```text
CommandBus
QueryBus
ManagedQueue
Model Runtime
```

短期可以兼容，但新接口应逐步改成更窄、更稳定的能力：

```text
ctx.files.read()
ctx.credentials.get()
ctx.models.createClient()
ctx.tasks.create()
ctx.events.emit()
```

插件不需要知道这些能力背后是 CommandBus、Redis、TypeORM 还是 RPC。

## 8. `xpert`

平台负责所有运行、安全和管理能力：

- MCP Publication 数据和页面。
- 公共 MCP Endpoint。
- Tool Runtime。
- API Key。
- OAuth Resource Server。
- 租户、组织和用户权限。
- Tool 审批。
- MCP Apps Host。
- Tasks、队列、取消和恢复。
- 审计、限流、缓存、Tracing。
- 多 API 实例一致性。
- 第三方 MCP 接入能力。

## 9. `xpert-sdk-js`

它只封装 Xpert 的管理 API。

例如：

```text
创建 MCP 服务
修改 MCP 服务
绑定能力
创建和撤销 API Key
查看审计
读取连接配置
```

它不负责：

- 运行 MCP Server。
- 验证访问 Token。
- 执行插件。
- 渲染 MCP App。
- 代替 Codex 连接 MCP。

## 10. `xpert-ai/chatkit-js`

这是第三方 MCP 接入 Xpert 后，显示 MCP Apps 的前端 Host。

它负责：

- iframe 安全渲染。
- Tool 输入和结果推送。
- App 与 Xpert 后端的消息转发。
- 主题、语言、尺寸、显示模式。
- 用户审批 UI。

它不负责 MCP Publication 的公共 Endpoint。

---

# 四、能力定义方案

## 11. 先保留现有插件兼容性

现有插件大量使用 LangChain `StructuredTool`。

不要要求所有插件一次性重写。

建议分两步：

### 兼容模式

现有 Tool 继续工作：

```ts
buildCalculatorTool()
```

平台通过适配器读取：

- `name`
- `description`
- `schema`

没有额外声明的旧工具默认：

```text
可以用于 Agent
不自动允许对外 MCP 发布
```

### 新模式

新插件使用 `defineXpertTool()`，提供更多信息。

## 12. Tool 定义示例

```ts
export const searchDocument = defineXpertTool({
  name: 'search_document',
  title: '搜索文档',
  description: '在当前连接的飞书空间中搜索文档',

  inputSchema: z.object({
    query: z.string(),
    limit: z.number().min(1).max(50).default(10)
  }),

  outputSchema: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string()
      })
    )
  }),

  exposure: {
    mcp: {
      eligible: true
    }
  },

  behavior: {
    risk: 'read',
    sideEffect: 'none',
    idempotency: 'safe'
  },

  requiredContext: ['workspace', 'principal'],

  async execute(input, context) {
    return {
      content: [
        {
          type: 'text',
          text: `找到 ${items.length} 篇文档`
        }
      ],
      structuredContent: {
        items
      }
    }
  }
})
```

## 13. Tool 行为字段

建议统一定义：

```ts
type ToolRisk = 'read' | 'write' | 'dangerous'

type ToolSideEffect = 'none' | 'reversible' | 'irreversible'

type ToolIdempotency = 'safe' | 'idempotent' | 'non_idempotent'
```

### 示例

| Tool                | risk      | sideEffect   | idempotency    |
| ------------------- | --------- | ------------ | -------------- |
| `search_document`   | read      | none         | safe           |
| `update_document`   | write     | reversible   | idempotent     |
| `send_message`      | write     | irreversible | non_idempotent |
| `delete_repository` | dangerous | irreversible | non_idempotent |

平台依据这些字段设置默认审批规则，但插件不能绕过平台规则。

## 14. 所需上下文

建议定义：

```ts
type RequiredContext =
  | 'tenant'
  | 'organization'
  | 'workspace'
  | 'principal'
  | 'project'
  | 'conversation'
  | 'agent'
  | 'execution'
  | 'store'
  | 'checkpoint'
```

MCP 调用通常能提供：

```text
tenant
organization
workspace
principal
execution
```

如果一个 Tool 强制依赖：

```text
conversation
agent
checkpoint
```

平台默认不允许把它直接发布为 MCP。

这样可以避免为了 MCP 伪造 `xpertId`、`agentKey`、`conversationId`。

## 15. 统一执行上下文

```ts
export interface ToolExecutionContext {
  source: 'agent' | 'mcp' | 'workflow' | 'api'

  tenantId: string
  organizationId?: string
  workspaceId?: string
  projectId?: string

  principal: {
    type: 'user' | 'service_account'
    id: string
    userId?: string
    clientId?: string
  }

  executionId: string
  requestId: string
  traceId?: string

  conversationId?: string
  xpertId?: string
  agentKey?: string

  signal?: AbortSignal

  host: {
    files: ToolFilesApi
    credentials: ToolCredentialsApi
    models: ToolModelsApi
    tasks: ToolTasksApi
    events: ToolEventsApi
  }
}
```

插件不能拿到：

- 原始 MCP API Key。
- 原始 OAuth Access Token。
- 完整 Authorization Header。
- 不属于该 Toolset 的其他凭证。

## 16. 统一结果类型

```ts
export interface XpertToolResult<T = unknown> {
  content?: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'audio'; data: string; mimeType: string }
    | { type: 'resource_link'; uri: string; name?: string }
  >

  structuredContent?: T
  meta?: Record<string, unknown>
  isError?: boolean
}
```

不同入口负责转换：

```text
Agent Adapter：转成 ToolMessage
MCP Adapter：转成 CallToolResult
```

插件只返回一次统一结果。

---

# 五、Resource、Prompt、App 的插件接口

## 17. Resource

```ts
defineMcpResource({
  key: 'document',
  uri: 'lark://documents/overview',
  title: '文档空间概览',
  mimeType: 'application/json',

  async read(context) {
    return {
      contents: [
        {
          uri: 'lark://documents/overview',
          mimeType: 'application/json',
          text: JSON.stringify(data)
        }
      ]
    }
  }
})
```

## 18. Resource Template

```ts
defineMcpResourceTemplate({
  key: 'document_by_id',
  uriTemplate: 'lark://documents/{documentId}',

  arguments: {
    documentId: {
      required: true
    }
  },

  async read({ documentId }, context) {
    // 读取对应文档
  },

  async complete({ argument, value }, context) {
    // 返回文档候选
  }
})
```

## 19. Prompt

```ts
defineMcpPrompt({
  key: 'review_document',
  name: 'review_document',
  title: '审查文档',

  arguments: {
    documentId: {
      required: true
    },
    focus: {
      required: false
    }
  },

  async get(args, context) {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请审查文档 ${args.documentId}，重点关注 ${args.focus ?? '全部内容'}`
          }
        }
      ]
    }
  }
})
```

## 20. MCP App

插件包中保存构建产物：

```text
apps/
└── document-browser/
    ├── index.html
    ├── app.js
    └── app.css
```

声明：

```ts
defineMcpApp({
  key: 'document_browser',
  entry: './apps/document-browser/index.html',

  csp: {
    connectDomains: ['https://open.feishu.cn'],
    resourceDomains: []
  },

  permissions: {
    clipboardWrite: true
  }
})
```

Tool 关联 App：

```ts
app: {
  resourceKey: 'document_browser'
}
```

插件不自己拼最终 `ui://` 地址。

Xpert 发布时生成：

```text
ui://xpert/{publicationId}/{pluginName}/{resourceKey}
```

## 21. App-only Tool

有些 Tool 只供界面按钮调用，不需要让模型看到，例如：

```text
切换分页
刷新图表
保存表单草稿
```

插件可以声明：

```ts
visibility: ['app']
```

模型看不到，但 App 可以调用。

---

# 六、统一 Tool Runtime

## 22. 当前问题

当前 `ToolsetGetToolsHandler`：

- 从 `RequestContext` 读取 tenant、organization、user。
- 注入 Agent 专用的 conversation、xpert、agent、execution 上下文。
- 根据 Toolset Category 创建 Builtin、OpenAPI、OData、MCP Toolset。

如果直接在 MCP Controller 再复制一次，会出现两套：

```text
工具加载
凭证注入
权限检查
连接关闭
错误处理
```

以后一定不一致。

## 23. 新增 `ToolRuntimeService`

建议目录：

```text
packages/server-ai/src/tool-runtime/
```

核心接口：

```ts
class ToolRuntimeService {
  describeCapabilities(request: DescribeCapabilitiesRequest): Promise<CapabilityDescriptor[]>

  executeTool(request: ExecuteToolRequest): Promise<XpertToolResult>
}
```

### `describeCapabilities()`

用于：

- MCP `tools/list`。
- 创建 Publication 时展示可选能力。
- 插件升级时检查 Schema 变化。

不应该启动重量级连接或执行第三方请求。

### `executeTool()`

输入必须显式携带上下文：

```ts
interface ExecuteToolRequest {
  source: 'agent' | 'mcp' | 'workflow' | 'api'

  principal: ToolPrincipal

  tenantId: string
  organizationId?: string
  workspaceId?: string

  toolsetId: string
  toolName: string
  arguments: unknown

  executionId: string
  requestId: string

  conversationId?: string
  xpertId?: string
  agentKey?: string

  signal?: AbortSignal
}
```

不再让底层服务自行猜当前用户、组织和可选工作区。Publication 本身不提供虚构工作区；只有所绑定 Toolset 的真实执行边界需要时才传入 `workspaceId`。

## 24. 原 Handler 的新职责

```text
ToolsetGetToolsHandler
      ↓
只负责把 Agent 环境转成 ToolRuntime 请求
      ↓
ToolRuntimeService
```

MCP 入口：

```text
McpToolExecutionService
      ↓
把 McpPrincipal 转成 ToolRuntime 请求
      ↓
ToolRuntimeService
```

## 25. Toolset 绑定必须使用实例 ID

Publication 绑定：

```text
toolsetId + capabilityType + capabilityKey
```

不能只保存：

```text
pluginName + toolName
```

因为同一个飞书插件可能有：

```text
南京飞书 Toolset
上海飞书 Toolset
```

它们使用不同凭证和数据范围。

---

# 七、MCP Publication 数据模型

## 26. `mcp_publication`

代表一个对外 MCP 服务。

| 字段                     | 说明                          |
| ------------------------ | ----------------------------- |
| `id`                     | 主键                          |
| `tenantId`               | 所属租户                      |
| `organizationId`         | 所属组织                      |
| `name`                   | 显示名称                      |
| `slug`                   | URL 标识，例如 `dev-tools`    |
| `status`                 | `draft`、`active`、`disabled` |
| `authMethods`            | `api_key`、`oauth`            |
| `instructions`           | 整套 MCP 服务的共同说明       |
| `protocolVersion`        | 默认 `2026-07-28`             |
| `createdBy`              | 创建人                        |
| `createdAt`、`updatedAt` | 时间                          |

## 27. `mcp_publication_capability`

代表 Publication 中选择的一项能力。

| 字段             | 说明                                                           |
| ---------------- | -------------------------------------------------------------- |
| `publicationId`  | 所属 MCP 服务                                                  |
| `toolsetId`      | 当前租户/组织范围内的具体 Toolset 实例；该实例可选地属于工作区 |
| `capabilityType` | `tool`、`resource`、`resource_template`、`prompt`、`app`       |
| `capabilityKey`  | 插件内稳定名称                                                 |
| `publicName`     | 对 MCP 客户端展示的名称                                        |
| `enabled`        | 是否启用                                                       |
| `policy`         | 审批、限流、超时等覆盖配置                                     |
| `descriptorHash` | 当前能力定义摘要                                               |
| `pluginVersion`  | 绑定时插件版本                                                 |

### 为什么需要 `descriptorHash`

插件升级后，平台可以判断：

```text
只新增了可选参数
    → 可以继续使用

删除参数、修改类型、把只读改成写操作
    → Publication 标记为需要管理员复核
```

## 28. `mcp_api_key`

| 字段            | 说明                                |
| --------------- | ----------------------------------- |
| `publicationId` | Key 只能访问哪个 MCP 服务           |
| `name`          | 例如“Codex MacBook”                 |
| `keyPrefix`     | 用于页面识别，例如 `xpert_mcp_ab12` |
| `keyHash`       | 数据库只保存 Hash                   |
| `subjectType`   | `user` 或 `service_account`         |
| `subjectId`     | 对应用户或服务账号                  |
| `scopes`        | 可用范围                            |
| `expiresAt`     | 过期时间                            |
| `lastUsedAt`    | 最后使用时间                        |
| `revokedAt`     | 撤销时间                            |

明文 Key 只在创建时显示一次。

## 29. OAuth 配置

如果 Xpert 已有统一 OIDC/OAuth 身份服务，MCP 不应自己再造一套用户系统。

建议保存：

```text
mcp_oauth_policy
```

| 字段             | 说明                            |
| ---------------- | ------------------------------- |
| `publicationId`  | 适用的 MCP 服务                 |
| `issuer`         | Token 签发方                    |
| `audience`       | Token 必须面向哪个 MCP Resource |
| `requiredScopes` | 最低 Scope                      |
| `subjectMapping` | Token 用户如何映射到 Xpert 用户 |
| `enabled`        | 是否启用                        |

Xpert MCP Server 扮演 Resource Server：

- 负责验证 Token。
- 负责验证 audience。
- 负责把 subject 映射到 Xpert 用户。
- 不负责把入站 Token 转发给飞书、GitHub 等下游系统。

## 30. `mcp_invocation_audit`

记录：

- 哪个 Publication。
- 哪个 Toolset。
- 哪项能力。
- 哪个用户或服务账号。
- 哪个客户端。
- 调用是否成功。
- 耗时。
- 错误码。
- Trace ID。
- 参数摘要。

默认不要记录完整参数和完整结果，以免保存：

- 文件内容。
- 用户隐私。
- SQL 数据。
- 密钥。

## 31. `mcp_task`

长任务持久化：

| 字段            | 说明                                                  |
| --------------- | ----------------------------------------------------- |
| `taskId`        | MCP Task ID                                           |
| `publicationId` | 所属 MCP 服务                                         |
| `capabilityId`  | 来源能力                                              |
| `executionId`   | Xpert 执行 ID                                         |
| `status`        | working、input_required、completed、failed、cancelled |
| `progress`      | 进度                                                  |
| `resultRef`     | 最终结果引用                                          |
| `error`         | 错误摘要                                              |
| `expiresAt`     | 过期时间                                              |

## 32. App 和 Elicitation 状态

### App Instance

当前 Xpert 主要保存在进程内 Map。

新方案：

```text
Redis：App 临时运行状态
数据库/消息记录：历史恢复需要的最小快照
```

保存：

- appInstanceId。
- Publication、Toolset、Tool、用户绑定。
- Tool 输入和小型结果摘要。
- Token 过期时间。
- 当前显示模式。
- App 模型上下文。

### Elicitation State

```text
Redis + 签名状态 Token
```

保存：

- 原始请求摘要。
- 当前缺少的字段。
- 用户、Publication、Tool 绑定。
- 过期时间。
- 恢复执行所需 ID。

---

# 八、MCP Server 实现

## 33. 新公共 Endpoint

建议：

```text
POST /api/mcp/p/:slug
```

例如：

```text
POST /api/mcp/p/dev-tools
```

只使用 Streamable HTTP。

旧 SSE 仅用于兼容当前第三方 MCP 接入，不作为新 Publication 的 Transport。

## 34. 使用新 MCP SDK 实现

当前 Xpert 的 MCP Consumer 依赖旧版：

```text
@modelcontextprotocol/sdk ^1.17.4
@langchain/mcp-adapters 0.6.0
```

新的 MCP Publication 建议单独使用与 `2026-07-28` 匹配的官方 TypeScript SDK 新 API。

不要第一步就强行把现有 Consumer 全部一起升级。

推荐：

```text
mcp-publication 使用新 SDK
现有 mcp-consumer 暂时保留旧适配
验证稳定后再迁移 consumer
```

这样降低一次改动同时影响 Agent 工具链和新 MCP Server 的风险。

## 35. MCP Core 处理流程

每个请求：

```text
请求进入
  ↓
确定 Publication
  ↓
认证
  ↓
生成 McpPrincipal
  ↓
检查 Publication 状态
  ↓
检查租户/组织范围与主体权限
  ↓
按方法路由
  ↓
执行能力
  ↓
记录审计和 Trace
  ↓
返回标准 MCP 结果
```

## 36. 统一 Principal

```ts
interface McpPrincipal {
  authMethod: 'api_key' | 'oauth'

  subjectType: 'user' | 'service_account'
  subjectId: string

  userId?: string
  clientId?: string

  tenantId: string
  organizationId?: string

  publicationId: string
  scopes: string[]
}
```

认证方式只在认证模块里有区别。

Tool Runtime 不需要知道这是 API Key 还是 OAuth。

## 37. 最终权限计算

```text
Publication 选择的能力
        ∩
API Key / OAuth Scope
        ∩
Xpert 租户/组织权限
        ∩
插件声明允许发布
        ∩
Toolset 当前启用状态
        ∩
第三方连接凭证权限
        =
最终可见和可调用能力
```

`tools/list` 只返回最终可调用的 Tool。

不要把不能调用的 Tool 先展示给模型，再在调用时拒绝。

---

# 九、API Key 实现

## 38. Key 格式

```text
xpert_mcp_<随机值>
```

客户端发送：

```http
Authorization: Bearer xpert_mcp_xxx
```

使用 Bearer 的好处是 API Key 和 OAuth 都使用同一个 Header。

## 39. 数据库存储

只保存：

```text
prefix
hash
metadata
```

不保存明文。

Key 创建完成后：

```text
明文只显示一次
```

## 40. 运行时检查

- Key 是否存在。
- 是否撤销。
- 是否过期。
- 是否绑定当前 Publication。
- 是否绑定正确 tenant、organization。
- 是否超出 Scope。
- 是否触发限流。

撤销后应立即失效，可以使用 Redis 短缓存，但撤销操作必须主动清除缓存。

---

# 十、OAuth 实现

## 41. Xpert 在 OAuth 中的角色

```text
Codex / WorkBuddy = OAuth Client
Xpert MCP          = Resource Server
现有身份系统       = Authorization Server
```

优先复用现有身份服务，不建议在 `mcp-publication` 模块里自己实现完整 Authorization Server。

## 42. 必须实现

- Protected Resource Metadata。
- `WWW-Authenticate` 中返回 Resource Metadata 地址。
- Authorization Server Discovery。
- Bearer Token 验证。
- issuer 验证。
- audience 验证。
- Scope 验证。
- Token subject 到 Xpert 用户映射。
- 用户对当前 tenant/organization 的实时权限检查。

## 43. 不允许 Token 透传

错误做法：

```text
Codex 给 Xpert 的 OAuth Token
      ↓
原样传给 GitHub 或飞书
```

正确：

```text
Codex Token：只证明可以访问 Xpert MCP
插件 Provider Token：由 Xpert 的插件连接单独管理
```

---

# 十一、Tools 实现

## 44. `tools/list`

流程：

```text
读取 Publication 绑定
  ↓
批量读取 Capability Descriptor
  ↓
计算权限
  ↓
转换名称和 Schema
  ↓
返回
```

Tool 对外名称建议：

```text
github_search_code
lark_search_document
postgres_query
```

不要使用 UUID，也不要只叫 `search`。

平台保存 `publicName`，防止不同插件重名。

## 45. `tools/call`

流程：

```text
解析 publicName
  ↓
找到 publication capability
  ↓
检查权限和审批
  ↓
校验输入 Schema
  ↓
调用 ToolRuntimeService
  ↓
转换 XpertToolResult
  ↓
记录审计
```

## 46. 审批策略

默认建议：

| 风险      | 默认行为                             |
| --------- | ------------------------------------ |
| read      | 可以自动调用，管理员仍可改为确认     |
| write     | 默认需要确认或明确白名单             |
| dangerous | 强制确认；部分能力可直接禁止远程发布 |

API Key 无法像 Chat UI 一样随时弹窗时，可以：

- Publication 明确配置允许。
- Client 本身支持审批时使用客户端审批。
- 高风险 Tool 默认不允许服务账号使用。

---

# 十二、Resources、Prompts 和 Completion

## 47. Resources

平台不要把 Resource 强行转成 Tool。

应保留标准 MCP Resource：

```text
resources/list
resources/read
```

Resource 读取时同样经过：

- Publication allowlist。
- Principal Scope。
- Workspace RBAC。
- 大小限制。
- MIME 类型检查。
- URI 检查。

## 48. Resource Templates

支持：

```text
resources/templates/list
```

模板参数由 plugin-sdk 声明。

平台负责：

- 模板参数校验。
- URI 编码。
- 防止目录穿越。
- Completion 路由。

## 49. Prompts

支持：

```text
prompts/list
prompts/get
```

Prompt 内容可能包含敏感组织或业务上下文信息，因此 `prompts/list` 和 `prompts/get` 也必须做权限检查。

## 50. Completion

平台根据引用对象找到对应插件回调：

```text
Prompt 参数补全
Resource Template 参数补全
```

需要：

- 限制返回数量。
- 设置短超时。
- 防止每输入一个字符就触发昂贵第三方调用。
- 允许插件声明本地缓存时间。

---

# 十三、Elicitation 实现

## 51. 插件使用方式

插件不直接操作 ChatKit UI。

使用统一接口：

```ts
const answer = await context.input.request({
  type: 'form',
  title: '选择部署环境',
  schema: {
    environment: {
      type: 'string',
      enum: ['dev', 'staging', 'production']
    }
  }
})
```

或者敏感操作：

```ts
await context.input.request({
  type: 'url',
  url: authorizationUrl
})
```

## 52. 平台处理

```text
Tool 执行中请求输入
  ↓
平台生成 input_required
  ↓
客户端显示表单或网页
  ↓
用户提交
  ↓
客户端重试原请求并附带结果
  ↓
平台验证签名和身份
  ↓
恢复执行
```

## 53. 安全要求

- 普通 Form 不接收 API Key、密码、OAuth Token。
- 敏感操作使用 URL 模式。
- 状态 Token 必须绑定用户、Publication、Tool 和过期时间。
- 用户回答后再次执行 Tool 时必须防止前半段写操作重复执行。

插件需要使用幂等键或分阶段任务状态。

---

# 十四、MCP Apps 实现

## 54. 复用当前成果

当前 Xpert 已经有：

- `app-support.ts`。
- `mcp-apps.service.ts`。
- Xpert ChatKit `mcp-app.tsx`。
- iframe、CSP、主题、Tool 输入和结果推送。

这些不应该丢弃。

应重构成通用模块：

```text
mcp-app-runtime
```

同时服务：

```text
第三方 MCP 接入 Xpert
Xpert 插件发布成 MCP
```

## 55. 对外发布 App

插件提供 App Bundle。

Xpert Publication 在 `tools/list` 中加入：

```json
{
  "_meta": {
    "ui": {
      "resourceUri": "ui://xpert/..."
    }
  }
}
```

并通过 Resource 读取返回：

```text
MIME: text/html;profile=mcp-app
HTML: 插件 App Bundle
```

## 56. App 结果降级

每个带 App 的 Tool 必须提供：

```text
content：给模型和不支持 App 的客户端看
structuredContent：给 App 渲染
_meta：只给 UI 使用
```

## 57. 当前必须补的安全项

### 反向 Tool 调用审批

当前 Xpert App 后端看到 `tools/call` 后会直接调用第三方 MCP Tool，没有看到用户审批步骤。

新方案必须：

```text
App 发起 tools/call
  ↓
检查 Tool 风险
  ↓
只读 Tool 可按策略自动允许
写 Tool 弹用户确认
危险 Tool 强制确认或禁止
  ↓
记录审计
  ↓
实际调用
```

### App Instance 共享状态

不能继续只放在单个 API 进程 Map。

使用 Redis：

```text
appInstanceId → 状态
TTL → 自动清理
```

这样 nginx 后面的 api-1、api-2、api-3 都能处理后续请求。

## 58. 补齐 MCP Apps 方法

建议按优先级补：

### 第一批

- `ui/resource-teardown`。
- App 反向 Tool 审批。
- `ui/download-file`。
- `tools/list`。
- `resources/list`。
- `resources/templates/list`。

### 第二批

- `prompts/list`。
- `host-context-changed`。
- fullscreen。
- picture-in-picture。
- 完整多模态 `ui/message`。
- 专用 App Origin / Domain。

## 59. 客户端差异

- WorkBuddy：作为完整 MCP Apps 验证客户端。
- Codex：只保证 Tool 和结构化结果，不承诺 UI。
- Xpert ChatKit：完整 Host 能力由我们自己控制。

---

# 十五、Tasks 实现

## 60. 复用 Xpert 队列

```text
MCP tools/call
  ↓
Tool 声明使用 Task
  ↓
创建 Managed Queue Job
  ↓
创建 mcp_task
  ↓
返回 taskId
```

## 61. 方法映射

```text
tasks/get
    → 查询 mcp_task + Xpert execution

tasks/update
    → 客户端补交 input_required 信息，或更新扩展状态

tasks/cancel
    → 取消队列任务和 execution
```

## 62. 服务重启要求

Task 状态不能只保存在内存。

API 重启后：

- 仍能查询 Task。
- 可继续等待。
- 可取消。
- 已完成结果仍可取得。

## 63. 防止重复执行

使用：

```text
publicationId + requestId + toolName
```

作为幂等键的一部分。

对 `send_message`、退款、删除等非幂等工具尤其重要。

---

# 十六、变化订阅和缓存

## 64. 插件只发通用变化事件

例如：

```ts
context.events.emit({
  type: 'resource.updated',
  key: 'lark://documents/123'
})
```

插件不管理 `subscriptions/listen` 连接。

## 65. Xpert 转成 MCP 订阅事件

平台处理：

- Tools changed。
- Resources changed。
- Resource updated。
- Prompts changed。
- Task updated。

## 66. 缓存提示

插件可以提供建议：

```text
文档内容：30 秒
表结构：5 分钟
静态帮助文档：1 小时
审批状态：不缓存
```

平台最终决定：

- `ttlMs`。
- `cacheScope`。
- 用户隔离、组织隔离，以及能力执行本身需要时的工作区隔离。

插件不能自行声明跨用户共享缓存。

---

# 十七、Server Instructions

## 67. Instructions 来源

最终说明可以由三部分合并：

```text
平台安全说明
+
Publication 管理员说明
+
插件提供的使用建议
```

优先级：

```text
平台强制规则 > 管理员规则 > 插件建议
```

例如：

```text
数据库只读限制是平台强制规则，插件和管理员不能覆盖。
```

## 68. 长度控制

Codex 建议最重要内容放在前 512 个字符内。

平台应：

- 自动生成简要开头。
- 把跨 Tool 的共同规则放前面。
- 不把每个 Tool 的完整描述再复制一次。

---

# 十八、第三方 MCP Consumer 升级

## 69. 当前模块的问题

当前第三方 MCP 接入主要围绕 LangChain Tool：

```text
MCP Server
  ↓
getTools()
  ↓
DynamicStructuredTool
  ↓
Agent
```

因此 Tools 支持较好，其他能力没有自然入口。

## 70. 新的 Consumer 结构

建议增加：

```text
packages/server-ai/src/mcp-consumer/
```

内部：

```text
connection/
    管理 STDIO、HTTP、旧 SSE

auth/
    手工 Header、API Key、OAuth Client

tools/
resources/
prompts/
completion/
elicitation/
apps/
tasks/
subscriptions/
```

LangChain Tool 只是 Tools 的一个适配器，不再代表整个 MCP Consumer。

## 71. OAuth Client

第三方 MCP 接入页面增加：

```text
认证方式：
- 无认证
- 手工 Header
- API Key
- OAuth
```

OAuth 流程：

```text
Xpert 连接 MCP
  ↓
收到 401 和 Resource Metadata
  ↓
发现授权服务器
  ↓
用户浏览器登录
  ↓
保存加密 Token
  ↓
自动刷新
  ↓
按用户或组织绑定
```

不能只在 Header 输入框中手工粘贴一个会过期的 OAuth Token。

## 72. Resources 和 Prompts 的产品入口

### Resources

可以用于：

- Agent 上下文来源。
- 用户手动选择资源。
- MCP App 读取。
- 对话中的可引用对象。

### Prompts

可以用于：

- 斜杠命令。
- 工作空间模板。
- Agent 快捷任务入口。

## 73. Elicitation

第三方 MCP 请求补问信息时：

```text
MCP Consumer
  ↓
Xpert 执行中断
  ↓
ChatKit 显示表单或授权链接
  ↓
用户回答
  ↓
恢复 MCP 请求
```

## 74. Tasks

第三方 MCP 返回 Task 时，映射到 Xpert Chat 中的任务卡片：

- 显示状态。
- 显示进度。
- 支持取消。
- 支持继续提供信息。
- 完成后恢复对话。

## 75. 新协议迁移

新 Consumer 优先支持 MCP `2026-07-28`。

旧连接：

- 继续兼容旧 Session 模式。
- SSE 标记为 Legacy。
- 不再给 SSE 增加新能力。
- 管理页面提示用户迁移 Streamable HTTP。

---

# 十九、前端页面设计

## 76. 全局管理导航

建议区分：

```text
MCP 接入
    连接别人的 MCP

MCP 服务
    把 Xpert 能力发布给别人
```

不要两个页面都叫“MCP 工具”。

## 77. MCP 服务列表

每张卡片显示：

- 名称。
- Endpoint。
- 状态。
- 能力数量。
- API Key 数量。
- OAuth 是否启用。
- 最近调用时间。
- 最近错误。

## 78. MCP 服务编辑页

分成：

```text
基本信息
开放能力
认证
权限策略
Instructions
审计
测试
```

### 开放能力

按 Toolset 分组：

```text
飞书：南京公司账号
  ✓ 搜索文档
  ✗ 发送消息

GitHub：xpert-ai
  ✓ 搜索代码
  ✓ 读取 PR
  ✗ 删除仓库
```

### 认证

```text
API Key
  创建、撤销、最后使用时间

OAuth
  Issuer、Audience、Scope、测试登录
```

## 79. 连接配置复制

页面根据客户端生成配置提示：

```text
Codex
WorkBuddy
通用 MCP Client
```

不要把 Key 重新显示；只能在创建时复制。

---

# 二十、REST 管理 API

## 80. Publication

```http
POST   /api/mcp-publications
GET    /api/mcp-publications
GET    /api/mcp-publications/:id
PATCH  /api/mcp-publications/:id
DELETE /api/mcp-publications/:id
POST   /api/mcp-publications/:id/enable
POST   /api/mcp-publications/:id/disable
```

删除建议先做软删除或禁用，避免 Endpoint 被意外复用。

## 81. 能力绑定

```http
GET    /api/mcp-publications/:id/available-capabilities
PUT    /api/mcp-publications/:id/capabilities
PATCH  /api/mcp-publications/:id/capabilities/:capabilityId
```

## 82. API Key

```http
POST   /api/mcp-publications/:id/api-keys
GET    /api/mcp-publications/:id/api-keys
POST   /api/mcp-api-keys/:keyId/revoke
POST   /api/mcp-api-keys/:keyId/rotate
```

## 83. OAuth 和审计

```http
GET    /api/mcp-publications/:id/oauth-policy
PUT    /api/mcp-publications/:id/oauth-policy
POST   /api/mcp-publications/:id/oauth-policy/test

GET    /api/mcp-publications/:id/audit
POST   /api/mcp-publications/:id/test
GET    /api/mcp-publications/:id/connection-info
```

## 84. `xpert-sdk-js`

等平台 API 稳定后增加：

```ts
client.mcpPublications.create()
client.mcpPublications.update()
client.mcpPublications.list()
client.mcpPublications.delete()

client.mcpCapabilities.replace()

client.mcpApiKeys.create()
client.mcpApiKeys.list()
client.mcpApiKeys.revoke()

client.mcpAudit.search()
```

这些只是上面 REST API 的 TypeScript 封装。

---

# 二十一、建议目录结构

## 85. Xpert 主仓库

```text
packages/
├── contracts/
│   └── src/ai/
│       ├── mcp-publication.model.ts
│       ├── mcp-capability.model.ts
│       └── mcp-auth.model.ts
│
├── plugin-sdk/
│   └── src/lib/
│       ├── toolset/
│       │   ├── define-tool.ts
│       │   ├── tool-execution-context.ts
│       │   └── tool-result.ts
│       └── mcp/
│           ├── resource.ts
│           ├── resource-template.ts
│           ├── prompt.ts
│           ├── completion.ts
│           ├── app.ts
│           ├── task.ts
│           └── events.ts
│
└── server-ai/
    └── src/
        ├── tool-runtime/
        │   ├── tool-runtime.module.ts
        │   ├── tool-runtime.service.ts
        │   ├── capability-registry.service.ts
        │   ├── capability-policy.service.ts
        │   └── adapters/
        │       ├── langchain-tool.adapter.ts
        │       └── mcp-tool.adapter.ts
        │
        ├── mcp-core/
        │   ├── protocol/
        │   ├── transport/
        │   ├── errors/
        │   └── result/
        │
        ├── mcp-publication/
        │   ├── entities/
        │   ├── controllers/
        │   ├── commands/
        │   ├── queries/
        │   ├── runtime/
        │   ├── policies/
        │   └── mcp-publication.module.ts
        │
        ├── mcp-auth/
        │   ├── api-key/
        │   ├── oauth/
        │   ├── mcp-principal.ts
        │   └── guards/
        │
        ├── mcp-app-runtime/
        ├── mcp-task/
        ├── mcp-subscription/
        ├── mcp-audit/
        └── mcp-consumer/
```

## 86. Cloud 前端

```text
apps/cloud/src/app/features/operations/
└── mcp-management        # 全局 MCP 管理：MCP 服务 + 按需启动的运行实例

apps/cloud/src/app/features/xpert/workspace/
└── mcp-tools             # 工作区内连接第三方 MCP，显示名“MCP 接入”
```

## 87. `xpert-sdk-js`

```text
packages/core/src/mcp/
├── types.ts
├── publications.ts
├── capabilities.ts
├── api-keys.ts
├── oauth.ts
└── audit.ts
```

## 88. ChatKit

```text
xpert-ai/chatkit-js/
└── packages/chatkit-ui/src/components/thread/messages/
    └── mcp-app.tsx
```

建议把当前大文件继续拆成：

```text
mcp-app/
├── component.tsx
├── bridge.ts
├── sandbox.ts
├── security.ts
├── resource.ts
├── rpc.ts
└── types.ts
```

---

# 二十二、需要修改的现有文件

## 89. `get-tools.handler.ts`

路径：

```text
packages/server-ai/src/xpert-toolset/commands/handlers/get-tools.handler.ts
```

改动方向：

- 工具加载逻辑下沉到 `ToolRuntimeService`。
- Handler 只保留 Agent 入口适配。
- 显式传入 Principal 和上下文。

## 90. `mcp-toolset.ts`

路径：

```text
packages/server-ai/src/xpert-toolset/provider/mcp/mcp-toolset.ts
```

改动方向：

- 逐步变成外部 MCP Consumer 的 Tool Adapter。
- 不再承担 MCP Consumer 的全部能力。
- 保留现有 Apps metadata bridge 兼容。

## 91. `types.ts`

路径：

```text
packages/server-ai/src/xpert-toolset/provider/mcp/types.ts
```

改动方向：

- 旧版 Client 创建逻辑迁入 `mcp-consumer/connection`。
- 新版 `2026-07-28` Client 单独实现。
- SSE 标为 Legacy。

## 92. `app-support.ts` 和 `mcp-apps.service.ts`

改动方向：

- 抽成 `mcp-app-runtime`。
- 状态移到 Redis。
- 增加反向 Tool 审批。
- 补标准方法和 Teardown。
- 同时服务第三方 MCP 和 Xpert Publication。

## 93. 现有 `packages/server-ai/src/mcp`

当前模块通过 Nest Provider 装饰器静态扫描 Tool、Resource、Prompt，并提供固定 SSE 路由。

不要直接把动态多租户 Publication 全部塞进去。

可以复用：

- 部分 Decorator 思路。
- Schema 转换。
- 错误类型。

但新的动态 Publication 应使用独立模块。

---

# 二十三、安全设计

## 94. 默认拒绝

默认规则：

```text
插件安装 ≠ 自动发布
Toolset 创建 ≠ 自动发布
Publication 创建 ≠ 自动开放全部 Tool
```

管理员必须明确选择能力。

## 95. 租户隔离

每次请求必须同时验证：

```text
Token / Key 的 tenant
Publication 的 tenant
Toolset 的 tenant
当前用户的 tenant
```

任何不一致直接拒绝。

不能只依赖客户端传来的 Organization Header。

## 96. 输入和输出限制

- Tool 参数大小限制。
- Resource 大小限制。
- App HTML 大小限制。
- 二进制内容限制。
- 调用超时。
- Task 最大存活时间。
- Completion 返回数量限制。

## 97. URI 安全

Resource：

- 禁止目录穿越。
- 禁止未经允许访问本地文件。
- 禁止 `javascript:`、`data:` 等危险 URI。
- 插件 Resource 只能访问自己声明的数据范围。

## 98. MCP Apps

- 安全 iframe。
- 默认无网络访问。
- CSP 白名单。
- 权限最小化。
- 反向写 Tool 用户确认。
- App 消息全部审计。
- App 不能获得原始 MCP Token。
- App 不能获得其他 Toolset 凭证。

## 99. 审计脱敏

- API Key 只记录前缀。
- OAuth Token 不记录。
- Tool 参数按 Schema 标记敏感字段。
- 文件内容和大型结果不直接进审计表。
- 错误日志避免打印 Secret Header。

---

# 二十四、多实例设计

## 100. 适配 Xpert 当前部署

当前可能是：

```text
nginx
  ├── api-1
  ├── api-2
  └── api-3
```

新的 MCP Publication 使用无会话协议后，请求可以落到任意 API 实例。

平台状态必须放在：

```text
PostgreSQL
Redis
Queue
```

不能放在：

```text
单个 Node 进程 Map
单个 API 实例内存
```

## 101. 哪些放 PostgreSQL

- Publication。
- 能力绑定。
- API Key Hash。
- OAuth 策略。
- 审计。
- Task 主状态。

## 102. 哪些放 Redis

- API Key 短缓存。
- App Instance 临时状态。
- Elicitation 临时状态。
- 限流计数。
- 订阅连接路由。
- 短期幂等键。

## 103. Pub/Sub

以下变化通过 Redis Pub/Sub 或平台事件总线分发：

- Key 撤销。
- Publication 禁用。
- Tool 列表变化。
- Resource 更新。
- Task 更新。
- App Instance 状态变化。

---

# 二十五、可观测性

## 104. Trace

MCP 请求进入后创建或继续 Trace：

```text
MCP Request
  ↓
Auth
  ↓
Authorization
  ↓
Tool Runtime
  ↓
Plugin
  ↓
Provider API
```

全部使用同一个 Trace ID。

## 105. Metrics

建议指标：

```text
mcp_requests_total
mcp_request_duration_seconds
mcp_tool_calls_total
mcp_tool_call_duration_seconds
mcp_auth_failures_total
mcp_rate_limit_rejections_total
mcp_tasks_active
mcp_app_instances_active
mcp_app_rpc_total
```

维度控制：

- publicationId。
- method。
- toolName。
- status。
- authMethod。

不要把 userId 作为高基数 Prometheus Label。

## 106. Logs

结构化日志：

- requestId。
- traceId。
- publicationId。
- principalType。
- toolName。
- status。
- duration。

不要记录 Secret。

---

# 二十六、实施阶段

## 107. 阶段 0：先固定契约

完成：

- `McpPublication` 数据模型。
- Capability Descriptor。
- ToolExecutionContext。
- XpertToolResult。
- 风险和所需上下文字段。
- 客户端兼容测试清单。

这一阶段不改变现有插件运行行为。

## 108. 阶段 1：Tools + API Key

完成：

- `ToolRuntimeService`。
- MCP Publication 页面和数据表。
- `tools/list`。
- `tools/call`。
- API Key。
- RBAC。
- 审计和限流。
- Server Instructions。
- Codex 和 WorkBuddy Tool 联调。

这是第一版可交付能力。

## 109. 阶段 2：MCP Apps

完成：

- 插件 App Bundle 声明。
- Xpert 发布 `ui://` Resource。
- WorkBuddy 验证。
- Codex 文字降级验证。
- 反向 Tool 审批。
- Redis App Instance。
- Teardown 和下载。

## 110. 阶段 3：OAuth

归属 `xpert-pro`。宿主保留统一的 Publication 认证边界和显式 edition capability；只有
`xpert-pro` 将该 capability 设为启用。开源版的 OAuth 开关保持置灰，管理接口、metadata
和 OAuth Bearer 执行入口均拒绝访问，API Key 不受影响。

Pro 交付内容：

- Protected Resource Metadata。
- Discovery。
- Audience 和 Scope 验证。
- Xpert 用户映射。
- WorkBuddy OAuth。
- Codex OAuth。
- Token 撤销和权限回收测试。

## 111. 阶段 4：数据和交互能力

完成：

- Resources。
- Resource Templates。
- Prompts。
- Completion。
- Elicitation。
- Xpert Consumer 对应入口。

## 112. 阶段 5：长任务和实时变化

完成：

- Tasks。
- `subscriptions/listen`。
- 缓存提示。
- 完整 Trace 传播。
- 外部 MCP Consumer 升级到 `2026-07-28`。
- SSE 迁移提示。

---

# 二十七、测试和验收

## 113. Publication 基础测试

- 不在 Publication 中的 Tool 不出现在 `tools/list`。
- 禁用 Publication 后所有 Key 立即失效。
- Toolset 被删除后 Publication 能明确报错并提示修复。
- 插件升级导致 Schema 破坏性变化时标记待复核。
- 不同租户或组织的 Toolset 不能串用；有工作区归属的 Toolset 还必须保持其原有工作区隔离。

## 114. API Key 测试

- 明文只显示一次。
- 数据库只保存 Hash。
- 过期 Key 返回 401。
- 撤销立即生效。
- Key 不能访问其他 Publication。
- Key 日志只显示 Prefix。

## 115. OAuth 测试

- WorkBuddy 完成浏览器授权。
- Codex 完成 `mcp login`。
- 错误 issuer 被拒绝。
- 错误 audience 被拒绝。
- Scope 不足时只显示允许的 Tool。
- 用户失去当前租户/组织访问权后 Token 即使未过期也不能继续访问。
- 入站 Xpert Token 不会传给第三方 Provider。

## 116. MCP Apps 测试

- WorkBuddy 正常显示 App。
- Xpert ChatKit 正常显示 App。
- Codex 得到有意义的文字降级结果。
- App 反向只读调用符合策略。
- App 反向写调用必须确认。
- 拒绝审批后 Tool 不执行。
- CSP 阻止未声明域名。
- App 无法读取主页面 Cookie。
- API 请求落到不同实例时 App 仍可继续。
- 服务重启后历史消息可以恢复 App。

## 117. Tasks 测试

- 请求快速返回 taskId。
- API 重启后仍能查询。
- 可取消。
- 重复请求不会重复创建写任务。
- `input_required` 后能恢复。
- 完成后结果只返回一次。

## 118. 外部 MCP Consumer 测试

- STDIO。
- Streamable HTTP。
- 旧 SSE 兼容。
- API Key Header。
- OAuth。
- Tools。
- Resources。
- Prompts。
- Elicitation。
- Apps。
- Tasks。
- 连接关闭后没有 SSE 重连泄漏。

## 119. 客户端验收矩阵

| 测试项         | WorkBuddy |          Codex |              Xpert ChatKit |
| -------------- | --------: | -------------: | -------------------------: |
| Tools          |  必须通过 |       必须通过 |                   必须通过 |
| API Key/Bearer |  必须通过 |       必须通过 |       不适用或平台 Session |
| OAuth          |  必须通过 |       必须通过 | 外部 MCP Consumer 需要通过 |
| Instructions   |      验证 |       必须通过 |                       验证 |
| MCP Apps       |  必须通过 |   验证文字降级 |                   必须通过 |
| App 反向 Tool  |  必须审批 |         不适用 |                   必须审批 |
| Tasks          |      验证 | 验证客户端行为 |           必须显示任务状态 |

---

# 二十八、主要风险

## 120. 新旧 MCP SDK 并存

风险：

- 当前 Agent MCP 工具链依赖旧 LangChain Adapter。
- 新规范有破坏性变化。

处理：

- Publication 先使用新 SDK 独立实现。
- Consumer 后续迁移。
- 建立协议版本测试。

## 121. LangChain 丢失 `_meta`

当前 Xpert 已有自定义 `meta-artifact-bridge.ts`。

风险：

- 上游升级后内部字段变化。
- Bridge 可能失效。

处理：

- 把 Bridge 限制在 Consumer Adapter 内。
- MCP Publication 不经过 LangChain，直接使用 Tool Runtime 结果。
- 增加 `_meta`、`structuredContent`、`isError` 契约测试。

## 122. 客户端能力不同

风险：

- WorkBuddy 可以显示 App。
- Codex 当前不承诺显示 App。
- 不同客户端的 OAuth 和审批体验不同。

处理：

- Capability Negotiation。
- Tool 永远提供文字降级。
- 建立客户端兼容矩阵，不靠假设。

## 123. MCP App 安全

风险：

- 第三方 HTML。
- 数据外发。
- 反向 Tool 调用。
- 相机、定位等浏览器权限。

处理：

- 沙箱、CSP、审批、审计、最小权限、资源大小限制。
- 默认禁止未声明网络域。
- 写 Tool 默认确认。

## 124. 多实例状态

风险：

- App Instance、Task、Elicitation 落在某一台 API 内存。

处理：

- Redis/PostgreSQL。
- 无会话 MCP Endpoint。
- 幂等请求。

## 125. 插件升级造成行为漂移

风险：

- Tool 从只读变成写操作。
- 参数被删除。
- App 申请更多权限。

处理：

- Descriptor Hash。
- 破坏性变化待管理员复核。
- 权限扩大不能静默生效。

---

# 二十九、明确不做的事情

1. 不新增 Roots。
2. 不新增 Sampling。
3. 不新增 MCP Logging 协议；使用 OpenTelemetry 和平台日志。
4. 不为新 Publication 使用旧 SSE。
5. 不让每个插件启动独立公共 MCP Server。
6. 不自动发布所有插件工具。
7. 不把 MCP OAuth Token 传给第三方 Provider。
8. 不把 `xpert-sdk-js` 放进 MCP 调用主链路。
9. 不为了 MCP 伪造 Agent、Conversation、Checkpoint 上下文。
10. 不承诺所有客户端都能显示 MCP Apps。

---

# 三十、最终拍板

## 126. 最终模块关系

```text
xpert-plugin
    负责业务能力和 App 内容
        ↓
plugin-sdk
    负责稳定声明接口
        ↓
ToolRuntimeService
    负责统一执行
        ↓
McpPublication
    负责组合和发布
        ↓
McpAuth + RBAC + Audit
    负责安全治理
        ↓
Codex / WorkBuddy / 其他 Host
```

第三方 MCP 接入：

```text
第三方 MCP
    ↓
mcp-consumer
    ↓
Tool / Resource / Prompt / App / Task Adapter
    ↓
Xpert Agent 和 ChatKit
```

## 127. 最关键的三个技术决策

1. **先抽统一 Tool Runtime，再写 MCP Server。**
2. **Publication 绑定具体 `toolsetId + capabilityType + capabilityKey`。**
3. **新 Publication 使用 MCP `2026-07-28` Streamable HTTP；旧 Consumer 独立迁移。**

## 128. 一句话总结

> **Xpert 要建设的不是“把插件 Tool 套一层 MCP”，而是一套可以组合插件能力、统一认证授权、支持交互 UI 和长任务的 MCP 发布平台。**

---

# 参考代码和规范

## Xpert

- Toolset 统一加载：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/commands/handlers/get-tools.handler.ts>
- Plugin SDK BuiltinToolset：<https://github.com/xpert-ai/xpert/blob/main/packages/plugin-sdk/src/lib/toolset/builtin.ts>
- MCP Consumer Client：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/provider/mcp/types.ts>
- MCP Toolset：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/provider/mcp/mcp-toolset.ts>
- MCP Apps Runtime：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/provider/mcp/app-support.ts>
- MCP Apps Service：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/mcp-apps.service.ts>
- MCP `_meta` Bridge：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/provider/mcp/meta-artifact-bridge.ts>
- Xpert ChatKit MCP App：<https://github.com/xpert-ai/chatkit-js/blob/main/packages/chatkit-ui/src/components/thread/messages/mcp-app.tsx>

## MCP 官方

- MCP `2026-07-28`：<https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- Authorization：<https://modelcontextprotocol.io/specification/draft/basic/authorization>
- MCP Apps：<https://apps.extensions.modelcontextprotocol.io/api/documents/Overview.html>
- Tasks：<https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks>
- Tools：<https://modelcontextprotocol.io/specification/draft/server/tools>
- Resources：<https://modelcontextprotocol.io/specification/draft/server/resources>
- Prompts：<https://modelcontextprotocol.io/specification/draft/server/prompts>
- Completion：<https://modelcontextprotocol.io/specification/draft/server/utilities/completion>
- Elicitation：<https://modelcontextprotocol.io/specification/draft/client/elicitation>

---

# Cut 试点结论（2026-08-24 修订）

最初的 `xpert-cut-ir` 四工具 stdio MCP 只用于证明 plugin-managed stdio runtime、manifest allowlist 和进程生命周期。完整架构确定后，这套试点不再是 Cut 的交付形态：

- `cut_ir_create_project`、`cut_ir_validate_project`、`cut_ir_apply_operations`、`cut_ir_compare_projects` 以及独立 `mcp-server` 入口已经删除。
- Cut 改为宿主原生能力声明，和 Agent 复用同一业务实现，不再维护第二套 IR 工具语义。
- 当前 Cut 能力目录为 43 个 Tool、7 个 Resource Template、4 个 Prompt，共 54 项；其中 2 个 Tool 可选地支持 Task。
- Cut MCP 只允许安装到组织；它不是 MCP Publication、外部 MCP Consumer 或通用 stdio runtime 的前置依赖。
- 通用 stdio runtime 继续服务其他受托管插件或自定义 MCP server，不能因为删除 Cut 试点而回退。

历史 smoke 和四工具测试仅证明当时试点成立，不得继续作为当前 Cut 54 项宿主原生能力已验收的证据。

---

# 完整架构实施与审查状态（2026-08-25）

## 已实现的主干能力

- `plugin-sdk` 已提供 Tool、Resource、Resource Template、Prompt、App、Task、事件、执行上下文和统一结果契约，旧 LangChain Tool 继续兼容。
- Publication 按 tenant/organization 管理，能力绑定具体 `toolsetId + capabilityType + capabilityKey`。Toolset 如有真实工作区归属，执行时继续使用该工作区上下文。
- Agent、Workflow、API 和 MCP Publication 已统一进入 `ToolRuntimeService`；外部 MCP 的 Tool、Resource、Prompt、Completion 和 Task 也复用该入口。
- MCP Publication 管理模型、能力绑定、descriptor review、API Key、权限检查、限流、审计和连接信息已经实现。OAuth Resource Server 受 edition capability 保护，只在 `xpert-pro` 启用。
- 公共入口 `POST /api/mcp/p/:slug` 使用 MCP `2026-07-28` Streamable HTTP，支持 `server/discover`、Tools、Resources、Resource Templates、Prompts、Completion、Elicitation、Apps、Tasks 和 subscriptions。
- Tasks 使用数据库持久化和平台队列；MCP Apps 后端包含临时状态、历史快照、安全元数据、反向 Tool 审批、审计、下载确认和 teardown。
- 外部 MCP Consumer 已拆成 connection/auth/tools/resources/prompts/completion/elicitation/apps/tasks/subscriptions 模块，并保留旧 HTTP、SSE 和 STDIO 兼容路径。
- 全局“管理 / MCP 管理”页面组合 MCP 服务与按需启动的运行实例；第三方 MCP 接入仍保留在工作区业务入口。
- Cut 已声明 54 项宿主原生 MCP 能力，删除旧四工具 stdio 实现，并使用 patch changeset。

## 2026-08-25 CR 状态

1. **已修复**：`xpert-sdk-js` 的 Publication 管理已改为 tenant/organization scoped 的宿主路由；删除响应契约中的虚构 `workspaceId`，补齐 `providerInstructions` 和审计分页响应，并由契约测试固定。
2. **拆分交付**：`xpert-sdk-js` 的修正版已先行交付；`chatkit-js` 的 MCP Apps Host 升级及 Xpert 宿主侧对应的 ChatKit 包、iframe sandbox proxy 和部署环境配置不进入本次 Xpert PR，保留为独立后续升级。本次 PR 只交付不依赖该升级的宿主 MCP 平台能力。
3. **已修复**：Cut 静态 bundle manifest 与运行时 plugin meta 统一使用 `mcp` 分类，并增加一致性回归测试，避免安装前、安装后和 marketplace 合并结果不同。
4. **已修复**：OAuth 通过显式 edition capability 只在 `xpert-pro` 启用；开源版前端置灰且后端拒绝配置、metadata、启用旧 OAuth Publication 和 OAuth Bearer 调用。

## 尚未完成的验收

- 本轮 CR 只确认代码结构和定向自动化结果，不等同于浏览器手工验收。
- 真实 OAuth Provider、真实 Codex/WorkBuddy、Xpert ChatKit iframe、跨实例 Tasks/Apps、schema-sync 后数据库启动仍需按第 119 节和部署清单执行。
- 本仓库使用现有 schema-sync/TypeORM 同步链路创建 MCP 表；发布时必须执行该门禁，不能把“没有传统 migration 文件”误判为已完成数据库验收。

## 本轮定向自动化结果

- `xpert-sdk-js`：Publication 契约测试 7 项通过，`packages/core` TypeScript 检查通过。
- `chatkit-js`：不属于本次 Xpert PR，当前轮次不重新验证；其 SDK 升级、MCP Apps Host 和 sandbox proxy 继续作为独立后续交付。
- `xpert-develop`：contracts 16 个套件 74 项、UI 33 个套件 139 项、Cloud 改动范围 8 个套件 103 项、API 8 个套件 27 项以及本次改动涉及的 52 个 `server-ai` 测试文件通过；`plugin-sdk` 和 API 构建通过，Cloud development 构建通过。Cloud production 构建仅因当前环境无法验证 Google Fonts TLS 证书而停在字体内联，不是 TypeScript 或模板编译失败。
- `xpert-develop` 全量 `server-ai` 测试仍包含 develop 现有的非 MCP 失败并最终触发 Node 内存上限，不能以该全量结果替代上述改动范围验证，也没有在本 PR 中修改这些基线问题。
- `xpert-pro`：生产环境 edition capability 用例 2 项和 `config` 构建通过。
- `xpert-plugins`：Cut 分类一致性用例 1 项和 `tsconfig.spec` 类型检查通过。未执行浏览器手工验收和完整 Cut build/prepack。

## 仓库交付顺序

1. `xpert-sdk-js`：先修正 Publication 管理契约，验证并发布 `@xpert-ai/xpert-sdk` patch。
2. `xpert-develop`：先合入 Host contracts、plugin-sdk、Publication/Consumer/Apps/Tasks、开源版 OAuth 门禁和全局管理 UI；本次不升级 ChatKit 包，也不加入 iframe sandbox proxy 部署配置。执行 schema-sync 后部署 API，再部署 Cloud。
3. `xpert-pro`：在已合入对应 Host 基线后启用 MCP OAuth edition capability，验证真实 OAuth Provider，再部署 Pro API 和 Cloud。
4. `xpert-plugins`：发布 Cut patch，确保目标 Host 已理解原生 MCP 声明；安装到组织后再执行 Cut 54 项 discovery/call 与客户端验收。
5. `chatkit-js` 与 Xpert 宿主升级：作为独立后续交付，基于已发布 SDK 验证 MCP Apps Host，再单独更新 ChatKit 包、锁文件和 sandbox proxy 部署配置。

任一上游包尚未发布时，下游只能保留开发分支验证，不能宣称跨仓集成完成。
