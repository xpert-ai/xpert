# 本地验收记录

验收日期：2026-09-21。范围为 Xpert 后端与 Angular 宿主、xpert-sdk-js、chatkit-js 的当前工作区源码。本地使用现有 PostgreSQL/Redis；API 为 3333，宿主为 4300，ChatKit 开发服务为 5173，3000 保持关闭。

## 自动检查

| 检查                                                                  | 结果                      |
| --------------------------------------------------------------------- | ------------------------- |
| Agent Plugins 解析、来源处理、运行时服务、图装配、文件读取及 MCP 配置 | 7 个测试套件、26 项通过   |
| ChatKit 全部单元测试                                                  | 85 个测试文件、827 项通过 |
| SDK 全部单元测试                                                      | 86 项通过、4 项跳过       |
| SDK、ChatKit、后端与 Angular 类型检查                                 | 通过                      |
| SDK 与 ChatKit UI 库构建                                              | 通过                      |

后端检查包含清单校验、组件隔离、路径边界与 ZIP 路径逃逸、资源选择校验、版本检查、必需中间件与配置冲突。相关 ChatHandler、发布专家访问和 Skills 回归另行运行；未运行整个 Xpert 单体仓库的全部测试。

## 本地集成与浏览器验收

| 场景                                        | 结果                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| 无 package.json 的标准包通过 ZIP 导入、上架 | 成功；有效 Skill、远程 MCP 与无效 Skill、不支持的 stdio 同包隔离           |
| 未预装 Skills/MCP 节点的专用 Assistant      | 成功读取 Skill，真实调用 Streamable HTTP 工具，返回校验文本                |
| 个人 OAuth 与 MCP Apps                      | 本地协议测试服务器完成发现、客户端注册、PKCE、回调、工具调用与 UI 资源读取 |
| 图外中间件与已发布外部专家                  | 成功装配并实际委派，入口 Assistant 的发布图不变                            |
| 会话选择和并发                              | 首次保存、读取、更新通过；旧 revision 返回 409                             |
| 替换资源版本                                | 新目录展示新绑定；旧绑定退出目录，既有会话的版本仍可验证                   |
| 停用资源                                    | 选择校验及已签发 MCP Apps 访问返回 403                                     |
| 浏览器交互                                  | 管理页、搜索、移除旧版本、添加新版本、浏览全部、窄屏抽屉及刷新恢复通过     |

集成验收使用专用测试 Assistant、资源包和本地 MCP 服务，没有修改业务 Assistant 的发布图。OAuth 测试绑定在验收后停用。具体运行标识和原始回执保留在受保护的本地环境目录，不写入可分发文档。

## 尚未执行的发布检查

- OAuth 使用本地协议测试服务器，尚未使用第三方生产账号验收。
- Git 导入有源码与单元校验，本轮实际导入使用 ZIP；尚未针对外部 Git 服务做端到端验收。
- 本地数据库由开发环境同步表结构；独立 SQL 迁移仍需在目标发布环境的预演数据库执行。
- 初次验收使用本地构建链接；2026-09-22 已升级到正式发布的 SDK/ChatKit 包并更新消费者依赖与 lockfile，未部署生产环境。发布顺序和共享包存储要求见 [操作文档](./README.md)。

## Exa / Notion 首批接入补充验收

本轮新增标准包、安装脚本和文档，未修改后端运行时、SDK 或 ChatKit 实现。安装脚本 8 项测试、真实 ZIP 经生产解压与解析器的 2 项契约测试通过。

| 场景                                   | 结果                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 导入、上架与重复安装                   | Exa、Notion 已上架；重复安装复用原绑定                                                                 |
| 无静态 Skills/MCP 节点的专用 Assistant | 成功加载 exa-research 并调用真实 web_search_exa                                                        |
| Exa 搜索结果                           | 上游返回匿名免费额度耗尽，未取得成功搜索结果；未重试限流请求                                           |
| Notion OAuth                           | 真实发现与客户端注册通过，授权入口指向 mcp.notion.com；未代替用户同意授权或访问私有页面                |
| 会话状态                               | 首条消息保存、SDK 重新读取、移除和恢复通过                                                             |
| Assistant 图                           | 原有 Assistant 与专用验收 Assistant 的发布图均未被会话资源修改                                         |
| 暂缓的资源                             | Supabase 存在 OAuth 元数据发现兼容问题，其测试绑定已停用；OpenAI Developers 在当前网络返回 403，未上架 |

本轮浏览器自动化入口超时，未新增浏览器验收结论。第三方调用成功、用户授权与安装成功分别记录，不能相互替代。使用入口与当前限制见 [xpert-plugins 快速接入](https://github.com/xpert-ai/xpert-plugins/tree/main/agent-plugins)。

## Connector 升级与第二批资源

这一轮升级了后端、SDK 和 ChatKit，并把所有可分发包放在 `xpert-plugins/agent-plugins`。
前节 Supabase 的发现兼容问题已修复；以本节为准。

| 检查                        | 结果                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| 六个标准包                  | Exa、Notion、Linear、Supabase、Sentry、Canva CN 通过生产 ZIP/解析生命周期检查                            |
| 实际第三方 OAuth 发现       | Notion、Linear、Supabase、Sentry 均完成发现/注册并产生带 S256 和 resource 的授权入口；目录为待授权       |
| 本地完整 Connector 协议测试 | 浏览器回调 Cookie 绑定、PKCE、resource、自动刷新、Agent 工具调用通过                                     |
| MCP Apps                    | 执行结束后从持久化执行上下文恢复连接，成功读取 UI 内容                                                   |
| 版本与账号                  | 替换版本复用同一 Connector；旧会话版本仍有效；Assistant 发布图不变                                       |
| 账号撤销                    | 断开账号后目录显示待授权；已有 MCP UI 再读取被拒绝，远端读取计数不变                                     |
| Canva 原生插件              | 构建、生命周期和 35 项 Nx 单元测试通过；修复原 Jest 配置的 ESM/TS 加载问题                               |
| ChatKit / SDK               | 21 项选择器/授权回归、19 项 SDK 契约测试通过；类型检查通过                                               |
| 后端                        | Connector Service 75 项测试及 MCP OAuth/资源授权、MCP Apps/快照回归通过；后端与 Angular 模板类型检查通过 |

第三方测试只完成了真实发现与客户端注册，未替用户登录或同意授权，未读取第三方私有数据。Canva 仍需要管理员配置 System Integration 和个人 workspace Connector；未宣称真实 Canva 账号调用成功。Exa 原有匿名配额限制仍然存在。

本地完整协议测试可通过 `xpert-plugins/plugin-dev-harness/agent-plugins-connector-live.mjs` 复现，原始回执保存在受保护本地目录。当前浏览器自动化入口超时，本轮不新增浏览器端视觉验收结论。未发布 npm 包或部署生产。

## 2026-09-22 工作空间统一连接

- 新建 Connector 只允许 shared；连接操作要求空间管理员权限。已获准使用 Assistant 的调用者不需要个人 Connector 所有权或 consent。
- 历史个人绑定显示未连接，运行时拒绝使用。管理员显式重连时作废旧待授权会话，重新取得共享凭据，不复制个人凭据。
- 后端定向测试覆盖权限撤销、共享读取、管理员重连、项目访问、跨空间隔离、重复 provider 和旧个人 OAuth 资源拒绝；SDK 覆盖目录查询与新字段。
- ChatKit 覆盖合并目录、凭据依赖隐藏、缓存、管理员入口、无个人授权、失败不改变选择、StrictMode 去重及切换会话取消迟到操作。
- 六个标准包通过真实 ZIP 打包和生产解析器生命周期检查；安装脚本测试 9 项通过。
- 本地 OAuth/MCP fixture 完成浏览器回调 Cookie 绑定、空间 shared 连接、令牌刷新、1 次真实 Agent 工具调用、MCP UI 读取、跨版本连接复用和旧版本保留。Assistant 图未改变。断开后目录失效，既有 UI 的后续请求被阻止。测试绑定已停用，测试共享连接已断开。
- 上述端到端验证使用本地模拟服务，不代表新的第三方服务账号已授权。浏览器页面在当前过期登录态验证了重新登录提示，完整页面流程须在有效登录后复核。

## 2026-09-22 ChatKit Connector runtime authentication correction

- The Connector catalog alert alone did not establish an expired browser login. `/api/connector/runtime-options` used ordinary login authentication, while ChatKit sends an Assistant-scoped client secret. Its 401 was displayed as a sign-in error.
- Runtime catalog and readiness now use `/api/ai/assistants/:assistantId/connectors` and `/:bindingId/status`. OAuth and connection mutations retain the existing administrator routes. Readiness exposes only binding ID, status and granted state.
- HTTP regression tests use the production authentication guards and SecretTokenStrategy with fixture persistence: valid delegation, immutable organization context, missing/expired/invalid credentials, cross-Assistant replay, permission errors, response field filtering and administrator route protection. Connector service plus HTTP tests: 83 passed; SDK: 21 passed; ChatKit: 8 passed. Backend and ChatKit type checks and SDK build passed.
- A locally issued, short-lived ChatKit session accessed an authorized test Assistant through the built SDK: catalog and readiness succeeded; cross-Assistant replay returned 403; the legacy administrator API rejected the same credential with 401. No third-party OAuth, Assistant configuration or connection state was changed. The local ChatKit development server serves the updated SDK; the user's exact browser flow remains a manual refresh check.

## 2026-09-22 OAuth 回调与开发数据清理

- 两个 Cloud 连接入口启用 `withCredentials`，浏览器可保存回调绑定 Cookie；2 项请求回归测试通过。
- 停止个人连接到共享连接的自动转换；服务层只允许创建 shared 连接，旧个人连接必须删除后重建。
- 回调区分真实超时、会话失效与连接配置不一致，保留浏览器绑定和资源边界校验。Connector 与插件依赖定向测试 97 项通过。
- 通过已授权的组织／工作空间 API 删除本地 Notion 旧个人连接及其会话和许可，新建 disconnected shared 连接，并重新上架 Notion 配置、停用旧绑定。没有复用个人凭据或重放授权码。
- Notion 真实服务授权仍需管理员重新完成；已有会话中的旧 Notion 资源需要移除后重新选择。

## 工作空间连接宿主命令（2026-09-22）

- ChatKit 全量 886 个测试通过；宿主连接器、宿主命令和 Assistant ChatKit 相关测试 41 个通过。覆盖配置权限、跨空间绑定、伪造 Assistant、重复点击、取消、切换 Assistant，以及序列化回调经 iframe 命令发送。
- ChatKit types、UI 类型检查、Web Component 构建、UI library/application 构建及 Cloud TypeScript 检查通过。
- 浏览器验证：有配置权限时展示“连接账号”；点击后直接打开宿主的目标 Connector，取消后回到原弹窗且选择不变。无权限分支通过组件及宿主命令测试。
- 现有 Supabase 验收绑定为旧个人连接，服务端拒绝重连并提示重新创建工作空间连接；未迁移凭据或完成第三方 OAuth。
- 发布需同时升级 ChatKit Web Component 和 UI，避免旧桥接组件无法处理 `onConnectWorkspaceConnector`。
