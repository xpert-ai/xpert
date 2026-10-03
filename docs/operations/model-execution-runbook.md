# 执行用量对账与长任务运行手册

平台处理统一的授权、用量事实、审计和任务状态。供应商账单取证由对应插件或运维渠道完成；工具状态由运行时适配器提供。不要根据供应商名称推测模型能力或 Token，也不要把界面显示的估算当作实际消费。

## 启用告警

把同目录的 `model-execution-alerts.yml` 加入 Prometheus 的 `rule_files`，抓取平台 `GET /api/metrics`，在 Alertmanager 将 `severity=warning/critical` 路由给值班人。从仓库根目录验证：

```sh
promtool check rules docs/operations/model-execution-alerts.yml
promtool test rules docs/operations/model-execution-alerts.test.yml
```

| 告警                                 | 条件与持续时间                                        | 含义                                                                               |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `XpertExecutionSettlementStalled`    | `oldest_seconds > 900` 持续 5 分钟                    | 最老的待结算调用，从 `startedAt` 起已超过 15 分钟；不是进入 pending 状态后的时长。 |
| `XpertExecutionSettlementBacklog`    | `attempts > 20` 持续 10 分钟                          | 超过 20 条执行调用处于 `settlement_pending`。                                      |
| `XpertExecutionDeliveryFailures`     | 过去 10 分钟 `delivery_retry` 增量大于 5，持续 5 分钟 | 账本投递反复失败。计数是重试事件数，不是不同调用数。                               |
| `XpertInvocationContinuationStalled` | `oldest_error_seconds > 600` 持续 5 分钟              | 有错误标记的历史等待记录需要检查；不代表新任务的状态轮询停滞。                     |

阈值是起始配置，需要按部署容量调整。指标本身不携带用户、会话、密钥或提示词；抓取时可添加实例／部署标签。规则保留每条序列的标签，Alertmanager 可按部署和告警名分组。同一数据库的多个 API 副本会重复暴露积压快照，不能相加；仪表盘应按实例展示或在同一部署内取 max，也不要把不同数据库的部署合并统计。投递事件计数是各进程本地计数，规则对每个实例分别执行 increase，支持计数器重置。

指标由后台扫描刷新；没有序列不能解释为积压为零。另行配置抓取失败及 worker 存活检查。`reserved_tokens` 可用于观察未知消费占用，不等于实际 Token 或费用。

## 待核对消费

使用具有 `MODEL_GATEWAY_MANAGE` 权限的已登录管理员，在 tenant 范围调用以下管理 API；CLI 执行凭证或 ChatKit client secret 不能替代管理员身份。个人用量查询仍限制为当前 tenant、organization 和本人。

1. `GET /api/model-execution/admin/pending?take=50&skip=0` 分页查看积压；`take` 为 1–100，`skip` 为 0–100000。保存返回记录的 `id`、`attemptId`、`callId`、模型和预占量。下面两个路径中的 `:id` 使用 **items[].id（数据库记录 UUID）**，不是 `callId` 或 `attemptId`。
2. 已有实际用量事实、但账本尚未完成时，调用 `POST /api/model-execution/admin/calls/:id/retry-delivery`，检查返回的 `delivered`。后台也每 30 秒重试；同一 attempt 的投递幂等。没有用量事实时，重试投递不会生成消费证据。
3. 没有实际用量事实时，从供应商账单、请求回执或对应插件取得权威证据。请求超时、tokenizer 估算、CLI 金额估算都不能证明零消费。证据存入组织批准的审计存储；接口只接收编号、摘要和结构化数据，不上传提示词、密钥或完整模型响应。
4. 核对原调用及上游请求编号后，调用 `POST /api/model-execution/admin/calls/:id/reconcile`。每次独立操作使用新的 UUID；同一次操作重试保持整个请求体不变：

```json
{
  "operationId": "<一次核对操作的 UUID>",
  "evidenceReference": "<审计记录编号，1–256 字符>",
  "evidenceSha256": "<证据文件 SHA-256，小写 64 位>",
  "reason": "<核对原因及确认过程，10–1000 字符>",
  "providerRequestId": "<上游请求编号，1–256 字符>",
  "outcome": "provider_usage",
  "inputTokens": 100,
  "outputTokens": 20,
  "totalTokens": 120,
  "priceAmount": null,
  "priceCurrency": null
}
```

Token 必须是非负安全整数，`totalTokens = inputTokens + outputTokens`。`provider_usage` 要求总量大于零。没有权威金额时保留 null，表示未定价；有金额（包括 0）时必须给出币种。服务不会替管理员验证外部证据真实性，提交前必须完成核对。

有明确零消费证明时使用 `outcome: "no_usage"`，Token 和金额全部为 0，并填写币种；记录标记为 `failed`／`reconciled_no_usage`，释放未知消费预占。已有实际用量事实或已投递的调用不能通过此接口改写。证据不足则保留 pending；不得以估算补单、直接改库或手动减去预占。

审计先持久化，随后沿原 attempt 的用量事实／投递路径应用；未完成的审计每 30 秒重试。对同一调用只能提交一致的证据，重复 operationId 不能覆盖另一条审计。超时后重试同一请求，不另造扣费请求，也不更换用户、模型或 Assistant。

`reconcile` 返回 `status: "applied"` 只证明核对已应用，不等于账本投递完成。正用量核对后还要检查 retry-delivery 的 `delivered`，或由本人检查 `/api/model-execution/calls` 中的 `delivered`、`status` 和定价状态。零消费核对无需投递一笔实际用量，不能以 `delivered: false` 判断其失败。

## 新任务：有界等待与 Agent 轮询

普通长任务采用 [统一任务观察](../../packages/server-ai/src/runtime-task/README.md)：启动器返回已有 task handle，Agent 使用 `task_status({ taskIds, timeoutMs, mode })` 观察同一任务。默认等待 30 秒；设 0 即时查询，正值按宿主上限截断，默认上限为 60 秒。窗口结束返回 `pending`，不挂起父图，也不意味着任务失败；不得因此重复启动。没有独立的模型侧 `task_wait` 工具。

后端在窗口内检查状态，不在每个定时 tick 调用模型。下一次模型决策由 Agent 自主发起；需检查 Assistant 提示词没有禁止轮询，以及父执行的迭代上限。用户取消父任务会终止观察；取消子任务须显式调用取消能力，并继续确认终态，不能把 `cancelling` 当作已停止。真正需要人确认的交互仍可 interrupt，不能由时间到期自动批准。

如果运行状态为 `unknown`／结果为 `unavailable`，先检查原执行回执、绑定、工具版本、用户和组织权限、实际环境实例；保留原任务 ID，不自动重派发。子任务回执可持久化不代表 API 重启后父回合必定自动恢复。结果与导出状态分别检查：分析、代码变更和测试可以没有 ZIP；只有显式请求文件或归档交付时才检查产物收集结果。

## 历史挂起任务兼容

新普通等待不写 `agent_invocation_wait`。旧监控器保留用于安全处理升级前的挂起记录：每 5 秒扫描到期待检查项，独立 dispatcher 每秒扫描 ready 项。数据库租约、原身份／插件绑定校验和准确 checkpoint 匹配共同防止重复恢复或批准另一个人机交互。

`xpert_agent_invocation_wait{kind="oldest_error_seconds"}` 计算 waiting、ready、blocked 中有 `lastError` 的记录自创建以来的最大年龄，不是错误连续持续时长。其中 `awaiting_user` 可能是正常等待人工确认。收到恢复告警应先辨别原因；只有用户回应当前交互才能继续，不能自动批准或批量清除 blocked。临时故障修复后 waiting/ready 由调度器重试；stale 表示原检查点已失效，不能强行恢复。详见 [Invocation runtime](../../packages/server-ai/src/agent-invocation/README.md)。

## 部署与回退

基础 Agent Invocation 和 ModelExecution 表存在后，按顺序应用对应增量脚本，再启动完整新版 API/worker：

1. [执行消费审计](../../packages/server-ai/src/model-execution/migrations/20261001-execution-operations.sql)。
2. [历史等待记录](../../packages/server-ai/src/agent-invocation/migrations/20261001-invocation-wait.sql)，随后应用 [等待分组兼容](../../packages/server-ai/src/agent-invocation/migrations/20261002-task-wait-groups.sql)。即使新任务不挂起，已部署的历史监控器仍需要完整字段。

部署前按既有流程备份并确认旧 worker 已退出。回退先关闭新执行授权准入、停止新任务派发，保留可用的账本投递和证据应用 worker，处理完遗留消费与历史等待后再停监控器。不得删除用量、证据和等待表。撤销模型授权不证明 guest 进程或文件操作已停止；需要取消并确认终态。浏览器退出不应重启已有任务。
