# 本地开发实例的检查点与恢复

`tools/local-environment/cli.py checkpoint` 为
[Linux 本地开发实例](local-development-environment.md)提供部署失败后的状态恢复。
恢复直接处理本地文件和 PostgreSQL 工具，不依赖 API 能够启动。

该操作替换整个实例的应用状态，只适用于调用者已获授权、且由单一项目独占的
开发实例。`--exclusive-project` 是记录独占使用范围的标签，要求与创建时一致；
它不调用 Project API，不检查平台项目权限，也不会授予访问权。共享实例应采用
针对具体变更的修复方式。

## 使用流程

部署前，在四个服务均健康时创建检查点：

```bash
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" \
  checkpoint create --name before-install --exclusive-project "$project_id"
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" start
```

create 停止本实例服务、确认 PostgreSQL 干净关闭，再复制并校验状态。
Supervisor 保持运行；成功后服务仍停止，需要 start。已有同名检查点不会覆盖。
复制失败的临时文件保留供检查，不发布为可恢复检查点。

部署失败需要恢复时，使用原名称和独占范围：

```bash
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" \
  checkpoint restore --name before-install --exclusive-project "$project_id"
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" start
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" \
  checkpoint verify --name before-install --exclusive-project "$project_id"
```

start 返回 75 / pending 时，按通用启动说明继续相同的 start。没有预先创建的
检查点时，恢复命令不能补出过去的状态。

## 覆盖范围和一致性

| 内容 | 处理方式 |
| --- | --- |
| `postgres`、`redis`、`data`、`public`、`plugins`、`templates` | 保存和恢复整个目录；恢复前的状态另外保留 |
| 源码、构建输出、sandbox 工作区、日志、凭据、进程身份 | 保留原位置，不从检查点覆盖 |
| 配置、凭据、Git HEAD、依赖锁、运行时标记 | 与创建时绑定；变化后拒绝应用原检查点 |
| 外部状态路径及特殊文件 | 拒绝复制；插件指向同一 checkout 的宿主依赖链接可保留，复制时不跟随链接 |

restore 先确认检查点内容及绑定一致，停止自有服务，检查端口及 PostgreSQL
数据目录没有仍在运行的服务，再准备副本。它不会停止未知进程，也不会自动
接受被重新初始化的数据库。目录和文件摘要覆盖内容、类型和权限。

恢复将当前状态保留到检查点下的私有 `restores/<operation>/before`，然后逐个
替换目录。CLI 的环境操作锁防止并行管理命令冲突，恢复日志记录各目录进度。
进程中断后，重复**同一个恢复命令**续接；如果已恢复目录又被写入，或当前状态
与日志不符，则报告冲突并保留现场。

存在 `restore-pending.json` 时，普通变更命令及服务启动入口拒绝启动部分恢复
的实例，status 也不会报告 platform_ready。status、logs 和修复所需的 exec
仍可使用；它们不授予跳过恢复检查的权利。

## 结果和后续检查

- `checkpoint_created`：冷检查点已发布，服务保持停止。
- `state_restored`：文件恢复完成，保留旧状态路径，服务保持停止。
- `environment_recovered`：重新启动后四个服务健康，数据库 system identifier
  与检查点一致；不代表插件功能验收通过。
- `not_ready` / `identity_mismatch`：环境尚未恢复到可确认状态，verify 返回非零。

所有成功结果中的 `acceptancePassed` 都为 false。调用者仍需核对实际加载的
插件版本并执行真实功能用例；源码修复和未提交编辑不会被恢复操作撤回。

检查点、旧状态和复制失败的临时目录含实例私有数据，并占用额外磁盘。工具
没有后台轮询或自动删除任务；保留和清理由实例维护者决定。这是同一环境的
本地恢复机制，不是跨机器备份。

## 验证

基础回归使用临时文件模拟部署后的变化，覆盖复制/替换中断、续接、冲突、
链接边界、数据身份以及启动保护：

```bash
cd tools/local-environment
python3 -B -m unittest test_checkpoints test_environment test_waiting test_builds
```

真实 PostgreSQL 测试以非 root 用户运行，所有数据创建在新的临时目录中。
环境变量只指定 PostgreSQL 二进制目录，不接受现有数据库地址或数据目录：

```bash
XPERT_CHECKPOINT_PG_BIN=/path/to/postgresql/bin \
  python3 -B -m unittest test_checkpoints_postgres
```

该测试检查恢复前后真实表数据、数据库身份和插件文件。API、Redis、Web 健康
探测使用替身；完整 Xpert 重启和插件业务验收须另外执行。
