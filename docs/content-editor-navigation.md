# 内容编辑器：仅在 ChatKit Workbench 承载

## 职责边界

- 平台服务端：资源鉴权、编辑器注册和解析、项目文件、版本与协作数据。
- Xpert SDK：`Client.content` 提供有类型的 `resolve/review/preview/mutate`，复用请求凭据、组织上下文和取消信号。
- ChatKit Workbench：资源导航、编辑器实例和未保存状态、链接生成、审阅与 Assistant 交互。
- 编辑器插件：具体格式的 UI、保存和定位；通过既有 Remote View bridge 汇报状态、回应保存握手。
- ClawXpert Detail：只承载 ChatKit，路由离开时调用通用 `prepareLeave()`。不注册内容命令、不持有文档状态、不打开另一套文档审阅界面。

删除 Angular `ContentWorkbenchService`、`ContentEditorHostService`、原生文档审阅弹窗和文档链接工具；不保留旧 `workbench.content.open` 兼容入口。ClawXpert 的其他通用视图与导航能力保持独立。

## 打开资源

1. 业务插件按需调用 `document.open` 准备文件资源，不在此 action 中导航。
2. 调用 `workbench.content.resolve`，传入 `{ resourceId, providerKey? }`。Assistant、Project 和组织来自可信 Workbench runtime。
3. ChatKit 调用 SDK；服务端鉴权并返回编辑器注册的 `viewKey` 和 provider 参数。解析操作没有导航和保存副作用。
4. 插件校验结果，再用同一 bridge 调用 `workbench.navigation.open`。ChatKit 只在内部打开目标标签；替换该标签的资源前等待未保存内容写入。
5. 任一步失败都保留原文档，不回退到 ClawXpert 外层工作台。

```ts
const result = await request('invokeClientCommand', {
  commandKey: 'workbench.content.resolve',
  payload: { resourceId, providerKey }
})
// 成功示例：
// { success: true, navigation: {
//   target: 'workbench.view', viewKey: 'markdown.views__markdown.editor',
//   selectionId: resourceId, parameters: { contentProvider: providerKey }
// } }
await request('invokeClientCommand', {
  commandKey: 'workbench.navigation.open',
  payload: result.navigation
})
```

完整信封为 `{ channel: 'xpertai.remote_component', protocolVersion: 1, instanceId, scopeRevision, requestId, type: 'invokeClientCommand', commandKey, payload }`。响应 `type: 'clientCommandResult'` 使用相同关联字段，结果位于 `result`。iframe 来源、实例、当前 scope 和 manifest 声明必须匹配。

## 必需宿主命令

`XpertViewClientCommandDefinition.required?: boolean` 声明视图运行的前提，不是授权字段：

- Spaces 将 `workbench.content.resolve` 标记为必需。
- Markdown / Office 编辑器将 `workbench.content.status` 标记为必需。
- ClawXpert 原生视图入口通过通用命令注册表过滤无法满足的 manifest；包括项目视图入口。它不识别 Spaces、Markdown 或 Office 名称。
- ChatKit 实现这些命令；optional 命令仍可声明并根据返回值处理不可用状态。资源 API 的服务端鉴权始终执行。

## 生命周期和审阅

每个 ChatKit Workbench 拥有独立协调器；原生编辑器与 Remote View 共用同一离开保护，不使用页面全局文档注册表。

对外只提供 `prepareLeave(): Promise<boolean>`，宿主收到 `true` 后再继续导航，`false` 或异常时保留挂载。`dirty` 由 ChatKit 内部协调器统一维护，原生标签标记、浏览器关闭提示与保存判定使用其派生只读快照；宿主不维护第二份 dirty，也不以状态快照代替异步保存确认。当前不增加公开 dirty 属性或事件，后续如需宿主显示未保存标记，再按只读通知扩展。此接口只检查编辑器修改是否已保存，不表示 AI 任务已经完成。

- `workbench.content.status`：插件上报当前 resource 和 dirty。仅接受当前实例、scopeRevision 和选中资源。
- 关闭脏标签、替换资源、审阅/恢复、切换 Assistant/Project/会话、刷新时，ChatKit 发出 `editorEvent/prepareClose`。插件保存并返回 `closePrepared`，携带原 requestId 与 scopeRevision。只有 `ready: true` 且状态干净才可继续。
- 错误、超时、实例卸载或过期响应均不视为保存成功；清洁标签的关闭和历史导航维持同步交互。
- `beforeunload` 在存在未保存内容时提示。ClawXpert 的 Angular 路由通过 `ChatkitLifecycleService` 调用公开 `prepareLeave()`；只处理布尔结果，不解释文档协议，15 秒无回应时阻止离开。
- `assistant.content.review` 在 ChatKit 打开审阅 UI：提案、评论、版本、外部修改冲突。接受/恢复前检查当前保存状态；恢复和冲突处理携带 epoch、sequence/hash 基线，服务端拒绝过期请求。
- `workbench.content.link/copyLink` 先校验资源权限，再按宿主提供的公开 `workbench.linkBaseUrl` 生成项目入口，保留 provider/块锚点，不携带当前私有会话、查询凭据。未配置时返回 `link_unavailable`。

## 本地交付与依赖

本次按审核阶段交付源码和暂存，不发布 SDK、不更新正式依赖或 lockfile、不部署在线应用。

SDK 源码位于同级 `xpert-sdk/packages/core`。ChatKit 当前声明的 SDK 0.14.0 尚无 `Client.content`；本地检查临时连接已构建的 SDK 源码包，检查后恢复 node_modules 原连接。正式集成时先发布 SDK，再升级 ChatKit 的 SDK 依赖并构建发布 ChatKit，最后升级平台所用 ChatKit 包。仅提交平台移除代码、仍运行旧 ChatKit 不能交付这项能力。

## 验证入口

- SDK：`packages/core/src/tests/content.test.ts`（请求作用域、凭据、取消、拒绝访问）。
- ChatKit：`WorkbenchShell.content.test.tsx`、`content/*test*`、`editors/editor-lifecycle.test.ts`、`RemoteViewFrame.test.tsx`、`ParentMessenger.test.tsx`，及既有 Workbench 导航/生命周期测试。
- 平台：`chatkit-lifecycle.service.spec.ts`、`view-client-command-registry.service.spec.ts`、`workbench-project-navigation.spec.ts`、`view-extension.utils.spec.ts`。
- SDK/ChatKit 发布后的浏览器验收：Spaces → 编辑器 → 切换文档/复制链接/审阅；保存失败关闭与跨项目切换被阻止；恢复保存后可离开；ClawXpert 原生工作台没有另一套内容视图入口。

## 本次本地验证记录

- ChatKit Workbench 与 ParentMessenger：60 个测试文件、424 项测试通过；UI TypeScript 检查和 Vite 构建通过，构建输出在临时目录，未替换在线资源。
- dirty 职责收敛后复验（2026-10-24）：Node v22.22.0 / pnpm 10.11.0，本地 SDK 源码联调下执行 `vitest run src/workbench src/providers/ParentMessenger.test.tsx --maxWorkers=2`，60 个文件、428 项测试通过；ChatKit UI TypeScript 检查通过。新增覆盖只读快照、保存期间的新修改、原生/插件状态共用及旧作用域延迟回调。此次未重跑生产打包，检查后恢复原 SDK 依赖链接。
- 平台容器、离开握手、命令可用性、manifest 规范化：133 项测试通过。
- SDK transport 与内容接口：6 项测试通过，SDK 构建通过。
- Spaces、Markdown 插件类型检查通过。Office 插件仍引用已安装的旧 contracts/plugin-sdk，缺少新 `required` 字段和内容编辑器接口，类型检查未通过；需新版平台包或等价的本地包联调后复验，不能把这次结果作为 Office 发布验收。
- React、Angular control、Web Component 和 UI5 生产源码进行了定向类型检查；Vue 包未安装依赖，未完成其独立类型检查。
- 上述为本地源码/组件验证，未部署、未进行已发布包组合的浏览器验收。已按要求保留正式依赖版本和 lockfile。
