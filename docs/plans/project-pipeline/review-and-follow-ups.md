# Project 通用流水线分批审核与后续清单

本次将已经实现并验证过的公共能力整理为顺序依赖的审核提交。业务插件仍独立维护；预算扩展、原生执行续轮和其他暂停工作不在本轮推进范围。此文是审核记录，尚不替代最终功能文档或产品文档。

2026-10-20 已完成前两批的公共边界专项审核：6 类阻塞问题修复、兼容性说明及非阻塞项见 [公共契约与 SDK 审核记录](./contracts-sdk-review.md)。下方“本次验证”保留最初整理批次的结果；专项审核的新验证结果以该记录为准。其他批次继续暂停。

同日继续完成第三批审核，修复历史 run/round、节点身份、执行时间及取消中状态的投影边界，详见 [持久化与 Task 原子投影审核记录](./persistence-projection-review.md)。当时第四批及其他剩余工作继续暂停。

同日按授权继续第四批执行协调与宿主执行桥接审核，修复观察租约的派发隔离、Runtime 持久化请求授权、过期 intent 写入和恢复扫描饥饿，详见 [执行协调与宿主桥接审核记录](./coordination-bridges-review.md)。预算、原生续轮及其他剩余工作仍暂停。

同日按授权完成第五批查询、统计与 Project API 接入审核，修复统计归属、Invocation 精确节点关联、完整运行状态分类和当前节点终态观察，详见 [查询、统计与 Project API 审核记录](./queries-analytics-api-review.md)。非阻塞项已单独记录；预算、原生续轮及其他剩余工作继续暂停。

同日按授权完成第六批公共泳道与节点交互审核，修复执行圆点结果口径和轮询导致流水线分页选择项丢失，详见 [公共泳道与节点交互审核记录](./swimlane-interactions-review.md)。11 个 UI 套件、35 项通过，类型检查及组件构建通过；Provider 轮询顺序和视觉覆盖完善记入非阻塞清单。未部署现有服务，第七批、预算、原生续轮及其他剩余工作继续暂停。

## 审核基线

- 分支：`codex/project-pipeline-review`。
- 基点：`c2b52ba455fdd38dd918fb1ed55368b3392b836f`。
- 公共服务端以已隔离部署的批准基线为准，包含节点和轮次执行归属、历史执行状态修复。
- Cloud、Desktop 和公共远程组件包含已经批准的入口、导航、泳道和节点交互修改。
- 原工作区和正在运行的服务保留原状。本次整理不执行数据库迁移、不重新部署、不推送远端。
- 中间提交用于分批阅读，存在跨层依赖；编译和集成验收针对完整提交链。不要单独部署某个中间提交。

## 审核顺序

| 批次 | 范围                          | 优先检查                                                       |
| ---- | ----------------------------- | -------------------------------------------------------------- |
| 1    | Contracts 公共协议与配置示例  | 定义版本、状态分离、显式执行权属、配置校验与能力协商           |
| 2    | Plugin SDK 扩展接口           | 组织范围、插件注册、只读回调和执行回调边界                     |
| 3    | 持久化、配置和 Task 原子投影  | 作用域外键、事务一致性、幂等、旧轮次保留、迁移约束             |
| 4    | 执行协调与宿主执行桥接        | 租约隔离、持久化派发、未知结果恢复、原生执行授权               |
| 5    | 查询、统计与 Project API 接入 | 本节点本轮次归属、去重、历史业务快照、执行终态观察             |
| 6    | 公共泳道与节点交互            | 配置标签与图标、控制节点布局、执行圆点、节点详情、显式配置入口 |
| 7    | Cloud 与 Desktop 宿主接入     | 项目入口、业务工作台导航、执行查看、视图状态恢复               |
| 8    | 审核与后续记录                | 验收证据、已知限制和后续独立批次                               |

对应代码提交（按依赖顺序）：

```text
3b04ee249 feat(contracts): define business-neutral project pipeline protocols
1657a21dd feat(plugin-sdk): expose scoped project pipeline extension interfaces
4c62101ed feat(pipeline): persist scoped definitions and atomic task projections
325ec520a feat(pipeline): coordinate durable operations and fenced native dispatch
c87629662 feat(project): expose pipeline analytics and exact execution attribution
c832662ad feat(project-ui): render configurable pipeline swimlanes and execution details
f89819caa feat(project-hosts): integrate pipeline navigation across Cloud and Desktop
```

代码注释聚焦设计原则：Provider 拥有业务状态，公共层拥有受作用域约束的投影与协调；读取不启动工作；外部副作用不放入数据库事务；历史业务快照不能被后来的执行观察覆盖。现有注释已说明的约束不重复逐行解释。

## 本次整理的边界修正

隔离部署基线排除了 Provider 原生模型预算和原生续轮，但部分测试仍引用相关服务与迁移。本分支同步移除这些引用，并测试不支持的续轮输入会被拒绝。已有 managed 执行所需的限制与模型计量保留原样，不表示恢复暂停的预算升级。

历史查询的旧测试把 Task 执行自动归入历史节点。本分支改为验证：没有持久化节点和轮次归属的记录不产生圆点，历史业务状态仍保留。已确认归属的执行由专门的归属与 Provider 授权集成测试覆盖。

提交钩子统一格式化后，原 managed 集成测试超过单文件限制。测试环境与场景已拆分到 `runtime/testing`，保持一个测试生命周期和独立测试数据库。前端交互测试增加可复用 Jest 配置；运行时交互测试与严格类型检查分别执行。

## 本次验证

测试数据库与 Redis 使用独立验收实例；真实业务数据不参与测试。

| 检查                           | 结果                                                                      |
| ------------------------------ | ------------------------------------------------------------------------- |
| Contracts                      | 44 个测试套件，250 项通过                                                 |
| Plugin SDK                     | 55 个测试套件，364 项通过                                                 |
| PostgreSQL 和 Redis 集成       | 5 个测试套件，168 项通过，无跳过                                          |
| 服务端查询、配置与协调单元测试 | 97 项通过；同次发现的 7 项环境条件测试跳过，不计入通过数                  |
| 公共流水线 UI                  | 9 个测试套件，31 项通过                                                   |
| Cloud 项目与导航               | 7 个选定测试套件，65 项通过                                               |
| Desktop 项目与会话导航         | 20 项通过                                                                 |
| 服务端与公共远程组件类型检查   | 通过                                                                      |
| 提交钩子                       | 格式、锁文件同步、颜色约束、TypeORM 字段类型、RequestContext 导入检查通过 |

本轮没有重新运行完整 Cloud 构建、Desktop 原生界面验收或生产部署，因此不将其列为本分支新增的验收证据。

历史在线验收已确认：第 4 轮不显示第 3 轮执行，第 3 轮保留归属圆点并能打开对应执行；执行完成后显示成功，历史业务快照不回写。本轮整理只复核代码和测试，不将先前在线记录冒充为新分支重新部署的验收。

## 后续清单

| 类别         | 后续事项                                                                        | 处理时机                                                |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 独立审核批次 | BOM 适配器的配置、节点工作台入口、业务诊断与业务操作                            | 公共协议审核稳定后，单独整理 solutions 仓库提交         |
| 独立审核批次 | Code Review 本地 Git 导入、执行和结果留在平台                                   | 单独整理 xpert-plugins 仓库提交，不增加 GitHub 评论交付 |
| 下线前验收   | P0 与 13–17 业务入口迁移逐项验收                                                | 验收通过后才移除旧 BOM 全流程泳道                       |
| 非阻塞完善   | 更多窄屏、长标签、多 Agent 和无执行数据的视觉回归                               | 后续界面完善批次，不改变公共模型                        |
| 非阻塞完善   | React 测试的旧 `act` API 与测试环境警告清理                                     | 测试设施维护批次；不影响已通过的交互断言                |
| 非阻塞完善   | 旧任务视图全量测试 runner 的品牌图标 `.cts/.cjs` 模块映射；流水线专用测试已通过 | 测试设施维护批次，不修改生产代码                        |
| 非阻塞完善   | 统一测试示例组织、补齐插件开发接入说明                                          | 公共协议审核后完善，避免本轮扩大业务迁移范围            |
| 另案评估     | 登录初始化、API bootstrap、插件加载与 seed 的旁支改动                           | 留在原工作区，不混入流水线提交                          |
| 继续暂停     | Provider 原生预算、原生执行续轮和此前其他暂停事项                               | 等待明确恢复，不随本批审核自动启动                      |
| 文档收尾     | 计划转功能文档，再形成 `docs/` 产品文档                                         | 全部业务验收完成后；不提前标记整体完成                  |

## 复核方式

安装依赖时使用仓库指定的 Corepack pnpm，不使用 Nx。服务端迁移需按照平台既有发布流程单独审核和执行；启动时的约束检查不能替代迁移。

```sh
corepack pnpm exec tsc -p packages/server-ai/tsconfig.lib.json --noEmit --incremental false
corepack pnpm exec tsc -p packages/server-ai/src/xpert-project/remote-components/project-tasks/tsconfig.check.json
corepack pnpm exec jest --config packages/contracts/jest.config.ts --runInBand
corepack pnpm exec jest --config packages/plugin-sdk/jest.config.ts --runInBand
corepack pnpm exec jest --config tools/testing/project-pipeline-ui.jest.config.cjs --runInBand
```

远程组件的严格类型检查需要已构建 Contracts 声明；公共协议构建会额外以 `strictNullChecks` 输出 Pipeline 声明。Jest 交互配置只负责运行行为断言，不能替代该类型检查。

数据库集成测试需要显式配置 `XPERT_PIPELINE_TEST_DATABASE_URL`，数据库名必须匹配 `xpert_pipeline_test_*`；队列恢复测试还需独立 `XPERT_PIPELINE_TEST_REDIS_URL`。使用 `packages/server-ai/jest.config.ts`，按文件执行 projection、provider-actions、managed、operation 和 model-budget 的 PostgreSQL 测试。未提供环境变量导致跳过，不等于验收通过。凭据不写入文档或源码。
