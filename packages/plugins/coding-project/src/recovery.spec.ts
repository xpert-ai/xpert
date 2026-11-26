import { ProjectTasksRuntimeCapability } from '@xpert-ai/plugin-sdk'
import type { ProjectTaskGraph } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { deliveryFixture } from './delivery.fixture'

describe('host-authorized coding reconciliation', () => {
  let f: Awaited<ReturnType<typeof deliveryFixture>>
  let graph: ProjectTaskGraph
  beforeEach(async () => {
    f = await deliveryFixture()
    await f.operations.prepare(f.context, 'development')
    f.setFailed()
    const accepted = f.accepted()
    graph = {
      projectId: f.projectId,
      cursor: '1',
      diagnostics: [],
      tasks: [
        {
          id: accepted.taskId,
          title: 'Accepted delivery',
          status: 'done',
          kind: 'summary',
          parentTaskId: null,
          predecessorIds: [],
          providerKey: null,
          sourceKey: null,
          revision: 4,
          plannedStartAt: null,
          plannedEndAt: null,
          estimatedDurationMs: null,
          actualStartAt: null,
          actualEndAt: null,
          diagnostic: null,
          assigneeXpertId: null
        }
      ],
      executions: [
        {
          id: randomUUID(),
          taskId: accepted.taskId,
          projectId: f.projectId,
          conversationId: f.context.executor.conversationId,
          status: 'succeeded',
          attempt: 1
        }
      ]
    }
    jest.spyOn(f.capabilities.require(ProjectTasksRuntimeCapability), 'graph').mockImplementation(async () => graph)
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    await f.db.destroy()
  })
  it('recovers accepted work without reopening ordinary submission or running tasks', async () => {
    await expect(
      f.evidence.submit(f.context, f.context.executor.conversationId, f.context.work.operationId, f.accepted().taskId)
    ).rejects.toMatchObject({ response: { code: 'CODING_OPERATION_NOT_ACTIVE' } })
    const result = await f.operations.reconcile(f.context, 'development')
    expect(await f.evidence.read(f.context, result.result)).toMatchObject({
      taskId: f.accepted().taskId,
      decisionId: f.accepted().decisionId,
      work: f.context.work
    })
    expect(await f.operations.reconcile(f.context, 'development')).toEqual(result)
  })
  it.each(['conversation', 'review', 'bytes', 'requirement'])('refuses invalid %s evidence', async (kind) => {
    if (kind === 'conversation') graph.executions[0].conversationId = randomUUID()
    if (kind === 'review') f.accepted().review = null
    if (kind === 'bytes') f.artifacts.get(f.packageFile.artifactId)!.buffer = Buffer.from('changed')
    if (kind === 'requirement') f.changeTarget()
    await expect(f.operations.reconcile(f.context, 'development')).rejects.toThrow()
    expect((await f.store.operation(f.context, f.context.work.operationId)).evidence).toBeNull()
  })
  it('rechecks sealed evidence instead of treating a previous seal as recovery authority', async () => {
    await f.operations.reconcile(f.context, 'development')
    f.readAcceptance.mockResolvedValue(null)
    await expect(f.operations.reconcile(f.context, 'development')).rejects.toMatchObject({
      response: { code: 'CODING_FORMAL_ACCEPTANCE_NOT_SUBMITTED' }
    })
  })
  it('requires exactly one accepted summary for the pinned conversation', async () => {
    const taskId = randomUUID()
    graph.tasks.push({ ...graph.tasks[0], id: taskId })
    graph.executions.push({ ...graph.executions[0], id: randomUUID(), taskId })
    f.readAcceptance.mockImplementation(async (_c, id) => ({ ...f.accepted(), taskId: id }))
    await expect(f.operations.reconcile(f.context, 'development')).rejects.toMatchObject({
      response: { code: 'CODING_RECOVERY_ACCEPTANCE_REQUIRED' }
    })
  })
})
