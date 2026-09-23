# 会话 Agent Plugins

标准 Agent Plugin 是资源包，使用根目录 `plugin.json`、`skills/<name>/SKILL.md` 和 `mcp.json`。它不要求 `package.json`，不执行 npm 脚本、Hooks 或服务器模块。原生 Xpert 插件继续使用原安装机制和安装范围。

## 管理员操作

1. 进入组织范围的「插件 → Agent Plugins」。管理员必须拥有目标工作空间的管理权限。
2. 输入 HTTPS Git 地址、明确 ref 和可选子目录，或上传 ZIP。ZIP 可直接包含包内容，也可包含一个顶层目录。系统保留来源、Git commit、内容摘要和组件诊断。有效 Skill 不会因同包另一个 Skill 或 MCP 配置无效而被丢弃。
3. 查看组件清单。声明了 `cn.xpertai.connectors` 的 MCP 自动使用 Connector 授权；旧个人 OAuth 包需要发布新的 Connector 配置版本，不再提供个人授权入口。将 `cn.xpertai` 的逻辑专家引用映射到当前组织可用的已发布专家。中间件 provider 必须已通过原生插件安装，配置遵守 provider schema。
4. 选择可使用的工作空间并上架。也可以直接上架已有中间件配置或已发布数字专家，无需构造插件包。
5. 升级时先导入新包，在上架表单选择「替换版本」。已有会话继续使用旧绑定，新目录仅展示新版本。停用旧绑定会阻止后续调用；用户需要移除或重新选择。

Packages are organization-scoped. Runtime checks cover the organization, workspace, project, Assistant, resource and expert permissions. Users can select published package bindings and automatically discovered resources described below, and use connections configured by workspace administrators. Assistant access governs runtime use; users do not own Connector accounts.

## 会话行为

### Automatic resource discovery

- External experts are discovered from published Agents accessible to the current actor. A delegated ChatKit session must first authorize its exact parent Assistant; resource discovery then applies the actor's tenant, organization, workspace and membership rules. The catalog shows the newest published revision per expert family and excludes the parent family and experts already configured in the graph.
- Middleware entries combine managed configuration presets with installed, user-addable providers whose default configuration passes their schema. Missing required configuration, malformed schemas, internal providers and deprecated providers are excluded from automatic discovery. Providers already represented by managed presets or the entry Agent's graph are not listed again.
- Explicit managed bindings take precedence in the catalog. Disabling a binding also prevents automatic discovery from making the same resource available again in that workspace.
- Automatic entries do not create database bindings or change Assistant graphs. Their scoped UUID and configuration digest use the existing SDK selection contract. Every execution rebuilds and authorizes the reference; expert republication or middleware configuration/provider-version changes invalidate stale references. Older published expert snapshots remain usable while they still exist and are authorized.
- Existing menu caching and pagination are unchanged. Reload the page after deploying the backend change to replace a previously cached catalog.

宿主通过 `composer.resources.enabled: true` 启用输入框下方「插件」入口；ChatKit 默认关闭。插件整体选择，详情展示组件和诊断。支持搜索、分类、分页、浏览全部、添加、移除和授权失败后保留草稿。

`runtimeResources` 独立于 `runtimeCapabilities`：

```json
{ "revision": 0, "resources": [{ "bindingId": "<binding UUID>", "version": "<64-character configuration digest>" }] }
```

首次消息可携带完整选择；已有会话通过专用接口提交完整集合，revision 冲突返回 409。普通会话 options 更新不能修改资源字段。进行中的执行和中断恢复使用执行快照；新选择从下一次执行生效，撤销权限仍会阻止旧快照的后续工具或协作者调用。

能力仅装配到入口 Agent，不修改 Assistant 草稿或发布图。Skills 在未配置 Skills 节点时自动获得加载能力；无沙箱时仅可读取授权包中的文件。远程 MCP 使用现有 OAuth、审批和 MCP Apps 消费链路，不要求服务器提供 Xpert 私有字段。MCP 配置被工作空间操作改写后，原版本绑定失效。中间件相同 provider 配置去重，冲突拒绝；既有必需中间件不可关闭。外部专家固定引用发布 ID 和发布时间；原 ID 被重新发布后，旧绑定失效，需重新上架选择。

当前支持 Streamable HTTP MCP。stdio、旧 SSE 显示诊断并跳过；不支持 marketplace 订阅、旧客户端清单兼容、任意 Agent URL 或包内代码加载。

## 接口与 SDK

Xpert 请求在 ChatKit 中统一通过 `@xpert-ai/xpert-sdk`：

| SDK                                    | API（相对 `/api/ai`）                              |
| -------------------------------------- | -------------------------------------------------- |
| `assistants.getResources`              | `GET /assistants/:id/resources`                    |
| `assistants.validateResources`         | `POST /assistants/:id/resources/validate`          |
| `assistants.authorizeResource`         | `POST /assistants/:id/resources/authorize`         |
| `conversations.getRuntimeResources`    | `GET /conversations/:id/runtime-resources`         |
| `conversations.updateRuntimeResources` | `PUT /conversations/:id/runtime-resources`         |
| `connectors.runtimeOptions`            | `GET /assistants/:id/connectors`                   |
| `connectors.runtimeStatus`             | `GET /assistants/:id/connectors/:bindingId/status` |

Connector runtime reads accept Assistant-scoped ChatKit credentials under `/api/ai`. The readiness response contains only `bindingId`, `status`, and `granted`. Configuration, OAuth authorization, reconnection and disconnection remain on the administrator `/api/connector` API. Deploy these backend routes before updating the SDK and ChatKit; legacy management routes retain their existing authentication.

查询支持 `projectId`、`search`、`kind`、`offset`、`limit`。管理员 API 位于 `/api/agent-plugins`：`GET /`、`GET /options`、`POST /git`、`POST /zip`、`POST /bindings`、`PUT /bindings/:id`。替换上架使用可选 `replacesBindingId`，停用使用 `{ "enabled": false }`。

## 存储与部署

执行 `packages/server-ai/src/agent-plugin/migrations/20260921-agent-plugins.sql`，并将 `XPERT_AGENT_PLUGIN_PATH` 指向所有 API/执行节点共享、持久化的目录。默认 `storage/agent-plugins` 适合单节点本地开发。数据库与包目录必须一起备份；不要在导入后编辑包目录。

发布顺序：后端及数据库迁移 → 带资源接口的 SDK → ChatKit types/UI/Web Component → Xpert 宿主。保留未启用入口的旧客户端兼容性。发布 SDK 后将 ChatKit 的 SDK 依赖更新到该已发布版本并刷新 lockfile；发布 ChatKit 后更新 Xpert 对应依赖和 lockfile。当前宿主使用已发布的 ChatKit Types/UI/Web Component 0.6.0、Angular 0.4.4、Web Shared 0.4.5，依赖锁文件同时固定 SDK 0.3.0，无需本地源码链接。发布到生产环境仍需执行数据库迁移并配置共享包存储。

## 示例与验证

- Exa、Notion、Linear、Supabase、Sentry、Canva 中国版的标准包、批量安装和授权流程见 [xpert-plugins 快速接入](https://github.com/xpert-ai/xpert-plugins/tree/main/agent-plugins)。直接复用现有链路，无需 Codex 清单兼容或桌面运行时。
- 本轮自动检查、实际调用与发布前待验证项见 [验收记录](./VALIDATION.md)。
- 单元测试：`corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand packages/server-ai/src/agent-plugin`。
- 本地实际调用验收使用专用 Assistant 和本地 Streamable HTTP 测试服务器，不修改现有业务 Assistant。

规范依据：[Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md)。`cn.xpertai` 是宿主扩展，非标准内建资源类型。

## Agent Plugin 与 Connector 授权

标准包通过 `extensions["cn.xpertai"].connectors` 按 MCP server key 声明依赖：

```json
{
  "version": 1,
  "connectors": {
    "notion": { "type": "mcp_oauth" },
    "canva": { "type": "existing", "provider": "canva", "resource": "https://mcp.canva.cn" }
  }
}
```

- `mcp_oauth` 自动生成组织隔离的 Connector provider，创建空间统一连接，复用浏览器绑定的 OAuth 回调、加密凭据存储、刷新和断开。provider 身份包含 endpoint、scopes、clientRegistration；可选 `clientRegistration: "preregistered"` 使用现有 Connector 配置表单。默认动态客户端注册，无须按服务编写原生插件。
- `existing` 只映射管理员已创建的 shared workspace Connector。包使用逻辑 provider 和 OAuth resource/scopes，不分发机器 ID 或凭据。Canva 的 clientId/clientSecret 继续配置在既有 System Integration。
- MCP OAuth 元数据发现使用独立固定版本 `@modelcontextprotocol/sdk-oauth`，原 MCP transport SDK 保持原版本。支持路径形式的 protected-resource metadata、PKCE 和 resource/audience 校验；复用已有受约束 OAuth fetch。
- 每次请求重新检查当前用户、组织、空间/项目、已上架绑定、持久化 toolset 配置、Connector 可用状态和资源范围。credential-only Connector 不作为独立中间件展示。MCP App 的执行上下文仅保存在服务端快照；恢复连接后仍重新校验授权。
- SDK `assistants.authorizeResource` 返回工作空间 Connector 状态与配置权限。有权限时，ChatKit 的“连接账号”通过 `composer.resources.onConnect({ assistantId, bindingId })` 直接打开宿主的目标 Connector 连接流程；无权限时显示联系管理员的提示。宿主重新校验当前 Assistant、工作空间和绑定的配置权限，复用空间连接表单及 OAuth。返回 `{ status: "connected" | "cancelled" }`，不传递凭据；ChatKit 重新检查就绪状态后继续原来的能力选择，取消或失败不清空草稿。iframe 通过 Web Component 的 `onConnectWorkspaceConnector` 命令调用宿主。
- 同一 server 不能同时声明旧 `oauthServers` 与 `connectorServers`。旧发布版本和凭据不自动搬迁；通过新版本替换启用 Connector，管理员清理旧个人连接并创建新的空间共享连接后，重新上架插件以更新连接引用；匹配 endpoint/scopes 的后续版本复用该空间连接。历史个人凭据不复制，不提供个人到共享的自动迁移。原生插件安装范围规则保持不变。

当前验证使用 npm 发布包；生产启用前仍须按后端 → SDK → ChatKit 的顺序部署。

## 工作空间连接模型

- 工作空间持有连接配置和凭据；只有空间管理员能创建、连接、重连或断开。
- 运行时通过已发布 Assistant 校验用户权限，使用该 Assistant 所在空间的连接；每次工具调用重新验证权限与连接状态。
- ChatKit 的“连接插件”同时展示标准插件和可执行 Connector 能力，凭据依赖型 Connector 不单独展示。旧 `+ → 连接器` 仅作为未启用统一选择器的兼容入口。
- 新客户端目录可使用 `includeWorkspace=true` 在项目上下文中读取空间连接；历史项目连接保留兼容；图中 provider 在没有历史项目配置时使用 Assistant 工作空间的连接。项目权限仍先行校验，同一会话不能同时选择同一 provider 的多个连接。
- 管理入口始终指向空间设置，不再新增“我的连接”页面。旧个人绑定不再支持重连或自动转换。开发环境清理旧绑定及其授权会话、使用许可后，新建 shared 绑定并重新上架引用它的插件；旧个人 OAuth 包必须上架 Connector 依赖版本。
