import { ConflictException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import { projectPluginDeploymentRequestSchema, projectPluginDeploymentRefs } from '@xpert-ai/contracts'
import { ProjectPipelineRuntimeAdapterProvider, type ProjectPipelineOperationContext, type ProjectPipelineOperationReceipt } from '@xpert-ai/plugin-sdk'
import { DeployPluginArchiveCommand, ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { ArtifactsService } from '../../../artifacts/artifacts.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineEvidenceService } from '../runtime/pipeline-evidence.service'
import { ProjectPluginDeploymentStore, deploymentConflict } from './plugin-deployment.store'

@Injectable()
@ProjectPipelineRuntimeAdapterProvider('operation', projectPluginDeploymentRefs.operation)
export class ProjectPluginDeploymentService {
  readonly kind = 'operation' as const
  readonly ref = projectPluginDeploymentRefs.operation
  constructor(private readonly store: ProjectPluginDeploymentStore, private readonly evidence: ProjectPipelineEvidenceService,
    private readonly artifacts: ArtifactsService, private readonly access: ProjectAccessRuntimeService,
    private readonly commands: CommandBus) {}

  execute(c: ProjectPipelineOperationContext) { return this.run(c, 'install') }
  inspect(c: ProjectPipelineOperationContext) { return this.run(c, 'inspect') }
  async cancel(c: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    // Installation already dispatched cannot be rolled back automatically.
    return { status: 'cancelled', receiptKey: c.work.operationId }
  }

  private async run(c: ProjectPipelineOperationContext, action: 'install' | 'inspect'): Promise<ProjectPipelineOperationReceipt> {
    await this.access.assertEdit(c)
    const claim = await this.store.claim(c)
    if (action === 'install' && claim.state !== 'dispatching') throw deploymentConflict()
    const input = c.inputs.request
    if (input?.kind !== 'evidence') throw deploymentConflict()
    const approval = await this.store.approval(c, input.value)
    const request = projectPluginDeploymentRequestSchema.parse(await this.evidence.verify(c, input.value, projectPluginDeploymentRefs.request))
    const actor = { ...c.actor, userId: approval.actorId }
    const identity = await this.commands.execute(new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' }))
    const status = await runWithExecutionIdentity(identity, async () => {
      await this.access.assertManage({ ...c, actor })
      const archive = await this.artifacts.readArtifactVersion({ artifactId: request.artifactId, artifactVersionId: request.artifactVersionId, purpose: 'copy' })
      if (archive.artifact.id !== request.artifactId || archive.version.id !== request.artifactVersionId ||
        archive.version.artifactId !== request.artifactId || archive.artifact.projectId !== c.projectId ||
        archive.artifact.tenantId !== c.actor.tenantId ||
        (archive.artifact.organizationId ?? null) !== (c.actor.organizationId ?? null) ||
        createHash('sha256').update(archive.buffer).digest('hex') !== request.sha256)
        throw new ConflictException(t('server-ai:Error.PluginDeploymentIdentity'))
      const current = await this.store.claim(c)
      if (current.leaseOwner !== claim.leaseOwner || current.leaseFence !== claim.leaseFence) throw deploymentConflict()
      return this.commands.execute(new DeployPluginArchiveCommand({ buffer: archive.buffer, action,
        fileName: request.fileName, packageName: request.packageName, packageVersion: request.packageVersion,
        sha256: request.sha256, allowReplace: request.allowReplace, allowRestart: request.allowRestart }))
    })
    if (!status.installed || !status.loaded || !status.scopeKey || !status.runtimeRevision)
      return { status: 'pending', receiptKey: claim.id }
    const reference = await this.store.record(c, claim, { operationId: claim.id, request, approval: approval.reference,
      scopeKey: status.scopeKey, runtimeRevision: status.runtimeRevision, installed: true, loaded: true })
    return { status: 'succeeded', receiptKey: claim.id, outputs: { deployment: reference } }
  }
}
