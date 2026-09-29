# Collaborators as a built-in middleware

Collaborators are assembled by a host-owned middleware and executed through the
unified Agent invocation runtime. Assistant graphs, session
`runtimeResources`, public SDK contracts, and ChatKit requests keep their formats.

## Responsibility boundaries

1. `createCollaboratorsMiddleware` selects configured collaborators using the
   existing runtime capability allowlist, preserves required connections, and merges
   dynamic experts only on the conversation entry Agent (`isStart && !leaderKey`).
   It deduplicates expert IDs and creates the existing slug/description/parameter
   tool declarations.
2. `AgentInvocationGraphService.compileExperts` rejects conflicting tool/node names,
   compiles published graphs through `XpertCollaborator`, preserves streaming mute
   tags, and wraps each child with `wrapNativeAgentInvocation`.
3. `AgentInvocationRuntime` reserves a persistent invocation before dispatch,
   checks authorization, pins target/provider revisions, and tracks checkpoint
   suspension and recovery. `nativeInvocationTool` exposes the wrapped child as an
   ordinary tool in `middleware.tools`.
4. The Agent builder routes these tools through its shared tool path. Local
   followers and workflow Agent nodes use `NativeAgentCompiler` and the same
   invocation boundary; the compiler preserves their native state projections.

## Execution invariants

- Tool names and graph node names remain the expert slug. Input parameters, human
  input projection, ToolMessage IDs, parent/child execution records, and streaming
  events continue to use the existing expert executor.
- Experts execute their published graph (`isDraft: false`). They do not inherit
  the caller's dynamic resource selection. Existing execution config, recursion
  budget, partner context, cancellation signal, memory store, and environment are
  retained.
- Dynamic resource references are copied into the authorization guard. A selection
  change cannot replace the references used by an already compiled run.
- Before each call (including resume), the runtime resolves the saved resource
  references and repeats the target's authorized workflow read. This does not
  replace the compiled child graph. Revoked access or an invalid dynamic resource
  version blocks execution.
- Published invocation revisions exclude unpublished drafts, so editing a draft
  does not invalidate a paused published call. A changed published revision still
  conflicts with an existing call.
- Local followers retain their existing behavior and receive the same dynamic
  resource authorization guard when the parent run uses resources.
- `interruptBefore`, interrupts inside a child graph, checkpointer namespaces,
  `endNodes`, and return-to-Agent edges remain on the existing StateGraph path.
- `AssistantTaskRuntimeCapability` keeps its public API and delegates through the
  `xpert-task` strategy. Task records retain the resolved target workspace so
  inspection can verify their execution scope.

## Verification

Run with the repository package manager:

```sh
corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand \
  --runTestsByPath \
  packages/server-ai/src/xpert-agent/collaborators/collaborators.middleware.spec.ts \
  packages/server-ai/src/xpert-agent/collaborators/collaborators.integration.spec.ts
```

The integration tests compile a real parent StateGraph with deterministic model
responses and in-memory persistence. They cover configured and dynamic experts,
result return, execution lineage, end routing, interrupts/resume, resource snapshot
stability, revoked access/version checks, conflicting names, and cancellation.
They do not call a paid model or modify a local Assistant/database.
