# MinIO / S3 存储基础与联合验收

> 本文为 2026-11-05 第一阶段验收记录。后续 ArtifactContent 底层存储已调整为使用系统 FileStorage Provider，见 [Artifact 内容存储与联合验收](artifact-content-storage.md)。普通 POSIX 工作目录没有整体迁移。

## 结论与修复范围

此变更修复 FileStorage 的私有桶浏览器签名地址、统一上传 Content-Type、签名 TTL 边界、匿名公开 URL 的 key 编码，以及更改默认 provider 后仍读取旧租户设置缓存的问题。它没有将 POSIX Workspace 改为对象存储，不能据此宣称 Artifact、数据集和后台任务已全面使用 MinIO。

新增 `signedUrlEndpoint` 与现有 `endpoint` 分离：前者在签名时参与 Host 签名，后者用于服务端读写。保留 `publicUrl` 的显式匿名公开语义。S3 兼容配置仍由现有插件配置边界解析，未在业务服务增加 env 读取。

`IFileStorageProvider.putFile(bytes, key, { contentType })` 增加可选元数据参数；旧 provider 的两参数实现仍兼容。统一上传和配额包装器传递该参数，S3 写入对象元数据，旧 multipart multer-s3 使用其内容类型检测。put 成功后直接按输入字节计算 size，避免第二次 HEAD 失败把已完成写入误报为失败。

真实登录上传发现：保存 `fileStorageProvider` 后，middleware 的五分钟缓存仍持有旧 provider。现在数据库保存成功后使当前租户缓存失效；真实 HTTP 已验证预热 LOCAL 缓存、保存 MINIO、立即上传到 MinIO。缓存删除失败时请求报错，数据库保存可能已完成；多实例部署仍应使用共享缓存，本次只验证单 API 实例。

## 当前字节路径

| 入口                                  | 实际路径/持久化                                                                                   | MinIO 配置的影响                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| FileStorage / StorageTargetStrategy   | provider `putFile`；StorageFile 记录 provider + key                                               | MINIO/S3 provider 的对象可进入私有桶                      |
| WorkspaceFiles `uploadBuffer`         | UploadFileCommand → volume target → VolumeHandle                                                  | 无；仍是本地 POSIX 文件                                   |
| WorkspaceFiles `readBuffer` / appData | VolumeSubtreeClient / VolumeWorkspaceStorage；原子写、文件锁、包含关系与 symlink 检查             | 无                                                        |
| ArtifactContent                       | VolumeWorkspaceStorage 下 `.apps/artifact_content/<artifactId>/<sha256>`；单次 Buffer 最大 50 MiB | 无；受保护内容与发布权限仍由平台检查                      |
| ArtifactDraft / ArtifactVersion       | PostgreSQL 元数据、便携 Workspace 引用、内容摘要；发布时重验内容                                  | 无；portable 引用不是对象存储开关                         |
| 受控文件预览/下载                     | 授权 grant → 本地文件路径 → createReadStream，支持 Range/HEAD                                     | 无；这条 HTTP 下载已有流式读取                            |
| Artifact 分享                         | ArtifactLink 固定/latest 版本、授权和撤销检查 → Volume 字节                                       | 无；直接对象签名不能代替可撤销分享                        |
| Analytics 文件 provider               | 插件经 WorkspaceFiles resolveFile/readBuffer 取得完整 Buffer，再送解析 worker                     | 本次仅源码确认；外部插件真实查询留给联合验收              |
| Sandbox / 后台文件任务                | 持久化 Workspace 引用；执行时读取 Buffer 或解析只读 hostPath 挂载                                 | 对象存储不能代替 POSIX 挂载；worker 必须能访问同一 Volume |

对象 key 是内部定位符，FileStorage API/平台 ACL 才负责租户、组织和用户授权。统一上传的默认 key 含 tenant；受信任服务端自定义同名 key 属于覆盖语义，组织级 bucket/前缀配置不能代替业务授权。

## 大文件和迁移约束

统一上传源、WorkspaceFiles 和 ArtifactContent SDK 仍使用完整 Buffer；MinIO provider 的 getFile/putFile 也不是流式 SDK。只验证了小文件语义，没有进行容量或内存压力认证。现有 Analytics 文件插件的输入限制为 8,000,000 bytes，ArtifactContent 为 50 MiB；ZIP 消费方还须限制总解压大小、条目数、压缩比和并发 Buffer 数。

本次没有新增 Runtime Capability 或分片协议：尚无经过确认、超出现有 Buffer 限制的 Live Dashboard 外部消费契约。大文件支持需要明确大小、取消、重试、摘要、配额与失败清理要求后再实现，不能把 provider 的 multipart SDK 支持当成平台端到端流式支持。

ZIP 只携带逻辑资源 ID、相对条目、内容摘要、固定版本依赖。禁止携带源 bucket、endpoint、签名 URL、绝对路径、源系统用户/租户授权。导入时使用目标侧可信 scope，经 WorkspaceFiles / ArtifactContent / Artifacts SDK 重建文件与 Artifact 身份；版本 ID 必须重映射。公共模板、公开数据集和 ZIP 业务由 Live Dashboard 实现，本变更不修改其仓库。

## 本次验证矩阵（2026-11-05）

基线为 `origin/main` 的 `ccd75aab78aa717402109e15573f9d33d0ba5339`，工作分支 `fix/minio-storage-foundation`。同步成功，未复制源工作区的未提交修改。

| 场景                                                                                  | 结果                    | 证据层级与限制                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 配置、签名 endpoint、region、TTL、key 编码                                            | 12 项通过               | provider 单元与配置边界测试；虚拟主机/TLS 仅 URL 生成                                                                                                                  |
| 私有 MinIO put/get、MIME、UTF-8 名称与大小、匿名拒绝、签名篡改/过期、重启、重复删除   | 5 项通过                | 真实 MinIO `RELEASE.2023-03-20T20-16-18Z`；独立私有桶，测试后清理                                                                                                      |
| 统一上传到 MinIO、不同 tenant key、路径穿越拒绝                                       | 1 项通过                | 真实生产 StorageTargetStrategy + MinIO；StorageFile 元数据持久化为测试替身，非登录 HTTP E2E                                                                            |
| 租户设置缓存、保存失败及保留策略授权                                                  | 26 项通过               | 3 个新失效测试 + 23 个原有 retention/middleware 测试                                                                                                                   |
| 真实登录上传、签名读取和删除                                                          | 通过                    | 正常初始化管理员与组织；真实 StorageFile PostgreSQL 记录、私有 MinIO 字节/MIME；未登录删除 401、跨组织上下文删除 403；默认改回 LOCAL 后仍删除原 MINIO 对象，旧链接 404 |
| 配额包装、上传边界、StorageFile 删除授权                                              | 24 项通过               | server 单元测试，包含元数据透传和租户/组织/用户检查                                                                                                                    |
| Workspace SDK、ArtifactContent、固定版本/可撤销分享、Artifact 授权、Analytics Runtime | 91 项通过，1 项原有跳过 | 本地真实文件 + 测试 repository/授权依赖；Analytics 是宿主契约测试，未调用外部文件解析插件                                                                              |
| 受控文件 grant、过期/撤销与下载文件名                                                 | 36 项通过               | 单元测试；因无关 TS2589，执行时仅忽略该诊断，未修改仓库 TS 配置；不等同真实浏览器 HTTP 预览                                                                            |
| Artifact 草稿发布/固定历史/并发/隔离/回滚/删除                                        | 17 项通过               | 真实独立 PostgreSQL 和 POSIX 文件；标准 ts-jest 类型检查通过                                                                                                           |
| provider TypeScript、平台库及 API 构建                                                | 通过                    | provider `tsc --noEmit`；源码启动流程完成库/API 构建及 schema apply/verify                                                                                             |
| API/Cloud 健康与进程归属                                                              | 已验证 HTTP 200         | 独立 worktree 进程；缓存健康报告为 memory，未宣称 Redis 业务队列验收                                                                                                   |
| 浏览器界面预览、文件数据集实际查询、跨客户 ZIP                                        | 尚未验收                | 签名链接以 HTTP 客户端验证；未进行 UI 操作或部署外部 Analytics/Live Dashboard 插件                                                                                     |

受控文件测试使用的临时运行选项为 `--globals '{"ts-jest":{"diagnostics":{"ignoreCodes":[2589]}}}'`，原因是现有 `thread-run-control.service.ts` 的 TypeORM 深度推导；生产平台构建通过。没有把这一诊断处理描述为完整测试类型检查通过。

对象存储写入与 StorageFile 数据库记录不是跨系统事务；元数据保存失败的孤立对象恢复仍需部署侧对账。对象 URL 绑定 key，覆盖同 key 可改变旧 URL 读到的内容；固定内容承诺应使用 Artifact 版本及摘要验证，不能直接重用对象 URL。

## 可复现验证

在独立 checkout 按仓库规则执行状态检查、`git pull --ff-only`、`corepack pnpm install --frozen-lockfile`，首次执行 `corepack pnpm bootstrap`。使用 Node 22；本次 Node 24 的 isolated-vm 原生编译失败。Node 22.23 的 Jest TS 配置需 `NODE_OPTIONS=--no-experimental-strip-types`。

真实 MinIO 测试仅由以下环境变量启用，凭据通过测试执行环境安全注入，禁止写入报告：

- `XPERT_TEST_MINIO_ENDPOINT`：服务端测试地址。
- `XPERT_TEST_MINIO_SIGNED_ENDPOINT`：浏览器可达测试地址；本次验证不同主机名指向相同服务。
- `XPERT_TEST_MINIO_ACCESS_KEY` / `XPERT_TEST_MINIO_SECRET_KEY`。
- `XPERT_TEST_MINIO_RESTART_CONTAINER`：只允许 `xpert-minio-storage-minio-<数字>` 独立容器名。
- `ARTIFACT_DRAFTS_TEST_DATABASE_URL`：专用 PostgreSQL 数据库，名称须以 `xpert_artifact_drafts_test_` 开头。

```bash
corepack pnpm exec jest --config packages/plugins/draft/jest.config.ts --runInBand
corepack pnpm exec jest --config packages/server/jest.config.ts --runInBand --runTestsByPath \
  packages/server/src/file/file-upload/strategies/storage-minio.integration.spec.ts \
  packages/server/src/file/file-upload/strategies/storage-target.strategy.spec.ts \
  packages/server/src/file/file-storage/file-storage-quota.policy.spec.ts \
  packages/server/src/storage-file/storage-file.service.spec.ts \
  packages/server/src/tenant/tenant-setting/tenant-setting-storage.spec.ts \
  packages/server/src/tenant/tenant-setting/tenant-setting-retention.spec.ts \
  packages/server/src/tenant/tenant-setting/tenant-settings.middleware.spec.ts
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand --runTestsByPath \
  packages/server-ai/src/artifacts/drafts/artifact-drafts.integration.spec.ts
```

自动化测试创建随机专用 bucket，finally 删除其对象和 bucket；PostgreSQL fixture 创建独立 schema 并清理。本次补齐旧草稿测试 fixture 的类型绑定与新增依赖，不放宽生产授权。

真实 HTTP 验收通过正常登录、全局插件配置和租户设置 API 执行，不直接插入用户或伪造 token。凭据仅保存在受限本地文件；HTTP 结果摘要与执行脚本保留在独立环境目录。可复现顺序：预热 LOCAL 设置 → 保存 MINIO → `/api/files/upload` 上传 CSV → 检查对象和签名读取 → 未登录/其他组织删除被拒绝 → 默认设为 LOCAL → `/api/storage-file/:id` 删除 → 原签名返回 404。

## 合并与联合验收

1. 先合并本平台提交，构建 SDK、server 和 draft provider，重启目标 API。没有数据库迁移和新增依赖。
2. 在目标组织运行对应 provider，配置私有 bucket、服务端 endpoint、可达的 signedUrlEndpoint、region、path-style 和短 TTL；保持 TLS 验证。
3. 确认 API/worker/sandbox 的持久 Volume 仍有效。不要删除旧 Volume 或假定内容已迁移到 MinIO。
4. 合并 Live Dashboard 业务，再通过已认证真实入口验证模板复制、公开数据集查询、固定版本分享、撤销、跨客户 ZIP 导入与身份重建。
5. 至少用两个租户/组织验证管理 API 与公开链接隔离，导入重试不能重复发布或复用源权限；故障后清理仅删除本次创建的资源。

签名有效期上限与 Host 签名约束依据 [AWS SigV4 查询签名规范](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html)。凭据提前失效或服务端策略仍可缩短实际访问时间。

S3 云厂商、TLS 反向代理、跨节点共享 Volume、大文件容量、已安装 Live Dashboard 文件查询和完整跨客户迁移均需部署侧联合验收。虚拟主机 URL/区域/TLS 配置目前只有单元验证；真实 MinIO 使用 HTTP、path-style、私有桶。

## 隔离环境与清理

保留的 Compose project 为 `xpert-minio-storage`；测试服务只绑定 loopback：MinIO 19000/19001、PostgreSQL 55439、Redis 16389。平台目标端口为 API 13000、Cloud 14200。环境凭据、Compose 文件和原始日志保存在不入库的环境目录，提交不包含个人机器路径或凭据。

停止本任务源码进程用其终端 Ctrl-C。仅在独立环境目录执行 `docker compose -p xpert-minio-storage -f compose.yml down`，保留 volumes；确认不再需要数据后才使用 `down -v`。禁止对默认 project 或其他任务执行清理。自动化随机桶已销毁；HTTP 验收文件和对象已删除，保留空的 `xpert-http-storage-test` 桶供已初始化实例继续使用。若运行中断，只清理该次报告对应的 `xpert-storage-test-*` / `xpert-upload-test-*` 桶，不能按通配符批量清理其他任务数据。
