# Agent 中间件

本文档介绍 Xpert Agent 中间件能力及其插件化实现方式，可对标 LangChain Middleware（参考官方文档：overview、built-in）。通过中间件，你可以在 Agent 生命周期的关键节点插入横切逻辑（日志、缓存、限流、安全、提示词治理等），无需修改核心编排逻辑。

## 核心概念
- **Strategy / Provider**：每个中间件实现一个 `IAgentMiddlewareStrategy`，通过 `@AgentMiddlewareStrategy('<provider>')` 标记并注册到 `AgentMiddlewareRegistry`（路径：`packages/plugin-sdk/src/lib/agent/middleware/strategy.interface.ts`）。
- **Middleware 实例**：`createMiddleware` 返回的 `AgentMiddleware` 对象，包含状态 Schema、上下文 Schema、可选工具及各生命周期钩子（类型定义：`packages/plugin-sdk/src/lib/agent/middleware/types.ts`）。
- **节点化接入**：在工作流图中为 Agent 连接 `WorkflowNodeTypeEnum.MIDDLEWARE` 节点（`getAgentMiddlewareNodes`，路径：`packages/contracts/src/ai/middleware.model.ts`）。运行时通过 `getAgentMiddlewares`（`packages/server-ai/src/shared/agent/middleware.ts`）按连接顺序加载并执行。
- **配置与元数据**：`TAgentMiddlewareMeta` 描述名称、国际化标签、Icon、说明与配置 Schema，UI 会据此渲染配置面板。

## 生命周期钩子与能力
| 钩子 | 触发时机 | 典型用途 |
| --- | --- | --- |
| `beforeAgent` | Agent 启动前，仅触发一次 | 初始化状态、注入系统提示、拉取外部上下文 |
| `beforeModel` | 每次模型调用前 | 动态拼装消息/工具、提前截断或压缩上下文 |
| `afterModel` | 模型返回后、工具执行前 | 调整 tool call 参数、记录日志/埋点 |
| `afterAgent` | Agent 完成后 | 结果落库、清理资源 |
| `wrapModelCall` | 包裹模型调用 | 自定义重试、缓存、提示词防护、模型切换 |
| `wrapToolCall` | 包裹工具调用 | 鉴权、限流、结果后处理、返回 `Command` 控制流 |

此外可声明：
- `stateSchema`：可持久化的中间件状态（Zod 对象/可选/默认值）。
- `contextSchema`：仅运行期可读上下文，不持久化。
- `tools`：动态注入的 `DynamicStructuredTool` 列表。
- `JumpToTarget`：在 hook 中返回 `jumpTo` 控制跳转（如 `model`、`tools`、`end`）。

## 编写一个中间件
1) **定义 Strategy 与元数据**
```ts
@Injectable()
@AgentMiddlewareStrategy('rateLimitMiddleware')
export class RateLimitMiddleware implements IAgentMiddlewareStrategy<RateLimitOptions> {
  readonly meta: TAgentMiddlewareMeta = {
    name: 'rateLimitMiddleware',
    label: { en_US: 'Rate Limit Middleware', zh_Hans: '限流中间件' },
    description: { en_US: 'Protect LLM calls with quotas', zh_Hans: '为模型调用增加配额保护' },
    configSchema: { /* JSON Schema 用于前端渲染表单 */ }
  };
```

2) **实现 `createMiddleware`**
```ts
  createMiddleware(options: RateLimitOptions, ctx: IAgentMiddlewareContext): AgentMiddleware {
    const quota = options.quota ?? 100;
    return {
      name: 'rateLimitMiddleware',
      stateSchema: z.object({ used: z.number().default(0) }),
      beforeModel: async (state, runtime) => {
        if ((state.used ?? 0) >= quota) {
          return { jumpTo: 'end', messages: state.messages };
        }
        return { used: (state.used ?? 0) + 1 };
      },
      wrapToolCall: async (request, handler) => handler(request),
    };
  }
}
```

3) **注册为插件模块**
```ts
@XpertServerPlugin({
  imports: [CqrsModule],
  providers: [RateLimitMiddleware],
})
export class MyAgentMiddlewareModule {}
```

4) **接入运行时**
- 开发/部署阶段将插件加入 `preBootstrapPlugins` 或 `PLUGINS` 环境变量（详见 `docs/plugins.md`）。
- 在工作流编辑器中为 Agent 添加中间件节点，并配置顺序（支持通过 `agent.options.middlewares.order` 调整执行顺序）。

## 内置示例
- **SummarizationMiddleware**（`packages/plugins/agent-middlewares/src/lib/summarization.ts`）  
  在 `beforeModel` 中检测对话长度，触发压缩后替换历史消息；支持按 token/消息数或上下文占比触发，并通过 `WrapWorkflowNodeExecutionCommand` 将压缩记录到执行轨迹。
- **todoListMiddleware**（`packages/plugins/agent-middlewares/src/lib/todoListMiddleware.ts`）  
  注入 `write_todos` 工具，并在 `wrapModelCall` 中追加系统提示指导 LLM 规划复杂任务，工具返回 `Command` 以更新 Agent 状态。

## 最佳实践
- 只实现必要的钩子，保持幂等，避免在 hook 内执行重型阻塞操作。
- 使用 `stateSchema` 严格声明持久化数据，防止不同中间件/Agent 间状态串扰。
- 在 `wrapModelCall`/`wrapToolCall` 内优先调用传入的 `handler`，确保默认链路可用，再叠加自定义逻辑。
- 针对比例触发的逻辑需依赖模型 `profile.maxInputTokens`，不存在时应回退到绝对 token 限制（示例见 Summarization）。
- 结合 LangChain Middleware 思路：将日志、审计、缓存、速率限制、灰度模型切换等横切关注点拆成独立中间件，按连接顺序组合。

通过上述方式，即可将 LangChain 的 Middleware 模型无缝迁移到 Xpert 的插件体系中，复用现有编排、工作流和 UI 配置能力。***
