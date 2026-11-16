import { randomUUID } from 'node:crypto'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { deliveryFixture } from './delivery.fixture'
import { CodingDeliveryWork } from './entities'
import { CodingDeliveryMiddleware } from './middleware'
import { CodingDeliveryService } from './delivery.service'
import { CodingDeploymentService } from './deployment'
import { CodingGitService } from './git'
import { parseMaterialManifest } from './material-validation'
import { PROVIDER } from './constants'

describe('Delivery materials before acceptance', () => {
  let f: Awaited<ReturnType<typeof deliveryFixture>>
  beforeEach(async () => {
    f = await deliveryFixture()
    await f.operations.prepare(f.context, 'development')
  })
  afterEach(async () => {
    await f.db.destroy()
  })
  const validate = () => {
    f.readAcceptance.mockResolvedValueOnce(null)
    return f.evidence.submitTask(f.context, f.context.executor.conversationId, f.accepted().taskId)
  }
  const submit = () =>
    f.evidence.submit(f.context, f.context.executor.conversationId, f.context.work.operationId, f.accepted().taskId)
  const setManifest = (value: unknown) => {
    f.artifacts.get(f.manifestFile.artifactId)!.buffer = Buffer.from(JSON.stringify(value))
  }
  const unsealed = async () =>
    expect(
      (await f.db.getRepository(CodingDeliveryWork).findOneByOrFail({ id: f.context.work.operationId })).evidence
    ).toBeNull()

  it('checks unaccepted immutable output and requires acceptance only when submitting', async () => {
    f.readAcceptance.mockResolvedValue(null)
    expect(await validate()).toMatchObject({
      valid: true,
      saved: false,
      acceptance: 'required',
      status: 'awaiting_acceptance',
      submitted: false,
      manifestArtifactId: f.manifestFile.artifactId
    })
    expect(f.readAcceptance).toHaveBeenCalledTimes(1)
    await unsealed()
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_FORMAL_ACCEPTANCE_NOT_SUBMITTED' } })
  })
  it('reports all three path errors and accepts corrected basenames with the same submission rules', async () => {
    setManifest({
      ...f.manifest,
      source: { ...f.manifest.source, fileName: 'dist/source.bundle' },
      package: { ...f.manifest.package, fileName: 'dist/plugin.tgz' },
      report: { ...f.manifest.report, fileName: 'out/report.json' }
    })
    const result = await validate()
    expect(result).toMatchObject({
      valid: false,
      saved: false,
      issues: [
        { path: 'source.fileName', code: 'file_name' },
        { path: 'package.fileName', code: 'file_name' },
        { path: 'report.fileName', code: 'file_name' }
      ]
    })
    await expect(submit()).rejects.toMatchObject({ diagnostic: { code: 'CODING_MANIFEST_INVALID' } })
    await unsealed()
    setManifest(f.manifest)
    expect(await validate()).toMatchObject({ valid: true })
    const receipt = await submit()
    expect((await f.evidence.read(f.context, receipt)).manifest).toEqual(f.manifest)
    expect(await submit()).toEqual(receipt)
  })
  it.each(['.', '..', 'dir\\file.tgz', 'x\0y', 'x'.repeat(241)])('rejects invalid basename %j', async (fileName) => {
    setManifest({ ...f.manifest, package: { ...f.manifest.package, fileName } })
    expect(await validate()).toMatchObject({ valid: false, issues: [{ path: 'package.fileName', code: 'file_name' }] })
  })
  it('rejects missing exports and hashes, then rechecks bytes after successful preflight', async () => {
    f.artifacts.get(f.packageFile.artifactId)!.buffer = Buffer.from('changed')
    expect(await validate()).toMatchObject({ valid: false, issues: [{ path: 'package', code: 'exported_file' }] })
    await unsealed()
    f.artifacts.get(f.packageFile.artifactId)!.buffer = Buffer.from('fixture package bytes')
    expect(await validate()).toMatchObject({ valid: true })
    f.artifacts.get(f.packageFile.artifactId)!.buffer = Buffer.from('changed after check')
    await expect(submit()).rejects.toMatchObject({ response: { code: 'CODING_FILE_NOT_IN_ACCEPTED_ARTIFACTS' } })
  })
  it('reports stale work identity before review', async () => {
    setManifest({ ...f.manifest, work: { ...f.context.work, operationId: randomUUID() } })
    expect(await validate()).toMatchObject({ valid: false, issues: [{ path: 'work', code: 'work_identity' }] })
  })
  it('does not guess between multiple manifests', async () => {
    f.task([
      f.manifestFile,
      f.addFile('delivery-manifest.json', JSON.stringify(f.manifest)),
      f.packageFile,
      f.sourceFile,
      f.reportFile
    ])
    expect(await validate()).toMatchObject({ valid: false, code: 'CODING_MANIFEST_SELECTION_REQUIRED' })
  })
  it('preserves actor, conversation, artifact scope and operation checks', async () => {
    await expect(f.evidence.submitTask(f.context, randomUUID(), f.accepted().taskId)).rejects.toThrow()
    await expect(
      f.evidence.submitTask(
        { ...f.context, actor: { ...f.actor, userId: randomUUID() } },
        f.context.executor.conversationId,
        f.accepted().taskId
      )
    ).rejects.toMatchObject({ response: { code: 'CODING_EXECUTOR_SCOPE_MISMATCH' } })
    f.artifacts.get(f.packageFile.artifactId)!.artifact.projectId = randomUUID()
    await expect(validate()).rejects.toMatchObject({ response: { code: 'CODING_ARTIFACT_SCOPE_MISMATCH' } })
  })
  it('reports invalid JSON without emitting file contents', async () => {
    f.artifacts.get(f.manifestFile.artifactId)!.buffer = Buffer.from('private invalid content')
    const result = await validate()
    expect(result).toMatchObject({ valid: false, issues: [{ path: '$', code: 'json' }] })
    expect(JSON.stringify(result)).not.toContain('private invalid content')
  })
  it('uses server refinements missing from generated JSON Schema', () => {
    expect(() =>
      parseMaterialManifest(
        Buffer.from(
          JSON.stringify({
            version: 1,
            phase: 'git',
            work: f.context.work,
            candidateDigest: 'a'.repeat(64),
            commit: f.manifest.commit,
            repositoryKey: 'repo',
            remoteUrl: 'https://github.com/example/repo',
            branch: 'main',
            mode: 'pull_request',
            report: f.manifest.report,
            source: f.manifest.source
          })
        ),
        'git'
      )
    ).toThrow('pullRequestUrl')
  })
  it('uses only the submit tool for invalid materials, readiness and sealed submission', async () => {
    const unexpected = async () => {
      throw Error('Model calls are not needed for material validation')
    }
    const tools = new CodingDeliveryMiddleware(
      new CodingDeliveryService(f.store, f.evidence),
      f.store,
      f.evidence,
      new CodingDeploymentService(f.store, f.evidence),
      new CodingGitService(f.store, f.evidence, f.operations)
    ).createMiddleware(
      {},
      {
        ...f.actor,
        projectId: f.projectId,
        conversationId: f.context.executor.conversationId,
        xpertId: f.context.executor.xpertId,
        node: { id: randomUUID(), key: 'delivery', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: PROVIDER },
        tools: new Map(),
        runtime: { createModelClient: unexpected, wrapWorkflowNodeExecution: unexpected }
      }
    ).tools!
    expect(tools.some((tool) => tool.name === 'coding_delivery_validate')).toBe(false)
    const seal = tools.find((tool) => tool.name === 'coding_delivery_submit')!
    const input = { taskId: f.accepted().taskId }
    f.readAcceptance.mockResolvedValue(null)
    setManifest({ ...f.manifest, package: { ...f.manifest.package, fileName: 'dist/plugin.tgz' } })
    expect(JSON.parse(await seal.invoke(input))).toMatchObject({
      status: 'materials_invalid',
      submitted: false,
      saved: false
    })
    await unsealed()
    setManifest(f.manifest)
    expect(JSON.parse(await seal.invoke(input))).toMatchObject({
      status: 'awaiting_acceptance',
      submitted: false,
      saved: false
    })
    expect(JSON.parse(await seal.invoke(input))).toMatchObject({ status: 'awaiting_acceptance', submitted: false })
    await unsealed()
    await expect(seal.invoke({ taskId: 'not-an-id' })).rejects.toThrow()
    f.readAcceptance.mockResolvedValue(f.accepted())
    const receipt = JSON.parse(await seal.invoke(input))
    expect(receipt).toMatchObject({
      status: 'submitted',
      submitted: true,
      evidence: { schemaRef: 'coding_project.delivery-evidence@1' }
    })
    expect((await f.evidence.read(f.context, receipt.evidence)).manifest).toEqual(f.manifest)
    f.setCompleted()
    expect(JSON.parse(await seal.invoke(input))).toEqual(receipt)
  })
  it('never falls back to pre-acceptance when an accepted task lacks independent execution review', async () => {
    f.readAcceptance.mockResolvedValue({ ...f.accepted(), review: null })
    await expect(
      f.evidence.submitTask(f.context, f.context.executor.conversationId, f.accepted().taskId)
    ).rejects.toMatchObject({ response: { code: 'CODING_EXECUTION_REVIEW_REQUIRED' } })
    await unsealed()
  })
  it('reports material errors even after acceptance without sealing output', async () => {
    setManifest({ ...f.manifest, package: { ...f.manifest.package, fileName: 'dist/plugin.tgz' } })
    expect(
      await f.evidence.submitTask(f.context, f.context.executor.conversationId, f.accepted().taskId)
    ).toMatchObject({ status: 'materials_invalid', submitted: false })
    await unsealed()
  })
})
