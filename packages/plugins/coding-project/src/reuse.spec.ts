import { randomUUID } from 'node:crypto'
import { ProjectPipelineCatalogRuntimeCapability, ProjectPipelineCommandsRuntimeCapability,
  type ProjectPipelineCatalogApi, type ProjectPipelineCommandsApi } from '@xpert-ai/plugin-sdk'
import { deliveryFixture } from './delivery.fixture'
import { CodingDeliveryService } from './delivery.service'
import { CodingDelivery } from './entities'
import { workPrompt } from './prompts'

describe('release an existing accepted task', () => {
  let f: Awaited<ReturnType<typeof deliveryFixture>>
  beforeEach(async () => { f = await deliveryFixture() })
  afterEach(async () => { await f.db.destroy() })
  function source() {
    const a = f.accepted()
    if (!a.review) throw new Error('Fixture independent review required')
    return { type: 'accepted_task' as const, taskId: a.taskId, taskRevision: a.taskRevision,
      decisionId: a.decisionId, reviewExecutionId: a.review.executionId }
  }
  it('pins the host-verified acceptance before starting release preparation', async () => {
    f.capabilities.register(ProjectPipelineCatalogRuntimeCapability,
      Object.assign({} as ProjectPipelineCatalogApi, { bindings: async () => ({ items: [] }) }))
    const start = jest.fn(async () => ({ instanceId: randomUUID() }))
    f.capabilities.register(ProjectPipelineCommandsRuntimeCapability, Object.assign({} as ProjectPipelineCommandsApi, {
      configure: async () => ({ bindingId: randomUUID() }), start
    }))
    const result = await new CodingDeliveryService(f.store, f.evidence).start(f.context,
      randomUUID(), f.context.executor.xpertId, { title: 'Release existing plugin', requirement: 'Deploy the accepted package unchanged',
        acceptedTaskId: f.accepted().taskId })
    const stored = await f.store.get(f.context, result.deliveryId)
    expect(stored.requirement.origin).toEqual(source())
    expect(f.readAcceptance).toHaveBeenCalledWith({ actor: f.actor, projectId: f.projectId }, f.accepted().taskId)
    expect(start).toHaveBeenCalledTimes(1)
    const prompt = workPrompt('development', stored.requirement, f.context)
    expect(prompt).toContain('release preparation, not new development')
    expect(prompt).not.toContain('Develop and independently test')
  })
  it('cannot turn an unaccepted task into a release candidate', async () => {
    f.readAcceptance.mockRejectedValueOnce(new Error('Independent acceptance required'))
    await expect(new CodingDeliveryService(f.store, f.evidence).start(f.context, randomUUID(), f.context.executor.xpertId,
      { title: 'Unaccepted', requirement: 'Deploy', acceptedTaskId: randomUUID() }))
      .rejects.toThrow('Independent acceptance required')
    expect(await f.db.getRepository(CodingDelivery).count()).toBe(1)
  })
  it('reuses the owning delivery when a stage conversation repeats start', async () => {
    await f.store.begin(f.context, 'development')
    const service = new CodingDeliveryService(f.store, f.evidence)
    const input = { title: 'Accidental nested delivery', requirement: 'Do not create another Pipeline', acceptedTaskId: randomUUID() }
    const result = await service.start(f.context, f.context.executor.conversationId, f.context.executor.xpertId, input)
    expect(result).toMatchObject({ deliveryId: f.row.id, instanceId: f.context.work.instanceId,
      operationId: f.context.work.operationId, reused: true, alreadyExecutingStage: true })
    expect(await f.db.getRepository(CodingDelivery).count()).toBe(1)
    expect(f.capabilities.require(ProjectPipelineCommandsRuntimeCapability).start).not.toHaveBeenCalled()
    await expect(service.start(f.context, f.context.executor.conversationId, randomUUID(), input))
      .rejects.toMatchObject({ response: { code: 'CODING_EXECUTOR_SCOPE_MISMATCH' } })
  })
  it('rejects later changes to the original acceptance and permits explicitly requested business rework', async () => {
    const requirement = { ...f.row.requirement, origin: source() }
    await expect(f.store.authorizeRequirement(f.context, requirement)).resolves.toBeUndefined()
    f.readAcceptance.mockResolvedValueOnce({ ...f.accepted(), taskRevision: f.accepted().taskRevision + 1 })
    await expect(f.store.authorizeRequirement(f.context, requirement))
      .rejects.toMatchObject({ response: { code: 'CODING_SOURCE_ACCEPTANCE_CHANGED' } })
    expect(workPrompt('development', { ...requirement, feedback: 'Independent target review found a source bug' }, f.context))
      .toContain('Develop and independently test')
  })
})
