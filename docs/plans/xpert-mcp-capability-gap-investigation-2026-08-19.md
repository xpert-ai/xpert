# Xpert MCP 能力与外部 MCP 接入现状调查报告

> 调查日期：2026-08-19
> 调查范围：Xpert、`xpert-plugins`、`plugin-sdk`、`xpert-sdk-js`、Xpert 版 `chatkit-js`，以及 MCP `2026-07-28` 规范。
> 本文不讨论已经废弃的 Roots、Sampling、Logging，也不建议新增旧式 HTTP+SSE 实现。
> 2026-08-25 范围校正：MCP Publication 是租户/组织级管理对象，不归属于工作空间；具体能力绑定真实 Toolset，只有 Toolset 的业务执行需要工作区时才携带 `workspaceId`。

---

## 一、先说结论

### 1. Xpert 插件可以通过 MCP 提供什么

Xpert 插件以后不应该只提供“几个工具函数”，还可以提供：

1. **Tools：执行动作**，例如查数据库、发消息、创建工单。
2. **Resources：提供可读取的数据**，例如一篇文档、一张表的结构、一个项目文件。
3. **Resource Templates：按参数读取数据**，例如 `documentId` 不同就读取不同文档。
4. **Prompts：提供任务模板**，例如“审查这个 PR”“分析这份合同”。
5. **Completion：给参数做自动补全**，例如输入 `xpe` 时提示 `xpert`、`xpert-pro`。
6. **Elicitation：任务执行中向用户补问信息或请求确认**。
7. **MCP Apps：在对话中显示可交互界面**，例如表格、图表、表单、地图、PDF。
8. **Tasks：执行长任务**，例如视频生成、批量处理文件、长时间数据分析。
9. **变化通知：告诉客户端工具、资源或任务发生了变化**。
10. **丰富结果：返回文字、结构化数据、图片、音频、资源链接，而不是只能返回字符串**。
11. **Server Instructions：告诉 Codex 等客户端整套工具应该怎样配合使用**。

### 2. 这些能力不是都写在插件里

最容易记住的分工是：

```text
xpert-plugin  = 提供实际能力和界面内容
plugin-sdk    = 规定插件应该怎样声明这些能力
xpert         = 负责发布、执行、权限、安全、审计
xpert-sdk-js  = 让外部程序远程管理 Xpert
```

例如“飞书搜索文档”：

```text
飞书插件：真正调用飞书 API 搜索文档
plugin-sdk：提供定义 search_document 的统一写法
Xpert：决定是否把它发布为 MCP、谁能调用、记录审计
xpert-sdk-js：让外部管理程序创建或修改这条 MCP 发布配置
```

### 3. 别人的 MCP 接入 Xpert，目前支持得怎么样

当前 Xpert 已经比较完整地支持：

- 接入 STDIO、Streamable HTTP 和旧式 SSE MCP Server。
- 获取并调用 Tools。
- 开关单个 Tool。
- 保留部分结构化结果和 `_meta` 数据。
- **Xpert 自己维护的 ChatKit 分支已经支持 MCP Apps**。

当前明显缺失或不完整的能力：

- 第三方 MCP 的 OAuth 登录流程。
- 通用 Resources 展示和使用。
- Resource Templates。
- Prompts。
- Completion。
- Elicitation。
- Tasks。
- 变化订阅。
- 缓存提示。
- MCP Server Instructions 的使用。
- MCP `2026-07-28` 的新无会话协议。

### 4. ChatKit JS 是否支持 MCP Apps

要分清两个项目：

- **OpenAI 原版 `openai/chatkit-js`**：截至本次调查，公开类型、文档和 `1.9.0` 更新记录没有把 MCP Apps 列为内置能力。它有自己的 Widgets，但 Widgets 不等于 MCP Apps。
- **Xpert 自己的 `xpert-ai/chatkit-js`**：已经实现 MCP Apps，包括安全 iframe、工具结果推送、反向调用工具、读取资源、发送消息和更新模型上下文。

所以准确答案是：

> **不是 OpenAI 原版 ChatKit 已经支持，而是 Xpert 自己维护的 ChatKit 分支已经补了 MCP Apps 支持。**

---

## 二、几个词先用人话解释

| 名称            | 用人话解释                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| MCP Host        | 用户正在使用的 AI 客户端，例如 ChatGPT、Claude、Codex、WorkBuddy、Xpert ChatKit |
| MCP Server      | 向这些客户端提供能力的服务                                                      |
| Tool            | 一个可以执行的动作                                                              |
| Resource        | 一个可以读取的数据对象                                                          |
| Prompt          | 一个可复用的任务模板                                                            |
| MCP App         | MCP Server 提供的一段交互式界面，客户端在安全 iframe 中显示                     |
| Task            | 不需要当前请求一直等待的长任务                                                  |
| MCP Publication | Xpert 租户或组织管理员创建的一条“对外 MCP 服务”                                 |
| Toolset         | Xpert 工作空间里已经配置好凭证的工具实例，例如“连接南京飞书账号的飞书工具集”    |

本文中的“插件 MCP”不是指每个插件自己启动一台 MCP Server，而是：

```text
插件提供能力
      ↓
Xpert 选择并发布这些能力
      ↓
外部客户端通过 Xpert 的 MCP 地址调用
```

---

# 第一部分：Xpert 插件发布成 MCP 后可以提供哪些功能

## 三、总体结构

```text
Xpert Plugin
   │
   ├── Tools
   ├── Resources
   ├── Resource Templates
   ├── Prompts
   ├── Completion
   ├── MCP Apps
   ├── 长任务逻辑
   └── 变化事件
          │
          ▼
      plugin-sdk
   统一声明和调用约定
          │
          ▼
        Xpert
   发布、认证、权限、审计
          │
          ▼
Codex / WorkBuddy / ChatGPT / Claude
```

## 四、能力清单、使用场景和实现归属

| 能力                | 什么情况下使用                                   |                xpert-plugin |                    plugin-sdk |                    Xpert 平台 |         xpert-sdk-js |
| ------------------- | ------------------------------------------------ | --------------------------: | ----------------------------: | ----------------------------: | -------------------: |
| Tools               | 要执行动作，例如查数据、创建工单、发消息         |                    实现动作 |              提供工具定义方式 |        执行、授权、审批、审计 |         管理发布配置 |
| Resources           | 要读取固定数据，例如文档、文件、表结构           |                    实现读取 |              提供资源定义方式 |            统一暴露和权限检查 |         管理是否发布 |
| Resource Templates  | 数据很多，不能全部预先列出，需要按 ID 或路径读取 |                实现模板读取 |              提供模板定义方式 |          参数校验、路由、权限 |         管理是否发布 |
| Prompts             | 给用户提供固定任务入口                           |                提供模板内容 |          提供 Prompt 定义方式 |      列表、参数校验、返回内容 |         管理是否发布 |
| Completion          | Prompt 或资源参数需要下拉提示、搜索建议          |              提供候选值查询 |                  提供补全回调 |              调用、限流、权限 |           无核心职责 |
| Elicitation         | 缺参数、要用户确认、要跳转登录                   |              决定需要问什么 |            提供请求输入的接口 |      显示、保存状态、恢复执行 |           无核心职责 |
| MCP Apps            | 需要表格、图表、表单、地图、PDF 等交互 UI        | 提供 HTML/JS/CSS 和业务交互 | 提供 App 声明和 Tool-App 关联 |  托管资源、安全沙箱、消息转发 |           无核心职责 |
| Tasks               | 视频生成、批量处理、长时间解析                   |                实现任务业务 |            声明工具支持长任务 |        队列、状态、取消、恢复 |   查询和管理任务可选 |
| 变化通知            | 工具权限、文档内容、任务状态变化                 |            发出业务变化事件 |              提供通用事件接口 |             转成 MCP 变化订阅 |           无核心职责 |
| 丰富结果            | 返回图片、音频、结构化 JSON、资源链接            |                生成结果内容 |              提供统一结果类型 | 转成 MCP 返回格式并做大小控制 |           无核心职责 |
| Server Instructions | 一套工具存在共同使用规则                         |            可提供插件级建议 |                  提供声明字段 |        合并成发布服务的总说明 |         管理说明内容 |
| API Key / OAuth     | 控制谁可以访问 Xpert MCP                         |                      不实现 |                        不实现 |                      完全负责 | 创建、撤销、查看配置 |

下面逐项说明。

---

## 五、Tools：让 AI 做事情

### 适合场景

- 飞书插件：搜索文档、发送消息、创建表格。
- GitHub 插件：搜索代码、创建 Issue、读取 PR。
- 数据库插件：查询数据、执行被允许的更新。
- 视频插件：提交视频生成任务。

### 谁负责什么

```text
插件：写实际业务代码
plugin-sdk：规定名称、输入参数、输出参数和风险说明怎么写
Xpert：决定是否发布、是否需要用户确认、使用哪个 Toolset 凭证
```

插件最好额外告诉平台：

- 这是只读还是写操作。
- 是否会删除或覆盖数据。
- 重复调用会不会重复扣费、重复发消息。
- 是否适合长任务。
- 是否关联 MCP App。

这些信息只是插件的“事实说明”，最终权限规则由 Xpert 决定。

---

## 六、Resources：让客户端读取数据

### 适合场景

- `lark://documents/123`：读取一篇飞书文档。
- `github://repos/xpert-ai/xpert/readme`：读取仓库说明。
- `postgres://tables/users/schema`：读取数据表结构。
- `xpert://knowledgebases/abc/documents/123`：读取知识库文档。

### 与 Tool 的区别

```text
Tool：去执行一次动作，例如“搜索文档”
Resource：直接读取一个已知对象，例如“读取文档 123”
```

Resources 很适合只读内容，也更容易缓存、引用和审计。

---

## 七、Resource Templates：按参数读取不同资源

如果一个飞书空间里有十万篇文档，不应该把十万个 Resource 全部列出来。

可以提供一个模板：

```text
lark://documents/{documentId}
```

数据库插件可以提供：

```text
postgres://tables/{schema}/{table}
```

使用时由客户端填入参数，再读取对应数据。

### 适合场景

- 文档 ID、文件路径、项目 ID 数量很大。
- 资源是动态生成的。
- 用户只知道部分名称，需要配合自动补全。

---

## 八、Prompts：给用户提供任务模板

Prompts 不是执行动作，而是给用户一个已经设计好的任务入口。

例如 GitHub 插件可以提供：

```text
review_pull_request
investigate_bug
prepare_release_notes
```

用户选择“审查 PR”，填写仓库和 PR 编号，客户端再把模板内容交给模型。

### 与 Xpert Skill 的关系

不要规定“一个 Skill 就等于一个 MCP Prompt”。

更合理的是：

```text
一个完整 Skill
   ├── 说明
   ├── 流程
   ├── 工具使用规范
   └── 可选择暴露一个或多个 Prompt 入口
```

---

## 九、Completion：给参数做自动补全

这里的 Completion 不是让大模型续写文字，而是输入框的候选建议。

例如：

```text
项目名称输入：xpe
提示：
- xpert
- xpert-pro
- xpert-plugins
```

或者资源模板：

```text
postgres://tables/{table}
```

用户输入 `user` 时提示：

```text
users
user_profiles
user_sessions
```

### 适合场景

- Prompt 参数。
- Resource Template 参数。
- 项目、文档、仓库、表名等候选值很多。

---

## 十、Elicitation：执行中向用户补问信息

例如部署工具已经开始执行，但缺少环境：

```text
要部署到哪里？
- dev
- staging
- production
```

或者删除工具需要确认：

```text
即将删除 3 个文件，是否继续？
```

还可以给用户一个安全网页地址完成敏感操作，例如：

- OAuth 登录。
- 支付授权。
- 输入不应经过聊天内容传输的秘密信息。

### 责任边界

- 插件负责说明“当前缺什么信息”。
- Xpert 负责把问题展示给用户、保存当前执行状态，并在用户回答后恢复任务。
- API Key、OAuth Token 等敏感数据不能作为普通表单结果直接交给插件。

---

## 十一、MCP Apps：在对话中展示交互式界面

### 适合场景

- 数据库查询结果表格：分页、排序、筛选。
- 销售分析 Dashboard。
- PDF 阅读和批注。
- 地图、3D 模型、视频播放器。
- 配置表单、审批表单、多步骤向导。
- 任务进度和实时日志。

### 插件提供什么

```text
Tool：query_sales_data
App：sales-dashboard 的 HTML/JS/CSS
关联关系：这个 Tool 调用后使用这个 App 展示
```

### Xpert 提供什么

- 给 App 分配 `ui://` 资源地址。
- 安全 iframe。
- CSP 网络访问限制。
- 相机、麦克风、定位等权限控制。
- Tool 输入和结果推送。
- App 反向调用工具时的用户审批。
- App 生命周期和历史恢复。

### 必须支持文本降级

不是所有客户端都能显示 MCP Apps。

因此带 App 的 Tool 仍必须返回有用的文字或结构化数据：

```text
支持 Apps 的 WorkBuddy：显示交互式表格
不支持 Apps 的 Codex：仍然能看到文字摘要和 JSON 结果
```

MCP Apps 官方把这种方式称为“渐进增强”：有 UI 支持就显示 UI，没有也能继续工作。

---

## 十二、Tasks：执行长任务

### 适合场景

- 视频生成。
- 批量解析数百份文件。
- 大型报表生成。
- 浏览器自动化。
- 数据导出和模型训练。

不应该让一个 HTTP 请求等待十分钟。

正确流程是：

```text
调用工具
  ↓
返回 taskId
  ↓
客户端查询进度
  ↓
可取消、可等待、必要时向用户补问信息
  ↓
最终取得结果
```

Xpert 已有执行记录、队列和 Managed Queue，适合由平台统一映射成 MCP Tasks。插件只实现任务内容，不自己建任务数据库。

---

## 十三、变化通知

### 适合场景

- 插件升级后新增了工具。
- 用户撤销授权后某个工具不可用了。
- 飞书文档发生更新。
- 任务状态从运行中变为完成。
- Prompt 列表发生变化。

插件发出“业务对象变化”事件，Xpert 再转成 MCP 的变化订阅消息。插件无需自己理解每种客户端的连接方式。

---

## 十四、丰富结果

Tool 返回值不要只支持字符串。

建议支持：

- 文字。
- 结构化 JSON。
- 图片。
- 音频。
- Resource Link。
- 内嵌 Resource。
- 只给 UI 使用、不放进模型上下文的 `_meta` 数据。

例如图片生成插件可以直接返回图片内容和资源地址，而不是只返回一段 URL 字符串。

---

## 十五、Server Instructions

Server Instructions 是一条整套 MCP 服务的使用说明。

例如“研发 MCP 服务”可以说明：

```text
- 搜索代码前先调用 repository_info。
- 创建 Issue 前必须先展示标题和正文给用户确认。
- 数据库工具只允许查询，不允许写入。
- 每分钟最多调用 20 次。
```

Codex 官方会读取 MCP Server 的 `instructions`，并把它作为整套工具的共同使用规则。因此 Xpert 发布给 Codex 时，这项能力很有价值。

---

## 十六、API Key 和 OAuth

这是平台功能，不是插件功能。

### API Key 适合

- 个人 Codex。
- 固定 WorkBuddy 工作区。
- CI/CD。
- 服务账号。

### OAuth 适合

- 客户端需要代表真实用户访问。
- 要显示 Xpert 登录和授权页面。
- 不同用户拥有不同工作空间权限。
- 需要可撤销、可刷新、可审计的用户授权。

注意有两层不同授权：

```text
Codex → Xpert MCP：由 Xpert MCP Auth 负责
Xpert 插件 → 飞书/GitHub：由插件连接和平台凭证中心负责
```

Xpert 收到的 OAuth Token 不能原样转发给飞书或 GitHub。

---

## 十七、四个项目的最终职责

### `xpert-plugin`

负责：

- 工具业务代码。
- 第三方 API 适配。
- Resource 读取逻辑。
- Prompt 内容。
- Completion 候选查询。
- MCP App 的 HTML/JS/CSS。
- 长任务实际业务。
- 工具风险、只读、幂等等事实声明。

不负责：

- 启动公共 MCP HTTP Server。
- API Key。
- MCP OAuth。
- 工作空间权限。
- 审计、限流、全局审批。

### `plugin-sdk`

负责：

- 提供统一的 Tool、Resource、Prompt、App、Task 定义方式。
- 提供统一执行上下文。
- 提供统一返回结果类型。
- 提供变化事件接口。
- 隐藏 Xpert 内部 CommandBus、数据库和具体实现。

不负责：

- 跑 MCP Server。
- 存数据库。
- 验证 OAuth Token。
- 管理工作空间。

### `xpert`

负责：

- 工作空间内能力目录。
- MCP Publication。
- MCP 协议和 Streamable HTTP Endpoint。
- Tools、Resources、Prompts 等列表和调用。
- API Key、OAuth、RBAC。
- Tool Runtime。
- MCP Apps Host 和安全策略。
- Task、队列、恢复、取消。
- 审计、限流、缓存、Tracing。
- 多租户和多实例一致性。

### `xpert-sdk-js`

负责远程调用 Xpert 管理 API，例如：

- 创建、修改、下线 MCP Publication。
- 绑定或解绑插件能力。
- 创建、撤销 API Key。
- 管理 OAuth 策略。
- 查询审计和连接信息。

它不参与 Codex 实际调用插件的链路。

---

# 第二部分：别人的 MCP 接入 Xpert，目前支持情况

## 十八、当前接入链路

```text
第三方 MCP Server
      ↓
Xpert MCP Client
      ↓
转换成 LangChain Tool
      ↓
Xpert Agent 调用
      ↓
结果进入 ChatKit
```

当前主要代码：

- `packages/server-ai/src/xpert-toolset/provider/mcp/types.ts`
- `packages/server-ai/src/xpert-toolset/provider/mcp/mcp-toolset.ts`
- `packages/server-ai/src/xpert-toolset/provider/mcp/app-support.ts`
- `packages/server-ai/src/xpert-toolset/mcp-apps.service.ts`
- `packages/server-ai/src/xpert-toolset/provider/mcp/meta-artifact-bridge.ts`

## 十九、当前能力对照表

| MCP 能力                                | Xpert 当前状态         | 说明                                                           |
| --------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| STDIO                                   | 已支持                 | 可以启动本地 MCP 进程                                          |
| Streamable HTTP                         | 已支持                 | 可以配置远程 HTTP MCP 地址                                     |
| 旧式 SSE                                | 已支持，但不应继续扩展 | 新规范已经废弃，应只保留兼容                                   |
| Tools 列表和调用                        | 已支持                 | 当前最完整的能力                                               |
| 单 Tool 启用/禁用                       | 已支持                 | Toolset 中可配置                                               |
| Tool 输入 Schema                        | 已支持                 | 转成 LangChain Tool 使用                                       |
| Tool annotations                        | 部分支持               | MCP Apps 元数据能读取，但尚未形成统一风险和审批策略            |
| `structuredContent`、`_meta`、`isError` | 部分支持               | 通过自定义 bridge 保留下来，但依赖 LangChain 适配层兼容代码    |
| 通用 Resources                          | 部分支持               | MCP Apps 可读取资源；普通资源没有形成面向 Agent/用户的完整入口 |
| Resource Templates                      | 未支持                 | 没有发现列表、读取和参数补全链路                               |
| Prompts                                 | 未支持                 | 没有发现 `prompts/list`、`prompts/get` 的平台接入              |
| Completion                              | 未支持                 | 没有参数自动补全能力                                           |
| Elicitation                             | 未支持                 | 第三方 MCP 不能在执行中让 Xpert 向用户补问                     |
| MCP Apps                                | 已支持，但不完整       | Xpert 自己的 ChatKit 分支已经实现，生产环境默认关闭            |
| Tasks                                   | 未支持                 | 第三方 MCP 长任务没有接入 Xpert 任务模型                       |
| 变化订阅                                | 未支持                 | 没有 `subscriptions/listen`                                    |
| 列表缓存提示                            | 未支持                 | 没有发现 `ttlMs`、`cacheScope` 的使用                          |
| Server Instructions                     | 未支持使用             | 没有发现把 MCP Server 的说明注入 Agent 的逻辑                  |
| 手工 API Key/Header                     | 可用                   | 用户可以手工配置 Header，但没有专门的凭证生命周期              |
| MCP OAuth                               | 未支持                 | 没有发现 discovery、浏览器登录、Token 保存和刷新流程           |
| MCP `2026-07-28` 无会话协议             | 未支持                 | 当前依赖和代码仍是旧版会话式客户端结构                         |

## 二十、为什么说当前 MCP 协议实现偏旧

当前 `server-ai` 使用：

```text
@modelcontextprotocol/sdk ^1.17.4
@langchain/mcp-adapters 0.6.0
```

代码仍然通过 `MultiServerMCPClient` 建立客户端、保存连接并调用 `getTools()`，同时保留 SSE Transport 的强制关闭逻辑。

而 MCP `2026-07-28` 已改为：

- 无初始化握手和服务端 Session。
- 每个请求可以落到任意 API 实例。
- 使用请求 Header 帮助网关路由和授权。
- List 结果可缓存。
- 变化事件统一走 `subscriptions/listen`。

因此当前 Xpert 可以继续兼容旧 MCP，但如果要建设新的平台级 MCP 能力，不能继续把旧客户端结构当成未来基础。

---

# 第三部分：Xpert ChatKit 的 MCP Apps 调查

## 二十一、OpenAI 原版 ChatKit 的结论

本次核查的 OpenAI 原版：

```text
仓库：openai/chatkit-js
包：@openai/chatkit
版本：1.9.0
```

公开类型中有：

- ChatKit Widgets。
- Widget Action。
- Client Tool。
- Composer、Command、Entity 等 UI 能力。

但没有发现：

- `ui://` MCP App Resource。
- MCP Apps AppBridge。
- `_meta.ui.resourceUri`。
- MCP App iframe 生命周期。

所以不能因为 ChatKit 能显示 Widget，就判断它已经支持标准 MCP Apps。

## 二十二、Xpert 自己的 ChatKit 已经支持什么

Xpert 维护的仓库：

```text
xpert-ai/chatkit-js
包：@xpert-ai/chatkit-ui
当前核查版本：0.5.0
```

核心文件：

```text
packages/chatkit-ui/src/components/thread/messages/mcp-app.tsx
```

已支持：

1. 获取 `ui://` HTML Resource。
2. 校验 `text/html;profile=mcp-app`。
3. 使用 `srcDoc` 渲染安全 iframe。
4. 注入 CSP。
5. 支持相机、麦克风、定位、剪贴板写入权限声明。
6. 注入主题、语言、方向、时区和容器尺寸。
7. 向 App 发送初始 Tool 输入和 Tool 结果。
8. App 反向调用同一 MCP Server 的 Tool。
9. App 读取 MCP Resource。
10. App 打开 HTTP/HTTPS 外链。
11. App 发送用户消息到对话。
12. App 更新后续模型上下文。
13. 根据 App 高度自动调整 iframe。
14. 历史消息中重新恢复 App 实例。
15. 通过签名 Token 保护 App 实例访问。

后端支持的 App RPC 方法包括：

```text
ping
tools/call
resources/read
ui/message
ui/update-model-context
ui/request-display-mode
notifications/message
```

## 二十三、Xpert MCP Apps 还缺什么

| 缺口                                        | 影响                                                        | 建议优先级 |
| ------------------------------------------- | ----------------------------------------------------------- | ---------: |
| 反向 `tools/call` 没有看到用户审批流程      | 第三方界面可能在用户不知情时执行写操作                      |       最高 |
| App 实例主要保存在 API 进程内存             | 多 API 实例或重启后状态不稳定，虽然有恢复逻辑但仍有复杂边界 |       最高 |
| 生产环境默认关闭                            | 不显式配置 `XPERT_MCP_APPS_ENABLED` 就不能使用              |         高 |
| 只支持 inline 显示                          | 不支持 fullscreen、画中画                                   |         中 |
| 没有 `ui/resource-teardown`                 | App 卸载时无法完整清理状态和资源                            |         高 |
| 没有主题、语言、尺寸变化通知                | 打开后切换主题等场景不能实时更新                            |         中 |
| 没有 `ui/download-file`                     | App 无法使用标准下载能力                                    |         中 |
| 没有 App 内 `tools/list`                    | App 只能调用已知名称的 Tool                                 |         中 |
| 没有 App 内 `resources/list`                | 不能浏览 Server 的资源目录                                  |         中 |
| 没有 `resources/templates/list`             | App 无法发现动态资源模板                                    |         中 |
| 没有 `prompts/list`                         | App 无法浏览 Prompt                                         |         低 |
| `domain` 被读取但没有真正分配专用 Origin    | 不能按标准域隔离和复用站点身份                              |         中 |
| `ui/message` 会把图片、音频等简化成占位文本 | 多模态消息会丢失原始内容                                    |         中 |
| 没有 Tool 调用审批缓存和细粒度策略          | 无法区分只读刷新与危险写操作                                |         高 |

### 当前安全限制

代码中已有一些好的限制：

- App HTML 默认最大 2 MiB。
- 历史 Tool Result 默认最大 128 KiB，过大则不持久化完整结果。
- App 实例默认 30 分钟过期。
- iframe 不允许访问主页面 DOM 和 Cookie。
- 外链只允许 HTTP/HTTPS。
- 资源读取禁止 HTTP、HTTPS、JavaScript、Data、Blob URI 直接穿透。
- 生产环境需要配置 `XPERT_MCP_APP_TOKEN_SECRET`。

但最需要补的是：

> **App 反向调用 Tool 必须经过平台权限检查；写操作默认弹出用户确认。**

---

# 第四部分：客户端兼容性

## 二十四、WorkBuddy

官方文档确认 WorkBuddy 支持：

- MCP 标准 OAuth。
- Token 自动刷新。
- MCP Apps。
- App 内反向调用 Tool。
- App 读取资源。
- App 显示表格、表单、地图、PDF、3D 等界面。

因此 WorkBuddy 是 Xpert 第一批验证完整 MCP Apps 的合适客户端。

## 二十五、Codex

Codex 官方文档明确支持：

- STDIO MCP Server。
- Streamable HTTP MCP Server。
- Bearer Token。
- OAuth。
- Server Instructions。

Codex 文档没有把 MCP Apps 列入 Codex Host 的已支持 MCP 功能。因此：

- 可以把 Xpert 的 Tool、OAuth、Instructions 作为 Codex 第一阶段目标。
- 不应该承诺 Codex 一定显示 MCP Apps。
- 所有 MCP App Tool 必须提供文字或结构化结果降级。

## 二十六、建议的客户端验证矩阵

| 客户端                |          Tools |  API Key/Bearer |                       OAuth | Instructions |           MCP Apps |
| --------------------- | -------------: | --------------: | --------------------------: | -----------: | -----------------: |
| WorkBuddy Web/IDE     |             是 |              是 |                          是 |       需实测 |                 是 |
| Codex CLI/IDE/Desktop |             是 |              是 |                          是 |           是 |   不承诺，必须降级 |
| Xpert ChatKit         |             是 | 使用 Xpert 登录 | 当前接第三方 OAuth 尚未支持 |     尚未使用 | 是，Xpert 自研实现 |
| ChatGPT/Claude 等     | 取决于接入方式 |     取决于 Host |                 取决于 Host |  取决于 Host |   部分客户端已支持 |

---

# 第五部分：建议的建设顺序

## 二十七、插件发布 MCP

### 第一批必须完成

1. 统一 Tool Runtime。
2. 创建 MCP Publication。
3. 发布 Tools。
4. API Key。
5. 权限、审计、限流。
6. Streamable HTTP。
7. Server Instructions。
8. Codex 和 WorkBuddy 联调。

### 第二批

1. MCP Apps 发布。
2. App Tool 的文字降级。
3. App 反向 Tool 调用审批。
4. App 实例改用 Redis 等共享状态。

### 第三批

1. OAuth。
2. Resources。
3. Resource Templates。
4. Prompts。
5. Completion。
6. Elicitation。

### 第四批

1. Tasks。
2. 变化订阅。
3. 缓存提示。
4. 完整 Tracing。

## 二十八、第三方 MCP 接入 Xpert

优先顺序建议：

1. 把当前 MCP Apps 安全缺口补齐。
2. 增加 OAuth 客户端流程。
3. 增加 Resources 和 Prompts。
4. 增加 Elicitation。
5. 增加 Tasks。
6. 升级到 MCP `2026-07-28` 新客户端实现。
7. 旧 SSE 只保留兼容，不再增加新功能。

---

# 第六部分：最终架构判断

## 二十九、应该怎样定义这项产品能力

不要把项目命名为：

```text
插件 MCP
```

更准确的产品和架构名称是：

```text
Xpert MCP 发布能力
```

因为未来被发布的不一定只有插件 Tool，还可能包括：

- OpenAPI Tool。
- 外部 MCP Tool。
- 知识库查询。
- Workflow。
- Agent。
- Prompt。
- Resource。
- MCP App。

最终结构应该是：

```text
各种 Xpert 能力
      ↓
统一能力目录和执行入口
      ↓
MCP Publication
      ↓
API Key / OAuth / RBAC
      ↓
Codex / WorkBuddy / ChatGPT / Claude
```

## 三十、最终一句话

> **插件负责提供能力，`plugin-sdk` 负责规定能力怎么声明，Xpert 负责把能力安全地发布成 MCP，`xpert-sdk-js` 只负责远程管理这些发布配置。**

---

# 参考资料

## MCP 官方

- MCP `2026-07-28` 发布说明：<https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- MCP Apps 发布说明：<https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/>
- MCP Apps Overview：<https://apps.extensions.modelcontextprotocol.io/api/documents/Overview.html>
- MCP Tasks：<https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks>
- Tools：<https://modelcontextprotocol.io/specification/draft/server/tools>
- Resources：<https://modelcontextprotocol.io/specification/draft/server/resources>
- Prompts：<https://modelcontextprotocol.io/specification/draft/server/prompts>
- Completion：<https://modelcontextprotocol.io/specification/draft/server/utilities/completion>
- Elicitation：<https://modelcontextprotocol.io/specification/draft/client/elicitation>
- Authorization：<https://modelcontextprotocol.io/specification/draft/basic/authorization>

## 客户端

- Codex MCP 文档：<https://learn.chatgpt.com/docs/extend/mcp>
- WorkBuddy MCP：<https://www.codebuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide>
- WorkBuddy MCP Apps：<https://www.codebuddy.cn/docs/cli/mcp-apps>
- OpenAI ChatKit JS：<https://github.com/openai/chatkit-js>
- Xpert ChatKit JS：<https://github.com/xpert-ai/chatkit-js>

## Xpert 代码依据

- MCP Toolset：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/provider/mcp/mcp-toolset.ts>
- MCP Client 创建：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/provider/mcp/types.ts>
- MCP Apps 后端支持：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/provider/mcp/app-support.ts>
- MCP Apps Service：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/mcp-apps.service.ts>
- `_meta` 兼容 Bridge：<https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-toolset/provider/mcp/meta-artifact-bridge.ts>
- MCP 数据类型：<https://github.com/xpert-ai/xpert/blob/main/packages/contracts/src/ai/xpert-tool-mcp.model.ts>
- MCP 配置页面：<https://github.com/xpert-ai/xpert/blob/main/apps/cloud/src/app/@shared/mcp/server/server.component.ts>
- Xpert ChatKit MCP App UI：<https://github.com/xpert-ai/chatkit-js/blob/main/packages/chatkit-ui/src/components/thread/messages/mcp-app.tsx>
