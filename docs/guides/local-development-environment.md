# Xpert 本地开发环境（Linux 进程模式）

`tools/local-environment/cli.py` 在 Linux 开发机、虚拟机或现有容器中管理一个
独立的 Xpert 开发实例。PostgreSQL、Redis、pgvector 和项目 Node 按需安装
到用户目录；运行环境提供普通 Linux 进程和文件系统即可。

脚本与 Xpert 源码一起维护，负责依赖、配置、构建、迁移和实例服务管理，
在平台启动前即可使用。云电脑是其中一种使用场景，编排方法见
[云电脑使用说明](computer-local-development.md)。

## 环境与职责

- 使用普通用户、Python 3.12+、Git、Supervisor、基础 Node/Corepack 和构建工具。
- 使用持久目录中的独立源码 checkout，初始不能已有 `.env`。不复制已有平台
  的数据库、环境文件或凭据，也不接管未知端口上的服务。
- 依赖锁覆盖 Linux AMD64 和 ARM64，当前固定 PostgreSQL 17.11、pgvector
  0.8.1、Redis 7.4.7、Node 22.23.4。下载前置条件是 HTTPS 网络；缓存命中时
  仍校验 SHA-256。项目 Node 不替换镜像系统 Node。
- 调用方提供足够的内存、磁盘和构建时间，以及持久的服务进程所有者。
  脚本管理选定实例的进程，不调整主机或容器的资源限制。
- 此开发实例的 Local Shell 与 API 使用同一用户权限；适用于独立开发和
  测试，不提供多租户 Shell 隔离。

## 初始化与启动

以下变量均由调用者设置为持久绝对路径。`plugin_parent` 是允许本地加载插件
的目录；环境只使用自己生成的配置、管理员与插件存储。

```bash
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" prepare \
  --plugin-root "$plugin_parent"
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" bootstrap
```

`prepare` 用进程锁保护安装和配置发布。中断后重用已保存的初始化意图，不重新
生成密码或覆盖冲突文件。环境状态目录为 0700，私有配置与回执为 0600。
默认端口为 PostgreSQL 15432、Redis 16379、API 3000、Web 4200；可通过
`prepare` 的 `--db-port`、`--redis-port`、`--api-port`、`--web-port` 指定四个
互不重复的非特权端口。

`bootstrap` 安装锁定源码依赖、基础库和 Local Shell 插件，显式构建其
node-pty 并进行终端探测；不会全局放开依赖安装脚本。源码 revision 或依赖锁
改变后，需要重新执行 bootstrap。日志保存在私有状态目录。

默认 `managed` 模式要求调用方持有前台 Supervisor 进程。可以在一个持续
打开的终端执行以下命令，也可以交给外部进程管理器托管：

```bash
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" supervise
```

`XPERT_SUPERVISOR_READY` 只表示 Supervisor 控制通道可用。保持该进程运行，
在另一个终端或控制进程中启动、初始化和检查平台：

```bash
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" start --timeout 60
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" initialize
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" status --strict
```

启动顺序为 PostgreSQL/Redis、Web、API。首次启动可因构建耗时返回退出码 75
和 `status: pending`；它表示等待结束，后台服务仍可能运行，不能当成失败重启
或当成成功验收。重复相同服务选择的 `start` 继续等待和推进后续阶段。
数据库与 Redis 共用就绪等待预算；控制请求、数据库初始化等操作另有各自耗时，
`--timeout` 不是整个命令的硬性墙钟上限。

在允许后台进程持续运行的开发主机上，prepare 时可指定
`--supervisor-mode detached`，由 `start` 启动后台 Supervisor。短命调用进程或会清理子进程的
执行环境应使用 `managed` 并由外部持久进程托管。完整停止或主机/容器重启后，
managed 模式需重新运行 `supervise`；私有状态与数据目录保留，旧 PID 文件
不会授予新进程控制权。

## 构建与服务管理

构建回执记录源码、依赖锁和安装元数据、工具链、构建设置及产物摘要。
未跟踪源码、依赖补丁、配置变化或产物变化都会使回执失效；失败或编译期间
源码变化不能生成成功回执。Nx 声明的远程组件生成文件按产物校验，避免将正常
生成误判为并发源码变更。不支持手工修改 node_modules 后继续复用回执。

Web 使用 `development-light` 开发配置，有限编译完成后由 Angular 锁定的 Vite
预览产物并代理 API/OIDC，避免持续驻留编译器。此配置采用 JIT、关闭 source
map，不代替生产 AOT 构建检查。API 即使复用编译结果，也必须逐次执行
schema-sync apply、verify，成功后才能启动服务。

| 命令 | 行为 |
| --- | --- |
| `start --infra-only` | 只启动和验证 PostgreSQL、Redis |
| `build --service api\|web` | 单独构建并记录回执；等待编译完成后返回 |
| `status --strict` | 检查 Supervisor 身份、监听进程归属与四服务响应，未全就绪返回非零 |
| `logs --service api --lines 60` | 读取有限、脱敏日志，支持 web/bootstrap/terminal 等 |
| `restart --service api` | 重启 API，保留其他服务和数据 |
| `stop --service web` | 停止所选服务 |
| `stop` | 逆依赖顺序停止服务及 Supervisor，保留数据与缓存 |

Supervisor 控制前校验 Linux boot ID、PID/start time、cwd、命令与配置路径；
健康检查同时验证监听者属于该服务进程树。未知进程、旧代进程或被他人占用的
端口不会被接管。变更命令串行执行，status/logs 不等待长构建持有的变更锁。

## 插件部署与验证

`initialize` 通过本地 onboarding 创建独立管理员，重复调用验证已有账号。
凭据保存在私有状态目录中。需要调用部署 CLI 时，将新鲜 token 只交给子进程：

```bash
python3 "$platform_root/tools/local-environment/cli.py" \
  --platform "$platform_root" --state "$environment_state" exec --authenticated -- \
  corepack pnpm plugin:deploy:local --plugin-dir "$plugin_root" --no-keychain
```

该凭据只属于选定开发实例，不授予其他平台访问权。`platform_ready` 仅表示环境
健康；插件仍需核对实际加载版本、处理需要重启的安装结果，并执行真实功能
用例，并记录插件测试结果；环境回执不能替代插件验收。

## 测试范围

在满足环境前提并安装源码依赖后运行：

```bash
python3 -m unittest discover -s tools/local-environment -p 'test_*.py'
node --test tools/scripts/start-api.test.mjs tools/local-environment/preview-web.test.mjs
```

测试覆盖临时 Linux 进程和监听归属、下载与配置保护、构建复用、API 启动
门禁及 Web 代理。完整依赖安装、平台启动和插件功能仍需分别验证；运行测试
不自动意味着这些场景已经通过。
