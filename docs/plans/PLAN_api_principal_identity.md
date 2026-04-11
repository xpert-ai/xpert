# API Principal 与技术用户映射方案

## 背景

当前 `apiKey -> request.user` 的链路已经具备以下基础能力：

- `apiKey`/`client secret` 已统一转换成 `ApiPrincipal`
- 显式业务 user 覆盖头已固定为 `x-principal-user-id`
- request context 已能读取 `currentApiPrincipal()` / `currentApiKey()`

但还缺一个稳定、可解释、可迁移的“技术身份映射规则”：

- 不能再按 `apiKey` 临时创建 communication user
- 不能把 `request user` 猜成某个 end user
- 需要把“技术身份”和“本次请求代表的业务 user”拆开

## 核心定义

### 1. 技术身份

技术身份统一使用现有 `UserType.COMMUNICATION` user，不新增 `ApiConsumer` 等新实体。

这个 user 表示：

- 某个外部 API/App/Integration/Client 在系统里的长期技术主体
- 用于审计、权限、上下文归因
- 不是最终 end user

### 2. 业务 user

业务 user 表示“本次请求代表谁执行”。

- 默认等于技术身份
- 第三方如需指定 end user，必须显式传 header `x-principal-user-id`
- 不再从 body/query/上下文猜测业务 user

### 3. `xpert.userId` 的业务含义

`xpert.userId` 原本就不是创建者，也不是聊天终端用户，而是：

- `Xpert` 对外暴露 API/App 时使用的稳定技术账号
- 即 Xpert 的 external service account / technical principal

因此：

- `xpert.createdById` 是资源拥有者/维护者
- `xpert.userId` 是这个 Xpert 对外服务时的技术身份
- `x-principal-user-id` 才是本次请求可选代表的业务 user

## 绑定规则

| 场景 | apiKey 绑定方式 | 技术 user 来源 | 备注 |
| --- | --- | --- | --- |
| 显式绑定某个技术账号 | `apiKey.userId` | 直接使用该 user | 优先级最高 |
| Xpert/Assistant API 或 App | `apiKey.type = assistant` + `apiKey.entityId = xpertId` | `xpert.userId` | 在拿到 xpert 上下文后提升 principal |
| Integration API | `apiKey.type = integration` + `apiKey.entityId = integrationId` | `integration.userId` | 每个 integration 一个稳定 communication user |
| 通用第三方 client | `apiKey.type = client` + `apiKey.entityId = clientCode` | `User.thirdPartyId = client:<clientCode>` | 一个 clientCode 对应一个稳定 communication user |
| 历史未绑定 key | 无稳定绑定 | `apiKey.createdBy` | 仅作兼容兜底，不再自动造 user |

## 请求解析流程

### 1. 鉴权阶段

`apiKey` / `client secret` 先转换成 `ApiPrincipal`：

1. 优先找 `apiKey.userId`
2. 再按 `apiKey.type + entityId` 解析稳定技术 user
3. 都没有时回退到 `createdBy`

### 2. 业务 user 覆盖

如果请求头里存在 `x-principal-user-id`：

1. 只从 header 读取
2. 校验该 user 属于当前 tenant
3. 将该 user 作为 request context 的 `user`
4. 同时把技术身份元信息保留在 `ApiPrincipal` 上

### 3. Assistant/Xpert 场景

对于 `assistant` 类型 key，鉴权阶段不在 `server` 包里直接查 Xpert。
当 `server-ai` 真正解析到目标 Xpert 后：

1. 校验 `apiKey.entityId` 是否允许访问该 assistant
2. 将 request principal 提升为 `xpert.userId`
3. 如果请求显式传了 `x-principal-user-id`，则保留该业务 user，不覆盖

## 稳定标识策略

不新增新表，直接复用 communication user，并用稳定标识绑定：

- Xpert: `thirdPartyId = xpert:<xpertId>`
- Integration: `thirdPartyId = integration:<integrationId>`
- Client: `thirdPartyId = client:<clientCode>`

这些标识的作用是：

- 防止同一个业务主体重复创建多个技术 user
- 支持 relation 丢失后的幂等修复
- 让迁移和审计更可解释

## 本轮落地范围

### 已落地

- `x-principal-user-id` 作为全局共享常量
- `ApiPrincipal` 模型与 request context 接入
- `apiKey` / `client secret` 鉴权统一走 `resolvePrincipal`
- assistant 运行链路支持提升到 `xpert.userId`
- 显式 `requestedUserId` 不会被 assistant technical user 覆盖

### 本次补齐

- 移除 `ApiKeyService` 按 key 自动创建 communication user 的逻辑
- 新增稳定的 communication user 复用能力：
  - `UserService.ensureCommunicationUser(...)`
- `integration` 补齐 `userId/user`
- `integration` 侧支持稳定技术 user 绑定
- `xpert` 对外 API/App 启用时，按稳定 `thirdPartyId` 复用技术 user
- CORS 允许 `x-principal-user-id`

### 暂不强制

- 不在这一版强制所有历史 `apiKey` 立即补 `type/entityId`
- 不在这一版新增 `allowPrincipalUserOverride` 开关
- 不在这一版引入新的 consumer/integration mapping 表

## 迁移建议

### 历史 assistant key

- 确保 `apiKey.type = assistant`
- `apiKey.entityId = xpertId`
- 确保对应 `xpert.userId` 已存在

### 历史 integration key

- 补 `apiKey.type = integration`
- `apiKey.entityId = integrationId`
- 首次使用时自动补齐/复用 `integration.userId`

### 历史 client key

- 补 `apiKey.type = client`
- `apiKey.entityId = clientCode`
- 首次使用时解析为 `thirdPartyId = client:<clientCode>` 的 communication user

## 后续建议

后续可继续补两件事：

1. 为 `x-principal-user-id` 增加显式开关或白名单策略，避免所有 key 默认都可覆盖业务 user
2. 为 `thirdPartyId` 增加租户内唯一约束，进一步提升并发下的幂等性
