# 数据库同步与 SQL 迁移

采用分表混合方式，复用现有 `schema-sync` 部署任务和 TypeORM 0.3 的 `MigrationExecutor`。

- 普通表：修改 Entity，部署任务调用 TypeORM `synchronize()`。
- SQL 管理的表：在 `.deploy/api/database-migrations.json` 的 `managedTables` 中明确登记，整张表退出自动同步；后续字段、索引、约束变更都写迁移。
- 开发和生产 API 均关闭启动时的结构同步、自动迁移和 schema 删除。即使未设置 `DB_SCHEMA_SYNC_MODE` 或设置为 `internal`，也不会绕过 SQL 表保护。插件已有的受限同步继续保留，与宿主共用 PostgreSQL 锁。

没有新增独立迁移服务、实体快照或通用发布清单系统。事务、成功记录和重复执行判断由 TypeORM 完成；少量适配代码负责 SQL 文件加载、表归属、校验值和共享锁。

## 开发方式

本地使用 `corepack pnpm start:api`（或 `start:api:dev` / `start:api:debug`）启动时，每次都会先构建依赖库与 API/SQL 资源，再依次执行 `schema-sync --action apply`、`schema-sync --action verify`，通过后才启动本次构建的 API。构建、升级、校验任一步失败，API 均不会启动；nodemon 保留错误输出，修复后输入 `rs` 重试。

Entity、SQL、迁移清单等受监听源码变化触发重启时，也会重新执行整个流程。停止/重启会先终止上一轮子进程；生成的 `dist` 不触发循环重启。调试入口同样经过升级校验，仅最终 API 打开本机 `127.0.0.1:9229` 调试端口。

只升级和校验、不启动 API 时运行：

```bash
corepack pnpm schema:sync
```

这些本地入口使用开发环境配置，目标数据库与 API 相同，请先确认 `.env`。普通表仍由独立升级命令自动同步；不要打开 API 的全局 `synchronize`，否则 TypeORM 会删除 SQL 维护的约束。直接运行 `node dist/apps/api/main.js` 或 `nx serve api` 不包含上述编排；本地联调应使用 `start:api`，生产继续使用下方部署任务。

普通表不必手写迁移。需要特殊约束、索引或数据转换时，在所属模块的 `migrations/` 中添加：

```text
migrations/
  component.json
  20261021100000-add-order-rule.sql
  checks/20261021100000-add-order-rule.sql
```

`component.json` 声明稳定组件身份：

```json
{ "schemaVersion": 1, "component": "core.example" }
```

新脚本采用 UTC 的 14 位时间戳及小写英文描述。模块已接入后，新增规范 SQL 会随 API 的现有 assets 构建自动打包，无需逐条登记。普通 SQL 默认在自动同步后执行；新建 SQL 表若被普通表引用，先建立表和主键：

```sql
/* xpert-migration
{
  "phase": "before-sync",
  "mode": "transactional",
  "dependsOn": []
}
*/
CREATE TABLE example_order (id uuid PRIMARY KEY);
```

`phase` 只有 `before-sync` 和 `after-sync`。依赖使用完整 ID（组件名加不含扩展名的文件名），必须存在且排在当前迁移之前。跨表外键可放到 `after-sync`，避免空库时引用尚未创建的普通表。

SQL 不包含 `BEGIN/COMMIT`，由 TypeORM 以每个迁移一个事务执行。不支持 `CREATE INDEX CONCURRENTLY` 等非事务脚本。后置检查应是只读 SELECT，返回零行表示通过，失败行只有 `missing` 标识列，不返回业务数据。

`.deploy/api/database-migrations.json` 的 `checks` 是当前发布必须满足的 SQL 结构要求。后续迁移合法改变结构时更新这些检查，不修改历史迁移及其后置检查。已登记迁移的校验值变化会停止部署。

## 部署

继续使用现有命令：

```bash
node main.js --command schema-check
node main.js --command schema-sync
node main.js --command schema-sync --action verify
```

`schema-check` 只检查镜像中 SQL 资源能否完整加载。`schema-sync` 在同一个持锁连接上执行：基础 SQL → 普通表同步 → 其余 SQL 迁移 → 当前结构验证。任何一步失败都返回非零状态，installer 不继续更新 API。部署和 API 健康检查只使用目标镜像中的 SQL，不从部署机器源码补跑 Pipeline 文件。

Compose 的迁移任务与 API 共用镜像、环境配置、插件和数据挂载。单个插件导入或注册失败时，沿用 API 的故障隔离：由加载器记录错误，保留同组成功插件的模块与实体并继续迁移；不卸载插件、不修改其安装配置。失败插件未加载的实体表由 TypeORM 保留，不自动删除或同步，修复该插件后重新运行 `schema-sync` 才会更新它们。

这不等于忽略所有启动错误：插件列表读取失败、无法返回注册结果的整组发现异常、插件初始化超时仍会中止迁移；成功插件若引用缺失实体，TypeORM 元数据初始化失败也会阻止 DDL。数据库连接、SQL 基线、迁移和结构验证继续严格检查，未通过则不更新 API。

锁键为 `(1481658964, 1)`；宿主、遗留插件同步和 installer 的 Computer 迁移共用。锁等待 60 秒，单条语句 300 秒。数据库断开或进程结束后，由 PostgreSQL 释放会话锁，不使用 Redis TTL 判断 DDL 是否结束。

TypeORM 的 `xpert_schema_migrations` 记录成功迁移。`xpert_schema_migration_checksums` 在同一事务保存校验值和 SQL 表归属；它不是另一套迁移执行历史。重复部署跳过成功 SQL，包括后来补入的较早时间戳迁移。SQL 失败时 DDL、数据变更和成功记录一起回滚；再次部署只补跑未成功项。

普通表自动同步本身可能执行删列或改类型，发布前应审查 Entity 变更并使用代表性数据验证。SQL 管理表不会被自动同步修补；实际结构漂移会使验证失败，不能靠重放已成功 SQL 掩盖问题。应用回退不自动运行迁移的 `down`。

## 既有数据库接管

已有 SQL 表却没有迁移历史时，普通部署返回 `BASELINE_REQUIRED`。先核对结构和历史数据转换证据，再运行：

```bash
node main.js --command schema-sync --action baseline
node main.js --command schema-sync
node main.js --command schema-sync --action verify
```

`baseline` 只验证并登记配置中明确列出的接管集合，复用 TypeORM 的 fake migration 能力，不重放旧数据转换。检查失败则接管记录回滚，需要针对该旧版本编写补齐迁移或完成历史转换，不能直接伪造成功记录。

接管旧库的兼容检查由清单中的 `baselineChecks` 明确声明，与不可修改的历史迁移后置检查分开。当前集合包含平台结构、类型和历史转换证据检查；不能传空集合。未声明时仍使用原有基线迁移后置检查。兼容规则只影响旧库接管和当前结构校验，新库执行 SQL 后仍使用该迁移原有后置检查与校验值。

已确认可保留的旧结构只有：15 张 Pipeline 表的 `tenantId` / `projectId` 更强的非空约束、这些表 `deletedAt` 的带时区时间类型，以及 3 张 Assistant 模板表 ID 的 `uuid_generate_v4()` 默认函数。这些差异逐字段列在 `current.sql` 中，不全局放宽类型、非空或默认值检查，也不改写旧时间值。

名称不同的约束和索引仍需核对定义、有效性及验证状态，再通过显式修复对齐；真实缺失的约束和索引必须补齐。修复在共享迁移锁和事务中执行，全部接管检查通过才提交。旧库存在已关闭但缺少到期时间的调用活动时，沿用历史迁移的 `updatedAt + interval '30 days'` 规则补齐 `expiresAt`，不重启调用或重放工具。其余历史证据异常仍阻止接管。

本地启动遇到 `BASELINE_REQUIRED` 同样会停止，不会自动尝试接管。核对并备份旧库后，可显式运行 `corepack pnpm schema:baseline`：构建 → baseline → apply → verify，通过后重新运行 `start:api`。若出现 `SCHEMA_VERIFICATION_FAILED`，说明旧库结构或历史转换证据与基线不符，必须先针对差异修复；重复启动或重复 baseline 不能补齐这些差异。

ModelExecution 的调用可能在派发前失败，因此 `dispatchedAt=NULL` 本身不代表遗漏历史转换。接管保留正常的待派发、预检失败和未派发恢复记录；若同时存在成功、待结算、用量或扣费证据，则仍阻止接管并要求核对，不自动补写派发时间。

当前 SQL 基线覆盖 55 张既有表；另外 5 张向量表及 5 张内容文档表由新增 SQL 创建，其余未登记的实体表仍由 TypeORM 同步。基线来源与 38 个历史 SQL 的哈希保存在 `platform-baseline/legacy-inventory.json`。原有 8 位日期脚本是历史参考，部署不再次执行；新增脚本使用 14 位格式。基线包含旧数据转换的必要条件，不能仅凭表存在就自动接管。

## 内容文档表部署与应急修复接管

内容文档的 5 个实体必须同时注册在 `ALL_AI_ENTITIES`，供独立 schema-sync 和 API 元数据初始化使用。仅在 NestJS 模块中调用 `TypeOrmModule.forFeature()` 不会把实体加入独立同步任务。

`content_document`、`content_revision`、`content_proposal`、`content_comment`、`content_location_change` 由 `ai.content-documents.20261025020000-content-document-tables` SQL 迁移管理，已加入 `managedTables`。不要只补 Entity 注册后对这些表开启自动同步：必须保留租户、组织非空约束、外键、修订/提案幂等键，以及排除 deleted 文档的路径唯一索引。

旧的 `20261021_content_documents.sql` 保留为历史参考。规范迁移在普通实体同步之后创建表及外键，并在每次部署验证全部字段类型、空值约束、主键、外键和业务索引。旧表中的空租户、空组织或缺失必需字段会阻止迁移，需要单独核对数据，不自动填充归属。

若已有迁移历史的生产库因缺表执行过历史 SQL 应急建表，后续正常运行 `schema-sync` 即可：新迁移的建表/索引操作可重复执行，验证通过后由迁移执行器登记成功，保留原行与 ID。不要手工写入迁移历史或校验值。完全没有迁移历史的旧库仍按上面的 `baseline → apply → verify` 流程接管。

应急操作先备份 schema，使用失败即退出的 SQL 客户端，在事务内获取共享锁 `(1481658964, 1)` 并设置锁等待/语句超时；先试跑回滚，再提交并核对结构。已修复数据库无需重启 API。结构与文件归属查询验证不替代 Bid 助理的实际业务验收。

## 验证与边界

```bash
node --test tools/scripts/start-api.test.mjs
node tools/scripts/test-schema-migrations.cjs
node --test .deploy/api/health-diagnostics.test.cjs .deploy/api/schema-compose.test.cjs
node .deploy/api/check-image.cjs <已构建的镜像ID>
```

数据库测试使用并清理独立 PostgreSQL 容器，缺少 Docker 会失败。覆盖普通表自动演进、SQL 表保护、跨表外键、重复及并发执行、较早编号补入、事务失败、校验值、已有库接管和完整宿主 Pipeline 约束检查。内容文档回归还覆盖缺表安装、应急修复后接管与数据保留、真实 Repository 读取、文件归属保护、路径唯一性、删除后路径复用及结构漂移阻断。

旧库验收通过原有 Entity 同步与 38 个哈希固定的历史 SQL 独立重建结构，不使用新基线建库再删除历史。加入真实外键约束下的待派发、失败、成功和待结算调用，验证 `BASELINE_REQUIRED → baseline → apply → verify`、异常证据回滚、重复升级及所有调用字段保持不变。开发和生产 API 初始化后再验证 SQL 约束，防止启动路径重现结构破坏。该夹具覆盖已完成这 38 个历史脚本的旧部署，未补齐历史迁移的更早数据库仍需先修复并通过基线检查。

镜像检查使用临时 PostgreSQL 和 Redis，依次验证打包后的同步迁移、只读校验、API 启动与健康状态，不连接现有业务库。

本次按用户确认的范围完成现有同步入口的迁移补充。原计划中的插件任意 SQL 安装、非事务恢复、长数据任务治理、独立 plan/status CLI 和完整发布清单不在本次实现范围。目标生产环境和各受支持旧版本的业务验收仍需单独进行。
