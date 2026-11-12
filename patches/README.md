# Dependency patches

`@langchain/langgraph@0.4.7` queues checkpoint promises while another graph node
may still be running. A rejected write can become an unhandled rejection before
the graph drains that queue, terminating Node during cancellation or a database
failure. The patch attaches a rejection observer immediately and retains the
original rejected promise in the queue. The graph still reports the failure;
checkpoint authorization, cancellation fences and persistence are unchanged.

Both CommonJS and ESM entry points are patched. The strict child-process tests in
`checkpoint-persistence-errors.spec.ts` cover checkpoint and pending-write
rejections, including writes flushed on interrupt. API build/runtime assembly and
Web/Desktop manifest preparation carry the patch files with the shared pnpm settings.

The generated Desktop workspace permits unused patches because it intentionally
excludes the backend LangGraph dependency. This setting is local to that isolated
workspace; API and root-workspace patch checks remain strict.

## Upstream provenance

This is a temporary, minimal backport of the upstream rejection-observation fix
to the pinned `@langchain/langgraph@0.4.7` package:

- Report: [langgraphjs#2838](https://github.com/langchain-ai/langgraphjs/issues/2838).
- Original proposal: [langgraphjs#2839](https://github.com/langchain-ai/langgraphjs/pull/2839).
- Merged fix: [langgraphjs#2969](https://github.com/langchain-ai/langgraphjs/pull/2969),
  commit [5a4f83146c3c33961a908216e7792650ca3f5256](https://github.com/langchain-ai/langgraphjs/commit/5a4f83146c3c33961a908216e7792650ca3f5256).
- Official release containing the fix: [LangGraph 1.5.0 changelog](https://github.com/langchain-ai/langgraphjs/blob/main/libs/langgraph-core/CHANGELOG.md#150).

Only immediate rejection observation is backported to the old promise queue.
The upstream PR's separate DeltaChannel persistence changes are not included.
Keeping the rejected promise in the queue is essential: swallowing the write
failure or reporting a successful run would change persistence semantics.

## Deferred official upgrade

Status: planned separately; the current batch keeps the minimal backport and
does not upgrade the LangChain dependency family.

The current workspace pins LangGraph `0.4.7`, Core `0.3.72`, and Checkpoint `0.1.1`.
[LangGraph 1.5.0 package metadata](https://registry.npmjs.org/@langchain%2flanggraph/1.5.0)
requires Core `^1.1.48` and Checkpoint `^1.2.0`, so replacing only LangGraph is not
the planned migration. Version 1.5.0 identifies the upstream fix; choose the
appropriate supported target release when this work is scheduled.

1. Assess compatible versions of LangGraph, Core, Checkpoint, Supervisor/Swarm,
   model integrations and plugin peers, including persisted checkpoint formats.
2. Run the rejection regressions against the unpatched official package. Cover
   CommonJS/ESM, default Node rejection handling, async/sync durability with
   parallel nodes, and errors reaching both invoke and fully consumed streams.
3. Verify real database persistence, cancellation, interrupt/resume, existing
   thread recovery and representative Assistant/plugin execution before rollout.
4. Remove this patch and its `patchedDependencies` entry only after those checks
   pass. Regenerate and verify all workspace/deployment locks; retain patch-copy
   wiring and the Desktop unused-patch setting only if other patches need them.

Track the chosen target, validation results and rollout/rollback steps in the
upgrade change. Do not treat a swallowed error or a process-level rejection
handler as satisfying the regression checks.
