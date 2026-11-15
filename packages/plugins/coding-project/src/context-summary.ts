import type { ProjectPipelineGraph } from '@xpert-ai/contracts'

/** Coordination needs current state, not another copy of the definition, task reports and artifact graph. */
export function deliveryGraphSummary(graph: ProjectPipelineGraph) {
  return {
    instance: graph.instance,
    runId: graph.runId,
    runState: graph.runState,
    roundId: graph.roundId,
    round: graph.round,
    historical: graph.historical,
    historyComplete: graph.historyComplete,
    snapshotAt: graph.snapshotAt,
    dispatchEnabled: graph.dispatchEnabled,
    nodes: graph.nodes.map(({ id, projection, taskIds }) => ({
      id,
      key: projection.key,
      title: projection.title,
      kind: projection.kind,
      state: projection.state,
      blockers: projection.presentation?.blockers,
      operationUnavailableReason: projection.presentation?.operationUnavailableReason,
      taskIds
    })),
    attentions: graph.attentions
      ?.filter((attention) => attention.state === 'open')
      .map((attention) => ({
        id: attention.id,
        nodeInstanceId: attention.nodeInstanceId,
        kind: attention.kind,
        reasonCode: attention.reasonCode
      })),
    refresh: graph.refresh,
    taskDiagnostics: graph.tasks?.diagnostics,
    actions: graph.actions,
    statistics: graph.statistics,
    statisticsScope:
      'Execution counts and durations cover directly linked node executions only, not delegated child tasks or end-to-end delivery time. Model usage has its own reported scope.',
    taskStateNotice:
      'Pipeline completion does not establish summary/child task completion. Read the delivery summary with project_get_task before the final reply; retain unresolved task states and review limitations.'
  }
}
