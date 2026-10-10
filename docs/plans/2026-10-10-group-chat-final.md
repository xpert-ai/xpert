# 群聊最终实现与验证边界

更新日期：2026-10-10。本文以当前 develop 分支实现为准，收敛开发期方案；早期原型和迁移草稿不作为部署依据。

## 会话与消息模型

群 D 直接使用 `ChatConversation(purpose='group')`。`xpertId` 是默认接收无 @ 消息的主数字专家标识，不另设默认成员字段。每个数字专家成员使用独立的 `ChatConversation(purpose='group_assistant_runtime')` 保存模型上下文和执行记录；公开群时间线使用群 D 的 `ChatMessage`。

新增实体服务于成员、投递回执和人类交互认领，不另造一套群会话模型：

| 实体                    | 职责                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `GroupParticipant`      | 真人/数字专家成员、角色、运行会话关联、已读与个人偏好      |
| `GroupMessageRecipient` | 每条公开消息对各接收者的投递和消费回执、执行关联与恢复状态 |
| `GroupInteraction`      | 指定真人的工具或审批交互及其唯一认领状态                   |

以上实体实现共享契约 interface。业务逻辑集中在 `ChatGroupModule`；`AIModule` 保留 `/api/ai/groups` 入口 Controller 和统一认证边界。运行能力由其所属的 `xpert/runtime-capabilities` 管理，通过显式依赖及类型化 CQRS 协作。

## 路由、身份与队列

- 真人输入有 @ 时，仅投递给正文绑定的成员；无 @ 时交给 `xpertId` 指定的主数字专家。只 @ 真人不唤醒数字专家。
- @ 使用稳定成员 ID 与 UTF-16 文本区间绑定，服务端校验正文、成员和权限，不按显示名称猜测接收者。回复关联不能覆盖正文路由。
- 数字专家间通过 `send_group_message` 的 request/reply 协议交流，保留根问题关联、投递回执与循环限制。
- 执行复用已有 Handoff/message queue；运行中输入使用 steer，不增加第二种队列或前端模式选择。
- 真人消息身份来自认证上下文。每次执行归属实际发起问题的真人；数字专家之间的转交沿用根真人，真人回复使用实际回复者。运行中的 steer 不改写已开始执行的创建人。

`ChatMessage.sequence` 是公开消息顺序；`ChatConversation.lastMessageSequence` 在行锁下分配下一个序号；`ChatConversation.revision` 表示快照变化。成员或投递状态变化需要更新 revision，但不生成新的消息序号。字段不保留开发期旧列名映射。

## 统一 ChatKit 凭据

宿主用已登录真人及正确的 tenant/organization 上下文请求：

```http
POST /api/ai/v1/chatkit/sessions
Content-Type: application/json

{ "scope": { "kind": "conversation", "conversationId": "<group-conversation-uuid>" } }
```

返回的 `client_secret` 通过现有 `api.getClientSecret` 交给 ChatKit。凭据绑定真人及指定 conversation，沿用统一认证、过期和刷新机制；不使用独立群凭据头。群成员身份不自动授予内部执行、工作空间或项目资源的读取权限，相关入口继续检查各自的访问范围。

SDK 0.9.1 已发布，提供群消息、成员、SSE 与 Workbench/Composer API，并已移除无效的 `GroupsClient.createSession`。凭据统一通过上述宿主接口创建。ChatKit 0.13.0 使用正式发布的 SDK 0.9.1；Cloud、Desktop 和服务端类型通过共享 catalog 对齐 ChatKit 0.13.0，无需本地 SDK 链接脚本。

## 界面复用

Cloud 和 Desktop 均沿用现有 ChatKit Chat，群模式通过运行时适配器提供数据及操作。共用 Header、原 Actions、Composer、消息列表及 Chat/Workbench 左右布局，不新建第二套聊天窗口。

- 群与数字专家共用会话列表，头像采用成员组合形式。
- 当前真人消息靠右且无头像；其他成员靠左，连续同作者消息在组末左下显示头像。
- 时间按间隔合并展示；@ 以正文为准，不另加重复说明，也不显示原消息引用块。
- 群成员使用 Dialog，用户与数字专家通过 Tabs 区分，邀请使用可搜索选择器；头像详情复用原详情交互。
- 数字专家消息上的姓名链接打开原 Workbench 执行视图，定位对应运行记录；读取仍受运行归属和资源权限约束。
- 原 Composer 项目、文件、插件菜单保留；涉及资源的上下文限制在一个目标数字专家。多目标时不混用私有资源上下文。
- 主题只使用既有变量及其派生规则，不新增 `ChatKitThemeTokens` 颜色配置。宿主切换会话时保留 iframe，按会话绑定重置数据和凭据。

## 已提交及验证范围

| 主仓库    | 已提交批次                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Xpert     | 后端群聊与统一凭据各批；Cloud `b63107477`；Desktop `6c2bd5472`；ChatKit 0.13.0 升级与 minor changeset `4fff33037`                               |
| ChatKit   | 已发布 0.13.0；主题及宿主契约 `806699c`；群聊界面 `fe79435`；SDK 0.9.1 接入 `ae1e653`；输入框与工作台收尾 `13723fd`；develop 合并验证 `8086700` |
| Xpert SDK | 已发布 0.9.1；统一群凭据接口 `fd4f79c`；发布冲突及文件访问测试合并 `71ffc19`                                                                    |

此前审核阶段：ChatKit 相关测试 382 项通过，切换正式 SDK 0.9.0 后补跑 72 项通过，类型检查和 UI 构建通过。Desktop 308 项测试通过，并通过类型检查、原生音频构建及前端构建；本机 Node 22 测试使用 `NODE_OPTIONS=--experimental-strip-types` 加载 TypeScript。

本次宿主升级：主工作区、API build/production、Web 和 Desktop 五份锁文件均通过冻结检查；25 项依赖检查、7 项 Desktop 群聊与会话列表测试，以及 Cloud、contracts 类型检查通过。ChatKit 0.13.0 的冻结安装已通过，发布包中的内嵌 UI 入口及静态资源已核验。以上是依赖与静态/单元验证，不等同于重新完成整套群聊端到端验收。

真实双人、双数字专家交互记录见 [四方验收记录](2026-10-09-group-four-actor-acceptance.md)。该历史记录包括人问人、人问数字专家、数字专家互问互答、双 SSE 和 busy 输入；没有同时验证 B 的完整 Desktop 视觉界面。一次 busy steer 在原回答结束后续跑，耗时约 31.757 秒，不能据此声称立即中断当前生成。最终主分支合并后未在本次文档收尾中重新执行该端到端场景。

本批收尾统一 Cloud 的数字专家加载失败提示，并更新群聊实现及历史验收文档。SDK 接口清理与 ChatKit 依赖升级已分别提交。
