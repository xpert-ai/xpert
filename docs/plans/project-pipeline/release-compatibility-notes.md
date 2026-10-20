# Project Pipeline 候选发布兼容性说明

2026-10-20 更新：候选 `d82f91498` 已完成真实配套包验证，详见 [RC2 记录](./candidate-build-regression.md)。两个候选包均为 `4.0.0-pipeline.0.d82f91498f63`，SDK 精确依赖同版 Contracts；CJS / Node ESM、严格 Node / NodeNext / Bundler 类型消费，以及 Node 20 / Zod 4 检查通过。该 4.0 预发布标识显式承认下述类型破坏性变更，只用于本地候选，正式源码版本未改、没有发布。后文“仍须完成”的表述保留第八批时点；对应候选证据现以 RC2 记录为准。

本说明对应代码审核基线 `27bd935b3`，供发布审查和插件维护者使用，尚不是已发布版本公告。最终 Contracts / SDK 版本、依赖范围及产物验证仍须按[发布条件 G1 / G2](./release-readiness-review.md)完成；本轮不改包版本、不发布。

## 源码类型兼容

`ProjectTaskExecutionTarget` 已从可继承的单一 interface 扩展为联合类型，不能宣称所有 TypeScript 消费方式完全向后兼容。只针对 Assistant 执行扩展字段的调用方，应继承具体类型：

```ts
import type { ProjectTaskAssistantExecutionTarget } from '@xpert-ai/contracts'

interface LabeledAssistantTarget extends ProjectTaskAssistantExecutionTarget {
  localLabel: string
}
```

通用调用方应先按 `kind` 区分 Runtime Invocation，再读取 Assistant 专属字段。为兼容旧 Assistant 对象，其 `kind` 可以省略；不要把省略 kind 的旧对象当作无效 Runtime，也不要仅凭 invocationId 的存在区分类型，因为 Assistant 类型也可携带 invocationId。

```ts
import type { ProjectTaskExecutionTarget } from '@xpert-ai/contracts'

function executionIdentity(target: ProjectTaskExecutionTarget) {
  if (target.kind === 'runtime_invocation') return target.invocationId
  return target.agentExecutionId
}
```

导航联合新增目标的消费者需补齐对应分支或明确返回不支持，不能静默转到任意页面。业务工作台仍由 Project 的注册入口解析；客户端传递节点身份，不按节点名称拼业务 URL。

## Contracts 与 SDK 必须配套

- `ProjectPipelineContribution` / `projectPipelineContributionSchema` 的 SDK 原导入路径保留，实际 schema 统一来自 Contracts。SDK 必须依赖包含该导出的 Contracts 产物；不能仅升级 SDK 后继续混用旧 Contracts。
- 候选包需要同时验证 JS 导出和类型入口。普通声明输出后必须保留 Pipeline 的严格空值声明覆盖，否则 Zod 必填字段可能在消费端弱化为可选。
- `packages/plugin-sdk/testing/pipeline-declarations.consumer.ts` 验证必填约束和具体 Assistant 类型扩展；其配置指向构建目录。发布验收还须在实际打包产物中确认入口路径与严格消费结果，不能只检查工作区源码。
- 最终版本策略应显式考虑联合类型引起的源码不兼容；本说明不推测未发布版本号，也不以 JSON 协议未变为理由省略版本审查。

## 插件注册和运行边界

- 目录元数据只读。定制时复制并注册新模板版本，不修改已注册同版本对象。公共配置原始输入不被宿主冻结。
- 相同 JSON 声明可在不同来源注册；实时适配器实例必须按来源独立创建。不同组织 / 插件不可复用同一实例来覆盖注册来源。
- 只读 Provider 保持可用。提供动作执行时配对结果查询 / 恢复接口；目录校验不运行业务回调，读取不得启动执行。未知协议或能力不能降级冒充已支持。
- 公共层不决定业务完成条件。执行成功与业务验收拒绝可以同时成立；新增 UI 按执行状态着色，业务结果单独保留。

## 数据与 UI 行为变化

- 节点 / 轮次执行依据持久化归属证据。没有证据的旧执行不进入节点圆点或采用精确归属的统计；执行本身不删除。不能通过 Task、Assistant、时间或最新序号猜测归属来填满界面。
- 历史业务快照保持不变；最新执行观察只影响读取结果中的执行终态，不回写历史业务状态。旧 run 不可重新选中或追加轮次，节点身份不可换 key 重绑。
- Cloud 的匿名 UI 偏好不迁移给新账号。未提供 runtimeUserId 的宿主不持久化偏好；业务访问依旧由服务端授权，偏好不是权限凭据。
- Desktop 从已授权会话恢复项目及角色 Assistant，本地保存值不授予访问权限。独立 Project 入口仍使用配置的平台页面及其登录。

## 数据库与暂停范围

发布必须核对审核分支中的 SQL 清单和启动约束，不从原工作区复制全部迁移。已有 managed 限制及其持久化属于当前基线，不能因名称包含 budget 就跳过所需迁移；Provider 原生预算扩展和 native continuation 则仍排除。以当前 [managed 测试夹具](../../../packages/server-ai/src/xpert-project/pipeline/runtime/testing/pipeline-managed.fixture.ts)和 [schema 启动检查](../../../packages/server-ai/src/xpert-project/pipeline/persistence/pipeline-schema.service.ts)为代码核对入口。

回退必须保留轮次、Task、Operation / Invocation 和 native grant 事实；不得以删除历史记录、清空未知结果或重置已消费授权替代恢复。完整升级和回退演练仍待完成。
