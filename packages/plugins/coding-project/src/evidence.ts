import { Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { createHash } from 'node:crypto'
import {
  ArtifactsRuntimeCapability,
  ProjectPipelineEvidenceRuntimeCapability,
  ProjectTasksRuntimeCapability,
  type ProjectTaskAcceptanceReceipt,
  type ProjectPipelineContext,
  type ProjectPipelineAssistantContext,
  type ProjectPipelineEvidenceResolver,
  type ProjectPipelineOperationContext
} from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import { IsNull } from 'typeorm'
import { CodingDeliveryStore, scopeWhere, conflict } from './store'
import { artifactRefSchema, evidenceSchema, type DeliveryEvidence } from './schemas'
import { canonical, digest, refs, deliveryBranch } from './constants'
import { projectPluginDeploymentReceiptSchema } from '@xpert-ai/contracts'
import { deploymentRequest } from './deployment-request'
import {
  MaterialValidationError,
  materialIssue,
  parseMaterialManifest,
  type MaterialIssue
} from './material-validation'

export function evidenceRef(evidence: DeliveryEvidence): ProjectPipelineEvidenceRef {
  return {
    resolverRef: refs.evidence,
    schemaRef: refs.evidenceSchema,
    objectKey: evidence.work.operationId,
    version: '1',
    digest: digest(evidence),
    producerOperationId: evidence.work.operationId
  }
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
    if (
      evidence.work.roundId !== c.work.roundId ||
      evidence.work.inputDigest !== c.work.inputDigest ||
      evidence.work.generation !== c.work.generation
    )
      throw conflict('CODING_EVIDENCE_STALE')
    return evidence
  }

  async submit(
    c: ProjectPipelineContext,
    conversationId: string,
    operationId: string,
    taskId: string,
    manifestArtifactId?: string
  ) {
    const row = await this.store.operation(c, operationId)
    if (
      row.context.executor.conversationId !== conversationId ||
      (row.context.executor.userId ?? row.context.actor.userId) !== c.actor.userId
    )
      throw conflict('CODING_EXECUTOR_SCOPE_MISMATCH')
    if (row.evidence) {
      if (
        row.evidence.taskId !== taskId ||
        (manifestArtifactId && row.evidence.artifacts[0].artifactId !== manifestArtifactId)
      )
        throw conflict('CODING_EVIDENCE_ALREADY_SEALED')
      // A lost tool response may be retried after this operation has completed.
      // Replaying the sealed receipt performs no execution or state transition.
      return evidenceRef(row.evidence)
    }
    await this.store.assertActive(row, 'submit', c)
    return this.sealAccepted(c, row, taskId, manifestArtifactId, () => this.store.assertActive(row, 'submit', c))
  }

  /** Only the host recovery adapter calls this; ordinary tools retain the active-operation guard. */
  async reconcile(c: ProjectPipelineAssistantContext) {
    const row = await this.resolveOperation(c, c.executor.conversationId, c.work.operationId)
    const check = async () => {
      await this.store.current(c, c.subjects[0])
      if (
        canonical(row.context.work) !== canonical(c.work) ||
        row.context.executor.xpertId !== c.executor.xpertId ||
        row.context.executor.publishedVersion !== c.executor.publishedVersion
      )
        throw conflict('CODING_OPERATION_IDENTITY_CONFLICT')
    }
    await check()
    const tasks = this.store.capabilities.require(ProjectTasksRuntimeCapability)
    let taskId = row.evidence?.taskId
    if (!taskId) {
      const graph = await tasks.graph(c)
      const related = new Set(
        graph.executions.filter((item) => item.conversationId === c.executor.conversationId).map((item) => item.taskId)
      )
      for (const id of related) {
        const parent = graph.tasks.find((item) => item.id === id)?.parentTaskId
        if (parent) related.add(parent)
      }
      const candidates = graph.tasks.filter(
        (item) =>
          related.has(item.id) &&
          item.status === 'done' &&
          (!item.controlKind || item.controlKind === 'ordinary') &&
          (item.kind === 'summary' || !item.parentTaskId)
      )
      const accepted: ProjectTaskAcceptanceReceipt[] = []
      for (const task of candidates) {
        const value = await tasks.readAcceptance(c, task.id)
        if (value?.conversationId === c.executor.conversationId) accepted.push(value)
      }
      if (accepted.length !== 1) throw conflict('CODING_RECOVERY_ACCEPTANCE_REQUIRED')
      taskId = accepted[0].taskId
    }
    return this.sealAccepted(c, row, taskId, undefined, check)
  }

  private async sealAccepted(
    c: ProjectPipelineContext,
    row: Awaited<ReturnType<CodingDeliveryStore['operation']>>,
    taskId: string,
    manifestArtifactId: string | undefined,
    check: () => Promise<unknown>
  ) {
    const accepted = await this.store.acceptedTask(c, taskId)
    if (accepted.conversationId !== row.context.executor.conversationId)
      throw conflict('CODING_TASK_NOT_FROM_THIS_OPERATION')
    const { manifest, artifacts } = await this.validateMaterials(c, row, accepted.artifacts, manifestArtifactId)
    const evidence = evidenceSchema.parse({
      version: 1,
      deliveryId: row.deliveryId,
      requirementVersion: row.requirementVersion,
      phase: row.phase,
      work: row.context.work,
      taskId,
      taskRevision: accepted.taskRevision,
      decisionId: accepted.decisionId,
      reviewExecutionId: accepted.review.executionId,
      manifest,
      artifacts,
      releaseScope: await this.store.get(c, row.deliveryId).then(({ requirement }) =>
        requirement.mode === 'local'
          ? { mode: 'local' as const }
          : {
              target: requirement.target,
              repository: requirement.repository,
              branch: deliveryBranch(row.deliveryId, row.requirementVersion)
            }
      )
    })
    await check()
    const result = await this.store.works.update({ ...scopeWhere(c), id: row.id, evidence: IsNull() }, { evidence })
    if (result.affected !== 1) {
      const replay = await this.store.operation(c, row.id)
      if (!replay.evidence || canonical(replay.evidence) !== canonical(evidence))
        throw conflict('CODING_EVIDENCE_ALREADY_SEALED')
    }
    return evidenceRef(evidence)
  }

  async resolveOperation(c: ProjectPipelineContext, conversationId: string, operationId?: string) {
    const id = operationId ?? (await this.store.stageForConversation(c, conversationId))?.id
    if (!id) throw conflict('CODING_OPERATION_NOT_FOUND')
    const row = await this.store.operation(c, id)
    if (
      row.context.executor.conversationId !== conversationId ||
      (row.context.executor.userId ?? row.context.actor.userId) !== c.actor.userId
    )
      throw conflict('CODING_EXECUTOR_SCOPE_MISMATCH')
    return row
  }

  async submitTask(
    c: ProjectPipelineContext,
    conversationId: string,
    taskId: string,
    operationId?: string,
    manifestArtifactId?: string
  ) {
    const row = await this.resolveOperation(c, conversationId, operationId)
    const seal = async () => ({
      status: 'submitted' as const,
      submitted: true as const,
      evidence: await this.submit(c, conversationId, row.id, taskId, manifestArtifactId)
    })
    // Preserve sealed replay even after the stage is terminal. Missing acceptance never seals output.
    if (row.evidence) return seal()
    await this.store.assertActive(row, 'submit', c)
    const tasks = this.store.capabilities.require(ProjectTasksRuntimeCapability)
    const accepted = await tasks.readAcceptance({ actor: c.actor, projectId: c.projectId }, taskId)
    try {
      // The strict submit path re-reads acceptance and all current guards; a stale receipt grants nothing.
      if (accepted) return await seal()
      return await this.checkCandidate(c, row, taskId, manifestArtifactId)
    } catch (error) {
      if (error instanceof MaterialValidationError)
        return {
          ...error.diagnostic,
          status: 'materials_invalid' as const,
          submitted: false as const,
          operationId: row.id,
          taskId,
          recovery: accepted
            ? t('coding_project:Submission.CorrectAcceptedTask', {
                defaultValue:
                  'Create a corrective summary and implementation task in this delivery stage. Reuse valid candidate files, repair the reported issues, and export the manifest and every referenced file. Preflight the new implementation, independently review it, accept the new summary, then submit that summary.'
              })
            : t('coding_project:Submission.RepairCandidate', {
                defaultValue:
                  'Repair the reported issues in the current implementation task. Export the manifest and every referenced file, then call coding_delivery_submit again before independent review and task acceptance.'
              })
        }
      throw error
    }
  }

  private async checkCandidate(
    c: ProjectPipelineContext,
    row: Awaited<ReturnType<CodingDeliveryStore['operation']>>,
    taskId: string,
    manifestArtifactId?: string
  ) {
    const tasks = this.store.capabilities.require(ProjectTasksRuntimeCapability)
    if (!tasks.readCandidate) throw conflict('CODING_CANDIDATE_READ_UNAVAILABLE')
    const candidate = await tasks.readCandidate({ actor: c.actor, projectId: c.projectId }, taskId)
    if (candidate.projectId !== c.projectId || candidate.taskId !== taskId)
      throw conflict('CODING_ARTIFACT_SCOPE_MISMATCH')
    if (candidate.conversationId !== row.context.executor.conversationId)
      throw conflict('CODING_TASK_NOT_FROM_THIS_OPERATION')
    const checked = await this.validateMaterials(c, row, candidate.artifacts, manifestArtifactId)
    return {
      status: 'awaiting_acceptance' as const,
      submitted: false as const,
      valid: true as const,
      saved: false as const,
      operationId: row.id,
      taskId,
      taskRevision: candidate.taskRevision,
      executionId: candidate.executionId,
      manifestArtifactId: checked.artifacts[0].artifactId,
      artifacts: checked.artifacts,
      acceptance: 'required' as const,
      nextAction:
        'Read the implementation result and dispatch its independent execution review with reviewAsSubtask=true on this implementation task. If already dispatched, wait for its result. Read the review Markdown before deciding on the summary task.'
    }
  }

  private async validateMaterials(
    c: ProjectPipelineContext,
    row: Awaited<ReturnType<CodingDeliveryStore['operation']>>,
    fileRefs: Array<{ artifactId: string; versionId: string }>,
    manifestArtifactId?: string
  ) {
    const api = this.store.capabilities.require(ArtifactsRuntimeCapability)
    const cache = new Map<string, Awaited<ReturnType<typeof load>>>()
    const load = async (ref: { artifactId: string; versionId: string }) => {
      const result = await api.readArtifactVersion({
        artifactId: ref.artifactId,
        artifactVersionId: ref.versionId,
        purpose: 'copy'
      })
      if (
        result.artifact.projectId !== c.projectId ||
        result.artifact.tenantId !== c.actor.tenantId ||
        (result.artifact.organizationId ?? null) !== (c.actor.organizationId ?? null)
      )
        throw conflict('CODING_ARTIFACT_SCOPE_MISMATCH')
      return {
        ...result,
        reference: artifactRefSchema.parse({
          ...ref,
          fileName: result.fileName,
          size: result.buffer.length,
          sha256: createHash('sha256').update(result.buffer).digest('hex')
        })
      }
    }
    const read = async (ref: { artifactId: string; versionId: string }) => {
      const key = `${ref.artifactId}/${ref.versionId}`
      const result = cache.get(key) ?? (await load(ref))
      cache.set(key, result)
      return result
    }
    let manifestRef = manifestArtifactId ? fileRefs.find((file) => file.artifactId === manifestArtifactId) : undefined
    if (manifestArtifactId && !manifestRef) throw conflict('CODING_MANIFEST_NOT_ACCEPTED')
    if (!manifestRef) {
      const matches: typeof fileRefs = []
      for (const file of fileRefs) if ((await read(file)).fileName === 'delivery-manifest.json') matches.push(file)
      if (matches.length !== 1)
        throw new MaterialValidationError('CODING_MANIFEST_SELECTION_REQUIRED', [
          materialIssue(
            'manifest',
            'manifest_selection',
            'Export exactly one delivery-manifest.json with the implementation files. If multiple manifests are intentional, select its manifestArtifactId from the task output.'
          )
        ])
      manifestRef = matches[0]
    }
    const content = await read(manifestRef)
    const manifest = parseMaterialManifest(content.buffer, row.phase)
    if (manifest.phase !== row.phase || canonical(manifest.work) !== canonical(row.context.work))
      throw new MaterialValidationError('CODING_MANIFEST_WORK_MISMATCH', [
        materialIssue(
          'work',
          'work_identity',
          'Copy the current work object from coding_delivery_context. Do not reuse an earlier operation identity.'
        )
      ])
    if (row.requirement.mode === 'local' && manifest.phase !== 'development')
      throw conflict('CODING_LOCAL_RELEASE_FORBIDDEN')
    const artifacts = [content.reference]
    const references = new Map<string, typeof content.reference>()
    const files =
      manifest.phase === 'development'
        ? [manifest.source, manifest.package, manifest.report]
        : manifest.phase === 'deployment'
          ? [manifest.report, manifest.installationReceipt]
          : [manifest.source, manifest.report]
    const issues: MaterialIssue[] = []
    for (const file of files) {
      let found = false
      for (const ref of fileRefs) {
        if (ref.artifactId === manifestRef.artifactId) continue
        const reference = references.get(ref.versionId) ?? (await read(ref)).reference
        references.set(ref.versionId, reference)
        if (reference.fileName === file.fileName && reference.sha256 === file.sha256) {
          artifacts.push(reference)
          found = true
          break
        }
      }
      if (!found) {
        const field = Object.entries(manifest).find(([, value]) => value === file)?.[0] ?? 'files'
        issues.push(
          materialIssue(
            field,
            'exported_file',
            'Export the referenced file in this implementation result with the exact basename and SHA-256. Recompute its hash from the exported bytes.'
          )
        )
      }
    }
    if (issues.length) throw new MaterialValidationError('CODING_FILE_NOT_IN_ACCEPTED_ARTIFACTS', issues)
    if (manifest.phase !== 'development') {
      const candidate = await this.input({ ...row.context, actor: c.actor }, 'candidate')
      const delivery = await this.store.get(c, row.deliveryId)
      if (delivery.requirement.mode === 'local') throw conflict('CODING_LOCAL_RELEASE_FORBIDDEN')
      if (candidate.manifest.phase !== 'development' || manifest.candidateDigest !== digest(candidate))
        throw conflict('CODING_APPROVED_CANDIDATE_CHANGED')
      if (manifest.phase === 'deployment') {
        if (
          manifest.targetKey !== delivery.requirement.target.key ||
          manifest.baseUrl !== delivery.requirement.target.baseUrl ||
          manifest.installedPackageSha256 !== candidate.manifest.package.sha256 ||
          manifest.installedVersion !== candidate.manifest.packageVersion ||
          manifest.loadedVersion !== candidate.manifest.packageVersion
        )
          throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
        const installation = row.context.inputs.installation
        if (delivery.requirement.target.deployment === 'current-instance') {
          if (installation?.kind !== 'evidence') throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
          const proof = projectPluginDeploymentReceiptSchema.parse(
            await this.store.capabilities.require(ProjectPipelineEvidenceRuntimeCapability).read(c, installation.value)
          )
          const file = artifacts.find(
            (item) =>
              item.fileName === manifest.installationReceipt.fileName &&
              item.sha256 === manifest.installationReceipt.sha256
          )
          if (!file) throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
          const saved = await load(file)
          if (
            saved.buffer.length > 64 * 1024 ||
            canonical(proof.request) !== canonical(deploymentRequest(candidate)) ||
            !proof.installed ||
            !proof.loaded ||
            canonical(projectPluginDeploymentReceiptSchema.parse(JSON.parse(saved.buffer.toString('utf8')))) !==
              canonical(proof)
          )
            throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
        }
      } else {
        const repo = delivery.requirement.repository
        if (
          manifest.commit !== candidate.manifest.commit ||
          manifest.repositoryKey !== repo.key ||
          manifest.remoteUrl !== repo.remoteUrl ||
          manifest.mode !== repo.mode ||
          manifest.branch !== deliveryBranch(row.deliveryId, row.requirementVersion) ||
          manifest.source.sha256 !== candidate.manifest.source.sha256
        )
          throw conflict('CODING_GIT_IDENTITY_MISMATCH')
        const deployment = await this.input({ ...row.context, actor: c.actor }, 'deployment')
        if (deployment.manifest.phase !== 'deployment' || deployment.manifest.candidateDigest !== digest(candidate))
          throw conflict('CODING_DEPLOYMENT_IDENTITY_MISMATCH')
      }
    }
    return { manifest, artifacts }
  }
}
