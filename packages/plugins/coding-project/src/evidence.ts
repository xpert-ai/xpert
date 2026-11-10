import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
  ArtifactsRuntimeCapability, ProjectTaskAcceptanceRuntimeCapability,
  type ProjectPipelineContext, type ProjectPipelineEvidenceResolver, type ProjectPipelineOperationContext
} from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import { IsNull } from 'typeorm'
import { CodingDeliveryStore, scopeWhere, conflict } from './store'
import { artifactRefSchema, evidenceSchema, manifestSchema, type DeliveryEvidence } from './schemas'
import { canonical, digest, refs, deliveryBranch } from './constants'

export function evidenceRef(evidence: DeliveryEvidence): ProjectPipelineEvidenceRef {
  return { resolverRef: refs.evidence, schemaRef: refs.evidenceSchema, objectKey: evidence.work.operationId,
    version: '1', digest: digest(evidence), producerOperationId: evidence.work.operationId }
}

@Injectable()
export class CodingEvidenceService implements ProjectPipelineEvidenceResolver {
  constructor(private readonly store: CodingDeliveryStore) {}

  async read(c: ProjectPipelineContext, ref: ProjectPipelineEvidenceRef) {
    const row = await this.store.operation(c, ref.objectKey)
    if (!row.evidence || canonical(evidenceRef(row.evidence)) !== canonical(ref))
      throw conflict('CODING_EVIDENCE_IDENTITY_MISMATCH')
    return row.evidence
  }
  async input(c: ProjectPipelineOperationContext, port: string) {
    const input = c.inputs[port]
    if (input?.kind !== 'evidence') throw conflict('CODING_INPUT_EVIDENCE_REQUIRED')
    const evidence = await this.read(c, input.value)
    if (evidence.work.roundId !== c.work.roundId || evidence.work.inputDigest !== c.work.inputDigest ||
      evidence.work.generation !== c.work.generation) throw conflict('CODING_EVIDENCE_STALE')
    return evidence
  }

  async submit(c: ProjectPipelineContext, conversationId: string, operationId: string, taskId: string, manifestArtifactId: string) {
    const row = await this.store.operation(c, operationId)
    if (row.context.executor.conversationId !== conversationId ||
      (row.context.executor.userId ?? row.context.actor.userId) !== c.actor.userId)
      throw conflict('CODING_EXECUTOR_SCOPE_MISMATCH')
    if (row.evidence) {
      if (row.evidence.taskId !== taskId || row.evidence.artifacts[0].artifactId !== manifestArtifactId)
        throw conflict('CODING_EVIDENCE_ALREADY_SEALED')
      // A lost tool response may be retried after this operation has completed.
      // Replaying the sealed receipt performs no execution or state transition.
      return evidenceRef(row.evidence)
    }
    await this.store.assertActive(row, 'submit', c)
    const accepted = await this.store.capabilities.require(ProjectTaskAcceptanceRuntimeCapability).read({ ...c, taskId })
    if (accepted.conversationId !== conversationId) throw conflict('CODING_TASK_NOT_FROM_THIS_OPERATION')
    const manifestRef = accepted.artifacts.find((item) => item.artifactId === manifestArtifactId)
    if (!manifestRef) throw conflict('CODING_MANIFEST_NOT_ACCEPTED')
    const api = this.store.capabilities.require(ArtifactsRuntimeCapability)
    const read = async (ref: { artifactId: string; versionId: string }) => {
      const result = await api.readArtifactVersion({ artifactId: ref.artifactId, artifactVersionId: ref.versionId, purpose: 'copy' })
      if (result.artifact.projectId !== c.projectId || result.artifact.tenantId !== c.actor.tenantId ||
        (result.artifact.organizationId ?? null) !== (c.actor.organizationId ?? null)) throw conflict('CODING_ARTIFACT_SCOPE_MISMATCH')
      return { ...result, reference: artifactRefSchema.parse({ ...ref, fileName: result.fileName, size: result.buffer.length,
        sha256: createHash('sha256').update(result.buffer).digest('hex') }) }
    }
    const content = await read(manifestRef)
    if (content.buffer.length > 64 * 1024) throw conflict('CODING_MANIFEST_TOO_LARGE')
    const manifest = manifestSchema.parse(JSON.parse(content.buffer.toString('utf8')))
    if (manifest.phase !== row.phase || canonical(manifest.work) !== canonical(row.context.work))
      throw conflict('CODING_MANIFEST_WORK_MISMATCH')
    const artifacts = [content.reference]
    const references = new Map<string, typeof content.reference>()
    const files = manifest.phase === 'development' ? [manifest.source, manifest.package, manifest.report]
      : manifest.phase === 'deployment' ? [manifest.report, manifest.installationReceipt] : [manifest.source, manifest.report]
    for (const file of files) {
      let found = false
      for (const ref of accepted.artifacts) {
        if (ref.artifactId === manifestArtifactId) continue
        const reference = references.get(ref.versionId) ?? (await read(ref)).reference
        references.set(ref.versionId, reference)
        if (reference.fileName === file.fileName && reference.sha256 === file.sha256) {
          artifacts.push(reference); found = true; break
        }
      }
      if (!found) throw conflict('CODING_FILE_NOT_IN_ACCEPTED_ARTIFACTS')
    }
    if (manifest.phase !== 'development') {
      const candidate = await this.input({ ...row.context, actor: c.actor }, 'candidate')
      const delivery = await this.store.get(c, row.deliveryId)
      if (candidate.manifest.phase !== 'development' || manifest.candidateDigest !== digest(candidate))
        throw conflict('CODING_APPROVED_CANDIDATE_CHANGED')
      if (manifest.phase === 'deployment') {
        if (manifest.targetKey !== delivery.requirement.target.key || manifest.baseUrl !== delivery.requirement.target.baseUrl ||
          manifest.installedPackageSha256 !== candidate.manifest.package.sha256 ||
          manifest.installedVersion !== candidate.manifest.packageVersion || manifest.loadedVersion !== candidate.manifest.packageVersion)
          throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
      } else {
        const repo = delivery.requirement.repository
        if (manifest.commit !== candidate.manifest.commit || manifest.repositoryKey !== repo.key ||
          manifest.remoteUrl !== repo.remoteUrl || manifest.mode !== repo.mode ||
          manifest.branch !== deliveryBranch(row.deliveryId, row.requirementVersion) ||
          manifest.source.sha256 !== candidate.manifest.source.sha256)
          throw conflict('CODING_GIT_IDENTITY_MISMATCH')
        const deployment = await this.input({ ...row.context, actor: c.actor }, 'deployment')
        if (deployment.manifest.phase !== 'deployment' || deployment.manifest.candidateDigest !== digest(candidate))
          throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
      }
    }
    const evidence = evidenceSchema.parse({ version: 1, deliveryId: row.deliveryId,
      requirementVersion: row.requirementVersion, phase: row.phase, work: row.context.work,
      taskId, taskRevision: accepted.taskRevision, decisionId: accepted.decision.requestId,
      reviewExecutionId: accepted.decision.reviewExecutionId, manifest, artifacts,
      releaseScope: await this.store.get(c, row.deliveryId).then(({ requirement }) => ({
        target: requirement.target, repository: requirement.repository, branch: deliveryBranch(row.deliveryId, row.requirementVersion)
      })) })
    await this.store.assertActive(row, 'submit', c)
    const result = await this.store.works.update({ ...scopeWhere(c), id: row.id, evidence: IsNull() }, { evidence })
    if (result.affected !== 1) {
      const replay = await this.store.operation(c, row.id)
      if (!replay.evidence || canonical(replay.evidence) !== canonical(evidence)) throw conflict('CODING_EVIDENCE_ALREADY_SEALED')
    }
    return evidenceRef(evidence)
  }
}
