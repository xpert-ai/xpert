# Xpert 生产 API 滚动更新摘流问题与后续修复方案

记录日期：2026 年 10 月 17 日，Asia/Shanghai。

状态：待后续处理。本次记录问题背景、已确认机制和建议方案；不代表下述修复已经实现或部署。

生产插件更新过程中，API 实例进入滚动重启状态后，入口仍可能向它分配请求，导致调用方收到 `503 RUNTIME_DRAINING` 或 `503 RUNTIME_NOT_READY`。需要让实例重启与入口摘流形成完整流程：先停止分配新流量，确认入口变更生效，再拒绝新请求并等待已有请求结束；重启后验证实际就绪，再恢复流量。

## 触发背景与观察到的现象

本问题在修复 11 个 App 封面并更新生产插件时暴露。封面修复本身包括平台统一解析 screenshots、插件 manifest 同步及补丁发布。运行中的插件更新会触发平台的自动滚动加载，因此进一步暴露了流量入口与实例生命周期之间的衔接问题。

当时观察到的事实如下，属于排查时的快照，不作为后续生产发布结果的说明：

- Canvas 和 Cut 的更新接口已返回安装成功，并提供自动运行时加载的回执。
- 后续一次 `POST /api/plugin/update` 返回 `503`，错误码为 `RUNTIME_DRAINING`，消息为 `The API instance is draining for restart`。
- 随后的登录请求也曾返回 `503`，消息为 `The API instance is not ready`。
- 后续检查中，曾有实例恢复就绪并实际加载新版 Canvas 和 Cut；同时，自动滚动任务状态出现过 `failed`。

这证明发布期间有请求到达了不接收业务请求的实例，但尚不能据此量化所有用户的受影响范围和持续时间。滚动任务的 `failed` 需要单独查看错误记录、实例启动和插件加载情况，不能仅凭同时出现的 503 断定它也由 Nginx 引起。

## 错误码与请求是否已经执行

`RuntimeDrainMiddleware` 在业务处理前调用 `RuntimeLifecycleService.trackRequest()`。实例正在排空请求，或现有就绪检查不通过时，中间件直接返回：

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 5
Connection: close
```

其中，排空状态返回 `RUNTIME_DRAINING`，其他未就绪状态返回 `RUNTIME_NOT_READY`。

对于明确由这段中间件返回的响应，该次请求尚未进入后续业务处理，可以在实例就绪后重试。这一判断不能扩展到所有 503、连接中断或客户端超时；那些情况可能需要先查执行结果，尤其是插件安装等写操作。

## 当前实现中的衔接缺口

排查时读取的 `RuntimeRestartCoordinatorService.beginReplicaRestart()` 顺序是：

```text
取得滚动重启名额并检查其他健康实例
→ beginDrain()
→ 当前实例立即拒绝新业务请求
→ instanceRegistry.setReady(false)
→ 延迟 750 毫秒
→ 等待已有请求结束，最长 30 秒
→ SIGTERM
```

内部实例注册表的 `setReady(false)` 没有在这条路径中完成 Nginx 摘流确认。已有 `/api/health/ready` 接口也需要被入口的路由机制实际消费，才能影响请求分配。

当时看到的入口配置为：

```nginx
upstream api {
    server api:3000;
}
```

域名可以解析为多个后端地址，因此问题不是这条配置只能转发到一个实例，而是该地址列表没有体现应用此刻是否允许接流。Nginx 对域名、多地址以及 `down` 参数的行为见[官方 upstream 文档](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server)。

由此形成的请求路径是：入口仍选择目标实例，而目标实例已经通过中间件拒绝请求。即使还有其他健康副本，请求也可能得到 503。Docker 容器健康检查或内部注册表变更，必须有配套机制才能更新当前入口的路由状态。

单纯增加现在的 750 毫秒延迟不能补上这个流程，因为该延迟发生在实例开始拒绝请求之后。

## 建议修改方案

建议以保留现有 Nginx、增加受控入口管理组件作为实施起点。后续先核对实际 Nginx 版本和部署方式，再确定组件的具体实现。

### 拆分准备下线与正式排空状态

在生命周期中新增 `withdrawing`，区分“通知入口不要再选我”和“已经停止接收业务请求”。

| 状态               | readiness 响应 | 业务请求处理                 |
| ------------------ | -------------- | ---------------------------- |
| ready              | 200            | 正常处理                     |
| withdrawing        | 503            | 入口传播期间仍处理到达的请求 |
| draining           | 503            | 拒绝新请求，等待已有请求结束 |
| 启动中或实际不可用 | 503            | 拒绝请求                     |

`withdrawing` 只能允许原本健康的实例继续处理传播期间的请求。现有插件加载、启动状态和租约有效性检查仍须生效，不能把真正未就绪的实例放行。

相应修改 `RuntimePluginAdmission.refresh()`，防止周期刷新把正在退出流量的实例重新标记为 ready。同步检查 readiness 类型、调用方和状态展示对新增状态的处理。

### 增加入口摘流与恢复流量操作

将 Nginx 上游改为包含独立实例列表，例如：

```nginx
upstream api {
    include /etc/nginx/upstreams/api.inc;
}
```

入口管理组件根据实际容器发现结果生成 `api.inc`，而不是把本次运行的容器编号写死在源码中。退出流量时移除目标实例或将其标记为 `down`；恢复流量时重新加入已经就绪的实例。

组件至少需要负责：

- 串行化配置变更，记录目标实例与启动身份，避免旧操作作用于替换后的实例。
- 校验候选配置，原子更新配置文件，并发出 reload。
- 确认所有相关入口已应用目标配置，再返回摘流成功；不能只依赖命令退出码、一次外部请求或固定 sleep。
- 摘流或恢复流量失败时返回明确状态，并保留可回滚的上一版配置。
- 对实例异常退出提供健康探测和移除机制，避免只覆盖计划内重启。

Nginx reload 会启动新 worker，并让旧 worker 继续服务已有连接，因此必须验证旧连接、keep-alive、HTTP/2 和 SSE 在切换期间的行为，不能将 reload 返回直接等同于“所有旧请求路径都已结束”。参见[Nginx 平滑重载说明](https://nginx.org/en/docs/control.html)。

入口管理组件应通过受控的内部接口执行这些操作，不应为了摘流向普通业务请求开放修改 Nginx 配置或容器管理的能力。

### 调整协调器的执行顺序

建议流程如下。`ingress` 表示拟新增的入口管理能力，不是现有可调用 API。

```ts
// 已取得重启名额，并确认剩余可接流容量足够
lifecycle.beginWithdrawal(restartState)
await instanceRegistry.setReady(false)

await ingress.withdrawAndConfirm(target)

lifecycle.beginDrain(restartState)
await lifecycle.waitForIdle(drainTimeoutMs)
processSignaler.signal('SIGTERM')
```

摘流失败或超时，应取消本次重启，并根据实例实际健康状态恢复生命周期及入口状态；不能在尚未摘流时继续发信号。

重启后的顺序为：确认新进程身份、验证插件运行版本与加载状态、确认 readiness、恢复入口流量、确认入口接流，最后才将该副本标记为本轮更新完成并处理下一台。

需要区分“应用已就绪”和“入口已能路由到该实例”。容量判断应计算实际可接流的副本；三副本部署以一次最多下线一个、保留两个可接流副本为目标，不能在前一台尚未接回入口时继续下线下一台。

### 保留请求语义与长连接处理

已有请求超过排空期限时，继续按平台现有的超时和流式中断协议处理；不能承诺无限期 SSE 一定会自然结束。后续应核对 drain timeout、进程关闭期限和入口连接期限是否匹配。

不要用全局重试替代摘流机制。`proxy_next_upstream http_503` 只能作为经过评估的补充策略；不要为掩盖问题直接启用 `non_idempotent`，它允许重试已经发给上游的 POST、PATCH 等请求，可能造成重复执行。Nginx 也无法在响应已发送给客户端后通过切换上游恢复流。参见[官方重试规则](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream)。

## 后续代码定位

主要修改与复核位置位于平台仓库的下列文件；Xpert 与 Xpert Pro 的对应实现应保持一致。

| 文件或组件                                                                   | 后续关注点                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/server/src/runtime-control/runtime-lifecycle.service.ts`           | 新增准备下线状态，分离接流状态与请求接纳条件 |
| `packages/server/src/runtime-control/runtime-drain.middleware.ts`            | 传播期请求处理与错误码语义                   |
| `packages/server/src/runtime-control/runtime-plugin-admission.ts`            | 周期刷新不能重新接纳退出流量中的实例         |
| `packages/server/src/runtime-control/runtime-restart-coordinator.service.ts` | 摘流确认、重启、恢复流量确认、取消及失败恢复 |
| `packages/contracts/src/runtime-control.ts`                                  | 生命周期状态及调用方兼容性                   |
| `packages/server/src/health/health.controller.ts`                            | readiness 与入口健康检查契约                 |
| 部署配置与拟新增入口管理组件                                                 | 实例发现、Nginx 配置生效确认、健康探测与回滚 |

## 后续处理清单与验收要求

- [ ] 复核线上 Nginx 版本、有效配置、容器发现方式及实际请求路径。
- [ ] 读取当时滚动任务失败的详细原因，单独判断是否还有启动、容量、租约或插件加载问题。
- [ ] 明确入口摘流确认协议、超时行为及并发更新锁，完成设计评审。
- [ ] 实现生命周期拆分和入口控制，覆盖失败恢复与实例替换场景。
- [ ] 为状态转换、摘流失败不重启、恢复接流前不处理下一台等行为补充测试。
- [ ] 在三个副本上持续发送 GET、POST、keep-alive、HTTP/2 和 SSE 流量，逐台执行更新。
- [ ] 验证摘流确认后，目标实例不再收到新的业务请求；计划内切换不向普通调用方暴露排空状态 503。
- [ ] 验证 POST 不重复执行，SSE 按中断协议收尾并可恢复。
- [ ] 验证未就绪或插件加载失败的实例不会接回流量；入口控制失败时不继续下线健康实例。
- [ ] 分别记录插件安装、实际加载、入口恢复和滚动任务完成，防止只凭安装成功回执结束验收。

后续从上述复核与设计项开始处理。本次封面发布的最终结果应查看原发布任务；不要把这份问题记录当成生产部署完成或失败的最终结论。
