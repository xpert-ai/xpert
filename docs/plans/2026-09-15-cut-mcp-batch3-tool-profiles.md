# Cut Batch 3: plugin-owned operation discovery

## Scope and ownership

Cut owns the shared profile catalogue, discovery, execution and Skill instructions.
No changes to subgraph, model binding or fallback behavior are required.
The decorated-provider migration extends SDK contracts for non-tool capabilities,
MCP task/input policies and middleware workspace files.
The native middleware registers exactly six tools from the first model request:
four base queries, `cut_discover_tools`, and `cut_execute_tool`.
The internal registry retains 50 validated operations. Discovery returns descriptions
and JSON parameter schemas as tool results, not additional bound model tools.

## Finalized grouping

The shared catalogue partitions all 43 MCP operations once. Base contains four
queries. Diagnostics, each timeline subgroup, proposal create/manage/undo,
caption authoring/commit, export-video, export-subtitle and version-finalize stay
separate. Native detail-reads provides the seven existing MCP Resource equivalents.

## Execution and recovery

Discover only the profiles needed, then execute with an explicit profile,
operation and arguments. The gateway checks profile membership and validates the
original schema before invoking the original scoped operation. Workbench project
context is resolved before validation; revision checks and business errors remain
in the existing services. Events retain the actual operation name and outer call ID.
Discovery never grants content approval. Existing Skills still govern user intent
and confirmation; this change does not add a new platform approval mechanism.

There is no mutable active-profile state or history-dependent reset. Detail reads,
job cancellation and proposal decisions can be rediscovered at any stage, including
a resumed task. Rediscover current resources after history compression, then read
and act against current revisions. Discovery results remain in conversation history;
this design reduces bound schemas, not all accumulated context tokens.

## Portable boundary

Existing MCP publication retains 43 tools, eight Resource Templates and four Prompts.
It uses the internal operation registry directly. Gateways are native middleware
only: exposing a general executor on MCP without per-operation publication checks
would bypass individual tool access and confirmation policies.
Portable clients therefore retain their existing behavior. The static Codex profile
export uses the shared catalogue but does not implement dynamic client-side binding.
Native middleware policies or memory mappings keyed by old operation names must
be reviewed when deploying: the host sees `cut_execute_tool`; Cut events and
internal operation traces retain the actual operation name.

## Validation

Tests cover six-tool registration and unchanged model request tools, bounded
schema discovery, full internal/MCP directories, invalid profile/argument rejection,
project-context resolution, and original operation behavior. Static profile script
tests cover export separation. Live model-driven workflow acceptance remains a
manual check; no running app is restarted or personal plugin reinstalled here.

## Decorator migration

`CutToolProvider` owns public registration through `@XpertToolProvider` and
`@XpertTool`, `@XpertResourceTemplate` and `@XpertPrompt`. The SDK generates
both adapters; the plugin no longer registers
its legacy Middleware/Toolset strategies. Operation metadata has one shared
source and the original scoped operation implementations remain internal.
Resources and prompts now use method decorators; `getMcpExtensions` remains an
SDK compatibility hook for existing plugins. All capability methods support
inheritance, with child overrides taking precedence. MCP validation remains
stricter than native Workbench inputs. SDK 3.19.0 is the planned minimum release; use the
matching local source until the SDK change is released.

The SDK and host changes are delivered first. Cut plugin changes remain local
until the SDK is published and the plugin dependency lockfile can be updated.
