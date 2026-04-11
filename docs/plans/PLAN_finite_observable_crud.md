# 前端 CRUD 请求有限流语义重构方案

## Summary
- 当前仓库里一部分前端 service 方法名看起来是“一次性请求”，实际却包裹了 `selectOrganizationId()`、`BehaviorSubject`、refresh stream 等长生命周期流。
- 这会让调用方误以为它们是普通 HTTP Observable，随后在 `forkJoin`、页面初始化 loading、`firstValueFrom`、批量并发请求里反复踩坑。
- 本方案的根本目标不是“在调用点继续补 `take(1)`”，而是统一基础 service 契约：
  - `get/load/fetch/create/update/delete` 默认必须是 finite observable
  - 只有 `watch/observe/stream` 才允许是非 completion 流
- 优先从前端基础 CRUD 层改起，尽量减少业务页面继续记忆 RxJS 细节。

## 问题定义
- 典型根因已确认：
  - [organization-base-crud.service.ts](/Users/xpertai03/.codex/worktrees/8e62/xpert/libs/apps/state/src/lib/organization-base-crud.service.ts) 中的 `getOneById()` 当前实现为：
    - 先订阅 `selectOrganizationId()`
    - 再 `switchMap` 到一次 HTTP 请求
  - 由于外层 organization stream 默认不会完成，整个返回值会“发出一次结果但不 completion”
- 直接后果：
  - `forkJoin([...getOneById(...)])` 永远不返回
  - 页面 loading 状态可能一直卡住
  - 方法语义与命名不一致，代码 review 很难快速看出风险
  - 调用方需要在每个页面自己补 `take(1)`，容易遗漏，也容易重复犯错

## 设计原则
- 请求语义必须由 service 方法名直接表达，而不是靠调用方猜测。
- 基础 CRUD 层默认提供“单次请求”语义，不能把 store/context 监听流直接泄露给上层。
- 如果真的需要随 organization 切换自动重新请求，必须显式命名为 `watch*` 或 `observe*`。
- 页面初始化和保存场景优先使用 one-shot request；实时联动场景才使用长生命周期流。

## 目标状态

### 1. 方法命名与流语义一一对应
- one-shot 方法：
  - `getById`
  - `getOneById`
  - `getAllInOrg`
  - `create`
  - `update`
  - `upsert`
  - `delete`
- reactive 方法：
  - `watchById`
  - `watchAllInOrg`
  - `observeOrganizationScoped`
  - 或其他明确以 `watch/observe/stream` 开头的方法

### 2. 页面初始化默认安全
- 调用 `forkJoin`、`Promise.all`、`firstValueFrom` 时，不需要额外记忆该方法是否会完成。
- `loading` 逻辑依赖于“请求结束”，而不是依赖调用方额外补齐 RxJS 操作符。

### 3. 组织上下文仍然保留，但只作为请求前置快照
- `organizationId` 仍然可以由 store 决定。
- 但对 one-shot CRUD 来说，只取当前快照一次，不把持续监听行为暴露出去。

## 核心方案

### A. 重构基础类的默认语义
- 改造 [organization-base-crud.service.ts](/Users/xpertai03/.codex/worktrees/8e62/xpert/libs/apps/state/src/lib/organization-base-crud.service.ts)
- 当前：
  - `selectOrganizationId().pipe(switchMap(() => http.get(...)))`
- 目标：
  - `selectOrganizationId().pipe(take(1), switchMap(() => http.get(...)))`
- 这样 `getOneById()` / `getAllInOrg()` 天然变成 finite observable

建议增加一个统一 helper，避免每个方法手写一遍：

```ts
protected withOrganizationContextOnce<R>(project: () => Observable<R>): Observable<R> {
  return this.selectOrganizationId().pipe(
    take(1),
    switchMap(() => project())
  )
}
```

然后基础方法统一改成：

```ts
getOneById(id: string, options?: PaginationParams<T>) {
  return this.withOrganizationContextOnce(() =>
    this.httpClient.get<T>(this.apiBaseUrl + '/' + id, { params: toHttpParams(options) })
  )
}
```

### B. 显式新增 reactive 版本，而不是继续复用 CRUD 名称
- 对确实要随 organization 切换自动刷新的场景，新增明确命名的方法，例如：

```ts
watchOneById(id: string, options?: PaginationParams<T>) {
  return this.selectOrganizationId().pipe(
    switchMap(() => this.httpClient.get<T>(this.apiBaseUrl + '/' + id, { params: toHttpParams(options) }))
  )
}
```

- 这样调用方一眼就知道：
  - `getOneById()` 是 one-shot
  - `watchOneById()` 才是持续联动

### C. 业务 service 禁止再把长流伪装成一次性方法
- 如果某个 service 还需要组合 `BehaviorSubject`、refresh trigger、workspace selector：
  - one-shot 版本保留 `get*`
  - 长流版本统一改成 `watch*`
- 例如：
  - `getAgentMiddleware()` 保持 one-shot
  - `agentMiddlewares$` 这种长期流保留 `$` 后缀即可
  - 如果新增封装方法，也必须叫 `watchAgentMiddlewares()`

### D. 页面层初始化逻辑优先 async/await
- 对初始化加载、保存前回填、并发详情拉取等场景：
  - 优先 `async/await + Promise.all`
  - service 返回 finite observable 后，再通过 `firstValueFrom()` 收敛
- 这样业务代码会更贴合“一次性装载”的语义
- RxJS 保留给：
  - 用户输入流
  - WebSocket / SSE
  - UI 联动状态流
  - 真正的组织切换自动刷新

## Public APIs / Interfaces / Types

### 基础 service 契约变化
- `OrganizationBaseCrudService<T>`：
  - `getOneById()` 从“可能无限流”改为“有限流”
  - `getAllInOrg()` 从“可能无限流”改为“有限流”
  - 新增 `watchOneById()` / `watchAllInOrg()` 或同等显式命名方法

### 命名规范变化
- `get/load/fetch/create/update/delete`：
  - 必须 finite
- `watch/observe/stream`：
  - 才允许长期订阅

### 调用约束变化
- 页面中使用 `forkJoin` 时：
  - 可以直接组合 `get*` / `load*` 请求
  - 不允许直接组合 `watch*` / `$` streams

## 实施步骤

### Phase 1：基础类修正
1. 修改 [organization-base-crud.service.ts](/Users/xpertai03/.codex/worktrees/8e62/xpert/libs/apps/state/src/lib/organization-base-crud.service.ts)
   - 为 one-shot CRUD 方法统一加 `take(1)`
   - 提取 `withOrganizationContextOnce()` 之类的公共 helper
2. 补充显式 reactive 方法
   - `watchOneById()`
   - `watchAllInOrg()`
3. 保证现有 `CrudService<T>` 不受破坏
   - 纯 HTTP 方法继续保持 finite

### Phase 2：仓库内调用点迁移
1. 搜索所有 `getOneById(`、`getAllInOrg(` 调用
2. 判断场景：
   - 页面初始化 / 保存 / detail 加载：继续使用 `get*`
   - 真正需要组织切换自动刷新：改成 `watch*`
3. 搜索所有 `forkJoin(` / `Promise.all(` / `firstValueFrom(`
   - 确认输入项都来自 finite request

### Phase 3：业务 service 语义清理
1. 审计所有带 store/refresh 包装的 service 方法
2. 对不符合命名语义的方法做拆分或重命名：
   - `get*` 改为 one-shot
   - 长流版本改名为 `watch*`
3. 在 code review 中把“命名与 completion 语义一致”作为固定检查项

### Phase 4：文档与护栏
1. 保留 [AGENTS.md](/Users/xpertai03/.codex/worktrees/8e62/xpert/AGENTS.md) 中的简洁规则
2. 可选增加 lint / review 护栏：
   - 禁止 `forkJoin` 直接接收 `$` 命名流
   - 禁止 `get*` 方法内部直接返回未收敛的 store stream

## 迁移策略
- 本次推荐“兼容式迁移”，避免一次性大面积破坏：
  - 先把基础类的 `getOneById` / `getAllInOrg` 语义修正为 finite
  - 再补 `watch*` 方法承接真正的响应式场景
- 这样大多数页面会直接获益，且不需要同步改完整个仓库。
- 对少数依赖“organization 切换自动刷新”的页面，再逐个迁移到 `watch*`。

## 风险与注意事项
- 风险 1：少数旧页面可能隐式依赖“切换 organization 自动重发请求”
  - 对策：补 `watch*` 方法，并在调用点显式迁移
- 风险 2：开发者继续在业务 service 中把 store stream 包装进 `get*`
  - 对策：命名规范写入 AGENTS，并在 review 中强制检查
- 风险 3：一次性请求和实时流混用导致状态管理混乱
  - 对策：页面初始化优先 async/await；实时联动单独管理

## Test Plan

### 基础类测试
- `getOneById()` 订阅后应只发出一次并完成
- `getAllInOrg()` 订阅后应只发出一次并完成
- `watchOneById()` 在 organization 改变时应重新请求
- `watchAllInOrg()` 在 organization 改变时应重新请求

### 集成测试
- `forkJoin([serviceA.getOneById(...), serviceB.getOneById(...)])` 能正常完成
- 页面 loading 在全部请求完成后能关闭
- organization 切换时：
  - 使用 `get*` 的页面不自动重刷
  - 使用 `watch*` 的页面按预期自动刷新

### 回归测试
- 现有 ClawXpert tools 面板不再卡在 loading
- 其他依赖 `getOneById()` / `getAllInOrg()` 的页面不出现行为倒退

## Assumptions
- 本方案只先重构前端 request/service 语义，不改后端接口协议。
- 本方案接受“默认 one-shot，少量场景显式 watch”的方向，而不是让所有 CRUD 默认变成响应式流。
- 本方案优先解决“隐藏的无限流伪装成请求流”问题，不试图在本轮统一整个仓库所有 RxJS 风格。
