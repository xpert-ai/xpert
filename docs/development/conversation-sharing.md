# 会话分享

会话分享复用 `Artifact → ArtifactVersion → ArtifactLink`，Cloud 页面为 `/s/<artifact-slug>`。没有独立 ConversationShare entity 或恢复令牌接口。会话快照通过 SDK `ArtifactTypeProvider` 注册为内置 Artifact 插件；类型绑定保存在 Artifact 的 `typeBinding` 列。这是新功能，不提供旧策略或未绑定数据的兼容读取。

## 产品调研

截至 2026 年 10 月 27 日，OpenAI 的[分享说明](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt)区分个人账户与受管理工作区：个人链接允许持链接者访问，后续消息不会自动加入；受管理工作区链接限制在同一工作区内，可能包含后续消息。撤销链接不收回接收者已经保存的副本。

用户提供的 Codex 截图包含会话菜单中的分享入口、内容预览、复制链接按钮，并明确提示不包含姓名和后续新增消息，任何持链接者可读。示例地址为 `https://chatgpt.com/s/cx_6ae059d485248191a2f56e7353a3b260`。本次网页抓取没有返回可读正文，因此这些 Codex 行为来自截图观察；不能仅凭 `/s/` 路径或 `cx_` 前缀推断服务端权限。

Xpert 采用截图中的快照语义，同时增加组织访问、到期和撤销。重新分享产生新链接并撤销原链接，避免原接收者通过同一 URL 静默看到新增内容。

## 权限规则

| 操作或访问者                                               | 规则                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 创建、预览、列表、撤销                                     | 已登录的真实用户，必须为会话创建者，且是来源组织的有效成员                                     |
| USER_XPERT 委托会话                                        | 允许管理其真实用户所有的会话；重新检查 Assistant 委托授权与家族范围                            |
| API Key、PUBLIC_XPERT、ENTERPRISE_XPERT、USER_CONVERSATION | 不允许管理分享；组织分享读取也不接受这些凭据                                                   |
| 项目或群组会话                                             | 第一版禁止导出，避免个人扩大共同数据的受众                                                     |
| 组织分享                                                   | 持链接并登录的来源组织有效成员；实时查询数据库，不信任组织请求头                               |
| 公开分享                                                   | 默认可用，所有者主动选择公开并勾选确认后发布；无需登录                                         |
| 失效条件                                                   | 到期、撤销、替换链接、原会话删除、分享者删除或失去组织成员资格、组织停用、原会话移入项目或群组 |

第一版支持 1、7、30 天有效期，默认 7 天。不提供密码、指定收件人名单、完整项目分享、群组分享、附件访问或“继续对话”。组织成员可以在没有 Assistant 使用权限的情况下阅读已明确导出的快照，但分享不会给他们原 Assistant 的使用权限。

## 数据边界

快照仅包含标题和按父消息链排序的可见 human/ai 文字。AI 消息必须成功完成；运行时隐藏消息、事件、待处理或取消的后续输入不导出。图片、附件、组件、工具结果、推理、引用结构、内部 ID、账户资料、状态、检查点及凭据不进入分享 DTO。

预览与分享页面复用 ChatKit 的 `MessageList`，通过 `ReadonlyMessageList` 将导出的 role/text 转换为只读消息，保留 Markdown、代码和表格展示。关闭编辑、重试、反馈和引用操作，不解释 HTML、不加载远程图片、不触发私有资源命令；Mermaid 以代码显示，普通 HTTP(S) 链接只能由访问者主动打开，并使用 noreferrer。用户主动写入正文的个人信息、密钥、链接和文件内容仍然可能被分享，预览明确提示分享者检查；系统不宣称自动脱敏全部正文。

消息链最多扫描 1,000 条，快照最多 1 MiB。超限、空内容或不完整父消息链拒绝导出，不静默截断。创建时重新生成快照并核对预览 SHA-256 摘要；内容变化返回 409，要求重新预览。随后保存独立 JSON，原会话的编辑及后续回复不会修改它。

## 存储和授权

- `Artifact.source` 为共享合同中的 `CONVERSATION_SHARE_ARTIFACT_SOURCE`：`pluginName=@xpert-ai/platform`、`resourceType=conversation_snapshot`，`resourceId` 为会话 ID。Artifact 的 tenant、organization、user 来自已认证的所有者范围。
- 快照通过现有 Workspace Files 上传到所有者私有文件目录，以 SHA-256 作为 ArtifactVersion 幂等键；版本记录文件大小、校验和和引用。相同快照复用版本。
- ArtifactLink 使用 `shareKey=conversation`、固定 `artifactVersionId`、`versionMode=version`、禁止下载和明确有效期。受众只允许 `organization_all` 或 `public_link`。使用 Artifact 原生随机 slug、持久化 URL、撤销状态和访问审计，不再另存加密令牌。
- `ConversationSharingService` 负责会话导出权限和预览摘要；`ConversationArtifactShares` 负责发布及个人列表；`ConversationArtifactPlugin` 位于 `ai/conversation-sharing`，实现 SDK 的 `IArtifactTypeProvider`，声明内容格式、分享限制和快照读取，实现来源会话与所有者成员关系校验。Artifact 核心不引用会话领域。
- 原生 Artifact 原始内容入口执行相同策略与快照结构校验，且读取后重新检查撤销及权限。普通 descriptor 入口禁止返回会话导出的内部标识。禁止通过通用 Artifact API 将链接改为 latest、无限期、允许下载或其他受众；公开发布始终需要明确确认，application policy 不可绕过。
- 撤销沿用 ArtifactLink 的状态和审计，不删除会话、Artifact 或版本文件。到期不等于立即清理存储。原会话删除后快照不可访问；所有者仍可以在个人管理中撤销。

## 交互和接口

ChatKit 菜单打开分享 Dialog，先预览当前分支，再选择组织/公开和 1、7、30 天。读取已有分享和复制只执行 GET，不延长有效期、不创建版本或新链接。显式更新才调用发布接口并替换旧链接。

个人设置中的“已分享链接” Dialog 支持搜索、分页、名称直接打开分享页、复制原链接、查看固定预览和确认撤销。查询限定当前租户与本人创建/拥有的 ArtifactLink；不依赖当前选择的组织。无权限或失效记录可清理但不返回可复制 URL。批量撤销限定用户已查看列表的时间截止点，保留后来创建的链接。

管理 API 位于 `/api/ai`，只读分享读取使用独立 allowlist DTO：

| 方法与路径                                       | 用途                                              |
| ------------------------------------------------ | ------------------------------------------------- |
| POST `/conversations/:id/share-preview`          | 预览 threadId，返回文字快照、摘要及公开分享可用性 |
| POST `/conversations/:id/shares`                 | 校验摘要并显式发布/更新                           |
| GET `/conversations/:id/shares`                  | 查询已有链接                                      |
| DELETE `/conversations/:id/shares/:shareId`      | 撤销该会话的链接                                  |
| GET `/shared-conversations/:token`               | 匿名读取公开快照；组织链接返回 401                |
| GET `/shared-conversations/:token/authenticated` | 登录读取组织快照                                  |
| GET `/conversation-shares`                       | 本人分享列表，支持搜索和分页                      |
| GET `/conversation-shares/:shareId`              | 本人查看固定快照                                  |
| DELETE `/conversation-shares/:shareId`           | 撤销本人链接                                      |
| POST `/conversation-shares/revoke-all`           | 确认并按截止时间撤销本人链接                      |

## 部署与验证

先发布新增分享接口的 SDK，再升级 ChatKit lockfile 并发布 ChatKit。当前本地使用相邻 SDK 源码链接；SDK 的 minor changeset 尚未发布。旧 SDK 下入口通过能力检测隐藏。

API 通过仓库标准 `start-api.mjs` 执行 build → schema apply → verify → serve；不增加分享实体；数据库需要包含 `Artifact.typeBinding` 列。只添加结构，不推测或回填旧记录的类型。Cloud 的 `CHATKIT_FRAME_URL` 应指向包含只读渲染入口的 ChatKit。分享及管理页面 URL 复用现有 `CLIENT_BASE_URL`，配置边界将其映射到通用的 `getConfig().clientBaseUrl`，未配置时使用平台已有的 `http://localhost:4200` 默认值。无需 `conversationSharing` 配置或额外公开开关；公开选项默认可用，发布仍需所有者主动选择并确认，默认受众仍为组织内，有效期默认 7 天。此功能不依赖额外加密密钥。

2026-10-28 配置简化验收：66 项分享及类型授权测试、26 项配置测试通过；本地移除专属公开开关并按标准流程重启 API 后，真实公开链接匿名读取成功，组织链接匿名返回 401、登录读取成功；未确认公开的发布请求返回 400，已有链接 ID、URL、有效期及管理列表保持不变。回执见工作区外 `.xpert-local-environment/conversation-sharing-20261027/sharing-defaults-acceptance.json`。

分享 API 及 `/s/` 页面保持 no-store、noindex/nofollow/noarchive 和 no-referrer。Pino 隐藏分享路径和 Artifact 原始内容路径中的 slug。网关/CDN 应采用相同策略。

测试涵盖会话授权和严格 HTTP 输入、Artifact 固定版本/校验和/持久化链接、匿名及组织成员读取、源码和成员失效、公开确认、撤销和到期、原始内容入口拒绝绕过，以及只读消息列表和管理 Dialog。完整 ChatKit/SDK 测试和本地真实数据验收回执位于工作区外 `.xpert-local-environment/conversation-sharing-20261027/`。本地链接仅限可访问该 localhost 的浏览器，未部署到互联网。

### 本地验收（2026-10-27）

真实 PostgreSQL 数据确认分享保存为 3 个 Artifact、3 个固定版本和 2 个有效链接（另一个临时分享已撤销）。组织分享匿名被拒绝；公开分享匿名可读；原始 Artifact 内容执行同一受众策略，descriptor 不返回会话内部标识。个人列表搜索、分页、重复读取、截止时间保护及撤销后原会话保留已通过。

浏览器正常登录后，管理列表名称打开对应页面，首击复制及刷新后复制均得到相同 URL。ChatKit 会话分享弹窗连续两次打开/复制，没有创建或替换请求。全新匿名浏览器在 1280px/390px 下显示只读 MessageList，宿主均与父容器等宽，无横向溢出、原会话请求或页面错误。

Artifact/会话后端回归 134 项通过，17 项数据库集成测试因原有环境条件跳过；最终新增内容策略及分享测试 57 项通过。Cloud 11、SDK 202、ChatKit UI 2293、配置 6、日志 5 项通过，SDK/ChatKit 原有跳过项保留。Server、Cloud、ChatKit 类型检查和 SDK/ChatKit 构建通过；API 按标准流程完成结构校验并恢复 ready。未执行生产部署或 Nginx 容器验收。

### Artifact 类型插件边界（2026-10-28）

`AppModule` 直接导入 `ConversationArtifactPluginModule`，由会话模块显式注册 `ConversationArtifactPlugin`、分享 URL 和宿主快照展示。内置类型和安装插件使用同一个 SDK `ArtifactTypeRegistry`；注册身份来自宿主装配或插件加载器，访问解析使用 Artifact 持久化的租户、组织和类型安装范围。Artifact 核心不导入会话代码，无需额外的内置插件聚合模块。

Artifact 存储 `typeBinding={pluginName,resourceType,scopeKey}`。类型和安装范围不可更改；插件卸载后拒绝访问，不回退到其他安装或普通文件。未绑定记录拒绝读取，需要通过有权访问来源的正常发布流程重新创建/发布。未维护旧内部策略接口。

会话插件声明只允许固定版本、最长 30 天、禁止下载和通用 descriptor，公开发布仍需明确确认。通用 Artifact 服务落实这些限制，并等待异步插件校验。内置 `/s/` 页面继续使用 ChatKit 的只读消息列表。

通用快照插件的 `/artifacts/snapshot/:slug` 页面可匿名展示，内容通过 `/api/artifacts/shared-links/:slug/snapshot` 读取。插件只获得明确的 viewer 描述及授权后的版本字节，渲染时清空隐式请求身份，不提供查询通道。实时查询展示继续使用当前登录访问者，并校验相同插件安装的 Presentation Provider。

通用 `ArtifactShareQueries` 仍封装所有者/租户/来源过滤、分页、查找和撤销，业务层不直接查询 ArtifactLink/ArtifactVersion 表。SDK 接入说明见 `packages/plugin-sdk/docs/artifact-types.md`。

本次类型插件实现验证：后端 143 项、SDK 注册及能力边界 44 项、Cloud 展示 18 项、日志脱敏 5 项通过；后端原有 17 项数据库集成测试按环境条件跳过。Server/SDK 类型检查、Cloud 类型及 Angular 模板编译通过。

### 类型插件本地真实数据验收（2026-10-28）

API 已通过标准 build → schema apply → verify → serve 流程重启并恢复 ready；Cloud 开发服务已重新编译。`artifact` 属于普通实体同步表，`typeBinding` 通过结构同步添加，不另设 SQL 迁移或回填历史数据。通过正常会话发布 API 将验收会话绑定到内置 `conversation_snapshot` 类型，PostgreSQL 确认 3 个 Artifact 均为 `builtin:global`，每个仍只有 1 个固定版本；2 个有效链接，临时撤销用例无有效链接。

真实 API 验证公开分享匿名可读、组织分享匿名拒绝且正常登录可读，原始 Artifact 入口执行相同受众规则。管理查询的搜索、分页、链接复用、身份注入拒绝、撤销后的不可访问及原会话保留均通过。额外 12 项 HTTP 检查确认：禁止下载、禁止通过通用快照渲染器读取内置会话类型、禁止改用普通文件绕过类型、禁止就地修改受众、禁止 latest 版本分享、公开分享必须显式确认；拒绝后原链接和受众保持不变。

浏览器通过正常登录验收管理弹窗名称打开页面、首击复制、刷新后复制相同 URL；ChatKit 分享弹窗连续两次进入及复制也未发送创建/替换请求。匿名浏览器实际渲染 ChatKit MessageList，1280px/390px 下宿主分别与父容器等宽，无输入框、操作按钮、私有会话请求、渲染 iframe 的 API 请求或页面错误。已检查桌面和手机截图。

验收回执位于工作区外 `.xpert-local-environment/conversation-sharing-20261027/artifact-type-*.json`，截图位于 `output/playwright/artifact-types/`。此验收覆盖内置会话 Artifact 插件；外部插件注册、安装范围隔离、卸载后的拒绝访问及通用快照协议由自动测试覆盖，未额外安装第三方插件。未部署生产或验证生产 Nginx 容器。
