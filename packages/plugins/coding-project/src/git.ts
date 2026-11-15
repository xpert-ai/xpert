import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { ArtifactsRuntimeCapability, type ConnectorRuntimeApi, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { CodingDeliveryStore, conflict } from './store'
import { CodingEvidenceService } from './evidence'
import { CodingOperations } from './adapters'
import { digest, deliveryBranch } from './constants'
import { GitHubDeliveryClient, githubRepository } from './git-github'
import { pushApprovedBundle } from './git-process'

@Injectable()
export class CodingGitService {
  constructor(
    private readonly store: CodingDeliveryStore,
    private readonly evidence: CodingEvidenceService,
    private readonly operations: CodingOperations
  ) {}

  async execute(
    c: ProjectPipelineContext,
    conversationId: string,
    operationId: string,
    action: 'inspect' | 'deliver',
    connectors: ConnectorRuntimeApi | undefined
  ) {
    const row = await this.store.operation(c, operationId)
    if (row.requirement.mode === 'local') throw conflict('CODING_GIT_HOST_NOT_ALLOWED')
    const repository = row.requirement.repository
    const authorize = async () => {
      await this.store.assertActive(row, 'submit', c)
      if (row.phase !== 'git' || repository.delivery !== 'github') throw conflict('CODING_GIT_HOST_NOT_ALLOWED')
      if (
        row.context.executor.conversationId !== conversationId ||
        (row.context.executor.userId ?? row.context.actor.userId) !== c.actor.userId
      )
        throw conflict('CODING_EXECUTOR_SCOPE_MISMATCH')
      await this.operations.approved({ ...row.context, actor: c.actor })
    }
    await authorize()
    const context = { ...row.context, actor: c.actor },
      candidate = await this.evidence.input(context, 'candidate')
    const deployment = await this.evidence.input(context, 'deployment'),
      manifest = candidate.manifest
    if (
      manifest.phase !== 'development' ||
      manifest.sourceFormat !== 'git-bundle' ||
      deployment.manifest.phase !== 'deployment' ||
      deployment.manifest.candidateDigest !== digest(candidate)
    )
      throw conflict('CODING_GIT_CANDIDATE_REQUIRED')
    if (!('branch' in candidate.releaseScope)) throw conflict('CODING_GIT_HOST_NOT_ALLOWED')
    const destination = githubRepository(repository.remoteUrl)
    const branch = candidate.releaseScope.branch
    if (branch === repository.baseBranch || branch !== deliveryBranch(row.deliveryId, row.requirementVersion))
      throw conflict('CODING_GIT_IDENTITY_MISMATCH')
    if (!repository.connectorBindingId || !connectors?.getConnectorCredential)
      throw conflict('CODING_GIT_CONNECTOR_REQUIRED')
    // This is the host-scoped runtime API: configuration alone cannot grant a Connector.
    const credential = await connectors.getConnectorCredential({
      bindingId: repository.connectorBindingId,
      provider: 'github',
      projectId: c.projectId
    })
    if (
      credential.provider !== 'github' ||
      credential.bindingId !== repository.connectorBindingId ||
      (credential.expiresAt && !(new Date(credential.expiresAt).getTime() > Date.now()))
    )
      throw conflict('CODING_GIT_CONNECTOR_REQUIRED')
    const { accessToken } = z.object({ accessToken: z.string().min(1) }).parse(credential.credentials)
    const client = new GitHubDeliveryClient(accessToken, destination)
    let remoteCommit = await client.head(branch)
    if (remoteCommit && remoteCommit !== manifest.commit) throw conflict('CODING_GIT_BRANCH_CONFLICT')
    let pullRequestUrl =
      remoteCommit && repository.mode === 'pull_request'
        ? await client.pull(branch, repository.baseBranch, manifest.commit)
        : null
    if (action === 'deliver') {
      if (!remoteCommit) {
        const ref = candidate.artifacts.find(
          (a) => a.fileName === manifest.source.fileName && a.sha256 === manifest.source.sha256
        )
        if (!ref) throw conflict('CODING_FILE_NOT_IN_ACCEPTED_ARTIFACTS')
        const source = await this.store.capabilities.require(ArtifactsRuntimeCapability).readArtifactVersion({
          artifactId: ref.artifactId,
          artifactVersionId: ref.versionId,
          purpose: 'copy'
        })
        if (
          source.artifact.projectId !== c.projectId ||
          source.artifact.tenantId !== c.actor.tenantId ||
          (source.artifact.organizationId ?? null) !== (c.actor.organizationId ?? null) ||
          source.buffer.length > 100 * 1024 * 1024 ||
          createHash('sha256').update(source.buffer).digest('hex') !== manifest.source.sha256
        )
          throw conflict('CODING_ARTIFACT_DIGEST_CHANGED')
        await pushApprovedBundle({
          remoteUrl: repository.remoteUrl,
          baseBranch: repository.baseBranch,
          branch,
          commit: manifest.commit,
          bundle: source.buffer,
          beforeWrite: authorize,
          authorizationHeader: `Authorization: Basic ${Buffer.from(`x-access-token:${accessToken}`).toString('base64')}`
        })
        remoteCommit = await client.head(branch)
        if (remoteCommit !== manifest.commit) throw conflict('CODING_GIT_IDENTITY_MISMATCH')
      }
      if (repository.mode === 'pull_request' && !pullRequestUrl) {
        await authorize()
        pullRequestUrl = await client.createPull(
          branch,
          repository.baseBranch,
          manifest.commit,
          row.requirement.title,
          `${manifest.releaseNotes}\n\nApproved source commit: ${manifest.commit}\nSource SHA-256: ${manifest.source.sha256}`
        )
      }
    }
    return {
      version: 1,
      operationId,
      repositoryKey: repository.key,
      remoteUrl: repository.remoteUrl,
      baseBranch: repository.baseBranch,
      branch,
      commit: manifest.commit,
      remoteCommit,
      sourceSha256: manifest.source.sha256,
      candidateDigest: digest(candidate),
      mode: repository.mode,
      pullRequestUrl,
      delivered: remoteCommit === manifest.commit && (repository.mode === 'commit' || Boolean(pullRequestUrl))
    }
  }
}
