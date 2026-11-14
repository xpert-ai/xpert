import { randomUUID } from 'node:crypto'
import {
  projectPipelineConfigurationSchema,
  checkProjectPipelineConfiguration,
  WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import {
  ProjectPipelineCatalogRuntimeCapability,
  ProjectPipelineCommandsRuntimeCapability,
  type ProjectPipelineCommandsApi
} from '@xpert-ai/plugin-sdk'
import { deliveryFixture } from './delivery.fixture'
import { CodingDeliveryService } from './delivery.service'
import { localConfiguration, CodingPipelineContribution } from './pipeline'
import { localRequirementSchema, releaseRequirementSchema } from './schemas'
import { CodingDelivery } from './entities'
import { deploymentRequest } from './deployment-request'
import { workPrompt } from './prompts'
import { CodingDeliveryMiddleware } from './middleware'
import { CodingDeploymentService } from './deployment'
import { CodingGitService } from './git'
import { PROVIDER } from './constants'

let f: Awaited<ReturnType<typeof deliveryFixture>>
beforeEach(async () => {
  f = await deliveryFixture()
  f.setDefaultMode('local')
})
afterEach(async () => {
  await f.db.destroy()
})
function startup() {
  const configure = jest.fn(async (_context, input) => {
    projectPipelineConfigurationSchema.parse(input.configuration)
    return { bindingId: randomUUID(), revision: 1, definitionDigest: 'a'.repeat(64) }
  })
  const start = jest.fn(async () => ({
    instanceId: randomUUID(),
    runId: randomUUID(),
    roundId: randomUUID(),
    revision: 1
  }))
  const unexpectedCatalogCall = async () => {
    throw new Error('Unexpected catalog operation')
  }
  f.capabilities.register(ProjectPipelineCatalogRuntimeCapability, {
    bindings: async () => ({ items: [], next: null }),
    list: unexpectedCatalogCall,
    binding: unexpectedCatalogCall,
    configure: unexpectedCatalogCall
  })
  f.capabilities.register(ProjectPipelineCommandsRuntimeCapability, {
    ...f.capabilities.require(ProjectPipelineCommandsRuntimeCapability),
    configure,
    start
  })
  return { service: new CodingDeliveryService(f.store, f.evidence), configure, start }
}
async function localStage() {
  f.row.requirement = localRequirementSchema.parse({
    title: 'JSON tools',
    requirement: 'Build, install and test inside the Computer',
    mode: 'local'
  })
  await f.db.getRepository(CodingDelivery).save(f.row)
  f.context.subjects = [f.store.version(f.row)]
  await f.operations.prepare(f.context, 'development')
}

it('uses a valid native DAG ending after independent local acceptance, with no release nodes', () => {
  expect(projectPipelineConfigurationSchema.parse(localConfiguration)).toEqual(localConfiguration)
  expect(
    checkProjectPipelineConfiguration(localConfiguration, [
      ...new CodingPipelineContribution().descriptors,
      { kind: 'completion', ref: 'platform.output-validated@1' }
    ]).valid
  ).toBe(true)
  if (localConfiguration.template.executionAuthority !== 'platform') throw new Error('Expected native pipeline')
  expect(localConfiguration.template.nodes.map((node) => node.key)).toEqual(['development', 'accepted'])
  expect(localConfiguration.template.roundPolicy.terminalOutcomes).toEqual(['locally_accepted'])
  expect(localConfiguration.binding.roleBindings).toEqual({})
})
it('starts with empty external configuration, pins local mode and reuses the same instance', async () => {
  f.revoke()
  const allowed = jest.spyOn(f.store, 'allowed').mockRejectedValue(new Error('must not consult external destinations'))
  const { service, configure, start } = startup(),
    conversationId = randomUUID()
  expect(await service.preflight(f.context, f.context.executor.xpertId)).toMatchObject({
    mode: 'local',
    ready: true,
    blockers: [],
    targets: [],
    repositories: []
  })
  const input = { title: 'Local JSON plugin', requirement: 'No push; real platform tests inside Computer' }
  const result = await service.start(f.context, conversationId, f.context.executor.xpertId, input)
  expect(result).toMatchObject({ nextAction: 'finish_coordination_turn' })
  const stored = await f.store.get(f.context, result.deliveryId)
  expect(stored.requirement).toMatchObject({ mode: 'local' })
  expect(stored.requirement).not.toHaveProperty('target')
  expect(stored.requirement).not.toHaveProperty('repository')
  expect(configure.mock.calls[0][1].configuration.binding.templateRef).toBe('coding_project.local@1.0.0')
  f.setDefaultMode('release')
  expect(await service.start(f.context, conversationId, f.context.executor.xpertId, input)).toMatchObject({
    reused: true,
    instanceId: result.instanceId,
    nextAction: 'finish_coordination_turn'
  })
  expect(start).toHaveBeenCalledTimes(1)
  expect(allowed).not.toHaveBeenCalled()
})
it('does not silently turn an unauthorized release into local acceptance', async () => {
  f.revoke()
  const { service, start } = startup()
  expect(await service.preflight(f.context, f.context.executor.xpertId, { mode: 'release' })).toMatchObject({
    ready: false,
    blockers: ['CODING_CONFIGURE_AUTHORIZED_TARGET_AND_REPOSITORY']
  })
  await expect(
    service.start(f.context, randomUUID(), f.context.executor.xpertId, {
      title: 'Release',
      requirement: 'Deploy',
      mode: 'release'
    })
  ).rejects.toMatchObject({ response: { code: 'CODING_CONFIGURE_AUTHORIZED_TARGET_AND_REPOSITORY' } })
  expect(start).not.toHaveBeenCalled()
})
it('distinguishes choosing among authorized destinations from missing configuration', async () => {
  const allowed = await f.store.allowed(f.context)
  jest.spyOn(f.store, 'allowed').mockResolvedValue({
    targets: [...allowed.targets, { ...allowed.targets[0], key: 'another-target' }],
    repositories: [...allowed.repositories, { ...allowed.repositories[0], key: 'another-repo' }]
  })
  const { service } = startup()
  await expect(service.preflight(f.context, f.context.executor.xpertId, { mode: 'release' })).resolves.toMatchObject({
    ready: false,
    blockers: ['CODING_DESTINATION_SELECTION_REQUIRED']
  })
  await expect(
    service.preflight(f.context, f.context.executor.xpertId, {
      mode: 'release',
      targetKey: 'test',
      repositoryKey: 'repo'
    })
  ).resolves.toMatchObject({ ready: true, targetKey: 'test', repositoryKey: 'repo' })
  await expect(
    service.preflight(f.context, f.context.executor.xpertId, {
      mode: 'release',
      targetKey: 'unauthorized',
      repositoryKey: 'repo'
    })
  ).resolves.toMatchObject({ ready: false, blockers: ['CODING_DESTINATION_NOT_AUTHORIZED'] })
})
it('reuses pinned release destinations after more choices are configured', async () => {
  const { service, start } = startup(),
    conversationId = randomUUID()
  const input = { title: 'Release replay', requirement: 'Publish the accepted program', mode: 'release' as const }
  const first = await service.start(f.context, conversationId, f.context.executor.xpertId, input)
  const allowed = await f.store.allowed(f.context)
  jest.spyOn(f.store, 'allowed').mockResolvedValue({
    targets: [...allowed.targets, { ...allowed.targets[0], key: 'another-target' }],
    repositories: [...allowed.repositories, { ...allowed.repositories[0], key: 'another-repo' }]
  })
  await expect(service.start(f.context, conversationId, f.context.executor.xpertId, input)).resolves.toMatchObject({
    instanceId: first.instanceId,
    reused: true
  })
  expect(start).toHaveBeenCalledTimes(1)
})
it('accepts explicit destination choices through the Assistant tool schema', async () => {
  const allowed = await f.store.allowed(f.context)
  jest.spyOn(f.store, 'allowed').mockResolvedValue({
    targets: [...allowed.targets, { ...allowed.targets[0], key: 'another-target' }],
    repositories: [...allowed.repositories, { ...allowed.repositories[0], key: 'another-repo' }]
  })
  const { service } = startup()
  const middleware = new CodingDeliveryMiddleware(
    service,
    f.store,
    f.evidence,
    new CodingDeploymentService(f.store, f.evidence),
    new CodingGitService(f.store, f.evidence, f.operations)
  )
  const unexpectedRuntimeCall = async () => {
    throw new Error('Unexpected model runtime call')
  }
  const agent = middleware.createMiddleware(
    {},
    {
      ...f.context.actor,
      projectId: f.context.projectId,
      conversationId: randomUUID(),
      xpertId: f.context.executor.xpertId,
      node: { id: randomUUID(), key: 'delivery', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: PROVIDER },
      tools: new Map(),
      runtime: { createModelClient: unexpectedRuntimeCall, wrapWorkflowNodeExecution: unexpectedRuntimeCall }
    }
  )
  const preflight = agent.tools?.find((item) => item.name === 'coding_delivery_targets')
  if (!preflight) throw new Error('Missing preflight tool')
  const result = await preflight.invoke({ mode: 'release', targetKey: 'test', repositoryKey: 'repo' })
  expect(JSON.parse(result)).toMatchObject({ ready: true, targetKey: 'test', repositoryKey: 'repo' })
})
it('requires a new release round when the pinned destination policy changes', async () => {
  const { service, start } = startup(),
    conversationId = randomUUID()
  const input = { title: 'Release scope', requirement: 'Publish the accepted program', mode: 'release' as const }
  await service.start(f.context, conversationId, f.context.executor.xpertId, input)
  f.changeTarget()
  await expect(service.start(f.context, conversationId, f.context.executor.xpertId, input)).rejects.toMatchObject({
    response: { code: 'CODING_DESTINATION_CHANGED_NEW_ROUND_REQUIRED' }
  })
  expect(start).toHaveBeenCalledTimes(1)
})
it('rejects external destination keys in local mode and foreign project access before creating work', async () => {
  const { service, start } = startup()
  await expect(
    service.start(f.context, randomUUID(), f.context.executor.xpertId, {
      title: 'Local',
      requirement: 'Test',
      mode: 'local',
      targetKey: 'host'
    })
  ).rejects.toMatchObject({ response: { code: 'CODING_LOCAL_SCOPE_HAS_EXTERNAL_DESTINATION' } })
  await expect(
    service.preflight({ ...f.context, projectId: randomUUID() }, f.context.executor.xpertId, { mode: 'local' })
  ).rejects.toThrow('denied')
  expect(start).not.toHaveBeenCalled()
})
it('requires independent acceptance, seals local artifacts, and cannot generate a host deployment request', async () => {
  await localStage()
  const submitted = () =>
    f.evidence.submit(
      f.context,
      f.context.executor.conversationId,
      f.context.work.operationId,
      f.accepted().taskId,
      f.manifestFile.artifactId
    )
  f.readAcceptance.mockResolvedValueOnce({ ...f.accepted(), review: null })
  await expect(submitted()).rejects.toMatchObject({ response: { code: 'CODING_EXECUTION_REVIEW_REQUIRED' } })
  const ref = await submitted(),
    evidence = await f.evidence.read(f.context, ref)
  expect(evidence.releaseScope).toEqual({ mode: 'local' })
  expect(await f.operations.collect(f.context, 'development')).toEqual({ result: ref })
  expect(() => deploymentRequest(evidence)).toThrow()
  for (const phase of ['deployment', 'git'] as const)
    await expect(f.operations.prepare(f.context, phase)).rejects.toMatchObject({
      response: { code: 'CODING_LOCAL_RELEASE_FORBIDDEN' }
    })
  expect(await submitted()).toEqual(ref)
})
it('keeps legacy release snapshots unchanged and gives the CLI local-only work instructions', async () => {
  const legacy = releaseRequirementSchema.parse(f.requirement)
  expect(legacy).not.toHaveProperty('mode')
  await localStage()
  const prompt = workPrompt('development', f.row.requirement, f.context)
  expect(prompt).toContain('This is local development and acceptance only')
  expect(prompt).not.toContain('This stage stops at native human release approval')
  expect(prompt).not.toContain('relative to the configured base commit')
})
