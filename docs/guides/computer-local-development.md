# 在云电脑中使用 Xpert 本地开发工具

本页说明外层 Agent 如何编排[本地开发环境 CLI](local-development-environment.md)。
依赖安装、构建、迁移、初始化和插件测试方法以通用文档为准；CLI 本身只依赖
Linux 环境，不调用云电脑控制 API。

## 职责分工

| 层次 | 职责 |
| --- | --- |
| 本地开发 CLI | 管理云电脑内的独立 Xpert 实例、配置、构建及服务健康 |
| Computer / Sandbox 能力 | 提供云电脑、资源配额、持久目录、托管进程及生命周期控制 |
| Agent 与 skills | 安排环境准备、开发、部署、独立验收任务，处理反馈和返工 |

外层平台负责协调，内层实例作为开发和测试对象，使用自己的数据库、管理员和
插件目录。使用现有 Linux 云电脑即可；无需嵌套 Docker 或挂载宿主 Docker
socket。资源不足由外层部署调整，CLI 不更改容器隔离或配额。

## 托管服务

先在持久目录中准备独立源码 checkout，按通用文档执行 prepare 和 bootstrap。
prepare 使用默认 `managed` 模式。Coding CLI 任务结束时执行器会回收其
子进程，因此需要由协调 Assistant 使用外层 **`sandbox_service_start` 工具**
持有 Supervisor，而不是在任务中通过 nohup 或 detached 模式保活。

```json
{
  "name": "xpert-development-control",
  "command": "python3 <platform>/tools/local-environment/cli.py --platform <platform> --state <state> supervise",
  "cwd": "<platform>",
  "readyPattern": "XPERT_SUPERVISOR_READY"
}
```

将占位符替换为所选持久绝对路径，并保存工具返回的服务 ID。若路径包含空格
等 Shell 特殊字符，按 Shell 参数规则引用路径。该工具调用属于外层编排；
CLI 的 `supervise` 入口同样可以由其他持久进程管理器运行。

就绪标记仅表示 Supervisor 控制通道可用。随后由有限 Coding CLI 任务执行
通用文档中的 start、initialize 和 status。`status: pending` / 退出码 75
表示等待预算用尽；检查状态与有限日志后，重复相同服务选择的 start 推进
剩余阶段，不因等待超时直接 restart，也不把 pending 当成验收完成。

## 分任务与交接

环境操作可由 `xpert-platform-local-environment` skill 提供指导，插件实现、
打包和测试可使用 `xpert-plugin-development` skill。Agent 根据任务需要分配
prepare/bootstrap、服务启动与初始化、开发部署、独立验收和返工任务；这些
流程约定不进入本地 CLI 的平台业务逻辑。

跨任务保存源码路径、状态目录、托管服务 ID 和检查结果。CLI 状态与回执用于
重新检查同一环境；`platform_ready` 只说明环境健康，插件仍需核对实际加载版本
并运行功能用例。部署凭据通过内层实例的 `exec --authenticated` 交给子进程，
不把密码或 token 写入任务报告，也不借用外层平台凭据。

浏览器在云电脑内访问自己的 localhost；外部预览由外层能力另行提供授权转发。
内层 Local Shell 与 API 共用开发用户权限，不代表生产多租户隔离。

完整 stop 或云电脑重建后，应先由外层重新托管 supervise，再继续 start，保留
持久目录和数据。开发结束时停止实例服务，并通过外层工具释放其持有的托管
服务。具体资源回收由 Computer / Sandbox 生命周期能力负责。
