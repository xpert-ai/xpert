import type { ProjectPipelineGraph } from '@xpert-ai/contracts'

/** Runtime blockage does not revoke an accepted candidate or rewrite persisted business state. */
export function observeModelBudgetDenials(
    nodes: ProjectPipelineGraph['nodes'],
    denials: ReadonlyArray<{ operation: { nodeInstanceId: string } }>
): ProjectPipelineGraph['nodes'] {
    const blocked = new Set(denials.map(({ operation }) => operation.nodeInstanceId))
    return nodes.map((node) =>
        blocked.has(node.id)
            ? {
                  ...node,
                  projection: {
                      ...node.projection,
                      state: { ...node.projection.state, readiness: 'blocked', runtime: 'failed' },
                      presentation: {
                          ...node.projection.presentation,
                          blockers: [
                              ...new Set([...(node.projection.presentation?.blockers ?? []), 'MODEL_BUDGET_EXCEEDED'])
                          ]
                      }
                  }
              }
            : node
    )
}
