# ClawXpert ChatKit Workbench 功能差异备忘

状态：**仅记录，暂不迁移实现；遇到对应业务问题时再重新评估。**

`xp-clawxpert-conversation-detail` 移除外层 Workbench section 后，仅保留 `data-workbench-chat-shell`，由 ChatKit 承载工作台。本次不要求 ChatKit 立即补齐旧工作台的全部能力，也不恢复旧容器。

以下编号用于跟踪差异，不代表已批准的实施范围或排期。出现具体问题时，先确认当前版本是否仍有差异、现有入口能否满足需求，再提出对应迁移方案供审核。

## 核对范围

- 记录日期：2026-10-26。
- Xpert：以 `5a717bb54` 中的旧工作台实现，对照本地尚未提交的 ChatKit 单容器改动。
- ChatKit：本地 `chatkit-js` 源码 `1230d2e`。结论描述该源码与当前宿主接线，不代表所有已发布包的能力。
- 本清单基于源码对照；完整页面能显示，不等于下列业务路径均已完成端到端验收。

## 已有对应能力

ChatKit 已有文件浏览、编辑、上传、下载、删除，交互终端，普通网址浏览，文件差异查看，带版本的产物预览，iframe 插件视图，以及分栏、布局缩放和未保存编辑保护。

这些能力仍有入口、权限呈现和自动更新方面的差异，见下表。相似的组件名称不能直接视为完整替代，例如“任务摘要”与“定时任务管理”、“HTML 产物预览”与“运行中的 Sandbox 服务网页”分别属于不同功能。

## 按需重新评估的功能

| 编号 | 功能 | 当前差异与替代入口 | 重新评估的触发条件与候选范围 |
| --- | --- | --- | --- |
| 1 | 任务产物打开后继续编辑 | 带版本的 artifact 已由 ChatKit 原生处理。`workspace_file`、无版本号 artifact 等仍通过 Xpert 弹窗兜底。旧工作区文件可由该入口进入编辑器，当前兜底仅提供预览、下载，且文件大小已知时有 1 MB 预览限制。可编辑文件仍可从 ChatKit 文件面板另行打开。 | 用户从产物入口无法继续编辑，或被兜底预览大小限制阻断时，评估统一路由到 ChatKit 文件标签页，保留资源身份、版本和写权限。 |
| 2 | Sandbox 服务浏览器 | ChatKit 普通浏览器直接打开 URL，未承接根据会话与服务 ID 创建预览会话、把 Sandbox 内的 localhost 地址解析为服务代理地址的流程。任务摘要里的浏览器资源仍可通过旧浏览器组件弹窗打开。 | 运行中应用无法从 ChatKit 浏览器访问，或用户需要常驻服务预览标签页时，评估迁移服务解析、预览会话和代理地址处理。 |
| 3 | 工具完成后自动更新工作台 | 旧实现会在写文件后刷新文件树、服务启动后打开预览、生成文件后打开或更新产物标签页。当前宿主移除了这些接线。ChatKit 文件面板支持手动刷新和自身文件操作后的刷新，编辑器保存也会刷新文件树；工具事件尚未接入，产物主要通过点击打开。 | 用户看不到工具刚生成或修改的文件、服务预览未出现时，评估补接对应事件。自动刷新与自动打开产物分别决定，避免默认恢复全部自动弹出行为。 |
| 4 | 从文件内容直接引用到对话 | 输入框选择工作区文件仍可用。旧文件面板的一键引用当前文件、选中代码行并携带路径和行号、引用工作区 HTML 元素，尚未接入 ChatKit 原生文件编辑器。 | 用户需要边查看文件边针对具体内容提问时，评估编辑器到输入框的引用接口，保留路径、范围和资源上下文。 |
| 5 | 只读项目的文件按钮状态 | ChatKit 编辑保存会检查文件的 `canWrite`，但文件面板的新建、上传、删除入口尚未统一根据权限隐藏或禁用。旧工作台通过项目 `canEdit` 切换整个文件面板的只读模式。此项记录的是前端权限呈现差异。 | 只读用户看到不可执行的修改入口，或点击后才获知权限不足时，评估按后端能力结果统一按钮状态，并保留服务端鉴权。 |
| 6 | 运行中网页的检查工具 | 旧浏览器支持元素选择并引用、设备尺寸预览和缩放。ChatKit 的 HTML 产物预览已有相似能力，但普通 URL 和 Sandbox 服务网页尚未覆盖。通过任务摘要打开的旧浏览器弹窗仍保留相关能力。 | 用户需要指出运行中页面的元素进行修改，或检查不同设备尺寸时，评估与第 2 项一起迁移；不能用静态 HTML 产物标注代替服务网页检查。 |
| 7 | 非 iframe 插件视图 | 旧宿主支持 `stats`、`table`、`list`、`detail`、`raw_json` 等视图。ChatKit 当前只接收 `remote_component` 且 `isolation: iframe` 的视图。使用旧类型的插件，其工作台菜单、链接和自动打开路径不再由当前页面承接。 | 实际插件仍使用这些类型，导致视图不可用时，再选择补充 ChatKit 渲染器或把该插件视图迁为 iframe。 |
| 8 | 跨项目查看视图但保持当前对话 | 旧的非 iframe 视图标签页可以独立持有目标项目，不改变主对话项目。当前 ChatKit 导航到其他项目会切换主项目，未保留这类独立项目视图标签页语义。 | 用户需要在当前对话旁查看其他项目资料，并且切换主项目影响工作时，评估独立标签页作用域与导航设计。该项与第 7 项相关，不表示所有原有跨项目导航都使用独立作用域。 |
| 9 | 会话内定时任务管理 | ChatKit 的任务摘要不包含定时任务的新建、编辑、暂停、恢复、归档、批量处理和执行历史管理。Xpert 全局 `/chat/tasks` 页面仍保留；当前移除的是会话内的管理入口与直接切换到任务历史对话的接线。 | 用户必须离开当前会话才能管理任务、影响使用时，优先评估带当前 Assistant 上下文的跳转入口；确有内嵌需求时再迁移管理界面。 |

## 其他行为差异

### 旧布局配置和偏好恢复

当前页面不再消费旧 `initialLayout` 配置，也不再恢复外层工作台全屏、宠物与悬浮模式的旧偏好。ChatKit 有自己的布局机制，但不会自动迁移旧偏好。

只有在已配置的默认布局或用户偏好变化造成具体问题时，再决定废弃旧配置、映射到 ChatKit 配置或进行一次性偏好迁移。无需因此恢复已移除的外层布局。

### 重复文件面板和终端标签

旧容器允许重复添加文件面板与终端标签；ChatKit 当前按类型复用一个入口。旧容器的多个终端标签不等于已实现独立终端会话。

出现明确的多面板或多终端并行使用需求时，再定义实例隔离、连接生命周期和关闭行为，不直接照搬旧标签数量。

### 仍由 Xpert 承接的功能

知识库引用跳转，以及部分文件、浏览器和文件差异资源的弹窗兜底，仍由 Xpert 宿主处理。这些属于功能保留，不能计为 ChatKit 原生实现。只有具体使用问题或复用需求出现时，再决定是否迁入 ChatKit。

## 后续处理方式

1. 用具体业务场景定位上表编号，先检查当时的 ChatKit 版本和宿主实现，避免重复迁移已有能力。
2. 复现实际问题，确认保留入口或现有兜底是否足够。
3. 只对受影响的功能提出方案，说明是否需要改 SDK、ChatKit 或 Xpert 宿主，以及权限、资源版本和会话作用域边界。
4. 方案审核后再实现，并围绕该场景补齐验证；更新本备忘中对应项的状态和实现文档链接。

本记录不授权新增功能、扩大迁移范围、提交代码、发包或部署。

## 实现定位

Xpert 中保留的旧组件与当前桥接：

- [旧产物标签页设计](../workbench-artifact-tabs.md)：用于理解移除前的行为，不应直接视为当前单容器页面的能力说明。
- [任务资源弹窗兜底](../../apps/cloud/src/app/features/chat/clawxpert/conversation-detail/chatkit/resource-fallback.ts) 与 [文件预览弹窗](../../apps/cloud/src/app/features/assistant/workbench-file-preview-dialog.component.ts)。
- [旧浏览器组件](../../apps/cloud/src/app/features/chat/clawxpert/clawxpert-conversation-preview.component.ts) 与 [服务浏览控制器](../../apps/cloud/src/app/features/chat/clawxpert/clawxpert-managed-services-browser.ts)。
- [旧文件引用能力](../../apps/cloud/src/app/@shared/files/document/file-document-state.ts)、[工具文件刷新判定](../../apps/cloud/src/app/features/chat/clawxpert/clawxpert-workspace-file-refresh.utils.ts) 与 [产物标签辅助逻辑](../../apps/cloud/src/app/features/chat/clawxpert/workbench-artifact-tabs.ts)。
- [旧跨项目视图导航](../../apps/cloud/src/app/features/chat/clawxpert/workbench-project-navigation.ts) 与 [当前 ChatKit 导航](../../apps/cloud/src/app/features/chat/clawxpert/chatkit-workbench-navigation.ts)。
- [定时任务管理](../../apps/cloud/src/app/features/chat/tasks/tasks.component.ts) 与 [知识库引用桥接](../../apps/cloud/src/app/features/chat/clawxpert/conversation-detail/citations/navigation.ts)。

ChatKit 仓库中的对应入口，以 `packages/chatkit-ui/src/` 为相对根目录：

- `hooks/useOpenTaskSummaryResource.ts`、`workbench/artifact-preview/useArtifactActions.ts`：产物路由。
- `workbench/browser-preview/WorkbenchBrowserPreview.tsx`、`workbench/url-preview/UrlPreviewContent.tsx`：普通网页预览。
- `workbench/html-preview/`：HTML 产物标注与预览工具。
- `workbench/WorkbenchPanel.tsx`、`workbench/native/files/`：文件刷新、文件操作与编辑。
- `components/code-editor/CodeEditor.tsx`：原生代码编辑器。
- `workbench/useWorkbenchViews.ts`：视图类型过滤。
- `workbench/native/useNativeWorkbench.ts`、`workbench/layout-storage.ts`：原生标签复用与布局偏好。
