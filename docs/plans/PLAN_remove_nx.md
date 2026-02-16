# Xpert 仓库分阶段去除 Nx（保留 pnpm，核心链路优先）

## Summary
按你确认的偏好执行：
1. `分阶段移除 Nx`
2. `第 1 阶段仅覆盖核心流水线`
3. `第 1 阶段核心链路不允许再依赖 Nx`
4. `编排只用 pnpm（不引入 Turbo/Moon）`
5. `发布迁移到 Changesets，但 CI 仍只发布核心包`

总体策略是先把核心链路从 `pnpm nx ...` 切到 `pnpm + 原生工具`，再迁移测试/Storybook/lint，最后彻底删除 Nx 依赖与配置文件。

## 重要接口/契约变更（Public APIs / Interfaces / Types）
1. 构建编排契约从 `nx project targets` 迁移到 `pnpm scripts + tools/workspace manifest`。
2. 新增 `angular.json` 作为 Cloud 应用的 Angular CLI 构建契约（替代 Nx 对 `apps/cloud/project.json` 的承载）。
3. 新增 `tools/workspace/projects.manifest.json`（或同等命名）作为项目构建元数据源，最终替代 `project.json + nx graph`。
4. 发布契约从 `npx nx release ... / nx-release-publish` 迁移到 `changeset + npm publish`。
5. 业务 API（Nest/Angular 对外接口、DTO、数据库结构）不改。

## Phase 0：基线冻结与迁移护栏
1. 固化当前基线命令与产物路径，用于后续回归对比：`pnpm build`、`pnpm build:plugins`、`pnpm localpack`、两套 Dockerfile build 阶段。
2. 记录当前输出目录契约，后续必须保持不变：`dist/apps/api`、`dist/apps/cloud`、`dist/packages/*`、`packages/contracts/dist`、`packages/plugin-sdk/dist`。
3. 建立扫描护栏：
   - 核心链路扫描：`package.json`、`tools/scripts/build.mjs`、`.deploy/api/Dockerfile`、`.deploy/webapp/Dockerfile`、`.github/workflows/publish-npm-packages.yml` 中不得再出现 `nx`。
   - 全仓最终扫描：`rg -n "\bnx\b|@nx/|@nrwl/" . -g '!CHANGELOG.md' -g '!**/node_modules/**'`。

## Phase 1：核心流水线去 Nx（本阶段核心链路 0 Nx 依赖）
1. 新增构建执行层（不依赖 Nx）：
   - `tools/build/build-rollup.mjs`（替代 `@nx/rollup:rollup`）
   - `tools/build/build-tsc.mjs`（替代 `@nrwl/js:tsc` / `@nx/js:tsc`）
   - `tools/build/build-ngpkg.mjs`（替代 `@nx/angular:package`，调用 `ng-packagr`）
   - `tools/build/build-api.mjs`（替代 `@nx/webpack:webpack`）
   - `tools/build/build-cloud.mjs`（调用 `ng build cloud`）
   - `tools/workspace/projects.manifest.json`（显式声明项目、构建器、依赖顺序、输出路径、资产拷贝规则）。
2. 核心项目构建映射固定如下（决策完成，实施不再二次选型）：
   - `rollup`: `adapter, contracts, copilot, core, sql, store, xmla, plugin-sdk, agent-middlewares, integration-github, retriever-common, textsplitter-common, transformer-common, trigger-schedule, vlm-default, tool-calculator, ocr-paddle, vstore-chroma, vstore-weaviate`
   - `tsc`: `auth, common, config, server, server-ai, analytics, duckdb, echarts`
   - `ng-packagr`: `ngx-echarts, ocap-angular, copilot-angular, component-angular, formly, story-angular, core-angular`
   - `app`: `api(webpack)`, `cloud(angular cli)`
3. 固定核心构建顺序（替代 Nx dependsOn）：
   - `contracts -> common -> config -> auth -> server -> server-ai -> adapter -> analytics -> plugins(全部) -> store -> core -> echarts -> sql -> xmla -> duckdb -> copilot -> ngx-echarts -> ocap-angular -> api`
   - Cloud 在 `localpack` 和 webapp Docker 中单独执行生产构建。
4. 修改 `apps/api/config/webpack.config.js`：
   - 删除 `@nx/webpack` 的 `composePlugins/withNx` 依赖。
   - 改为标准 webpack node 配置（入口、tsconfig paths、assets copy、watch 选项保留）。
5. 新增 `angular.json`：
   - 仅迁移 `cloud` 项目当前 `build/serve/extract-i18n` 配置。
   - `apps/cloud/project.json` 暂留到最终清理阶段删除。
6. 重写根脚本（保留脚本名，内部执行器改为 pnpm + 原生工具）：
   - `build:plugins`、`build`、`b:p:*`、`b:p:all`、`bootstrap`、`start:api`、`start:cloud`、`localpack` 统统移除 `pnpm nx ...`。
7. 修改 `tools/scripts/build.mjs`：
   - `pnpm nx build cloud/api` 改为新脚本。
   - 继续保留 `pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.npmrc` 拷贝逻辑。
8. 修改 Docker 核心链路：
   - `.deploy/api/Dockerfile`、`.deploy/webapp/Dockerfile` 删除 `COPY nx.json` 和任何 Nx 命令。
   - 构建命令切换到新的 root/workspace scripts。
9. 修改发布 workflow 的构建步骤：
   - `pnpm bootstrap`、`pnpm build` 必须已完全不走 Nx。
10. Phase 1 验收（必须全部通过）：
   - `pnpm install`
   - `pnpm bootstrap`
   - `pnpm build:plugins`
   - `pnpm build`
   - `pnpm localpack`
   - `docker build -f .deploy/api/Dockerfile .`
   - `docker build -f .deploy/webapp/Dockerfile .`
   - 核心文件扫描无 Nx：`rg -n "\bnx\b|@nx/|@nrwl/" package.json tools/scripts/build.mjs .deploy/api/Dockerfile .deploy/webapp/Dockerfile .github/workflows/publish-npm-packages.yml`

## Phase 2：非核心开发链路去 Nx（测试、Lint、Storybook、辅助脚本）
1. Jest 去 Nx：
   - `jest.config.ts` 移除 `getJestProjects()`。
   - 改为显式 `projects` glob（`apps/**/jest.config.ts`, `packages/**/jest.config.ts`, `libs/**/jest.config.ts`）。
   - `jest.preset.js` 移除 `@nx/jest/preset`。
2. ESLint 去 Nx：
   - 根 `.eslintrc.json` 删除 `@nrwl/nx` 插件与 `enforce-module-boundaries` 规则。
   - 逐步替换各子项目 `.eslintrc.json` 中 `plugin:@nx/*`、`@nx/dependency-checks`。
3. Storybook 去 Nx：
   - 根脚本 `w:sb:ocap-angular`、`b:sb:ocap-angular` 改为 `storybook` 原生命令。
   - 相关包 `storybook/build-storybook/static-storybook` 不再依赖 Nx target。
4. 清理所有 `package.json` 中残余 `nx` 命令（包括 `apps/cloud/package.json`, `.deploy/api/package*.json` 等）。
5. Phase 2 验收：
   - `pnpm test`（或等效聚合命令）
   - `pnpm lint`（或等效聚合命令）
   - `pnpm storybook` / `pnpm b:sb:ocap-angular`

## Phase 3：发布链路迁移到 Changesets（核心包发布）
1. 新增 `@changesets/cli` 与配置：
   - `.changeset/config.json`
   - 根脚本：`changeset`、`changeset:version`。
2. 发布策略固定为“核心包”：
   - CI 发布目标保持 `dist/packages/core`。
   - 增加校验脚本 `tools/release/verify-core-only-changeset.mjs`，只允许 `@metad/ocap-core` 的 changeset 进入发布流程。
3. 文档改造：
   - `docs/release.md` 从 `nx release` 全量改为 `changeset` 流程（创建 changeset、版本落盘、打 tag、触发发布）。
4. `tools/scripts/publish.mjs` 去 Nx：
   - 删除 `@nx/devkit` 与 `readCachedProjectGraph`。
   - 改读 `tools/workspace/projects.manifest.json` 获取 `name -> outputPath`。
5. Phase 3 验收：
   - `pnpm changeset`
   - `pnpm changeset:version`
   - workflow 中 publish job 无 Nx 依赖且仅发布 core。

## Phase 4：彻底删除 Nx
1. 删除配置与元文件：
   - `nx.json`
   - 根 `project.json`
   - 全部 `**/project.json`
   - `migrations.json`
   - `.nxignore`（如仍仅服务 Nx）
2. 删除依赖：
   - `nx`, `@nx/*`, `@nrwl/*`, `@nx/eslint-plugin` 等。
3. 清理文档与注释中的执行型 Nx 指令（历史变更说明文件可保留历史文本）。
4. 重新 `pnpm install`，提交新的 `pnpm-lock.yaml`。
5. Final 验收：
   - 全链路命令通过：开发、构建、打包、Docker、CI 发布。
   - 全仓扫描仅允许历史残留：`rg -n "\bnx\b|@nx/|@nrwl/" . -g '!CHANGELOG.md' -g '!**/node_modules/**'`。

## 测试场景（最终验收矩阵）
1. 开发：
   - `pnpm start:api:dev`
   - `pnpm start:cloud`
2. 构建：
   - `pnpm build:plugins`
   - `pnpm build`
   - `pnpm localpack`
3. 产物：
   - `dist/apps/api`、`dist/apps/cloud`、`dist/packages/*`、`packages/contracts/dist`、`packages/plugin-sdk/dist` 结构与关键入口文件不变。
4. Docker：
   - API/Webapp Dockerfile 至少完成 build 阶段。
5. CI：
   - 发布 workflow 不再依赖 Nx。
6. 兼容性：
   - 根脚本名保持不变，外部调用命令不需要改。

## 显式假设与默认值
1. 保持严格兼容：脚本名、核心产物目录、Docker/CI 入口不变。
2. 第 1 阶段核心链路禁止任何 Nx 运行时依赖。
3. 不引入新编排器，仅使用 pnpm workspace/脚本。
4. 发布采用 Changesets，但 CI 仅发布核心包 `@metad/ocap-core`。
5. 若 `mjml/cheerio/domhandler` 运行时冲突仍存在，作为独立依赖修复（`pnpm.overrides`）并行处理，不改变本计划的去 Nx 路径。
