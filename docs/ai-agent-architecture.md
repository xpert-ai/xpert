# AI Agent architecture and source map

This note explains the AI Agent layer in the [system architecture diagram](images/readme/Xpert_System_Architecture.svg). It reflects a source review on 2026-09-29. The diagram is a logical architecture: configured features and runtime providers vary by deployment.

## Definition and compilation

An Agent definition supplies prompts, model configuration, tools, Skills, middleware, and graph connections. The compiler selects a native subgraph or a Swarm according to the configured partners. Native compilation builds a LangGraph `StateGraph` with model execution, tool nodes, middleware hooks, workflow nodes, and state channels.

Sources: [graph compiler](../packages/server-ai/src/xpert-agent/commands/handlers/compile-graph.handler.ts), [native subgraph compiler](../packages/server-ai/src/xpert-agent/commands/handlers/subgraph.handler.ts).

## Model and tool loop

Context feeds a model call. When the model requests tools, graph routing dispatches the corresponding tool nodes; tool results become messages and state updates for subsequent execution. The completion branch leads to the next configured workflow node or graph completion. The diagram's “Answer / next workflow node” is a logical outcome, not a mandatory separate answer node in every graph.

Middleware can participate through `beforeAgent`, `beforeModel`, `afterModel`, `afterAgent`, `wrapModelCall`, and `wrapToolCall`. Model-call preparation validates selected tool declarations and schemas. Selecting or exposing a tool to a model does not itself authorize its execution.

Sources: [subgraph routing and hooks](../packages/server-ai/src/xpert-agent/commands/handlers/subgraph.handler.ts), [model-call preparation](../packages/server-ai/src/shared/agent/model-call.ts), [tool execution](../packages/server-ai/src/shared/agent/tool_node.ts).

## Multi-agent coordination

| Mechanism                             | Execution relationship                                                                                                                                           | Source                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native sub-agent delegation           | A child graph is exposed as a tool. The parent delegates work and receives its result; execution records retain the parent/child relationship.                   | [Native Agent compiler](../packages/server-ai/src/agent-invocation/native-agent.compiler.ts)                                                                                                               |
| Published expert delegation           | Published Xperts are callable collaborators. Graph wrappers authorize the target, including resume paths.                                                        | [Graph service](../packages/server-ai/src/agent-invocation/agent-invocation-graph.service.ts), [collaborators middleware](../packages/server-ai/src/xpert-agent/collaborators/collaborators.middleware.ts) |
| Swarm handoff                         | Configured peer Agents transfer control through handoff tools and a Swarm graph. This differs from returning a child result to a parent.                         | [Swarm compiler](../packages/server-ai/src/xpert-agent/commands/handlers/create-swarm.handler.ts)                                                                                                          |
| Native or external runtime invocation | AgentInvocation governs calls through runtime strategies, with scoped authorization, pinned revisions, idempotency, persisted status, and provider capabilities. | [Invocation runtime](../packages/server-ai/src/agent-invocation/invocation-runtime.ts), [runtime contracts](../packages/plugin-sdk/src/lib/agent/runtime/types.ts)                                         |

Swarm handoff, tool-based delegation, and Bull-backed queued handoff are distinct mechanisms. External execution is a runtime-provider boundary, not another name for Swarm. Provider recovery, cancellation, and background capabilities vary; invocation idempotency does not promise exactly-once external side effects.

## Workflow, context, and durable execution

Workflow graphs combine Agent reasoning with configured branches, parallel paths, iteration, subflows, retrieval, HTTP, code, and other nodes. State includes messages and per-Agent channels, with fields for human input, summaries, memories, and pending follow-ups. Knowledge retrieval and workspace files supply additional context when configured.

Checkpoints persist graph state and pending writes under thread and checkpoint namespaces. Invocation streams events, supports cooperative cancellation, and resumes interrupted graphs. AgentInvocation wait handling uses durable graph interruption and interaction responses rather than repeated model polling; it does not imply an automatic resume scheduler.

Sources: [graph construction](../packages/server-ai/src/xpert-agent/commands/handlers/subgraph.handler.ts), [Agent state](../packages/server-ai/src/shared/agent/state.ts), [checkpoint saver](../packages/server-ai/src/copilot-checkpoint/checkpoint-saver.ts), [graph invocation](../packages/server-ai/src/xpert-agent/commands/handlers/invoke.handler.ts), [invocation wait/resume](../packages/server-ai/src/agent-invocation/invocation-wait.ts), [AgentInvocation design](../packages/server-ai/src/agent-invocation/README.md).

## Relationship to plugins and Agentic Apps

Plugins supply model adapters, tools, middleware, workflow extensions, runtime strategies, storage, and UI capabilities. Conversation Agent Plugin packages supply versioned resources rather than loading server code. Agentic Apps assemble these capabilities with published Assistants, domain services, resource provisioning, and interactive views. The Agent runtime executes the reasoning and coordination between those capabilities and application experiences.

The image was generated with the built-in image generation tool and visually reviewed against these source relationships. It is a presentation asset; this source map preserves the execution distinctions that a compact diagram cannot fully express.
