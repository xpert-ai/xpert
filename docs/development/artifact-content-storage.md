# Artifact 内容存储

> Beta：本批内部字节存储实现仍可能发生破坏性修改，暂不承诺跨 Beta 版本兼容。

## 分层职责

本批仅改造已有 Artifact 内容的底层存储，不扩展 Workspace Files SDK。`WorkspaceFileReference` / `WorkspacePortableFileReference` 继续只表达文件的逻辑位置和权限作用域，不增加内容类型、Provider、后端类型或存储连接信息。Artifact 使用方不参与存储配置和路由。

内部字节存储层通过系统 `FileStorage.getProvider()` 获取实际 Provider：有租户存储设置时使用该设置，否则使用系统部署默认值。ChatKit/SDK 和普通上传共用 SDK `RequestContext` 中的设置。

配置 MinIO、S3、OSS 等存储时，复用系统已有 Provider 的 bucket、endpoint、凭据及注册机制。没有额外的内容存储环境变量。配置的 Provider 不可用时明确失败，不静默回退本地。

LOCAL 使用平台已有的受保护 Volume `.apps/artifact_content` 命名空间，不能落到公开上传目录；远端通过现有 `IFileStorageProvider.putFile/getFile/deleteFile` 保存和读取字节。Artifact 层负责权限和作用域校验，内部字节层负责摘要校验和物理存储。普通可变工作目录、appData、共享文件锁和 Sandbox 挂载仍使用 POSIX。

## 复用现有 Artifact API

`ArtifactContent.write({ artifactId, buffer })` 返回逻辑引用，物理存储由内部字节层处理。内容路径绑定 Artifact ID 和内容摘要；版本发布和固定版本读取复用已有 Artifact API。更新内容产生新的摘要路径，历史版本继续指向原内容。

Artifact 自有引用必须匹配 Artifact ID、所有者、租户和组织。预览继续使用平台 `createSignedPreviewLink` / ArtifactLink，每次访问校验授权、撤销状态及固定版本。本功能不另增对象直链或对象签名 API，也不将 Provider 的公开 URL 返回给用户。远端存储须按系统文件存储要求配置访问权限，不能通过匿名桶绕过平台授权。

## 系统切换与数据迁移

- 系统底层存储配置应保持稳定。切换 Provider、bucket 或 endpoint 前必须安排数据迁移，核验目标字节和目录/对象键映射，并协调停写和配置切换。
- 配置切换后的全部操作采用新的系统配置；本功能不维护逐文件的旧 Provider 记录，也不搜索或回退到旧存储。未迁移的数据将无法读取。
- 迁移保持逻辑路径、权限作用域和内容摘要不变。引用及使用方代码无需修改，Artifact 固定版本继续使用原引用。已有本地内容在系统仍为 LOCAL 时保留原路径。

## 边界

- 已有 Artifact 内容接口使用完整 Buffer，写入最多 50 MiB，读取后校验大小与摘要；内存读取行为取决于系统 Provider，不承诺跨 Provider 的流式读取上限。
- 本地和远端写入保留 Volume 配额检查，远端还复用系统 Provider 配额包装。对象总容量尚未完整纳入 POSIX 用量扫描。
- 对象存储和数据库没有跨系统事务，失败发布可能留下孤立文件，需要应用侧回收；本批不提供自动 GC 或自动迁移器。
- 不新增 Runtime Capability，不扩展 Workspace 文件引用或文件 API；本批不修改 live-dashboard 插件及模板数据。
- ZIP 暂存不引入独立的通用不可变文件 API。恢复插件审核时，其未合入的 ZIP 实现需要调整为复用现有文件和 Artifact API。

## 验证

回归测试覆盖：系统租户设置、无 HTTP 请求时的部署默认值、引用不暴露存储类型、组织隔离、路径与摘要校验、配置切换但未迁移时失败、迁移后同一引用继续使用、未注册 Provider 不回退，以及 Artifact 授权。

`artifact-content.minio.integration.spec.ts` 保留真实 MinIO Provider 和 PostgreSQL 的联合验证：随机专用桶、更新内容后历史固定版本不变、平台签名预览与撤销、访问隔离及独立 MinIO 重启。测试通过既有 Provider 注册入口的替身提供测试 Provider，不建立内容专用配置。

2026-11-06 的旧实现真实 MinIO 验收是历史记录，不能替代此次统一系统 Provider 后的重新验收。当前修改未重跑真实 MinIO/PostgreSQL 联调。

开启联合测试需测试 runner 注入 `XPERT_TEST_MINIO_ENDPOINT`、`XPERT_TEST_MINIO_SIGNED_ENDPOINT`、`XPERT_TEST_MINIO_ACCESS_KEY`、`XPERT_TEST_MINIO_SECRET_KEY`、`XPERT_TEST_MINIO_RESTART_CONTAINER` 及 `ARTIFACT_DRAFTS_TEST_DATABASE_URL`。这些仅是测试环境参数。数据库名必须以 `xpert_artifact_drafts_test_` 开头，重启容器必须匹配 `xpert-minio-storage-minio-<数字>`。
