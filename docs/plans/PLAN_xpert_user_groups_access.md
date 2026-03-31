# Xpert UserGroup 授权重构与 Assistant 安全加固

## 背景与问题分析

当前 `GET /api/ai/assistants/:id` 在组织用户访问 tenant 级 assistant 时会出现 404，根因不是数据真的不存在，而是查询作用域和资源作用域不一致：

- `assistant.controller.ts` 当前直接调用 `XpertService.findOne(id, ...)`
- `XpertService` 继承 `TenantOrganizationAwareCrudService`
- 当请求处于 organization scope 时，基类会自动附加 `organizationId = 当前组织`
- tenant 级 xpert 的 `organizationId` 为 `NULL`
- 于是 tenant 级记录会在查询阶段被过滤掉，最终表现成 404

这个问题同时暴露了更深层的安全缺口：

- `assistants/search` / `assistants/count` / `assistants/:id` / run create 四条链路使用了不同的可见性逻辑
- tenant 级 published xpert 一旦发布，组织用户几乎没有显式授权边界
- API key / client secret 鉴权会主动改写请求为 tenant scope，如果不保留原始 organization 上下文，后续授权容易被绕开

## 目标模型

本轮统一采用以下模型：

- `UserGroup` 定义为 org 级实体，不做 tenant 级 group
- `Xpert` 删除 `managers`，统一改为 `userGroups`
- `userGroups` 只控制 published xpert 的使用/运行访问
- authoring/edit 继续沿用现有 creator/workspace/XpertGuard 规则
- tenant 级和 org 级 published xpert 都必须绑定 group 才能被访问
- 历史已发布但未绑定 group 的 xpert 立即关闭，不做兼容保留

## 核心设计

### 1. 数据模型

- 新增 `IUserGroup`
- 新增后端 `UserGroup` 实体：
  - 继承 `TenantOrganizationBaseEntity`
  - 字段：`name`、`description`、`members`
  - `members` 直接关联 `User[]`
- `Xpert` 新增 `userGroups` many-to-many，join table 为 `xpert_to_user_group`
- 旧 `xpert_to_manager` 不保留兼容逻辑，也不迁移历史数据

### 2. 运行时授权

新增统一的 published xpert 访问服务，负责：

- 在 tenant 范围解析目标 published xpert
- 从 `currentApiPrincipal.requestedOrganizationId ?? RequestContext.getOrganizationId()` 解析授权 org
- 校验候选资源只允许：
  - 当前 org 自己的 published xpert
  - tenant 默认 published xpert
- 校验当前用户是否属于该 xpert 在当前 org 绑定的任一 `userGroup`

统一接入以下入口：

- `POST /api/ai/assistants/search`
- `POST /api/ai/assistants/count`
- `GET /api/ai/assistants/:id`
- run create / execute

行为统一为：

- 资源不存在或未发布：404
- 资源存在但当前 org / group 无权访问：403

### 3. API key / client secret

当前 api key / client secret 鉴权会把请求强制改写为 tenant scope。为避免 published assistant ACL 被绕过，需要：

- 在 `IApiPrincipal` 中新增 `requestedOrganizationId`
- 在 `ApiKeyStrategy` / `SecretTokenStrategy` 清除 `organization-id` 之前先保存原始 org
- 后续 published assistant ACL 一律优先使用这个原始 org
- 若 assistant 请求没有 org 上下文，则直接拒绝访问

### 4. 发布规则

在 `XpertPublishHandler` 发布前增加校验：

- 当前 xpert 至少绑定一个 `userGroup`
- 否则禁止发布

同时保留运行时兜底：

- 历史已发布且无 group 的记录在访问时直接拒绝

### 5. 前端

- 新增 org-only 的 `settings/groups` 页面
- 提供 group 列表、编辑、成员维护
- `xpert` 授权页把 managers UI 全部替换为 userGroups UI
- `XpertAPIService` 删除 managers API，改成 `getXpertUserGroups/updateXpertUserGroups`
- 修正遗留 `/settings/groups/:id` 导航，正式落到新的 groups 页面

## 实施步骤

1. 先补 contracts：
   - `IUserGroup`
   - `IApiPrincipal.requestedOrganizationId`
   - `IXpert.userGroups`
2. 新建 `packages/server/src/user-group/**`
3. 改造 `Xpert` 实体与接口，移除 `managers`
4. 新增统一 published xpert access service
5. 改造 assistant controller 与 run create 主链路
6. 发布链路增加 `userGroups` 校验
7. 前端增加 `settings/groups` 与 xpert authorization 新界面
8. 补齐测试

## Public Interfaces

- `IApiPrincipal.requestedOrganizationId?: string | null`
- `IXpert.userGroups?: IUserGroup[]`
- 新增 org-only REST：
  - `GET /user-groups`
  - `POST /user-groups`
  - `GET /user-groups/:id`
  - `PUT /user-groups/:id`
  - `DELETE /user-groups/:id`
  - `PUT /user-groups/:id/members`
- xpert 授权接口改为：
  - `GET /xpert/:id/user-groups`
  - `PUT /xpert/:id/user-groups`
- 删除旧接口：
  - `GET /xpert/:id/managers`
  - `PUT /xpert/:id/managers`
  - `DELETE /xpert/:id/managers/:userId`

## Assumptions

- `UserGroup` 为 org 级，不提供 tenant 级 group
- 不再引入 direct-user ACL，也不保留 `responsibleUsers`
- 不迁移 `xpert.managers` 历史数据，只迁移结构
- 当前仓库继续依赖 `synchronize: true` 做 schema 变更，本轮不额外补手写 migration
- `userGroups` 不参与 xpert 编辑权限，只参与 published assistant 的使用权限
