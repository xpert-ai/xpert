# React 19 Remote View 运行时升级方案

## Summary

- 将 Xpert 平台托管的 React Remote View 运行时从当前锁文件解析的 React/ReactDOM `18.3.1` 升级到 React 19。
- 先拆除对 `react/umd/*` 和 `react-dom/umd/*` 包内文件的依赖，再升级 React；React 19 已移除 UMD 构建，不能只修改依赖版本。
- Remote View 运行时继续由平台提供，插件源码继续使用标准 `react`、`react-dom/client` 类型和 import；构建阶段通过受控 shim 连接平台运行时，避免插件重复打包 React。
- 采用 React 18/19 双运行时过渡：React 19 先显式启用，完成平台内置 View 与已安装插件验证后再切换为默认值，最后移除 React 18。
- 不使用公共 CDN。React 运行时资产随 Xpert 构建并由平台本地加载，以满足离线、CSP、供应链和版本可重复性要求。

参考：[React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)。

## 背景与当前约束

当前 Xpert 根依赖声明 React/ReactDOM `^18.2.0`，锁文件实际解析为 `18.3.1`。现有 `runtime: 'react'` 被协议定义为 classic-script iframe 运行时，部分 View Provider 会直接读取：

```text
react/umd/react.production.min.js
react-dom/umd/react-dom.production.min.js
```

再通过 `renderRemoteReactIframeHtml` 注入 iframe。该实现与 React 19 不兼容，因为 React 19 不再发布 UMD 文件。

升级同时影响以下边界：

- `@xpert-ai/contracts` 的 Remote View manifest 运行时契约；
- `@xpert-ai/plugin-sdk` 的 iframe HTML 生成与运行时资产加载；
- Xpert 内建 React Remote Views；
- 插件 Remote View 的 bundler shim、React 类型依赖和生成产物；
- `@xpert-ai/shadcn-ui`、Radix、portal、ref、焦点管理和表单交互；
- 安装后真实 View Host iframe，而不只是独立 React 预览页。

## 目标

1. React 19 Remote View 不依赖被移除的 UMD 包路径，也不依赖外部网络。
2. 平台能够明确解析并校验 View 所需的 React 运行时主版本。
3. 同一 iframe 中只存在一份 React 和一份匹配的 ReactDOM，避免 invalid hook call 与渲染器版本不一致。
4. 插件源码获得 React 19 官方类型，同时保持“源码标准 import、运行时平台注入”的边界。
5. Dialog、Popover、Dropdown、Tooltip、Portal、Focus Trap、Escape、表单 action/ref 等关键交互无回归。
6. 迁移期间可按 View 回退 React 18，不要求所有第三方插件在同一次发布中完成升级。

## 非目标

- 不把 Angular Cloud 宿主迁移为 React。
- 不借升级掩盖已有 ref、portal 或组件组合缺陷；共享组件应先做到 React 18/19 均正确。
- 不在本计划中重设计 View Extension postMessage 协议、业务 View 或主题系统。
- 不允许插件传入任意 React 脚本 URL，也不允许从 CDN 动态下载运行时。

## 架构决策

### 1. 平台本地运行时资产

新增平台拥有的 React Remote View runtime bundle，构建时从固定版本的 `react`、`react-dom` 生成浏览器资产并随 API/Plugin SDK 产物发布。View Provider 只选择受支持的运行时版本，不再读取 React 包内部的 `umd` 文件。

运行时资产应满足：

- 由 Xpert 构建流程产生并写入版本、内容哈希和完整性元数据；
- production/development 资产分离，生产默认使用 production；
- 只允许平台注册表中的版本，禁止文件路径、URL 或任意脚本输入；
- React 与 ReactDOM 必须成对注册和加载；
- iframe HTML 生成器对 inline script 做现有的转义和 CSP 处理；
- Docker、localpack 和插件本地部署均携带同一份运行时资产。

### 2. 显式运行时版本契约

扩展 React Remote View manifest，建议保留现有 `runtime` 判别字段，并增加版本字段：

```ts
type XpertRemoteComponentViewSchema = {
  type: 'remote_component'
  runtime: 'react' | 'vue' | 'esm'
  runtimeVersion?: '18' | '19'
  protocolVersion: 1
  // ...
}
```

过渡规则：

- Phase 1：省略 `runtimeVersion` 仍解析为 `18`；新 View 可显式声明 `19`。
- Phase 2：平台内建 View 和已验证插件改为显式 `19`。
- Phase 3：省略时默认 `19`，但显式 `18` 仍可回退。
- Phase 4：移除 React 18 资产和 `runtimeVersion: '18'` 支持，并在协议文档中记录破坏性变更。

该字段只选择平台运行时，不允许插件指定补丁版本或资产地址。React 19 的具体补丁版本在实施 PR 中统一锁定并记录，不能使用浮动版本作为生产运行时。

### 3. 源码、类型与运行时边界

- Remote View 源码继续使用 `import * as React from 'react'` 和 `createRoot` from `react-dom/client`。
- 每个 React Remote View 包声明与目标运行时匹配的本地 `@types/react`、`@types/react-dom`，并由专用 `tsconfig.remote.json` typecheck。
- bundler 通过平台维护的 typed shim 将标准 import 映射到 iframe 中的平台 React runtime；业务源码不得直接从未类型化的 `window.React` 导入。
- React 不进入插件 `app.js`，构建校验应拒绝重复打包 React/ReactDOM。
- 使用新 JSX transform；迁移时检查旧 JSX factory、字符串 ref、`findDOMNode`、legacy context 和已废弃测试 API。

## 实施阶段

### Phase 0：React 18.3 迁移基线

1. 固定当前 React 18.3.1 构建、类型检查和 Workbench E2E 基线。
2. 运行 React 18.3 开发构建，收集 React 19 相关弃用警告。
3. 盘点所有 `runtime: 'react'` View、`renderRemoteReactIframeHtml` 调用、UMD 包路径读取、React bundler shim 和私有运行时实现。
4. 修复共享 UI 的版本无关问题，特别是 ref 传递、Radix `asChild`、portal 容器、焦点恢复和受控/非受控状态。
5. 建立运行时矩阵清单，记录每个内建 View 和官方插件的负责人、当前 React 类型版本、UI 依赖与 E2E 覆盖。

### Phase 1：版本化平台运行时

1. 在 contracts 中增加 `runtimeVersion` schema、类型、序列化和校验。
2. 在 Plugin SDK 中新增平台 React runtime asset registry 和版本解析器。
3. 重构 `renderRemoteReactIframeHtml`：接收已解析的平台运行时资产，不再暴露 `reactUmd`、`reactDomUmd` 参数命名和包内路径假设。
4. 构建并注册 React 18.3.1 与 React 19 的本地 runtime bundle。
5. 为未知版本、React/ReactDOM 不匹配、资产缺失和完整性失败提供可诊断错误，不静默回退到任意版本。
6. 更新 View Extension 协议、插件开发文档和示例 manifest。

### Phase 2：共享 UI 与开发工具链升级

1. 根依赖、`@xpert-ai/shadcn-ui` 和 React Remote View 开发依赖升级到统一的 React 19 类型矩阵。
2. 更新 JSX transform、ESLint、Jest/jsdom、Testing Library、Radix 和其他具有 React peer 约束的依赖。
3. 对共享 UI 运行 React 19 类型修复和必要 codemod；不得使用 `any` 或私有 fork 绕过类型问题。
4. 加入构建检查，确认每个 remote `app.js` 不包含第二份 React/ReactDOM。
5. 确认主题变量、density、portal 和 shadcn 样式在 React 19 iframe 内正确安装。

### Phase 3：迁移平台内建 View

1. 先迁移 Knowledgebase Workbench 等平台内建 React View，manifest 显式声明 `runtimeVersion: '19'`。
2. 删除这些 Provider 中对 `react/umd/*`、`react-dom/umd/*` 的读取。
3. 使用真实生成的 `app.js`、`app.css` 和平台 React 19 runtime 完成模拟 View Host E2E。
4. 在安装后的 Xpert Workbench 中验证文档上传、弹层、表单、焦点、刷新、Assistant context 和 host bridge。

### Phase 4：迁移插件 Remote Views

1. 发布 Plugin SDK 与开发文档，允许插件对单个 View 显式选择 React 19。
2. 按运行时矩阵迁移官方插件；每个插件必须重新生成 remote assets，不能手工编辑 `app.js` 或 `app.css`。
3. 插件安装/刷新时校验声明的 runtime 是否为当前 Xpert 支持版本；不支持时给出明确兼容性诊断。
4. 对第三方插件保留 React 18 回退窗口，并记录弃用时间表。

### Phase 5：切换默认并移除 React 18

1. 所有平台内建 View 和官方插件通过 React 19 安装态验收后，将省略 `runtimeVersion` 的默认值切换为 `19`。
2. 观察一个稳定发布周期的 View 加载错误、iframe 异常、portal/focus 回归和插件兼容性指标。
3. 发布破坏性变更公告后，移除 React 18 runtime assets、兼容分支和 UMD 相关 API。
4. 全仓扫描不得再出现 React/ReactDOM UMD 包路径读取。

## Public APIs / Interfaces / Types 变化

- `XpertRemoteComponentViewSchema` 增加 `runtimeVersion?: '18' | '19'`，最终收敛为 React 19。
- Plugin SDK 增加受控 React runtime registry/resolver；运行时资产是平台实现细节，不进入 View manifest。
- `renderRemoteReactIframeHtml` 从“调用方提供 UMD 字符串”改为“使用平台解析的版本化 runtime assets”。
- 插件脚手架、示例和远程 typecheck 模板改用 React 19 类型和新 JSX transform。
- `@xpert-ai/shadcn-ui` 的 React/ReactDOM peer 范围在双版本期支持 18/19，React 18 退役后再提升最低版本。
- View Extension `protocolVersion` 暂保持 `1`；若最终实现改变 iframe 消息协议而不只是 runtime 选择，则必须升级协议版本，不能在 v1 中隐式改变 wire contract。

## 测试与验收

### 单元与契约测试

- manifest 接受受支持的 React 18/19 声明，拒绝未知版本和任意 URL/path。
- 省略版本时按当前迁移阶段解析到确定的默认版本。
- React 和 ReactDOM 资产版本、哈希与完整性校验一致。
- iframe HTML 不再依赖 `node_modules/react/umd`，不暴露主机文件路径。
- inline runtime、app script、CSP nonce/转义和 postMessage bridge 保持有效。
- remote bundle 检查不包含重复 React/ReactDOM。

### React 19 组件回归

- `createRoot` 挂载、卸载和重复打开 View 正常，无 root 泄漏或重复事件监听。
- Dialog、AlertDialog、Popover、DropdownMenu、Tooltip、Select、Command/Combobox 在 iframe 内定位正确。
- trigger ref、`asChild`、portal、overlay、焦点陷阱、焦点恢复、Escape/Cancel 和键盘导航正确。
- 表单提交、异步 action、错误边界和状态更新符合 React 19 行为。
- light/dark、default/compact density 与 host theme bridge 正常，无黑色边框或首屏主题闪烁。

### Workbench E2E 与安装态验证

- 模拟 View Host 加载实际构建的 runtime、`app.js` 和 `app.css`，不使用测试替身。
- 覆盖打开、选择/编辑、执行 action、失败反馈、保存、刷新/重开和下游流程。
- 对关键 View 在典型与最小面板尺寸下执行截图回归。
- 在真实安装的 Xpert 中验证权限、iframe、CSP、插件安装/刷新、Assistant context、host events 和 View bridge。
- 离线或禁止外网环境中 React 19 View 仍可加载，浏览器 Network 不访问 React CDN。

### 必须通过的命令

实施 PR 根据受影响项目至少执行：

```sh
pnpm install
pnpm exec nx test plugin-sdk
pnpm exec nx test server-ai
pnpm exec nx build plugin-sdk
pnpm exec nx build server-ai
pnpm build
```

若届时仓库已完成去 Nx 计划，则使用对应的 pnpm 原生命令替换以上 Nx 命令。每个迁移插件还必须运行自身 typecheck、单测、remote build、Workbench E2E、插件校验和本地部署验证。

## 发布、监控与回滚

- React 19 先按 View 显式启用，不做全局一次性切换。
- 记录 View key、插件版本、声明/解析后的 runtime 版本、加载结果和耗时；不记录业务数据或 iframe 内容。
- 运行时加载失败应显示可操作的兼容性错误，并保留服务端诊断日志。
- 双版本期可将单个 View manifest 回退到 `runtimeVersion: '18'`；不得通过临时 CDN 或重新暴露 UMD 文件修复生产问题。
- 切换默认值和删除 React 18 必须是两个独立发布门禁，确保仍有可恢复窗口。

## 完成标准

- Xpert 平台默认 React Remote View 使用已锁定的 React 19 runtime。
- 所有平台内建 React View 和官方插件均显式验证通过 React 19。
- 仓库中不存在 React/ReactDOM UMD 包路径读取或运行时 CDN 依赖。
- contracts、Plugin SDK、脚手架、开发指南和协议文档对运行时版本的描述一致。
- 真实安装态下关键 UI、host bridge、权限和 Assistant context 流程无回归。
- React 18 兼容代码只在公告的回退窗口内存在，并按 Phase 5 完成清理。

## Assumptions / Defaults

- 目标是 React 19 的受支持稳定补丁版本；实施时统一锁定具体版本，不在生产中使用 `^19` 作为 runtime 资产来源。
- 继续使用 iframe isolation 和 View Extension protocol v1，除非实施中确认 wire contract 必须改变。
- 平台运行时与插件源码类型分离：运行时由 Xpert 托管，类型和构建检查由每个 Remote View 工程负责。
- 本计划优先保证安全、可回滚和插件兼容性，不以减少短期构建产物大小为唯一目标。
