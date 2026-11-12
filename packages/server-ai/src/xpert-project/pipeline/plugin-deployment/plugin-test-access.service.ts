import { ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { projectPipelineEvidenceRefSchema } from '@xpert-ai/contracts'
import { PluginTestAccessCapability, RequestContext, RuntimeCapabilityProvider, type PluginTestAccessApi } from '@xpert-ai/plugin-sdk'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectFilesRuntimeService } from '../../services/project-files-runtime.service'
import { PreparePluginTestAccessCommand } from '../../../plugin-resource/commands/prepare-plugin-test-access.command'
import { pipelineDigest } from '../persistence/pipeline-identity'
import { ProjectPluginDeploymentStore, deploymentConflict } from './plugin-deployment.store'

const inputSchema = z.object({ deployment: projectPipelineEvidenceRefSchema,
  componentKey: z.string().min(1).max(191) }).strict()

@Injectable()
@RuntimeCapabilityProvider(PluginTestAccessCapability)
export class ProjectPluginTestAccessService implements PluginTestAccessApi {
  constructor(private readonly store: ProjectPluginDeploymentStore, private readonly access: ProjectAccessRuntimeService,
    private readonly files: ProjectFilesRuntimeService, private readonly commands: CommandBus) {}

  async prepare(c: Parameters<PluginTestAccessApi['prepare']>[0], value: Parameters<PluginTestAccessApi['prepare']>[1]) {
    if (RequestContext.currentUserId() !== c.actor.userId || RequestContext.currentTenantId() !== c.actor.tenantId ||
      (RequestContext.getOrganizationId() ?? null) !== (c.actor.organizationId ?? null))
      throw new ForbiddenException(t('server-ai:Error.PluginDeploymentScope'))
    await this.access.assertEdit(c)
    const input = inputSchema.parse(value), proof = await this.store.read(c, input.deployment)
    const row = await this.store.operation(c, proof.operationId)
    await this.store.current(c, row)
    if (row.state !== 'accepted' || row.receipt?.status !== 'succeeded' ||
      !Object.values(row.receipt.outputs).some((ref) => pipelineDigest(ref) === pipelineDigest(input.deployment))) throw deploymentConflict()
    const request = row.context.inputs.request
    if (request?.kind !== 'evidence') throw deploymentConflict()
    const approval = await this.store.approval(row.context, request.value)
    if (pipelineDigest(proof.approval) !== pipelineDigest(approval.reference)) throw deploymentConflict()
    const actor = { ...c.actor, userId: approval.actorId }
    const identity = await this.commands.execute(new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' }))
    const credential = await runWithExecutionIdentity(identity, async () => {
      await this.access.assertManage({ ...c, actor })
      return this.commands.execute(new PreparePluginTestAccessCommand(proof.request.packageName, input.componentKey, proof.operationId, {
        scopeKey: proof.scopeKey, runtimeRevision: proof.runtimeRevision,
        packageVersion: proof.request.packageVersion, sha256: proof.request.sha256
      }))
    })
    await this.store.current(c, await this.store.operation(c, proof.operationId))
    // The project is the sharing boundary. Secrets never enter tool output or pipeline evidence.
    const directory = `.plugin-tests/${proof.operationId}`, path = `${directory}/mcp-test-access.json`
    await this.files.mkdir({ ...c, path: directory })
    const existing = await this.files.read({ ...c, path }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null
      throw error
    })
    await this.files.write({ ...c, path, buffer: Buffer.from(JSON.stringify(credential)), expectedHash: existing?.sha256 ?? null })
    return { path, publicationId: credential.publicationId, expiresAt: credential.expiresAt }
  }
}
