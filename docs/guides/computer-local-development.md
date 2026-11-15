# 在云电脑中使用 Xpert 本地开发工具

本页说明 Coding CLI 如何使用[本地开发环境 CLI](local-development-environment.md)，
以及外层 Agent 如何安排任务。
依赖安装、构建、迁移、初始化和插件测试方法以通用文档为准；CLI 本身只依赖
Linux 环境，不调用云电脑控制 API。

## 职责分工

| 层次                    | 职责                                                   |
| ----------------------- | ------------------------------------------------------ |
| 本地开发 CLI            | 管理云电脑内的独立 Xpert 实例、配置、构建及服务健康    |
| Computer / Sandbox 能力 | 提供云电脑、资源配额、持久目录、托管进程及生命周期控制 |
| Agent 与 skills         | 安排环境准备、开发、部署、独立验收任务，处理反馈和返工 |

外层平台负责协调，内层实例作为开发和测试对象，使用自己的数据库、管理员和
插件目录。使用现有 Linux 云电脑即可；无需嵌套 Docker 或挂载宿主 Docker
socket。资源不足由外层部署调整，CLI 不更改容器隔离或配额。

## Coding CLI 自行管理服务

每个新 Project 使用自己的源码 checkout、状态目录、数据库及插件目录，只共享
依赖和构建缓存。同一 Project 的后续任务复用该实例。所有生命周期命令带上
`--project-root <project-root>`；prepare 保存绑定，后续操作拒绝旧共享实例或
其他 Project 的状态；已绑定的环境漏传该参数也会拒绝操作，不会修改已有数据来强行接管。

由 Coding CLI 调用仓库脚本自主启动、检查及停止服务：

```bash
python3 <platform>/tools/local-environment/cli.py \
  --platform <platform> --state <state> --project-root <project-root> prepare \
  --supervisor-mode detached
python3 <platform>/tools/local-environment/cli.py \
  --platform <platform> --state <state> --project-root <project-root> start
```

新环境默认使用 `detached`，由仓库脚本直接启动本地 Supervisor；已有环境可用
上述 prepare 命令显式切换后续启动方式，保留原有数据库、凭据和端口。
Coding CLI 也可按项目需要使用自己的后台进程或终端会话，并检查状态与日志。
这些服务可能在当前任务结束或取消时被执行器清理，不承诺跨任务保活。
`sandbox_service_start` 是宿主 Assistant 工具，不是云电脑 shell 命令，本流程
不依赖它，也不需要独立的云电脑服务管理器或续期机制。

进程已启动不代表平台已就绪。仍需执行通用文档中的 initialize 和 status 验证实例。
`status: pending` / 退出码 75
表示等待预算用尽；检查状态与有限日志后，重复相同服务选择的 start 推进
剩余阶段，不因等待超时直接 restart，也不把 pending 当成验收完成。

## 分任务与交接

环境操作可由 `xpert-platform-local-environment` skill 提供指导，插件实现、
打包和测试可使用 `xpert-plugin-development` skill。Agent 根据任务需要分配
prepare/bootstrap、服务启动与初始化、开发部署、独立验收和返工任务；这些
流程约定不进入本地 CLI 的平台业务逻辑。

跨任务保存源码路径、状态目录、启动命令、日志和检查结果。独立验收者先检查
同一实例，服务已停止时自行 start，并重新检查健康；不重新开发、换包或创建
新数据库。会话结束后进程停止本身不是候选失败。`platform_ready` 只说明环境健康，插件仍需核对实际加载版本
并运行功能用例。部署凭据通过内层实例的 `exec --authenticated` 交给子进程，
不把密码或 token 写入任务报告，也不借用外层平台凭据。

浏览器在云电脑内访问自己的 localhost；外部预览由外层能力另行提供授权转发。
内层 Local Shell 与 API 共用开发用户权限，不代表生产多租户隔离。

完整 stop 或云电脑重建后，由 Coding CLI 重新 start，保留项目的持久数据。
开发和验收结束时用 stop 停止实例服务，保留持久数据；取消和空闲回收仍遵循
Computer 与执行器原有规则，不为开发服务绕过清理。
