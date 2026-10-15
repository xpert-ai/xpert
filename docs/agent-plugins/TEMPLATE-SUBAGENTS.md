# Assistant templates as task sub-agents

Selecting an Agent Plugin with `extensions.xpertai.role !== "assistant"` exposes every Assistant template in that package as a delegation tool. An omitted role has the same behavior as `capability` or `subagent`. A package marked `assistant` remains exclusive to template-market discovery and does not gain delegation tools. All valid templates, irrespective of role, remain in the template marketplace.

The catalog uses an `assistant_template` component with its key, title, description and readiness. ChatKit adds and removes the entire package using the existing `bindingId + version` selection. Mixed packages keep their skills, MCP servers and other capabilities. Template details show the available sub-agents.

## Execution path

1. `RuntimeResourceService` authorizes the selection and supplies template declarations containing the pinned package reference, digest, template key and inputs. It does not compile or launch template Agents.
2. The host automatically attaches `createTemplateSubagentsMiddleware` to the conversation entry Agent. Stable tool names hash the package binding, version and template key. The middleware only declares tools and calls its typed executor; it never reads packages or creates Assistants.
3. On an actual tool call, `TemplateSubagentRuntimeService` reserves an invocation through `AgentInvocationRuntime` and the native `xpert` strategy. The template adapter validates package integrity, normalizes the complete DSL and binds already configured dependencies into an in-memory definition. Unavailable dependencies or connectors fail with a named diagnostic, without installation or authorization side effects.
4. The existing compiler resolves either a saved Assistant or a host-created template definition. Template definitions cannot be supplied through JSON request options. Internal Agents, workflow edges, skills, middleware and toolsets use the same compiler and native adapter as saved Assistants. Missing template model configuration falls back to the parent task's effective authorized model.
5. The invocation handle stores dependency locks, the effective base model and the bound graph digest. Resume selects the same dependency digests and rejects configuration drift. Access and package validity are checked again, including before child tool calls. Deterministic injected middleware keys preserve checkpoint identity.

## Task scope

- The parent Assistant remains the execution, permission and billing owner. Execution metadata records `templateSource` separately; no synthetic or newly published Assistant IDs are used.
- Standalone conversations recheck the exact published Assistant's live runtime file access, including the current user's grant behind a delegated `USER_XPERT` session. Project conversations instead recheck current Project membership and the Assistant binding; that grant does not unlock the Assistant's standalone files. These checks run before cached-result replay, dependency preparation and task-file initialization.
- Each invocation has its own cancellation controller, `template_<invocation-id>` checkpoint namespace and `agent-tasks/<invocation-id>` directory in the authorized work area. Initial files and onboarding preferences are confined to that directory. Seed memories enter the child's state, and memory tools use its invocation namespace.
- The child receives declared delegation inputs, selected system context and its authorized resources. Parent message history, environment variables, extra tools and dynamic package selection are not inherited. The parent's plan-mode restriction is retained.
- Declared template routines are not registered. Existing unambiguous shared connector bindings can be used; missing or ambiguous connections require prior configuration.
- Completed calls replay their recorded result. Failed calls keep their failure; a fresh tool call starts a new attempt. Approval interrupts reuse the existing invocation and child checkpoint. Parent cancellation propagates to the child and releases its runtime resources.

This release waits for each child within the parent task. It does not add reusable child sessions, autonomous background execution or scheduling.

## Validation and release

Dedicated tests use temporary packages and task directories. They cover all package roles, package integrity, multiple templates, old dependency digests, complete graph execution with an internal Agent and toolset, entry-only tool injection, no Assistant creation/publication commands, concurrent isolation, cancellation, failure/retry, approval resume, file/onboarding isolation and deterministic dependency binding. Existing catalog, collaborator, skills and template-setup tests provide regression coverage.

See [the validation record](TEMPLATE-SUBAGENTS-VALIDATION.md) for commands, results, permission coverage and the boundary between automated integration checks and real ChatKit/model acceptance.

The SDK catalog component type and ChatKit details must be released together. Publish the SDK change first, update ChatKit's SDK dependency and lockfile to that release, then build/release ChatKit against the updated API. Local cross-repository validation can use an isolated SDK build; it does not replace a release lockfile update. Existing assistant-role template packages need no changes.
