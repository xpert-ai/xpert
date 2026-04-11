# Angular 21 升级方案（含 Storybook 硬停用）

## Summary
- 目标版本固定为 Angular `21.1.4`、Nx `22.5.1`、TypeScript `5.9.3`。
- 验收范围：`cloud` 应用、Angular 相关库、Jest 测试链路稳定；本轮不包含 Storybook，按你选择做“硬停用”。
- 对不兼容包策略：`ngx-monaco-editor` 先保留并验证（接受 peer 警告）。

## 实施步骤

1. 建立迁移基线  
- 创建升级分支（例如 `chore/angular-21`）。  
- 记录当前状态：`pnpm nx report`、`git status --short`。

2. 先跑 Nx 主迁移框架  
- 执行：`pnpm nx migrate @nx/workspace@22.5.1 --interactive=false`。  
- 这一步会生成/更新 `migrations.json`，并把 Nx 包提升到 22 系列基础版本。

3. 统一更新依赖矩阵（`package.json`）  
- Angular 主干升级到 `21.1.4`：  
`@angular/animations`、`@angular/common`、`@angular/compiler`、`@angular/core`、`@angular/elements`、`@angular/forms`、`@angular/platform-browser`、`@angular/platform-browser-dynamic`、`@angular/router`、`@angular/service-worker`、`@angular/cli`、`@angular/compiler-cli`、`@angular/language-service`、`@angular-devkit/build-angular`、`@angular-devkit/core`、`@angular-devkit/schematics`、`@schematics/angular`。  
- Angular UI/工具链联动：  
`@angular/cdk`、`@angular/material`、`@angular/material-date-fns-adapter` 到 `21.1.4`；`zone.js` 到 `~0.16.0`；`ng-packagr` 到 `21.1.0`；`typescript` 到 `5.9.3`。  
- Nx 相关包全部升到 `22.5.1`：  
`nx`、`@nx/angular`、`@nx/jest`、`@nx/js`、`@nx/eslint`、`@nx/eslint-plugin`、`@nx/node`、`@nx/nest`、`@nx/web`、`@nx/webpack`、`@nx/workspace`、`@nx/rollup`、`@nx/cypress`。  
- Angular 生态联动升级：  
`@ngrx/store`、`@ngrx/entity`、`@ngrx/component-store` 到 `21.0.1`；  
`@angular-eslint/*` 到 `21.2.0`；  
`@ng-matero/extensions` 到 `21.1.3`；  
`angular-gridster2` 到 `21.0.1`；  
`ngx-cookie-service` 到 `21.1.0`；  
`ngx-float-ui` 到 `21.0.1`；  
`ngx-markdown` 到 `21.1.0`；`marked` 到 `17.0.2`；  
`@casl/angular` 到 `9.0.6`；  
`@sentry/angular` 到 `10.38.0`，移除 `@sentry/tracing`。  
- Jest 栈升级（配合 Angular 21）：  
`jest`、`jest-environment-jsdom`、`@types/jest` 到 30 系；  
`jest-preset-angular` 到 `16.0.0`；  
`ts-jest` 到 `29.4.6`；`@swc/jest` 升到 `0.2.39`。  
- Storybook 硬停用：删除 `@storybook/*`、`storybook`、`@nx/storybook` 依赖与相关 scripts。

4. 修改配置与代码文件  
- Storybook 停用改造：  
删除 `libs/component-angular/project.json`、`packages/angular/project.json`、`packages/ngx-echarts/project.json` 中 `storybook/build-storybook/static-storybook` targets；  
删除 `packages/angular/tsconfig.json`、`packages/ngx-echarts/tsconfig.json`、`libs/component-angular/tsconfig.json` 的 `./.storybook/tsconfig.json` references；  
删除根 `package.json` 中 `storybook`、`w:sb:*`、`b:sb:*` 脚本，并从 `b:docs` 去掉 Storybook 子命令；  
删除 `nx.json` 的 `build-storybook` targetDefaults。  
- 防止 Story 文件参与正常库构建：  
在 `libs/story-angular/tsconfig.lib.json`、`packages/copilot-angular/tsconfig.lib.json` 增加 `**/*.stories.ts` / `**/*.stories.js` 排除项。  
- 内部包 peer 版本提升到 Angular 21：  
`libs/apps/indicator-market/package.json`、`libs/apps/state/package.json`、`libs/core-angular/package.json`、`libs/story-angular/package.json`、`libs/component-angular/package.json`、`libs/formly/package.json`、`packages/copilot-angular/package.json`、`packages/angular/package.json`。  
- Markdown 兼容修复：  
`apps/cloud/project.json` 删除 `node_modules/marked/marked.min.js` 脚本注入；  
`apps/cloud/src/app/@shared/chat/providers/markdown.ts` 将 `renderer.code` 重写改为 `marked@17` token 形态签名。  
- Jest setup 迁移：  
把所有 `import 'jest-preset-angular/setup-jest'` 替换为 `setupZoneTestEnv` 方案（来自 `jest-preset-angular/setup-env/zone`）；  
`apps/cloud/src/test-setup.ts` 保留 `teardown.destroyAfterEach = false` 语义。  
- Sentry 清理：  
删除 `apps/cloud/src/main.ts` 中对 `@sentry/tracing` 的 import（注释块按新 SDK 语义整理）。

5. 安装与迁移执行  
- 执行 `pnpm install`。  
- 执行 `pnpm nx migrate --run-migrations`。  
- 若迁移器再改了依赖，补一次 `pnpm install`。  
- 确保 `pnpm-lock.yaml` 与以上改动一致提交。

## Public APIs / Interfaces / Types 变化
- 内部 Angular 库的 `peerDependencies` 从 `^17` 提升到 `^21`（影响下游安装约束）。  
- 开发接口变化：根脚本中 Storybook 命令移除，相关项目不再暴露 Storybook targets。  
- 测试初始化接口变化：从 `jest-preset-angular/setup-jest` 迁移到 `setupZoneTestEnv`。  
- `marked` 渲染器扩展函数签名从旧参数模式改为 token 模式（`apps/cloud/src/app/@shared/chat/providers/markdown.ts`）。

## 测试与验收场景

1. 依赖与迁移完整性  
- `pnpm install` 无阻塞错误。  
- `pnpm nx migrate --run-migrations` 执行完成。  

2. 构建验收（不含 Storybook）  
- `pnpm nx run-many -t build --projects=cloud,ocap-angular,copilot-angular,component-angular,core-angular,formly,story-angular --parallel=3` 成功。  

3. 测试验收  
- `pnpm nx run-many -t test --projects=cloud,core-angular,component-angular,formly,copilot-angular,api,server-ai --parallel=3` 成功。  

4. 手工烟测  
- `cloud` 中 Markdown 渲染与 `echarts` 代码块渲染正常。  
- Dashboard/Story 页面的 Gridster 拖拽与布局正常。  
- Monaco 编辑器相关页面可加载（按“先保留并验证”策略）。  
- 登录/邀请等页面 `@ng-matero/extensions` 组件正常。  

## Assumptions / Defaults
- 采用 Angular 最新稳定 `21.1.4`（截至当前环境时间）。  
- Storybook 本轮“硬停用”，后续单独恢复。  
- `ngx-monaco-editor` 本轮不替换，只做运行验证。  
- 不做架构迁移（继续 `AppModule + platformBrowserDynamic`），只做版本与兼容性升级。  
