import { randomUUID } from 'node:crypto'
import { PluginTestAccessCapability, ProjectPipelineEvidenceRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { checkProjectPipelineConfiguration, projectPluginDeploymentRefs, type ProjectPipelineExtensionDescriptor } from '@xpert-ai/contracts'
import { deliveryFixture } from './delivery.fixture'
import { CodingDeploymentService } from './deployment'
import { deploymentRequest, deploymentRequestRef, CodingDeploymentRequestResolver } from './deployment-request'
import { CodingCurrentDevelopmentOperation } from './adapters'
import { CodingPipelineContribution, currentInstanceConfiguration } from './pipeline'
import { CodingDeliveryWork } from './entities'
import { digest } from './constants'

describe('host installation and plugin acceptance split', () => {
  let f: Awaited<ReturnType<typeof deliveryFixture>>
  beforeEach(async () => { f = await deliveryFixture('current-instance'); await f.operations.prepare(f.context, 'development') })
  afterEach(async () => { await f.db.destroy() })
  async function candidate() {
    return f.evidence.submit(f.context, f.context.executor.conversationId, f.context.work.operationId,
      f.accepted().taskId, f.manifestFile.artifactId)
  }
  const hostDescriptors: ProjectPipelineExtensionDescriptor[] = [
    { kind: 'schema', ref: projectPluginDeploymentRefs.request }, { kind: 'schema', ref: projectPluginDeploymentRefs.receipt },
    { kind: 'schema', ref: 'platform.human-decision@1' }, { kind: 'completion', ref: 'platform.output-validated@1' },
    { kind: 'operation', ref: projectPluginDeploymentRefs.operation, effects: 'external_write', idempotency: 'keyed_receipt',
      retry: 'after_confirmed_failure', requiredCapabilities: [],
      inputs: { request: { schemaRef: projectPluginDeploymentRefs.request, cardinality: 'one' },
        approval: { schemaRef: 'platform.human-decision@1', cardinality: 'one' } }, outputs: { deployment: projectPluginDeploymentRefs.receipt } }
  ]
  it('composes human approval, native installation and independent acceptance as separate nodes', () => {
    expect(checkProjectPipelineConfiguration(currentInstanceConfiguration, [...new CodingPipelineContribution().descriptors, ...hostDescriptors]))
      .toMatchObject({ valid: true, issues: [] })
    expect(currentInstanceConfiguration.binding.executorBindings?.installer.kind).toBe('service')
    expect(currentInstanceConfiguration.template.executionAuthority === 'platform' ? currentInstanceConfiguration.template.edges : []).toContainEqual({ from: 'approval', to: 'installation', outcome: 'approve' })
    expect(currentInstanceConfiguration.template.executionAuthority === 'platform' ? currentInstanceConfiguration.template.edges : []).toContainEqual({ from: 'installation', to: 'deployment' })
  })
  it('derives a frozen host request from accepted artifacts without asking a model to author it', async () => {
    const ref = await candidate(), evidence = await f.evidence.read(f.context, ref)
    const outputs = await new CodingCurrentDevelopmentOperation(f.operations, f.evidence).collect(f.context)
    expect(outputs.request).toEqual(deploymentRequestRef(evidence))
    expect(await new CodingDeploymentRequestResolver(f.store).read(f.context, outputs.request)).toMatchObject({
      target: 'current-instance', artifactId: f.packageFile.artifactId, artifactVersionId: f.packageFile.versionId,
      sha256: f.packageFile.sha256, allowReplace: false, allowRestart: false })
    f.changeTarget()
    expect(deploymentRequest(evidence).allowRestart).toBe(false)
  })
  it('requires a host receipt before issuing test access and checks conversation ownership', async () => {
    const c = await f.next('deployment', await candidate()), prepare = jest.fn()
    f.capabilities.register(PluginTestAccessCapability, { prepare })
    const service = new CodingDeploymentService(f.store, f.evidence)
    await expect(service.execute(c, c.executor.conversationId, c.work.operationId, 'prepare_tests')).rejects.toThrow()
    await expect(service.execute(c, randomUUID(), c.work.operationId, 'inspect')).rejects.toThrow()
    expect(prepare).not.toHaveBeenCalled()
  })
  it('passes only host evidence to the bounded test API; inspect is read-only', async () => {
    const ref = await candidate(), evidence = await f.evidence.read(f.context, ref), c = await f.next('deployment', ref)
    const proof = { operationId: randomUUID(), request: deploymentRequest(evidence), approval: c.inputs.approval.kind === 'evidence' ? c.inputs.approval.value : ref,
      installed: true, loaded: true, scopeKey: 'tenant:test', runtimeRevision: 'revision' }
    const installation = { resolverRef: projectPluginDeploymentRefs.evidence, schemaRef: projectPluginDeploymentRefs.receipt,
      objectKey: randomUUID(), version: '1', digest: digest(proof), producerOperationId: proof.operationId }
    c.inputs.installation = { kind: 'evidence', value: installation }
    await f.db.getRepository(CodingDeliveryWork).update(c.work.operationId, { context: c })
    const prepare = jest.fn(async () => ({ path: '.plugin-tests/access.json', publicationId: 'publication', expiresAt: '2030-01-01T00:00:00Z' }))
    f.capabilities.register(PluginTestAccessCapability, { prepare })
    f.capabilities.register(ProjectPipelineEvidenceRuntimeCapability, { read: async () => proof })
    const service = new CodingDeploymentService(f.store, f.evidence)
    expect(await service.execute(c, c.executor.conversationId, c.work.operationId, 'inspect')).toEqual(proof)
    expect(prepare).not.toHaveBeenCalled()
    await service.execute(c, c.executor.conversationId, c.work.operationId, 'prepare_tests')
    expect(prepare).toHaveBeenCalledWith(c, { deployment: installation, componentKey: 'fixture-tools' })
    proof.request.sha256 = 'f'.repeat(64)
    await expect(service.execute(c, c.executor.conversationId, c.work.operationId, 'prepare_tests')).rejects.toThrow()
    expect(prepare).toHaveBeenCalledTimes(1)
  })
})
