---
title: '智能体架构与源码地图'
---

[English](../../en/architecture/ai-agent-architecture.md)

本文说明[系统架构图](../../images/readme/Xpert_System_Architecture.svg)中的 AI Agent 层，基于 2026-09-29 的源码审查。该图呈现的是逻辑架构；具体启用的功能和运行时 Provider 随部署而变化。

## 定义与编译

Agent 定义提供提示词、模型配置、工具、Skills、中间件和图连接。编译器根据配置的协作者选择原生子图或 Swarm。原生编译会构建 LangGraph `StateGraph`，其中包含模型执行、工具节点、中间件钩子、工作流节点和状态通道。

源码：[图编译器](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-agent/commands/handlers/compile-graph.handler.ts)、[原生子图编译器](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-agent/commands/handlers/subgraph.handler.ts)。

## 模型与工具循环

上下文进入模型调用。模型请求使用工具时，图路由会调度对应的工具节点；工具结果转化为消息和状态更新，供后续执行使用。完成分支进入下一个已配置的工作流节点，或结束图执行。图中的“Answer / next workflow node”表示逻辑上的结果，并不意味着每张图都必须有独立的回答节点。

中间件可以通过 `beforeAgent`、`beforeModel`、`afterModel`、`afterAgent`、`wrapModelCall` 和 `wrapToolCall` 参与执行。模型调用的准备阶段会校验所选工具的声明与 schema。选择工具或将其暴露给模型，本身不代表已授权执行该工具。

源码：[子图路由与钩子](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-agent/commands/handlers/subgraph.handler.ts)、[模型调用准备](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/shared/agent/model-call.ts)、[工具执行](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/shared/agent/tool_node.ts)。

## 多 Agent 协作

| 机制                 | 执行关系                                                                                               | 源码                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原生子 Agent 委派    | 将子图暴露为工具。父 Agent 委派任务并接收结果；执行记录保留父子关系。                                  | [原生 Agent 编译器](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/agent-invocation/native-agent.compiler.ts)                                                                                                                                         |
| 已发布专家委派       | 已发布的 Xpert 作为可调用的协作者。图包装层对目标进行授权，包括恢复执行路径。                          | [图服务](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/agent-invocation/agent-invocation-graph.service.ts)、[协作者中间件](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-agent/collaborators/collaborators.middleware.ts) |
| Swarm 交接           | 已配置的同级 Agent 通过交接工具和 Swarm 图转移控制权。这与子 Agent 向父 Agent 返回结果不同。           | [Swarm 编译器](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-agent/commands/handlers/create-swarm.handler.ts)                                                                                                                                  |
| 原生或外部运行时调用 | AgentInvocation 通过运行时策略管理调用，涵盖作用域授权、固定版本、幂等性、状态持久化和 Provider 能力。 | [调用运行时](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/agent-invocation/invocation-runtime.ts)、[运行时合同](https://github.com/xpert-ai/xpert/blob/main/packages/plugin-sdk/src/lib/agent/runtime/types.ts)                                     |

Swarm 交接、工具委派和基于 Bull 队列的交接是不同的机制。外部执行属于运行时 Provider 边界，并非 Swarm 的另一种名称。恢复、取消和后台执行能力取决于 Provider；调用幂等性不保证外部副作用恰好发生一次。

## 工作流、上下文与持久执行

工作流图将 Agent 推理与已配置的分支、并行路径、迭代、子流程、检索、HTTP、代码等节点组合起来。状态包含消息和各 Agent 的通道，以及人工输入、摘要、记忆和待处理后续任务等字段。配置知识检索和工作区文件后，它们可提供额外上下文。

附件存储、解析、工具参数和历史消息持久化的详细过程，见 [ChatKit 附件文件生命周期与数据流](/zh-Hans/architecture/file-lifecycle-data-flow)。

检查点在 thread 和 checkpoint 命名空间下持久化图状态及待写入内容。调用过程以流的形式发送事件，支持协作式取消，并可恢复被中断的图。AgentInvocation 的等待处理使用持久化图中断和交互响应，而不是反复调用模型轮询；这不意味着存在自动恢复调度器。

源码：[图构建](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-agent/commands/handlers/subgraph.handler.ts)、[Agent 状态](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/shared/agent/state.ts)、[检查点保存器](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/copilot-checkpoint/checkpoint-saver.ts)、[图调用](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/xpert-agent/commands/handlers/invoke.handler.ts)、[调用等待与恢复](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/agent-invocation/invocation-wait.ts)、[AgentInvocation 设计](https://github.com/xpert-ai/xpert/blob/main/packages/server-ai/src/agent-invocation/README.md)。

## 与插件和 Agentic Apps 的关系

插件提供模型适配器、工具、中间件、工作流扩展、运行时策略、存储和 UI 能力。Conversation Agent Plugin 包提供版本化资源，而不加载服务端代码。Agentic Apps 将这些能力与已发布的 Assistant、领域服务、资源准备和交互视图组合起来。Agent 运行时负责执行这些能力与应用体验之间的推理和协作。

该图使用内置图像生成工具制作，并根据这些源码关系完成视觉审查。它是一份展示素材；本文保留了紧凑图示难以完整表达的执行机制差异。
