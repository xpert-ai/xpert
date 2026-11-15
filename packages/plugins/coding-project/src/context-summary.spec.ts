import { ProjectPipelinesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { deliveryFixture } from './delivery.fixture'
import { CodingDeliveryService } from './delivery.service'
import { deliveryGraphSummary } from './context-summary'
import { workPrompt } from './prompts'

it('retains stage authority and current state without repeating the full graph', async () => {
  const f = await deliveryFixture()
  try {
    await f.store.begin(f.context, 'development')
    const service = new CodingDeliveryService(f.store, f.evidence)
    const result = await service.context(f.context, f.context.work.operationId)
    expect(result.requirement).toEqual(f.row.requirement)
    expect(result.work).toEqual(f.context.work)
    expect(result.manifestSchema).toBeDefined()
    expect(result.graph).toMatchObject({
      runId: f.context.work.runId,
      roundId: f.context.work.roundId,
      runState: 'active'
    })
    expect(result.graph).not.toHaveProperty('definition')
    expect(result.graph).not.toHaveProperty('tasks')
    expect(result.graph?.statisticsScope).toContain('not delegated child tasks')
    expect(result.graph?.taskStateNotice).toContain('project_get_task')
  } finally {
    await f.db.destroy()
  }
})

it('retains actionable blockers and current node state for final coordination', async () => {
  const f = await deliveryFixture()
  try {
    const graph = await f.capabilities
      .require(ProjectPipelinesRuntimeCapability)
      .graph(f.context, f.context.work.instanceId)
    graph.tasks = {
      projectId: f.projectId,
      cursor: 'current',
      tasks: [],
      executions: [],
      diagnostics: [{ providerKey: 'test', message: 'Task projection incomplete' }]
    }
    graph.nodes[0].projection.presentation = {
      blockers: ['Missing prerequisite'],
      operationUnavailableReason: 'Executor unavailable'
    }
    graph.attentions = [
      {
        id: 'blocked',
        nodeInstanceId: f.context.work.nodeInstanceId,
        kind: 'blocked',
        state: 'open',
        revision: 1,
        generation: 1,
        inputDigest: 'a'.repeat(64),
        reasonCode: 'TEST_BLOCKER',
        outcomes: [],
        inputEvidence: []
      }
    ]
    const summary = deliveryGraphSummary(graph)
    expect(summary.nodes[0].state).toEqual(graph.nodes[0].projection.state)
    expect(summary.nodes[0].blockers).toEqual(['Missing prerequisite'])
    expect(summary.nodes[0].operationUnavailableReason).toBe('Executor unavailable')
    expect(summary.taskDiagnostics).toEqual(graph.tasks.diagnostics)
    expect(summary).not.toHaveProperty('tasks')
    expect(summary.attentions).toEqual([
      { id: 'blocked', nodeInstanceId: f.context.work.nodeInstanceId, kind: 'blocked', reasonCode: 'TEST_BLOCKER' }
    ])
  } finally {
    await f.db.destroy()
  }
})

it('uses one authoritative context read instead of embedding another full requirement', async () => {
  const f = await deliveryFixture()
  try {
    const requirement = { ...f.row.requirement, requirement: 'unique-user-requirement-for-context-read' }
    const prompt = workPrompt('development', requirement, f.context)
    expect(prompt).toContain(`operationId=${f.context.work.operationId}`)
    expect(prompt).toContain('coding_delivery_context once')
    expect(prompt).not.toContain(requirement.requirement)
  } finally {
    await f.db.destroy()
  }
})
