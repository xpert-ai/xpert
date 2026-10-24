# 数据库同步与 SQL 迁移

采用分表混合方式，复用现有 `schema-sync` 部署任务和 TypeORM 0.3 的 `MigrationExecutor`。

- 普通表：修改 Entity，部署任务调用 TypeORM `synchronize()`。
- SQL 管理的表：在 `.deploy/api/database-migrations.json` 的 `managedTables` 中明确登记，整张表退出自动同步；后续字段、索引、约束变更都写迁移。
- 开发和生产 API 均关闭启动时的结构同步、自动迁移和 schema 删除。即使未设置 `DB_SCHEMA_SYNC_MODE` 或设置为 `internal`，也不会绕过 SQL 表保护。插件已有的受限同步继续保留，与宿主共用 PostgreSQL 锁。

没有新增独立迁移服务、实体快照或通用发布清单系统。事务、成功记录和重复执行判断由 TypeORM 完成；少量适配代码负责 SQL 文件加载、表归属、校验值和共享锁。

## 开发方式

开发环境修改 Entity 或 SQL 后，也先执行下方 `schema-sync` 命令，再启动 API。普通表仍由该命令自动同步；不要打开 API 的全局 `synchronize`，否则 TypeORM 会删除 SQL 维护的约束。

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

ModelExecution 的调用可能在派发前失败，因此 `dispatchedAt=NULL` 本身不代表遗漏历史转换。接管保留正常的待派发、预检失败和未派发恢复记录；若同时存在成功、待结算、用量或扣费证据，则仍阻止接管并要求核对，不自动补写派发时间。

当前 SQL 基线覆盖 55 张既有表；另外 5 张向量表由新增 SQL 创建，其余实体表仍由 TypeORM 同步。基线来源与 38 个历史 SQL 的哈希保存在 `platform-baseline/legacy-inventory.json`。原有 8 位日期脚本是历史参考，部署不再次执行；新增脚本使用 14 位格式。基线包含旧数据转换的必要条件，不能仅凭表存在就自动接管。

## 验证与边界

```bash
node tools/scripts/test-schema-migrations.cjs
node --test .deploy/api/health-diagnostics.test.cjs .deploy/api/schema-compose.test.cjs
node .deploy/api/check-image.cjs <已构建的镜像ID>
```

数据库测试使用并清理独立 PostgreSQL 容器，缺少 Docker 会失败。覆盖普通表自动演进、SQL 表保护、跨表外键、重复及并发执行、较早编号补入、事务失败、校验值、已有库接管和完整宿主 Pipeline 约束检查。

旧库验收通过原有 Entity 同步与 38 个哈希固定的历史 SQL 独立重建结构，不使用新基线建库再删除历史。加入真实外键约束下的待派发、失败、成功和待结算调用，验证 `BASELINE_REQUIRED → baseline → apply → verify`、异常证据回滚、重复升级及所有调用字段保持不变。开发和生产 API 初始化后再验证 SQL 约束，防止启动路径重现结构破坏。该夹具覆盖已完成这 38 个历史脚本的旧部署，未补齐历史迁移的更早数据库仍需先修复并通过基线检查。

镜像检查使用临时 PostgreSQL 和 Redis，依次验证打包后的同步迁移、只读校验、API 启动与健康状态，不连接现有业务库。

本次按用户确认的范围完成现有同步入口的迁移补充。原计划中的插件任意 SQL 安装、非事务恢复、长数据任务治理、独立 plan/status CLI 和完整发布清单不在本次实现范围。目标生产环境和各受支持旧版本的业务验收仍需单独进行。
