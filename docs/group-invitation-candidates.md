# 群聊邀请候选

`GET /api/ai/groups/:groupId/candidates` 使用群主身份和当前 tenant / organization 上下文。
创建群聊前可使用 `/api/ai/groups/candidates`；该入口仍要求有效组织成员身份。
请求只接受 `kind`、`search`、`limit`、`offset`，不得传用户身份、组织或排除名单覆盖服务端授权。

- `kind`：`user` 或 `assistant`，默认 `assistant`。
- `search`：去除首尾空格，最长 100 字符。
- `limit`：1～100，默认 50。
- `offset`：0～1000000，默认 0。
- 响应保持 `ChatGroupCandidate[]`，每项只包含公开的身份、名称和头像。

专家候选只包含当前可访问、已发布、`latest=true` 的 `agent`，按创建时间降序、ID 升序排列。
组织共享工作空间中的专家对同 tenant、同 organization 的有效组织成员可见；共享空间已归档时
不能仅凭共享设置获得访问。既有创建者、工作空间成员、UserGroup 和租户共享授权继续适用。
同组织身份不授予私有空间中的所有专家权限，目录授权也不增加工作空间创作权限。

服务端在去重及分页前排除已入群的有效成员。专家按 tenant、organization、workspace、type、slug
组成的版本系列排除：旧版已在群里时，新版不会再次出现。不同空间的同名/同 slug 专家不互相排除。
已移除成员可重新成为候选，其他群的成员不会影响当前群的候选。

ChatKit 每次请求 51 条，展示 50 条并用多出的一条判断是否显示“加载更多”；下一页 offset 增加 50。
搜索词、成员类型、群聊或有效成员集合变化后，从第一页重载并取消旧请求；翻页失败保留已加载项，
重试同一 offset。Desktop 创建群聊的旧数组桥接接口会逐页取齐，避免只显示第一页。

发布时需配套发布 `xpert-sdk-js` 的候选分页参数和 `chatkit-js` 的加载更多界面，并更新消费它们的
应用/托管 ChatKit。旧客户端仍能读取数组响应，但没有翻页界面的版本只能显示默认第一页。
后端、SDK、ChatKit 的审核不代表这些依赖已发布或生产环境已更新。
