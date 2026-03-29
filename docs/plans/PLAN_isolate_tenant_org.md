## Tenant / Organization 作用域重构方案

### Summary
- 现状已经确认：
  - 前端把 `Tenant` 混入 organization 列表，用户在一个 selector 里切换了两种不同语义的上下文，见 [organization-selector.component.ts](/Users/xpertai03/GitHub/xpert/apps/cloud/src/app/@theme/header/organization-selector/organization-selector.component.ts)。
  - 请求层默认靠是否带 `Organization-Id` 判断组织上下文，见 [tenant.interceptor.ts](/Users/xpertai03/GitHub/xpert/apps/cloud/src/app/@core/interceptors/tenant.interceptor.ts)。
  - 后端基类把“未带 organization”直接解释成 `organizationId IS NULL`，见 [organization-aware-crud.service.ts](/Users/xpertai03/GitHub/xpert/packages/server/src/core/crud/organization-aware-crud.service.ts)。
- 新方案原则：
  - “作用域”必须显式，不再把 tenant 当成一个假 organization。
  - tenant 模式定义为“租户级治理/默认配置模式”，不是跨组织混合浏览模式。
  - 本阶段按你选择的 `Frontend first` 推进：先重做 UI 与客户端上下文模型，后端先做兼容层，不做大规模破坏性迁移。
  - tenant 模式仅 `super admin` 可进入。

### Key Changes
- 前端交互重构：
  - 把当前左上角入口从“组织选择器”升级为“作用域切换器”。
  - 列表分两组而不是同组混排：
    - `Tenant Console`：仅 super admin 可见，文案明确写“租户级默认配置 / 组织治理”。
    - `Organizations`：真实 organization 列表。
  - 选中态显示为明确 scope badge，例如 `Tenant Scope` 或 `Organization: 元数信息技术`，不再复用 organization avatar 语义。
  - 切到 tenant scope 时进入专门的 tenant 落地页，不继续停留在组织专属页面上。
  - `Workspace selector` 与 `Scope switcher` 分离：workspace 只在 organization scope 下可用；tenant scope 下隐藏或禁用，并给出“请选择组织后管理工作空间”的说明。
  - 所有页面在顶部显示当前 scope 条带，避免用户忘记自己正处于 tenant 还是 organization。

- 前端状态与路由模型：
  - 在 store 中新增单一真相源：
    - `activeScope = { level: 'tenant' } | { level: 'organization'; organizationId: string }`
  - 保留 `selectedOrganization` 作为派生值，不再允许 `selectedOrganization = null` 既表示“没选中”又表示“tenant 模式”。
  - 额外持久化：
    - `lastOrganizationId`
    - `lastTenantCompatibleRoute`
    - `lastOrganizationCompatibleRoute`
  - 路由增加 scope 元数据：
    - `tenant-only`
    - `organization-only`
    - `dual-scope`
  - 切换规则固定：
    - `organization -> tenant`：清空 `selectedWorkspace / selectedProject / org-only filters`，跳转 tenant 落地页。
    - `tenant -> organization`：恢复上次 organization 或默认组织，再进入上次兼容页面；无兼容页面则进入 organization 首页。
    - 当前页面若与目标 scope 不兼容，不允许“空列表硬撑”，必须重定向。

- 页面能力分层：
  - `tenant-only`：
    - Tenant settings
    - Organization directory / enable-disable
    - tenant 默认助手配置
    - tenant 级插件 / 默认集成
  - `organization-only`：
    - workspace
    - xpert / knowledgebase / org members
    - org-specific assets
  - `dual-scope`：
    - 采用“Tenant Default + Organization Override + Effective Result”三段式
    - 现有 assistants 页面已经接近这个模式，后续把它作为标准交互模板复用到 feature toggle、插件配置、邮件模板、SMTP 等可继承配置页

- 后端隔离模型重构：
  - 新增显式请求上下文对象：
    - `RequestScopeContext { tenantId, level: 'tenant' | 'organization', organizationId: string | null }`
  - RequestContext 新增方法：
    - `getScope()`
    - `isTenantScope()`
    - `isOrganizationScope()`
    - `requireOrganizationScope()`
  - scope 解析优先级：
    1. 新 header `X-Scope-Level`
    2. 兼容旧行为：有 `Organization-Id` 视为 organization scope；无则视为 tenant scope
    3. 若 header 与组织 id 冲突，直接拒绝请求
  - 数据持久化本阶段保持兼容：
    - tenant-owned 数据继续使用 `organizationId = null`
    - organization-owned 数据继续使用真实 `organizationId`
    - 但这种 null 语义只允许存在于 repository/helper 层，不能再散落在业务 service 中

- 后端查询/写入统一策略：
  - 新增统一 helper 或新的 scope-aware base service，明确提供 3 类行为，禁止业务代码自己拼 `IsNull()`：
    - `findInCurrentScope()`：tenant 只查 tenant-owned；organization 只查当前 org-owned
    - `findWithInheritance()`：organization 读当前 org + tenant default；tenant 只读 tenant-owned
    - `writeToCurrentScope()`：按显式 scope 决定 `organizationId`
  - 资源分类固定：
    - `tenant-owned`：只能 tenant scope 读写
    - `organization-owned`：只能 organization scope 读写
    - `inheritable`：tenant 写 default，organization 写 override，读取时可请求 `effective`
  - 典型约束：
    - workspace 明确归类为 `organization-owned`，tenant scope 不再尝试返回空 workspace 列表假装可操作
    - assistants / features / plugins 优先归类为 `inheritable`
    - tenant scope 不提供“所有 organization 混合数据”的默认列表；跨组织总览以后若做，单独设计为 admin report，不复用 tenant scope

### Public Interfaces
- 前端 store / 组件接口：
  - `ActiveScope` 联合类型替代“null organization = tenant”
  - 所有 selector / guard / page facade 只消费 `activeScope`
- 请求协议：
  - 保留 `Tenant-Id`
  - 新增可选 header：`X-Scope-Level: tenant | organization`
  - organization scope 继续带 `Organization-Id`
  - tenant scope 明确发送 `X-Scope-Level: tenant`，即使不带 `Organization-Id`
- 可继承资源接口统一为：
  - `GET ...?scope=tenant|organization`
  - `GET .../effective`
  - `POST/PUT` body 内显式带 `scope`
- 响应补充元信息：
  - `scopeLevel`
  - `organizationId`
  - 对 inheritable 资源增加 `sourceScope` / `effectiveScope`

### Test Plan
- 前端：
  - super admin 可见 tenant scope；普通 org admin 不可见
  - tenant scope 与 organization scope 切换时，路由按兼容性正确重定向
  - tenant scope 下 workspace selector 不可操作
  - organization scope 下所有请求带 `Organization-Id`
  - tenant scope 下请求不带 `Organization-Id`，且带 `X-Scope-Level: tenant`
  - dual-scope 页面能正确显示 tenant default、organization override、effective source
- 后端：
  - `X-Scope-Level + Organization-Id` 组合能正确解析成 scope context
  - legacy 客户端只传 `Organization-Id` 时仍可工作
  - tenant scope 读取 `tenant-owned` 资源时只返回 `organizationId IS NULL`
  - organization scope 读取 `organization-owned` 资源时只返回当前组织数据
  - inheritable 资源的 `effective` 解析顺序为 `organization override > tenant default`
  - 非 super admin 进入 tenant scope 被拒绝
  - organization 不属于当前用户时 organization scope 被拒绝
- 回归场景：
  - 当前截图中的“工作空间”入口在 tenant scope 下不再出现“像是空组织”的误导
  - assistants 配置页成为标准样板，后续复用不再重新发明 scope 交互

### Assumptions
- tenant scope 本期定义为“租户级治理与默认配置”，不承担跨组织聚合浏览。
- workspace 继续保持 organization-owned，不支持 tenant-shared workspace。
- 本期先不做数据库 schema 迁移；`organizationId = null` 仍是存储层兼容表示，但不再暴露为 UI/接口语义。
- 后端大规模 service 替换分两步走：
  - 第一步补 `ScopeContext` 与兼容 helper
  - 第二步逐模块把直接依赖 `RequestContext.getOrganizationId() ? ... : IsNull()` 的代码迁移到统一 helper
