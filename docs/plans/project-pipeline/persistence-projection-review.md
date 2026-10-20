# 持久化与 Task 原子投影审核记录

审核日期：2026-10-20。审核对象为第三批 `4c62101ed`，在 `codex/project-pipeline-review` 上追加修复。公共层保持业务无关；运行协调、业务接入、预算扩展及原生续轮不恢复推进。

修复提交：`5375b2e34`。本地提交及提交钩子通过，未推送或部署。

## 结论与边界

投影事务的主干设计成立：Provider 回调在数据库事务之外执行；提交时按租户、组织和项目定位并锁定 Project 行。定义、实例游标、run、round、节点、Task、执行记录、关联和审计事件使用同一个事务管理器提交。后续节点校验或数据库约束失败会回滚前面的 Task 修改。

幂等以作用域内稳定身份、source epoch/sequence 和快照摘要共同约束。同版本同内容返回原回执，不追加事件；同版本不同内容拒绝；旧序号不会回退已提交游标。回执通知失败由队列重试，业务投影不因此重复创建。定义版本和轮次输入保持不可变。

历史保留发现并修复了 4 类阻塞问题。新增回归分别在空库迁移与 ORM 预建表两种布局运行。审核结论不覆盖第四批运行协调的完整正确性，也不表示整套业务流水线已经完成验收。

## 阻塞问题与修复

| 编号 | 问题                                                                                                                      | 修复与验收                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | 生产者提高 sourceSequence 后，可以重新选中已经归档的 run，覆盖其历史 round、节点和任务快照；终态 run 也能继续追加新 round | 已存在的非当前 run 拒绝重新选中；终态 run 不允许更改终态或追加轮次。失败时当前指针、历史快照、Task 与事件均不改变。新的业务执行必须使用新的 run 身份 |
| P2   | 节点只按 source key 查旧记录，换 key 后仍可命中相同的逻辑身份，并与旧节点 tombstone 相互覆盖                              | 同轮次内同时保持 source key 和 `(nodeKey, expansionKey)` 稳定，包括已有 tombstone。变更被拒绝，已写 Task 一并回滚                                    |
| P3   | 后续投影省略可选 startedAt/completedAt 时，会把执行表中已观察到的时间写成 NULL                                            | Pipeline 投影保留已观察的时间；仍允许显式提供后续事实。已确认执行身份保持不变。旧 Task Provider 的替换语义不变                                       |
| P4   | `cancelling` 被当成终态，阻止继续投影 cancelled；尝试新建 run 时则直到唯一索引才报错                                      | 统一未结束状态集合，取消中仍占用当前 run；允许其收敛到终态，阻止未结束时切换新 run。此修改只修正投影状态校验，不实现或恢复新的取消执行逻辑           |

修复前，上述情况均由 PostgreSQL 回归复现。修复后的负向断言同时检查写入回滚，而非只检查返回错误。

## 作用域与迁移核查

- 公共服务入口执行 Project 访问检查；Store 是内部持久化边界，使用显式可信 context，不从 Provider 数据中接受租户或组织。
- 查询和写入始终包含 tenantId、organizationId、projectId；空组织使用 `IS NULL`，不是省略组织过滤。新增用例覆盖错误租户、错误组织、空组织与非空组织之间的读写拒绝。
- Pipeline 身份摘要包含租户、组织、项目；Task key 包含实例身份，避免同 Provider 不同业务实例互相覆盖。
- SQL 复合外键阻止跨项目 Task/节点关联，删除标记不会改写业务状态或删除执行历史。约束迁移在空库和 ORM 预建表上重复执行，并验证缺失约束时启动检查拒绝运行。
- 当前外键以全局唯一 Project ID 为隔离锚点；冗余 tenantId/organizationId 与 Project 的一致性由受控写入路径保证，并非全部由复合外键直接验证。进一步数据库层强化列入后续，不把现有约束描述为数据库行级授权。

## 验证结果

| 检查                                | 结果                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| Pipeline 投影 PostgreSQL/Redis      | 56 项通过，包含新增 6 场景在两种表布局各执行一次              |
| Provider 操作 PostgreSQL/Redis 回归 | 44 项通过，确认共享投影约束未破坏已批准入口                   |
| 旧 Task 投影并发与回滚集成          | 9 项通过                                                      |
| 配置持久化、幂等与作用域分页        | 定向选中 1 项通过；其余 46 项运行协调测试未选中，不计入通过数 |
| Task 投影入口及配置控制器单元测试   | 3 套件、26 项通过                                             |
| 服务端 TypeScript                   | 通过                                                          |

旧 Task 集成测试首次运行有 7 项失败、2 项通过。定位到测试夹具忽略 Redis URL 的逻辑库编号，使队列使用 0 号库而锁使用配置库；修复夹具后 9 项全部通过。未改动生产 Redis 连接逻辑。

数据库及 Redis 均为独立验收实例，测试创建并清理临时 schema。没有对现有在线服务执行迁移、数据修补、部署或重新验收。

复核命令（先通过受保护本地环境设置测试连接，禁止将凭据写入源码）：

```sh
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand --runTestsByPath \
  packages/server-ai/src/xpert-project/pipeline/projection/pipeline-projection.postgres.spec.ts \
  packages/server-ai/src/xpert-project/pipeline/provider-actions/provider-actions.postgres.spec.ts
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand --runTestsByPath \
  packages/server-ai/src/xpert-project/services/task-projection/project-task-projection.integration.spec.ts
corepack pnpm exec tsc -p packages/server-ai/tsconfig.lib.json --noEmit --incremental false
```

Pipeline 测试使用 `XPERT_PIPELINE_TEST_DATABASE_URL` / `XPERT_PIPELINE_TEST_REDIS_URL`；旧 Task 测试使用 `XPERT_PROJECTION_TEST_DATABASE_URL` / `XPERT_PROJECTION_TEST_REDIS_URL`。二者必须指向专用测试实例；旧 Task 测试会清空所选 Redis 逻辑库。缺少环境变量而跳过测试不算通过。

## 非阻塞后续清单

| 编号 | 事项                                                                          | 后续方向                                                                                 |
| ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| F1   | 投影写入读取项目下全部执行记录，并多次线性查找；项目行锁粒度较粗              | 按本次 Task 身份缩小查询、建立内存索引并做大项目容量测试；保持跨 Task 原子性和统一锁顺序 |
| F2   | 部分现有投影更新会重写 createdById，创建者和最后观察者语义不够清晰            | 单独统一 createdBy/updatedBy/观察者记录并补审计回归；本轮不扩展到通用实体审计改造        |
| F3   | 启动检查主要验证约束名称、有效性和部分列；未逐一比对全部约束定义              | 补充迁移版本/结构指纹检查及同项目跨实例关系的数据库约束评估；继续要求外部迁移模式运行    |
| F4   | tenantId/organizationId 冗余列与所属 Project 的一致性尚未全部由数据库约束保证 | 独立设计兼容空组织的数据库约束和历史数据预检，不以数据库直写替代授权路径                 |
| F5   | Task 内容摘要使用 JSON 序列化顺序，语义相同但键顺序变化可能产生额外行更新     | 后续统一规范化摘要，保持已有幂等回执和 sourceSequence 规则                               |

非阻塞项保留为后续独立完善；预算、续轮、BOM/Code Review 接入与旧泳道下线等工作继续暂停。
