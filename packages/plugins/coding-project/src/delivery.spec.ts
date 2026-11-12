import { RequestContext, ProjectPipelineEvidenceRuntimeCapability, type ProjectTaskAcceptanceReceipt } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { projectPipelineContributionSchema, checkProjectPipelineConfiguration, UserType, SecretTokenBindingType } from '@xpert-ai/contracts'
import plugin from './index'
import { CodingPipelineContribution, configuration } from './pipeline'
import { CodingDelivery, CodingDeliveryWork } from './entities'
import { deliveryFixture } from './delivery.fixture'
import { digest, identity, TYPE } from './constants'
import { CodingDeliveryService } from './delivery.service'

describe('Coding delivery business boundaries', () => {
  let f: Awaited<ReturnType<typeof deliveryFixture>>
  beforeEach(async () => { f = await deliveryFixture(); await f.operations.prepare(f.context, 'development') })
  afterEach(async () => { jest.restoreAllMocks(); await f.db.destroy() })
  const submit = () => f.evidence.submit(f.context, f.context.executor.conversationId, f.context.work.operationId,
    f.accepted().taskId, f.manifestFile.artifactId)

  it('registers one plugin, its canonical project type and a valid four-stage bounded DAG', () => {
    expect(plugin.meta.artifactNamespace).toBe('coding_project')
    for (const item of new CodingPipelineContribution().configurations)
      expect(item.template.projectTypes).toEqual([TYPE])
    const app = plugin.meta.targetAppMeta?.xpert?.marketplace?.contents?.find((item) => item.type === 'app')
    expect(app?.projectTypes).toEqual([{ key: TYPE.projectTypeKey, title: { en_US: 'Coding project', zh_Hans: '编码项目' },
      binding: { kind: 'project' }, configuration: expect.any(Object) }])
    expect(projectPipelineContributionSchema.parse(new CodingPipelineContribution()).configurations).toHaveLength(2)
    expect(configuration.template.stages).toHaveLength(4)
    expect(JSON.stringify(configuration)).toContain('await_new_subject')
    expect(checkProjectPipelineConfiguration(configuration, [...new CodingPipelineContribution().descriptors,
      { kind: 'schema', ref: 'platform.human-decision@1' },
      { kind: 'completion', ref: 'platform.output-validated@1' }
    ])).toMatchObject({ valid: true, issues: [] })
  })
  it('requires the plugin-owned project type before starting a delivery', async () => {
    f.access.applicationKey = 'platform'
    await expect(new CodingDeliveryService(f.store, f.evidence).start(f.context, randomUUID(), f.context.executor.xpertId,
      { title: 'Old project', requirement: 'Build a plugin' }))
      .rejects.toMatchObject({ response: { code: 'CODING_PROJECT_TYPE_REQUIRED' } })
    expect(await f.db.getRepository(CodingDelivery).count()).toBe(1)
  })
  it('does not complete merely because the Assistant runtime succeeded', async () => {
    await expect(f.operations.collect(f.context, 'development')).rejects.toMatchObject({ response: { code: 'CODING_FORMAL_ACCEPTANCE_NOT_SUBMITTED' } })
  })
  it('does not create delivery state without an authorized destination', async () => {
    f.revoke()
    await expect(new CodingDeliveryService(f.store, f.evidence).start(f.context,
      randomUUID(), f.context.executor.xpertId,
      { title: 'No destination', requirement: 'Build a plugin' }))
      .rejects.toMatchObject({ response: { code: 'CODING_CONFIGURE_AUTHORIZED_TARGET_AND_REPOSITORY' } })
    expect(await f.db.getRepository(CodingDelivery).count()).toBe(1)
  })
  it('reuses a delivery after rework but refuses a changed initial requirement', async () => {
    const conversationId = randomUUID()
    const id = identity(f.projectId, conversationId, f.row.requirement.title)
    await f.db.getRepository(CodingDelivery).save({ ...f.row, id, revision: 2,
      requirement: { ...f.row.requirement, feedback: 'Add Unicode tests' } })
    const service = new CodingDeliveryService(f.store, f.evidence)
    const input = { title: f.row.requirement.title, requirement: f.row.requirement.requirement }
    await expect(service.start(f.context, conversationId, f.context.executor.xpertId, input))
      .resolves.toMatchObject({ deliveryId: id, reused: true })
    await expect(service.start(f.context, conversationId, f.context.executor.xpertId,
      { ...input, requirement: 'A different program' }))
      .rejects.toMatchObject({ response: { code: 'CODING_REQUIREMENT_CONFLICT' } })
  })
  it('converges concurrent identical submissions to one immutable receipt', async () => {
    const [first, second] = await Promise.all([submit(), submit()])
    expect(first).toEqual(second)
    expect(await f.db.getRepository(CodingDeliveryWork).count()).toBe(1)
  })
  it('seals accepted immutable artifacts and reuses an identical submission', async () => {
    const ref = await submit()
    expect(await submit()).toEqual(ref)
    const evidence = await f.evidence.read(f.context, ref)
    expect(evidence.artifacts).toHaveLength(4)
    expect((await f.operations.collect(f.context, 'development')).result).toEqual(ref)
    // Reconstruct services from the same persisted database: no middleware closure owns state.
    expect((await f.store.operation(f.context, ref.objectKey)).evidence?.manifest).toEqual(f.manifest)
  })
  it('refuses failed independent acceptance without sealing output', async () => {
    f.readAcceptance.mockRejectedValueOnce(Error('independent review missing'))
    await expect(submit()).rejects.toThrow('independent review missing')
    expect((await f.store.operation(f.context, f.context.work.operationId)).evidence).toBeNull()
  })
  it('requires formal acceptance before applying the coding review policy', async () => {
    f.readAcceptance.mockResolvedValueOnce(null)
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_FORMAL_ACCEPTANCE_NOT_SUBMITTED' } })
  })
  it.each<ProjectTaskAcceptanceReceipt['review']>([
    null,
    { executionId: randomUUID(), mode: 'evidence_only', verdict: 'pass' },
    { executionId: randomUUID(), mode: 'execution', verdict: 'changes_required' },
    { executionId: randomUUID(), mode: 'execution', verdict: 'indeterminate' }
  ])('keeps execution-review requirements in coding delivery: %j', async (review) => {
    f.readAcceptance.mockResolvedValueOnce({ ...f.accepted(), review })
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_EXECUTION_REVIEW_REQUIRED' } })
    expect((await f.store.operation(f.context, f.context.work.operationId)).evidence).toBeNull()
  })
  it('rejects a receipt for a different task before consuming its artifacts', async () => {
    f.readAcceptance.mockResolvedValueOnce({ ...f.accepted(), taskId: randomUUID() })
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_ARTIFACT_SCOPE_MISMATCH' } })
    expect(f.artifactApi.readArtifactVersion).not.toHaveBeenCalled()
  })
  it('rejects an artifact from another project', async () => {
    f.artifacts.get(f.packageFile.artifactId)!.artifact.projectId = 'another-project'
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_ARTIFACT_SCOPE_MISMATCH' } })
  })
  it('rejects mismatched bytes even if the supplied file name matches', async () => {
    f.artifacts.get(f.packageFile.artifactId)!.buffer = Buffer.from('changed')
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_FILE_NOT_IN_ACCEPTED_ARTIFACTS' } })
  })
  it('replays a sealed receipt after completion without reevaluating tasks or repeating external effects', async () => {
    const ref = await submit()
    f.setCompleted()
    f.readAcceptance.mockRejectedValue(Error('must not read again'))
    expect(await submit()).toEqual(ref)
    expect(f.readAcceptance).toHaveBeenCalledTimes(1)
    await expect(f.evidence.submit(f.context, f.context.executor.conversationId, f.context.work.operationId,
      f.actor.userId, f.manifestFile.artifactId)).rejects.toMatchObject({ response: { code: 'CODING_EVIDENCE_ALREADY_SEALED' } })
  })
  it('preserves human rejection feedback and retries a failed new-Round request without a second revision', async () => {
    await submit(); f.setCompleted()
    const service = new CodingDeliveryService(f.store, f.evidence)
    f.nextRound.mockRejectedValueOnce(Error('connection lost'))
    await expect(service.rework(f.context, f.context.work.operationId, 'Add Unicode acceptance cases')).rejects.toThrow('connection lost')
    expect((await f.store.get(f.context, f.id)).revision).toBe(2)
    await service.rework(f.context, f.context.work.operationId, 'Add Unicode acceptance cases')
    expect((await f.store.get(f.context, f.id)).revision).toBe(2)
    expect(f.nextRound.mock.calls[0]).toEqual(f.nextRound.mock.calls[1])
    await expect(service.rework(f.context, f.context.work.operationId, 'Different feedback')).rejects.toMatchObject({ response: { code: 'CODING_REWORK_STALE' } })
  })
  it('requires a fresh Round after destination configuration changes and can recover into it', async () => {
    f.changeTarget()
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_DESTINATION_CHANGED_NEW_ROUND_REQUIRED' } })
    await new CodingDeliveryService(f.store, f.evidence).rework(f.context, f.context.work.operationId, 'Review updated restart scope')
    expect((await f.store.get(f.context, f.id)).requirement.target.allowRestart).toBe(true)
  })
  it('rejects stale human approval on stage collection', async () => {
    const ref = await submit(), context = await f.next('deployment', ref)
    f.capabilities.register(ProjectPipelineEvidenceRuntimeCapability, { read: async () => ({
      kind: 'human', policyRef: 'coding_project.release-approval@1', outcome: 'approve',
      actorId: f.actor.userId,
      roundId: context.work.roundId, inputDigest: 'c'.repeat(64), generation: 1
    }) })
    await expect(f.operations.approved(context)).rejects.toMatchObject({ response: { code: 'CODING_APPROVAL_SUPERSEDED' } })
  })
  it('rejects a task from another stage conversation', async () => {
    f.accepted().conversationId = f.actor.userId
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_TASK_NOT_FROM_THIS_OPERATION' } })
  })
  it('uses the pinned executor identity when it differs from the initiating actor', async () => {
    const executorUserId = f.projectId
    await f.db.getRepository(CodingDeliveryWork).update({ id: f.context.work.operationId }, {
      context: { ...f.context, executor: { ...f.context.executor, userId: executorUserId } }
    })
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_EXECUTOR_SCOPE_MISMATCH' } })
    const caller = { ...f.context, actor: { ...f.actor, userId: executorUserId } }
    await expect(f.evidence.submit(caller, f.context.executor.conversationId, f.context.work.operationId,
      f.accepted().taskId, f.manifestFile.artifactId)).resolves.toMatchObject({ schemaRef: 'coding_project.delivery-evidence@1' })
    expect(f.readAcceptance).toHaveBeenCalledWith({ actor: caller.actor, projectId: caller.projectId }, f.accepted().taskId)
  })
  it('rejects cross-tenant access, cancellation and destination revocation', async () => {
    await expect(f.store.get({ ...f.context, actor: { ...f.actor, tenantId: 'other' } }, f.id)).rejects.toThrow('denied')
    f.setActive(false)
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_OPERATION_NOT_ACTIVE' } })
    f.setActive(true); f.revoke()
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_DESTINATION_NOT_AUTHORIZED' } })
  })
  it('invalidates a previous source revision without modifying its stored evidence', async () => {
    const ref = await submit()
    await f.db.getRepository(CodingDelivery).update({ id: f.id }, { revision: 2 })
    await expect(f.operations.collect(f.context, 'development')).rejects.toMatchObject({ response: { code: 'CODING_REQUIREMENT_SUPERSEDED' } })
    expect((await f.evidence.read(f.context, ref)).requirementVersion).toBe(1)
  })
  it('requires a human manager and preserves a version-bound approval input', async () => {
    const ref = await submit(), context = { ...f.context, inputs: { candidate: { kind: 'evidence' as const, value: ref } } }
    const principal = jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(f.actor.userId)
    const user = jest.spyOn(RequestContext, 'currentUser').mockReturnValue(
      { id: f.actor.userId, tenantId: f.actor.tenantId } as ReturnType<typeof RequestContext.currentUser>)
    const input = { candidateSelectionKey: 'coding_project.project_managers', outcome: 'approve', evidence: [] }
    expect(await f.policy.authorizeDecision(context, input)).toBe(true)
    const interactive = { id: f.actor.userId, tenantId: f.actor.tenantId, principalType: 'client_secret' as const,
      clientSecretBindingType: SecretTokenBindingType.USER_XPERT, resourceScope: { kind: 'assistant' as const, xpertId: f.actor.userId } }
    principal.mockReturnValue(interactive as NonNullable<ReturnType<typeof RequestContext.currentApiPrincipal>>)
    expect(await f.policy.authorizeDecision(context, input)).toBe(true)
    principal.mockReturnValue({ ...interactive, principalType: 'api_key' } as NonNullable<ReturnType<typeof RequestContext.currentApiPrincipal>>)
    expect(await f.policy.authorizeDecision(context, input)).toBe(false)
    principal.mockReturnValue(null)
    user.mockReturnValue(Object.assign({}, { type: UserType.COMMUNICATION }) as ReturnType<typeof RequestContext.currentUser>)
    expect(await f.policy.authorizeDecision(context, input)).toBe(false)
  })
  it('accepts cross-instance evidence only for the approved package and exact target', async () => {
    const ref = await submit(), candidate = await f.evidence.read(f.context, ref)
    const context = await f.next('deployment', ref)
    const report = f.addFile('target-report.json', 'fixture independent target checks'), install = f.addFile('install.json', 'fixture install')
    const manifest = { version: 1, phase: 'deployment', work: context.work, candidateDigest: digest(candidate),
      targetKey: 'test', baseUrl: f.row.requirement.target.baseUrl, installedPackageSha256: f.packageFile.sha256,
      installedVersion: '0.1.0', loadedVersion: '0.2.0', report: { fileName: report.fileName, sha256: report.sha256 },
      installationReceipt: { fileName: install.fileName, sha256: install.sha256 } }
    const file = f.addFile('delivery-manifest.json', JSON.stringify(manifest)), task = f.task([file, report, install], context)
    await expect(f.evidence.submit(context, context.executor.conversationId, context.work.operationId,
      task.taskId, file.artifactId)).rejects.toMatchObject({ response: { code: 'CODING_DEPLOYMENT_IDENTITY_MISMATCH' } })
    const corrected = f.addFile('delivery-manifest.json', JSON.stringify({ ...manifest, loadedVersion: '0.1.0' }))
    const accepted = f.task([corrected, report, install], context)
    const deployed = await f.evidence.submit(context, context.executor.conversationId, context.work.operationId,
      accepted.taskId, corrected.artifactId)
    expect(deployed).toMatchObject({ schemaRef: 'coding_project.delivery-evidence@1' })
    const gitContext = await f.next('git', ref, deployed)
    const gitReport = f.addFile('git-report.json', 'fixture remote head checks')
    const gitManifest = { version: 1, phase: 'git', work: gitContext.work, candidateDigest: digest(candidate),
      commit: f.manifest.commit, repositoryKey: 'repo', remoteUrl: f.row.requirement.repository.remoteUrl,
      branch: 'main', mode: 'commit', report: { fileName: gitReport.fileName, sha256: gitReport.sha256 },
      source: f.manifest.source }
    const wrongBranch = f.addFile('delivery-manifest.json', JSON.stringify(gitManifest))
    const gitTask = f.task([wrongBranch, gitReport, f.sourceFile], gitContext)
    await expect(f.evidence.submit(gitContext, gitContext.executor.conversationId, gitContext.work.operationId,
      gitTask.taskId, wrongBranch.artifactId)).rejects.toMatchObject({ response: { code: 'CODING_GIT_IDENTITY_MISMATCH' } })
    const correctBranch = f.addFile('delivery-manifest.json', JSON.stringify({ ...gitManifest, branch: candidate.releaseScope.branch }))
    const finalTask = f.task([correctBranch, gitReport, f.sourceFile], gitContext)
    const delivered = await f.evidence.submit(gitContext, gitContext.executor.conversationId, gitContext.work.operationId,
      finalTask.taskId, correctBranch.artifactId)
    expect((await f.operations.collect(gitContext, 'git')).result).toEqual(delivered)
    expect((await f.evidence.read(gitContext, delivered)).manifest).toMatchObject({ commit: f.manifest.commit })
  })
})
