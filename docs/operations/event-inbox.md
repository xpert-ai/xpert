# 事件收件箱的绑定、切流与诊断

平台从已授权的插件来源接收业务事实，按业务对象交给后台处理。绑定指定来源插件、适配器、来源引用、已发布的 Assistant 和执行用户，并保存租户、组织、工作区、可选项目和发布版本。即使来源事件还没有会话，也可以产生回执。[用户指南](../zh-Hans/guides/event-inbox.mdx) · [绑定实体与索引](../../packages/server-ai/src/agent-event/agent-event.entity.ts) · [插件 SDK 与三个接入示例](https://github.com/xpert-ai/xpert-plugins/blob/develop/docs/event-inbox.md)

## 一条事实如何变成回执

以某次报价延期为例，解析事务提交、收件成功、形成交期风险、飞书通知送达分别有自己的证据。

| 阶段     | 持久化与恢复                                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 来源捕获 | 插件在业务事务内固定来源 ID、对象分区、绑定修订和不可变快照。原始报价、GitHub 载荷或飞书消息留在插件。                                                                            |
| 平台收件 | 收件服务校验信封、绑定和声明的类型版本，以绑定 ID 和来源事件 ID 唯一写入 `agent_event_inbox`。原信封重投返回同一回执；同键内容冲突保留原回执并增加冲突计数。                      |
| 后台处理 | 共享恢复扫描和 Managed Queue 唤醒绑定。平台恢复执行身份，重验已发布目标和项目，按绑定及 `subject.kind/key` 认领同一分区的事件。插件重验业务权限，在领域事务内保存决定和操作引用。 |
| 完成回执 | 平台校验租约所有者、代次和到期时间。接替后迟到的 worker 无法覆盖当前决定。可恢复的处理失败进入退避，达到尝试上限后隔离；已经提交的领域决定可重放。                                |

`agent_event_binding` 保存委托及修订，`agent_event_partition` 保存分区租约。部署时按平台标准同步实体和索引，再执行 `schema-sync --action verify`。队列负责唤醒，数据库持久记录负责恢复。普通聊天仍走消息接口；已启动的运行沿用 Handoff/Invocation、项目 Pipeline 和 checkpoint；渠道发送及通知继续使用各自的出站记录。[数据库同步](../development/database-migrations.md) · [运行时](../../packages/server-ai/src/agent-event/agent-event.runtime.ts) · [回执存储](../../packages/server-ai/src/agent-event/agent-event.store.ts)

## 按来源绑定启用

先部署兼容平台和插件，并确认目标 Assistant 已发布。执行人需要相应组织、工作区创作和适用的项目权限。Code Review 上线前可启用仓库级影子比对，检查 `matched`、`different` 和 `binding_changed`，核实差异后再切换该仓库。

| 插件        | `adapter`            | `sourceBindingRef`                 |
| ----------- | -------------------- | ---------------------------------- |
| Code Review | `code_review.github` | 仓库策略 ID                        |
| 采购比价    | `procurement.quote`  | 采购案例 ID                        |
| 飞书        | `lark.inbound`       | 已绑定该 Assistant 触发器的集成 ID |

以执行用户的组织身份调用 `POST /api/agent-event/assistants/{assistantId}/bindings`，传入插件包名 `plugin`、`adapter`、`sourceBindingRef`、`enabled` 和 `expectedRevision`。首次创建时修订取 0，后续变更使用服务端返回的当前修订；项目级绑定传入 `projectId`。插件再次校验来源对象。记录返回的绑定 ID 和修订供核查。[绑定控制接口](../../packages/server-ai/src/agent-event/agent-event.controller.ts)

- **让新到事件切回原入口**。对已启用的绑定调用 `POST /api/agent-event/bindings/{id}/rollback`，提交当前 `expectedRevision`。来源切回原入口，绑定保留当前授权修订，已经归平台的事实可以排空。飞书在同一事务锁下核对扫描时的路由和修订，切换前的 worker 会放弃尚未领取的派发意图。
- **暂停委托**。向原配置接口提交 `enabled: false` 和当前修订。暂停会推进授权修订，重新启用后不能据此派发旧修订的飞书意图。多实例部署中的消费者都须能识别原有归属记录，切流前先升级消费者。
- **诊断与重试**。`GET /api/agent-event/bindings/{id}` 可查看捕获状态、最近扫描、错误、冲突及隔离数量。用 `GET /api/agent-event/bindings/{id}/receipts?after={cursor}` 查看该绑定的回执，再以 `GET /api/agent-event/receipts/{receiptId}` 核对单项决定。修复原因后可通过视图重试符合条件的隔离项。对飞书 `outcome_unknown`，先用原 Handoff 运行或原消息对账；重试收件回执不能证明外部发送成功。

## 视图与宿主

内置 Remote View `platform.event-inbox__inbox` 同时服务于 Assistant 的 `agent.workbench` 和个人宿主 `user/me` 的 `user.event-inbox`。个人宿主接受当前组织内的交互登录用户。Assistant 宿主另可接受平台允许且限定到同一 Assistant 的用户委托凭据。请求中的筛选值只能收窄服务器已授权的绑定。重试会重新校验资格；打开会话命令只提交回执 ID，由宿主重新读取服务器给出的动作后导航。[视图注册](../../packages/server-ai/src/agent-event/views/event-inbox.provider.ts) · [绑定和会话授权](../../packages/server-ai/src/agent-event/event-binding-access.service.ts)

## 上线前核对

按来源保留真实渠道的上线证据。Code Review 的签名夹具可验证同一 PR 修订的幂等处理，真实 GitHub 交付还需要可用的 App 安装、仓库授权及评审回写。采购案例应从上传实际报价文件开始，核对提取出的供应商、报价修订、交期和最终风险数。飞书群聊单独核对提及、跨群隔离和重投，私聊决定卡另需已验证的收件人和有效来源绑定。

先在目标库核对实体、迁移和索引，再按绑定启用。切回时让已归属平台的回执排空。灰度期间记录最老待处理回执、恢复耗时和数据增长，据此确定保留期。[人工决定](../zh-Hans/guides/human-decisions.mdx)
