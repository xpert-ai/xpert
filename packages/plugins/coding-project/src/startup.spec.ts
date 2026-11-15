import { randomUUID } from 'node:crypto'
import { projectPipelineConfigurationSchema, type ProjectPipelineSavedConfiguration } from '@xpert-ai/contracts'
import {
  ProjectPipelineCatalogRuntimeCapability,
  ProjectPipelineCommandsRuntimeCapability,
  type ProjectPipelineCommandsApi
} from '@xpert-ai/plugin-sdk'
import { deliveryFixture } from './delivery.fixture'
import { CodingDeliveryService } from './delivery.service'
import { configuration, currentInstanceConfiguration } from './pipeline'
import { CodingDelivery } from './entities'

describe.each(['cli', 'current-instance'] as const)('Coding delivery startup: %s', (deployment) => {
  let f: Awaited<ReturnType<typeof deliveryFixture>>
  beforeEach(async () => {
    f = await deliveryFixture(deployment)
  })
  afterEach(async () => {
    await f.db.destroy()
  })

  it('starts with a valid complete executor configuration and reuses the persisted instance on replay', async () => {
    const template = deployment === 'current-instance' ? currentInstanceConfiguration : configuration
    const original = JSON.stringify(template)
    const saved: ProjectPipelineSavedConfiguration[] = []
    const instanceId = randomUUID(),
      bindingId = randomUUID()
    const configure = jest.fn<
      ReturnType<ProjectPipelineCommandsApi['configure']>,
      Parameters<ProjectPipelineCommandsApi['configure']>
    >(async (_context, request) => {
      // Use the actual host contract: dropping a required executor must fail before start.
      saved.push({
        id: bindingId,
        revision: 1,
        createdAt: new Date().toISOString(),
        configuration: projectPipelineConfigurationSchema.parse(request.configuration)
      })
      return { bindingId, revision: 1, definitionDigest: 'a'.repeat(64) }
    })
    const start = jest.fn<
      ReturnType<ProjectPipelineCommandsApi['start']>,
      Parameters<ProjectPipelineCommandsApi['start']>
    >(async () => ({ instanceId, runId: randomUUID(), roundId: randomUUID(), revision: 1 }))
    f.capabilities.register(ProjectPipelineCommandsRuntimeCapability, {
      ...f.capabilities.require(ProjectPipelineCommandsRuntimeCapability),
      configure,
      start
    })
    const unexpectedCatalogOperation = async () => {
      throw new Error('Unexpected catalog operation')
    }
    const bindings = jest.fn(async () => ({ items: saved, next: null }))
    f.capabilities.register(ProjectPipelineCatalogRuntimeCapability, {
      bindings,
      list: unexpectedCatalogOperation,
      binding: unexpectedCatalogOperation,
      configure: unexpectedCatalogOperation
    })
    const service = new CodingDeliveryService(f.store, f.evidence),
      conversationId = randomUUID()
    const input = { mode: 'release' as const, title: 'Start delivery', requirement: 'Deliver the requested plugin' }
    const result = await service.start(f.context, conversationId, f.context.executor.xpertId, input)

    expect(result).toMatchObject({ instanceId, reused: false })
    expect(saved).toHaveLength(1)
    const executors = saved[0].configuration.binding.executorBindings
    expect(executors?.coordinator).toEqual({
      kind: 'assistant',
      roleKey: 'coordinator',
      selectionKey: f.context.executor.xpertId
    })
    if (deployment === 'current-instance') {
      expect(executors?.installer).toEqual({
        kind: 'service',
        roleKey: 'installer',
        selectionKey: 'platform.plugin-deployment'
      })
    } else {
      expect(executors).not.toHaveProperty('installer')
    }
    expect(start).toHaveBeenCalledWith(f.context, {
      bindingId,
      objectKey: result.deliveryId,
      triggerKey: result.deliveryId,
      title: input.title
    })
    expect((await f.db.getRepository(CodingDelivery).findOneByOrFail({ id: result.deliveryId })).instanceId).toBe(
      instanceId
    )
    expect(await service.start(f.context, conversationId, f.context.executor.xpertId, input)).toMatchObject({
      deliveryId: result.deliveryId,
      instanceId,
      reused: true,
      nextAction: 'finish_coordination_turn'
    })
    expect(configure).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
    expect(bindings).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(template)).toBe(original)
  })
})
