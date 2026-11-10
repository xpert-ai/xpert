import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { randomUUID, createHash } from 'node:crypto'
import { RequestContext, type ProjectPipelineOperationContext } from '@xpert-ai/plugin-sdk'
import { projectPluginDeploymentRefs } from '@xpert-ai/contracts'
import { ArtifactsService } from '../../../artifacts/artifacts.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectFilesRuntimeService } from '../../services/project-files-runtime.service'
import { ProjectPipelineEvidenceService } from '../runtime/pipeline-evidence.service'
import { ProjectPluginDeploymentService } from './plugin-deployment.service'
import { ProjectPluginDeploymentStore } from './plugin-deployment.store'
import { ProjectPluginTestAccessService } from './plugin-test-access.service'
import { ProjectPluginDeploymentAdapters } from './plugin-deployment.adapters'
import { pipelineDigest } from '../persistence/pipeline-identity'
import { pipelineDecisionEvidence } from '../runtime/pipeline-decision-evidence'
import { ProjectPipelineDecisionEntity, ProjectPipelineOperationEntity, ProjectPipelineEventEntity } from '../persistence/pipeline.entity'
import { decisionEvidence } from '../runtime/pipeline-decision-inputs'

jest.mock('@xpert-ai/server-core', () => ({
  DeployPluginArchiveCommand: class { constructor(readonly input: unknown) {} },
  ResolveExecutionIdentityCommand: class { constructor(readonly actor: unknown) {} },
  runWithExecutionIdentity: jest.fn(async (_identity: unknown, callback: () => Promise<unknown>) => callback())
}))
jest.mock('../../../artifacts/artifacts.service', () => ({ ArtifactsService: class {} }))
jest.mock('../../services/project-access-runtime.service', () => ({ ProjectAccessRuntimeService: class {} }))
jest.mock('../../services/project-files-runtime.service', () => ({ ProjectFilesRuntimeService: class {} }))
jest.mock('../../services/task-projection/project-task-projection.writer', () => ({
  projectionScope: (c: ProjectPipelineOperationContext) => ({ tenantId: c.actor.tenantId, organizationId: c.actor.organizationId, projectId: c.projectId })
}))
jest.mock('../runtime/pipeline-transaction', () => ({
  lockManagedProject: jest.fn(), managedAudit: () => ({})
}))
jest.mock('../persistence/pipeline-human-wait-snapshot', () => ({ capturePipelineHumanWaitSnapshot: async () => ({ nodeIds: [] }) }))
jest.mock('../persistence/pipeline.entity', () => ({
  ProjectPipelineOperationEntity: class ProjectPipelineOperationEntity {},
  ProjectPipelineInstanceEntity: class ProjectPipelineInstanceEntity {},
  ProjectPipelineRoundEntity: class ProjectPipelineRoundEntity {},
  ProjectPipelineRunEntity: class ProjectPipelineRunEntity {},
  ProjectPipelineNodeEntity: class ProjectPipelineNodeEntity {},
  ProjectPipelineDecisionEntity: class ProjectPipelineDecisionEntity {},
  ProjectPipelineEventEntity: class ProjectPipelineEventEntity {}
}))

describe('host-owned plugin deployment node', () => {
  const buffer = Buffer.from('approved archive')
  const request = { target: 'current-instance' as const, artifactId: randomUUID(), artifactVersionId: randomUUID(),
    fileName: 'plugin.tgz', packageName: '@test/plugin', packageVersion: '1.0.0',
    sha256: createHash('sha256').update(buffer).digest('hex'), allowReplace: false, allowRestart: false }
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }, publisher = randomUUID()
  const requestRef = { resolverRef: 'test.candidate@1', schemaRef: projectPluginDeploymentRefs.request,
    objectKey: randomUUID(), version: '1', digest: pipelineDigest(request), producerOperationId: randomUUID() }
  let c: ProjectPipelineOperationContext, operation: ProjectPipelineOperationEntity, decision: ProjectPipelineDecisionEntity
  let service: ProjectPluginDeploymentService, store: ProjectPluginDeploymentStore, tests: ProjectPluginTestAccessService
  let events: ProjectPipelineEventEntity[], active: boolean
  const execute = jest.fn(), assertEdit = jest.fn(), assertManage = jest.fn(), verify = jest.fn(), readArchive = jest.fn()
  const write = jest.fn(), readFile = jest.fn()
  beforeEach(async () => {
    jest.clearAllMocks(); active = true; events = []
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
    const operationId = randomUUID()
    c = { actor, projectId: randomUUID(), idempotencyKey: operationId,
      work: { operationId, instanceId: randomUUID(), runId: randomUUID(), roundId: randomUUID(), nodeInstanceId: randomUUID(),
        generation: 1, inputDigest: 'a'.repeat(64) }, subjects: [], parameters: {}, inputs: { request: { kind: 'evidence', value: requestRef } } }
    decision = Object.assign(new ProjectPipelineDecisionEntity(), { id: randomUUID(), kind: 'human' as const,
      roundId: c.work.roundId, nodeInstanceId: randomUUID(), operationId: randomUUID(), inputDigest: c.work.inputDigest,
      generation: 1, outcome: 'approve', actorId: publisher, policyRef: 'test.approval@1', evidence: [requestRef] })
    c.inputs.approval = { kind: 'evidence', value: pipelineDecisionEvidence(decision) }
    operation = Object.assign(new ProjectPipelineOperationEntity(), { id: operationId, context: structuredClone(c),
      handlerRef: projectPluginDeploymentRefs.operation, kind: 'operation' as const, state: 'dispatching' as const,
      dispatchStartedAt: new Date(), leaseOwner: randomUUID(), leaseFence: 1, leaseExpiresAt: new Date(Date.now() + 120000) })
    const find = async (entity: { name: string }, query: { id: string }) => {
      if (entity.name === 'ProjectPipelineOperationEntity') return operation
      if (entity.name === 'ProjectPipelineDecisionEntity') return decision
      if (entity.name === 'ProjectPipelineEventEntity') return events.find((event) => event.id === query.id) ?? null
      if (entity.name === 'ProjectPipelineInstanceEntity') return { id: c.work.instanceId, authority: 'platform',
        currentRunId: c.work.runId, currentRoundId: active ? c.work.roundId : randomUUID(), revision: 1 }
      if (entity.name === 'ProjectPipelineRunEntity') return { state: 'active' }
      if (entity.name === 'ProjectPipelineRoundEntity') return { state: 'active', generation: 1, inputDigest: c.work.inputDigest }
      if (entity.name === 'ProjectPipelineNodeEntity') return { disposition: 'active', projection: { state: { freshness: 'current', applicability: 'selected' } } }
      throw Error(entity.name)
    }
    const manager = { findOneBy: jest.fn(find), findOneByOrFail: jest.fn(find), save: jest.fn(),
      insert: jest.fn(async (_entity: unknown, event: ProjectPipelineEventEntity) => { events.push(event) }) }
    verify.mockResolvedValue(request); assertEdit.mockResolvedValue({}); assertManage.mockResolvedValue({})
    readArchive.mockResolvedValue({ buffer, artifact: { id: request.artifactId, ...actor, projectId: c.projectId },
      version: { id: request.artifactVersionId, artifactId: request.artifactId } })
    execute.mockImplementation(async (command: object) => 'actor' in command ? { resolved: true } : 'input' in command ? {
      packageName: request.packageName, expectedSha256: request.sha256, expectedVersion: request.packageVersion,
      installed: true, loaded: true, scopeKey: 'tenant:test', runtimeRevision: 'runtime-1', restartRequired: false
    } : { secret: 'bounded-test-secret', endpoint: '/mcp', publicationId: randomUUID(), expiresAt: '2030-01-01T00:00:00Z' })
    readFile.mockRejectedValue(Object.assign(Error('missing'), { code: 'ENOENT' }))
    const module = await Test.createTestingModule({ providers: [ProjectPluginDeploymentStore, ProjectPluginDeploymentService,
      ProjectPluginTestAccessService, ...ProjectPluginDeploymentAdapters,
      { provide: DataSource, useValue: { manager, transaction: (fn: (value: typeof manager) => Promise<unknown>) => fn(manager) } },
      { provide: CommandBus, useValue: { execute } }, { provide: ProjectPipelineEvidenceService, useValue: { verify } },
      { provide: ProjectAccessRuntimeService, useValue: { assertEdit, assertManage, listReadable: jest.fn(async () => [{}]) } },
      { provide: ProjectFilesRuntimeService, useValue: { mkdir: jest.fn(), read: readFile, write } },
      { provide: ArtifactsService, useValue: { readArtifactVersion: readArchive } }] }).compile()
    service = module.get(ProjectPluginDeploymentService); store = module.get(ProjectPluginDeploymentStore); tests = module.get(ProjectPluginTestAccessService)
  })
  afterEach(() => jest.restoreAllMocks())

  it('pins gate inputs alongside attachments and deduplicates exact references', () => {
    expect(decisionEvidence({ request: { kind: 'evidence', value: requestRef }, copies: { kind: 'evidence_collection', value: [requestRef] } }, []))
      .toEqual([requestRef])
  })
  it('authorizes the recorded publisher and persists immutable host evidence', async () => {
    const receipt = await service.execute(c)
    expect(execute.mock.calls[0][0]).toMatchObject({ actor: { ...actor, userId: publisher, kind: 'user' } })
    expect(assertManage).toHaveBeenCalledWith({ ...c, actor: { ...actor, userId: publisher } })
    expect(execute.mock.calls[1][0]).toMatchObject({ input: { buffer, allowReplace: false, allowRestart: false, action: 'install' } })
    if (receipt.status !== 'succeeded') throw Error('missing receipt')
    await expect(store.read(c, receipt.outputs.deployment)).resolves.toMatchObject({ request, runtimeRevision: 'runtime-1' })
    expect(events).toHaveLength(1)
    await service.inspect(c)
    expect(events).toHaveLength(1)
  })
  it.each(['no-approved-input', 'different-round', 'different-generation', 'declined', 'policy-decision', 'stale-worker', 'cancelled', 'expired-lease', 'superseded'] as const)
    ('blocks %s before installation', async (reason) => {
      if (reason === 'no-approved-input') decision.evidence = []
      if (reason === 'different-round') decision.roundId = randomUUID()
      if (reason === 'different-generation') decision.generation++
      if (reason === 'declined') decision.outcome = 'rework'
      if (reason === 'policy-decision') decision.kind = 'policy'
      if (reason === 'stale-worker') c.inputs.request = { kind: 'evidence', value: { ...requestRef, digest: 'f'.repeat(64) } }
      if (reason === 'cancelled') operation.cancelRequestedAt = new Date()
      if (reason === 'expired-lease') operation.leaseExpiresAt = new Date(0)
      if (reason === 'superseded') active = false
      await expect(service.execute(c)).rejects.toThrow()
      expect(execute).not.toHaveBeenCalled()
    })
  it('does not accept a valid decision for a different request', async () => {
    decision.evidence = [{ ...requestRef, digest: 'f'.repeat(64) }]
    c.inputs.approval = { kind: 'evidence', value: pipelineDecisionEvidence(decision) }; operation.context = structuredClone(c)
    await expect(service.execute(c)).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })
  it.each(['bytes', 'project', 'tenant', 'version'] as const)('rejects archive %s mismatch', async (field) => {
    const archive = await readArchive()
    if (field === 'bytes') archive.buffer = Buffer.from('other')
    if (field === 'project') archive.artifact.projectId = randomUUID()
    if (field === 'tenant') archive.artifact.tenantId = randomUUID()
    if (field === 'version') archive.version.id = randomUUID()
    await expect(service.execute(c)).rejects.toThrow()
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('checks live publisher authority on every recovery', async () => {
    assertManage.mockRejectedValueOnce(Error('revoked'))
    await expect(service.inspect(c)).rejects.toThrow('revoked')
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('recovers by inspection only, and waits for runtime loading', async () => {
    execute.mockImplementation(async (cmd: object) => 'actor' in cmd ? {} : { installed: true, loaded: false })
    await expect(service.inspect(c)).resolves.toEqual({ status: 'pending', receiptKey: c.work.operationId })
    expect(execute.mock.calls[1][0]).toMatchObject({ input: { action: 'inspect' } })
    expect(events).toHaveLength(0)
  })
  it('does not publish success after the round changes during installation', async () => {
    const impl = execute.getMockImplementation()!
    execute.mockImplementation(async (cmd: object) => { const result = await impl(cmd); if ('input' in cmd) active = false; return result })
    await expect(service.execute(c)).rejects.toThrow()
    expect(events).toHaveLength(0)
  })
  it('issues test access only for the accepted host receipt, with no installation or exposed secret', async () => {
    operation.receipt = await service.execute(c); operation.state = 'accepted'
    if (operation.receipt.status !== 'succeeded') throw Error('no receipt')
    execute.mockClear()
    const result = await tests.prepare(c, { deployment: operation.receipt.outputs.deployment, componentKey: 'tools' })
    expect(JSON.stringify(result)).not.toContain('bounded-test-secret')
    expect(write.mock.calls[0][0].buffer.toString()).toContain('bounded-test-secret')
    expect(execute.mock.calls.some(([command]) => 'input' in command)).toBe(false)
  })
  it('does not issue test credentials for unaccepted or forged evidence', async () => {
    const receipt = await service.execute(c)
    if (receipt.status !== 'succeeded') throw Error('no receipt')
    execute.mockClear()
    await expect(tests.prepare(c, { deployment: receipt.outputs.deployment, componentKey: 'tools' })).rejects.toThrow()
    await expect(tests.prepare(c, { deployment: { ...receipt.outputs.deployment, digest: 'f'.repeat(64) }, componentKey: 'tools' })).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })
  it('rejects impersonation before accessing evidence', async () => {
    await expect(tests.prepare({ ...c, actor: { ...actor, userId: publisher } }, { deployment: requestRef, componentKey: 'tools' })).rejects.toMatchObject({ status: 403 })
  })
})
