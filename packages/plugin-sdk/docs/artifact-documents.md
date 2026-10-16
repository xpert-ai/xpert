# 隔离 HTML 文档宿主

`@xpert-ai/plugin-sdk/artifact-document` 是浏览器安全的 SDK 子入口，不依赖 Nest、具体数据源或图表库。

## 所有权

- 平台 SDK 提供 `mountArtifactDocument`、严格的查询消息协议、隔离 iframe、CSP 和页面 SDK。
- 插件提供文档生命周期、Binding 白名单和 `query` 回调。回调必须调用服务端，以当前用户重新授权，并从已保存版本中读取 Binding。
- 文档只能调用 `window.xpertLiveArtifact`，不能调用宿主通用 View Actions，也不能选择 Artifact 版本、Provider 或提交查询定义。
- 文档内容由 Artifacts 保存；平台宿主不规定数据库、插件页面结构、业务模型和图表类型。

## 宿主

在专用文档宿主页调用 `installArtifactDocumentFramePolicy(document)`，再挂载 iframe；未安装时 mount 会拒绝挂载。该策略作用于整个宿主页，禁止子框架的 URL 导航；允许 `srcdoc`。不要装到需要加载其他远程 iframe 的应用根文档。

`mountArtifactDocument(frame, { html, context, query, onBusy, onResult, onError })` 返回 `refresh()` 和 `dispose()`。上下文只含 Binding ID（最多 64 个）、默认控件值（最多 24 个）、语言及主题；它在挂载时严格校验并复制，后续修改原对象不会扩大允许的 Binding 集合。Artifact ID、版本和身份由可信回调闭包持有，不交给文档选择。

SDK 使用独立 MessageChannel，只接受当前 iframe、当前挂载随机标识的一次初始化请求；旧文档的延迟消息不能初始化新挂载。每条查询严格解析、检查 Binding 白名单、拒绝当前一分钟窗口内的重放，执行中的请求 ID 跨窗口继续受保护，最多 8 个并发、每分钟 60 次。关闭宿主后丢弃返回结果并清理 busy 状态；实际服务端取消/期限由查询能力负责。

## 文档 SDK

```javascript
const live = window.xpertLiveArtifact
live.bindSelect(document.querySelector('select'), {
  bindingId: 'sales',
  controlId: 'region',
  fieldId: 'region',
  allLabel: '全部区域'
})
live.subscribe('sales', (dataset) => render(dataset))
await live.ready()
await live.query('sales', { region: null })
// 筛选值是声明的 controlId；刷新沿用此 Binding 最近一次请求的控件值。
await live.refresh('sales')
```

订阅会接收普通查询和宿主刷新结果。同一 Binding 的旧响应不会覆盖新响应。页面自行处理 loading/error/empty 和数据完整性；可信宿主独立显示新鲜度、部分结果及错误状态。

`bindSelect` 是可选的通用 Dataset 控件适配器：从已收到的数据行收集唯一值、保留筛选前的候选值、维持选择并发起查询。option.value 使用 JSON 编码以保留标量类型，页面不应再添加第二个 change handler。`allValue` 默认 null，可显式指定声明的全选值。它不会额外查询隐藏数据，也不会把候选列表当作授权；字段和参数访问始终由后端校验。查询失败触发冒泡的 `xpert-query-error` 事件。其他控件可直接使用 query。

## 隔离边界

HTML 在 `sandbox="allow-scripts"` 内执行，无同源权限、表单、弹窗和下载授权。内容前缀首先安装 CSP，允许内联 JS/CSS 和 data/blob 图片，拒绝网络请求、外部脚本、外部字体、子 iframe、worker、eval、对象和表单。宿主页额外的 frame-src 策略拒绝文档自身导航。

HTML 格式验证不是 sanitizer，也不证明业务正确性。Agent 代码仍可画出错误图形或阻塞自己的文档；业务口径、数值与实际页面都需要验收。该能力不提供后端写操作、任意网络代理或自动推送。

## 验证

运行定向 `protocol.spec.ts`。从平台根目录执行 `node packages/plugin-sdk/tests/artifact-document-browser.cjs` 可使用真实 Chromium 验证消息边界、筛选刷新、并发响应、CSP、父 DOM/Web Storage 隔离、自身导航、旧握手拒绝、并发/频率限制和销毁后的响应丢弃。网络验证使用实际监听的本机 HTTP 服务，不能仅根据浏览器 request 事件判断是否发生外部通信。
