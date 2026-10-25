# Xpert Assistant 协作空间：第一期交付

更新：2026-10-16。实现位于当前未提交的 `xpert` 和 `xpert-plugins` 工作区；已部署到隔离本地环境。本文替代原独立 `/content/spaces:root` MVP 的验收口径。

## 当前架构

协作空间已改为 Assistant 的 `spaces` 中间件能力。发布后通过既有 Workbench Views 加载插件 Remote View，界面使用 React、仓库共享 shadcn/Radix 组件与 Tailwind。Cloud 全局 Spaces 导航和独立内容路由已移除。

平台通过 `platform.assistant.middleware-access` 显式区分独立 Assistant 与项目内使用：前者复用发布 Assistant 的目录访问策略，后者使用项目成员及 Assistant 绑定，不叠加目录可见性；均验证有效组织成员及指定中间件特性。与 View Middleware Runtime 共用解析规则。Spaces 在每次 View 请求和工具调用入口校验 `provider + requiredFeature`；页面、文件、搜索、Artifact 和 WebSocket 内容访问另由项目及资源权限控制，不逐文档重复检查功能权限。后台任务使用可信的显式身份，不借用请求发送者权限；授权不跨请求缓存，同一项目内多个 Assistant 可以协作。

每个 Assistant 和数据范围只有一个空间，首次打开时自动初始化。默认共享；`workspaceDataScope: user` 保持按用户隔离。原地重新发布保留内容。空间不再单独维护邀请或只读角色：共享成员拥有编辑和管理内容权限。旧独立空间数据保留且默认不可访问，没有静默迁移。

平台继续提供协作、文件、Artifact 和编辑器注册表；Spaces 插件负责目录、评论、提案、检查点、工具和视图，Office Editor 通过公开 Provider 提供 XLSX。各插件不互相导入私有服务。

## 已交付功能

- 文件夹、页面、上传文件、固定版本 Artifact 收藏，以及可选 XLSX。
- 页面 Yjs 实时编辑、在线成员、评论、检查点、历史恢复和断网编辑保护。
- Assistant 工具实际创建页面，读取和检索文档；已有正文的 AI 修改形成待审核提案，由人类接受。
- 选区和保存状态通过 `assistant.context.set` 传入当前聊天；上下文不授予资源权限。
- 视图内真实模型润色、提案审核和带来源序号的问答。
- 文件不可变版本、固定 Markdown 导出、Artifact 原资源权限交集、撤权后旧链接失效。
- 重复宿主初始化保持在途操作；真正更换作用域时取消旧请求，避免初始化误报和迟到响应污染。

## 本轮验证

| 验证 | 结果 |
| --- | --- |
| 平台定向测试 | 8 个套件共 118 项通过：发布访问策略、能力授权、组织撤权、协作、Artifact、文件和作用域 |
| Spaces 单测 | 4 项通过：并发 CRDT、精确补丁、非法结构，以及重复 init／作用域变更时的消息桥 |
| 类型与构建 | 配套 SDK 构建、平台 TypeScript、Spaces 后端及 Remote View 类型检查、构建和产物一致性检查通过 |
| 插件生命周期 | 元数据检查和 plugin-dev-harness 通过，部署后完成 API 重启与真实能力调用 |
| 真实服务 | 16 组通过，使用隔离 PostgreSQL、Redis、HTTP、WebSocket 和真实模型 |
| Assistant 聊天 | Workbench 中实际调用 `spaces_create_page` 创建“协作空间验收说明”，随后通过 API 回读正文及 Artifact 标识 |
| 浏览器操作 | 在 Assistant Workbench 的 Remote View 新建“产品发布协作手册”、编辑、生成真实模型提案、人类接受、发表评论及导出 v2；通过 API 确认正文、提案、评论与文件持久化 |
| 浏览器导出链接 | 可见“保存文件”链接中的文件名和完整 Markdown 字节已核验，与接受后的 v2 一致；操作系统落盘尚未自动确认 |
| 重启恢复 | API 重启后，AI 创建页面的正文、序号、Artifact 标识一致 |

16 组集成检查覆盖：有／无能力 Assistant；共享空间唯一性；个人隔离；未授权用户；双用户编辑与更新去重；并发提案和过期基线；评论与历史恢复；真实模型润色、人类接受与引用问答；固定 Artifact 收藏下载；上传文件；XLSX 版本与保存冲突；跨组织与伪造租户 header；撤销 Assistant 用户组成员后 API／搜索／文件／旧下载授权／WebSocket 拒绝；回收站；组成员增删；跨 Assistant 文档 id；移除已发布能力；重新发布保持空间。

Office Provider 的 36 项测试及格式限制沿用上一轮已验证实现，本轮未改其功能。上述数量不包含整个平台的全量测试。

**尚待人工验收一项：浏览器文件落盘。** 自动下载和可见保存链接均已点击，但当前 Codex 内嵌浏览器未返回下载完成事件；Computer Use 不允许检查 Codex 原生应用的系统保存窗口，因此不能将此项标记为通过。HTTP 文件内容、权限及浏览器收到的导出字节均已通过验证。界面提供“保存文件”回退链接，便于人工完成下载验收。

## 本地验收

打开 **团队文档助手 → Workbench → Views → 协作空间**。浏览器已使用 `spaces-owner@xpert.test` 登录；另有 editor 和 outsider 测试账号用于共享及拒绝访问验证。

本地入口：`http://localhost:4200/chat/x/spaces-shared-1792112422723/c`。API 为 `http://localhost:3000/api`。数据库与 Redis 使用隔离 Compose 项目 `xpert-spaces-phase1`，端口 55436 / 56436；原系统数据库未被改写。模型复用此前获准读取的火山引擎配置，Key 留在平台配置中。

本机 `.xpert-local-environment/spaces-phase1` 保存 `assistant-fixture.json`、`assistant-deployment.json`、`assistant-acceptance.json`、`assistant-created-document.json`、`assistant-restart-acceptance.json` 及浏览器证据。部署回执与实际运行验证分开记录。真实模型验收回执来自已完成脚本的标准输出，源码脚本现支持直接写入 `SPACES_TEST_REPORT`。

浏览器补充证据为 `assistant-ui-acceptance.json`、`assistant-browser-export.json` 和 `assistant-workbench-handoff.png`。`assistant-browser-export.json` 明确记录 `downloadCompletionConfirmed: false`，不以链接内容验证代替落盘验证。

```sh
# 在 xpert-plugins/xpertai 中执行；实例路径由调用者提供。
SPACES_TEST_IDENTITY=/absolute/path/identity.json \
SPACES_ASSISTANT_FIXTURE=/absolute/path/assistant-fixture.json \
node apps/spaces/scripts/assistant-fixture.mjs

SPACES_TEST_IDENTITY=/absolute/path/identity.json \
SPACES_ASSISTANT_FIXTURE=/absolute/path/assistant-fixture.json \
SPACES_TEST_REPORT=/absolute/path/acceptance.json \
SPACES_TEST_MODEL=1 \
node apps/spaces/scripts/live-acceptance.mjs
```

## 交付边界

本地部署可验收。生产发布需要协调发布配套平台／SDK，并执行 Artifact 的 `20261015-content-resource-policy.sql` 迁移；当前 registry SDK 单独安装不足以提供新增能力。插件表由平台插件实体生命周期管理。

首期检索为当前授权页面正文检索，尚未接入语义知识库索引和周期维护。编辑类型为页面和 XLSX；DOCX／PPTX 等需要后续适配。XLSX 不执行公式重算，复杂格式保真和集群跨节点传播需另行验收。生产级数据迁移与外部公开发布不在本次本地验收范围内。
