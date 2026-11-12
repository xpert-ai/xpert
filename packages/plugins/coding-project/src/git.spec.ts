jest.mock('./git-process', () => ({ pushApprovedBundle: jest.fn(async () => undefined) }))
import { type ConnectorRuntimeApi } from '@xpert-ai/plugin-sdk'
import { deliveryFixture } from './delivery.fixture'
import { CodingGitService } from './git'
import { GitHubDeliveryClient } from './git-github'
import { pushApprovedBundle } from './git-process'
import { digest } from './constants'

describe('approved Git delivery authorization and recovery', () => {
  let f: Awaited<ReturnType<typeof deliveryFixture>>
  beforeEach(async () => {
    jest.clearAllMocks()
    f = await deliveryFixture('current-instance', true); await f.operations.prepare(f.context, 'development')
  })
  afterEach(async () => { jest.restoreAllMocks(); await f.db.destroy() })
  async function ready() {
    const ref = await f.evidence.submit(f.context, f.context.executor.conversationId,
      f.context.work.operationId, f.accepted().taskId, f.manifestFile.artifactId)
    const candidate = await f.evidence.read(f.context, ref), c = await f.next('deployment', ref)
    const report = f.addFile('target-report.json', 'independent target checks'), installation = f.addFile('install.json', 'installation')
    const manifest = f.addFile('delivery-manifest.json', JSON.stringify({ version: 1, phase: 'deployment', work: c.work,
      candidateDigest: digest(candidate), targetKey: 'test', baseUrl: f.row.requirement.target.baseUrl,
      installedPackageSha256: f.packageFile.sha256, installedVersion: '0.1.0', loadedVersion: '0.1.0',
      report: { fileName: report.fileName, sha256: report.sha256 },
      installationReceipt: { fileName: installation.fileName, sha256: installation.sha256 } }))
    const accepted = f.task([manifest, report, installation], c)
    const deployed = await f.evidence.submit(c, c.executor.conversationId, c.work.operationId, accepted.taskId, manifest.artifactId)
    return f.next('git', ref, deployed)
  }
  function runtime() {
    const credential = jest.fn(async () => ({ connectorId: 'connector', bindingId: f.row.requirement.repository.connectorBindingId!,
      scope: { type: 'project' as const, projectId: f.projectId }, authorizationMode: 'shared' as const,
      provider: 'github', authMethodId: 'github-pat', credentials: { accessToken: 'test-secret' } }))
    const connectors: ConnectorRuntimeApi = { getConnector: jest.fn(), getConnectorCredential: credential }
    return { connectors, credential }
  }
  const service = () => new CodingGitService(f.store, f.evidence, f.operations)
  it('rejects before the Git stage without asking for a credential', async () => {
    const r = runtime()
    await expect(service().execute(f.context, f.context.executor.conversationId, f.context.work.operationId, 'deliver', r.connectors))
      .rejects.toMatchObject({ response: { code: 'CODING_GIT_HOST_NOT_ALLOWED' } })
    expect(r.credential).not.toHaveBeenCalled()
  })
  it('reuses the exact remote commit and PR without repeating writes or revealing credentials', async () => {
    const c = await ready(), r = runtime()
    jest.spyOn(GitHubDeliveryClient.prototype, 'head').mockResolvedValue(f.manifest.commit)
    jest.spyOn(GitHubDeliveryClient.prototype, 'pull').mockResolvedValue('https://github.com/example/plugins/pull/1')
    const create = jest.spyOn(GitHubDeliveryClient.prototype, 'createPull')
    const receipt = await service().execute(c, c.executor.conversationId, c.work.operationId, 'deliver', r.connectors)
    expect(receipt).toMatchObject({ delivered: true, remoteCommit: f.manifest.commit })
    expect(JSON.stringify(receipt)).not.toContain('test-secret')
    expect(pushApprovedBundle).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
    expect(r.credential).toHaveBeenCalledWith({ bindingId: f.row.requirement.repository.connectorBindingId, provider: 'github', projectId: f.projectId })
  })
  it('refuses to overwrite another remote commit', async () => {
    const c = await ready(), r = runtime()
    jest.spyOn(GitHubDeliveryClient.prototype, 'head').mockResolvedValue('b'.repeat(40))
    await expect(service().execute(c, c.executor.conversationId, c.work.operationId, 'deliver', r.connectors))
      .rejects.toMatchObject({ response: { code: 'CODING_GIT_BRANCH_CONFLICT' } })
    expect(pushApprovedBundle).not.toHaveBeenCalled()
  })
  it('keeps inspection read-only when the approved branch is absent', async () => {
    const c = await ready(), r = runtime()
    jest.spyOn(GitHubDeliveryClient.prototype, 'head').mockResolvedValue(null)
    const create = jest.spyOn(GitHubDeliveryClient.prototype, 'createPull')
    expect(await service().execute(c, c.executor.conversationId, c.work.operationId, 'inspect', r.connectors))
      .toMatchObject({ delivered: false, remoteCommit: null, pullRequestUrl: null })
    expect(pushApprovedBundle).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
  })
  it('rejects changed source bytes before invoking Git', async () => {
    const c = await ready(), r = runtime()
    jest.spyOn(GitHubDeliveryClient.prototype, 'head').mockResolvedValue(null)
    f.artifacts.get(f.sourceFile.artifactId)!.buffer = Buffer.from('changed source')
    await expect(service().execute(c, c.executor.conversationId, c.work.operationId, 'deliver', r.connectors))
      .rejects.toMatchObject({ response: { code: 'CODING_ARTIFACT_DIGEST_CHANGED' } })
    expect(pushApprovedBundle).not.toHaveBeenCalled()
  })
  it('checks immutable source bytes before a push and checks current authorization again at the write boundary', async () => {
    const c = await ready(), r = runtime()
    jest.spyOn(GitHubDeliveryClient.prototype, 'head').mockResolvedValue(null)
    jest.mocked(pushApprovedBundle).mockImplementationOnce(async (input) => { f.setActive(false); await input.beforeWrite() })
    await expect(service().execute(c, c.executor.conversationId, c.work.operationId, 'deliver', r.connectors))
      .rejects.toMatchObject({ response: { code: 'CODING_OPERATION_NOT_ACTIVE' } })
    expect(pushApprovedBundle).toHaveBeenCalledWith(expect.objectContaining({ commit: f.manifest.commit,
      bundle: Buffer.from('fixture source bytes'), branch: `coding-delivery/${f.id}/v1` }))
  })
  it('does not bypass host Connector authorization or accept another conversation', async () => {
    const c = await ready(), r = runtime(); r.credential.mockRejectedValueOnce(new Error('Connector not granted'))
    await expect(service().execute(c, c.executor.conversationId, c.work.operationId, 'deliver', r.connectors)).rejects.toThrow('Connector not granted')
    await expect(service().execute(c, f.context.executor.conversationId, c.work.operationId, 'deliver', r.connectors))
      .rejects.toMatchObject({ response: { code: 'CODING_EXECUTOR_SCOPE_MISMATCH' } })
    expect(pushApprovedBundle).not.toHaveBeenCalled()
  })
})
