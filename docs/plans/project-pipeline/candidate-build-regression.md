# 统一候选构建与跨层回归

2026-10-20；限定范围为 G1 本地候选构建、G2 配套包兼容性、G4 本地跨层回归。未部署、推送、迁移现有业务数据库、启动真实业务执行或发布 npm 包。预算扩展、续轮及其他暂停工作未恢复。

候选源码：`d82f91498f634f27042550d8b0867b72a3290bfa`。构建入口 `tools/testing/pipeline-candidate/build.mjs`，要求干净源码和全新输出目录。通过 Corepack pnpm 调用 TypeScript、Angular application builder、Vite、Electron builder，无 Nx 调度。构建会覆盖当前 checkout 的生成目录，因此应使用专用审核 checkout。

- Contracts / SDK 均使用本地 `4.0.0-pipeline.0.d82f91498f63`，SDK 精确依赖同版 Contracts。只有候选产物改版本，正式源码版本未改，未发布。
- Cloud 为完整 production 构建；公共远程组件全部重建并随 API 归档。
- API 为 TypeScript 编译的完整 JS 依赖闭包，保留 Nest DI metadata、静态资源、SQL 和生产 lock；归档不含 node_modules，部署时须按归档 lock 安装。已经在隔离目录完成 frozen-lockfile 安装和模块加载；无新第三方依赖版本。
- Desktop 为 macOS arm64 本地 ad-hoc 包；使用独立生产依赖，打包后以 Electron Node mode 加载内置服务、协议、更新器及音频 helper。不是签名公证发行包，也不等于已安装原生界面的交互验收。
- ChatKit UI / Types / Web Component 均为 0.16.0 依赖输入，分别保存文件树摘要。业务 BOM / Code Review 插件未重新构建、安装或验收，不将其当前安装状态计入本候选结论。

## 本轮阻塞修复

1. `e9653f921`：SDK 的数据源与文档类型导出改为 type-only，防止 JS 产物出现不存在的值导出；Nest 常量子路径显式添加扩展名。Project Task 决策工具在加入宿主 requestId 后通过完整共享 schema，解决真实严格声明消费时必填字段类型不匹配。
2. `d22163963`：加入独立候选构建及真实包消费检查。Node ESM 与 CJS 共享同一实现，Bundler 使用可 tree-shake 的 module 入口；避免原工作区 dist 和重复 Contracts schema 混入。
3. `d82f91498`：修复 Runtime 工具测试的联合 invoke 签名和 schema.shape 假设，改用公共工具接口和模型可见 schema 验证；同时验证 CJS / ESM schema 同一性及 SDK 精确依赖版本。

Desktop 首次打包加载暴露依赖漏装。使用隔离 frozen-lockfile 生产安装，并经 Corepack pnpm 调用打包器后通过；没有为此改动业务实现。RC1 中 30 个服务端套件、400 项通过，但另一个工具测试因类型错误未执行；修复后的 RC2 已整套重跑，RC1 不作为最终通过结果。RC2 已全部通过，未将 RC1 或专项重跑次数累加。

## 验收结果

最终构建和回归均对应 `d82f91498`，候选名为 `pipeline-20261020-rc2`。完整产物摘要、依赖输入摘要、每个套件的路径及断言数量见 [结构化验收回执](./candidate-20261020-receipt.json)。本地原始产物及日志保留在 `.xpert-review/candidates/pipeline-20261020-rc2`，未纳入 Git；回执不含凭据或组织 / 空间标识。

| 层次                        | 最终结果         | 验证重点                                                                    |
| --------------------------- | ---------------- | --------------------------------------------------------------------------- |
| Contracts                   | 45 套件 / 257 项 | 配置、协议、精确执行归属和统计口径                                          |
| SDK                         | 56 套件 / 369 项 | 来源隔离、目录注册、Provider / Adapter 扩展边界                             |
| 服务端 / PostgreSQL / Redis | 31 套件 / 413 项 | 原子投影、幂等、租约、持久化派发、未知结果、授权、节点 / 轮次隔离及历史快照 |
| 公共泳道                    | 11 套件 / 35 项  | 配置标签图标、内联控制节点、圆点去重与详情、显式配置入口                    |
| Cloud                       | 8 套件 / 70 项   | 项目入口、业务导航、精确执行查看、偏好与请求隔离                            |
| Desktop                     | 4 文件 / 30 项   | 工作台导航、执行命令、会话与视图恢复                                        |

合计 **1,174 项通过，0 失败、0 跳过**；其中 Jest 为 151 套件 / 1,144 项，Node test 为 30 项。数据库 / Redis 使用专用测试实例及测试数据库，不操作现有业务库。既有 managed 限制仅做回归，没有新增预算或续轮功能。

此外完成以下产物检查，不混入上述断言数量：

- 两个真实 `.tgz` 解包后，经 10 个公开入口分别执行 CJS require / Node ESM import，检查 SDK 精确 Contracts 依赖和跨入口 schema 对象同一性。消费者不使用工作区源码 paths。
- TypeScript 严格消费者分别使用 Node、NodeNext、Bundler 解析；必填字段、非 any 约束及具体 Assistant 类型扩展均通过。声明生成保留 Pipeline strictNullChecks 覆盖。
- Node 20.20.2 与 22.17.1 的包入口加载通过；Zod 3.25.67 与 4.2.0 的运行时消费通过，Zod 4 另通过严格 Bundler 类型消费。
- API 的真实编译模块加载、Contracts 单一实现及 Node 20 的 DI metadata 检查通过。Cloud production、公共远程组件及 Desktop 类型检查 / Vite 构建通过。
- macOS arm64 Desktop 包通过 Electron 44.4.5 的内置运行时加载检查；项目远程组件 JS / CSS 与 API 归档内文件逐字节一致。
- 五个归档的 SHA-256 在回归结束后复核一致。API 锁定安装没有引入原生产 lock 之外的第三方版本。

Jest 和 Node 回归测试使用候选对应的源码；包入口、API 模块加载、Desktop 加载和归档检查使用实际构建产物。这里不把源码测试称为现有服务的端到端验收。

## 复现入口

在干净的审核 checkout 中，使用新的输出目录执行：

```sh
node tools/testing/pipeline-candidate/build.mjs /absolute/path/to/new-candidate
corepack pnpm exec jest --config packages/contracts/jest.config.ts --runInBand
corepack pnpm exec jest --config packages/plugin-sdk/jest.config.ts --runInBand
corepack pnpm exec jest --config tools/testing/project-pipeline-ui.jest.config.cjs --runInBand
```

完整服务端及 Cloud 路径清单记录在回执的 `regression.server.files` / `regression.cloud.files`，分别传入对应 Jest config 的 `--runTestsByPath`。数据库测试须先提供 `XPERT_PIPELINE_TEST_DATABASE_URL`、`XPERT_PIPELINE_TEST_REDIS_URL`、`XPERT_PROJECTION_TEST_DATABASE_URL`、`XPERT_PROJECTION_TEST_REDIS_URL`，使用仓库测试夹具要求的专用数据库和独立 Redis 逻辑库；不输出凭据。Desktop 使用 `apps/desktop/tests/` 的 `workbench`、`workbench-handler`、`last-session`、`last-session-ui` 四个 `.test.cjs` 文件。

构建脚本用于本地候选验收，不接管常规 CI / npm 发布任务。正式发布应复用已验证的归档及精确依赖；如改用另一套打包流程或更换版本，必须对新产物重新执行包入口、声明消费与加载检查。

## 发布边界与后续

G1/G2/G4 的结论仅覆盖以上本地候选范围；不代表平台已经部署，也不代表 BOM / Code Review 迁移验收完成。G3 目标环境迁移与回退、G5 部署后多 Worker 故障恢复、G6 现有 Cloud / 原生 Desktop 在线交互、G7 两业务插件配套、G8 旧 BOM 泳道迁移下线仍待单独验收，本轮保持暂停。

构建出现的既有 bundle 体积、CommonJS 优化、Browserslist 和 peer dependency 提示保留为后续项；不能以清理提示为由升级无关依赖。实际平台/包加载与本次回归失败均应处理后再通过。
