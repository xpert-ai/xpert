import { ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { projectPluginDeploymentRefs } from '@xpert-ai/contracts'
import {
    ProjectPipelineRuntimeAdapterProvider,
    type ProjectPipelineOperationContext,
    type ProjectPipelineOperationReceipt
} from '@xpert-ai/plugin-sdk'
import {
    DeployPluginArchiveCommand,
    ResolveExecutionIdentityCommand,
    runWithExecutionIdentity
} from '@xpert-ai/server-core'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPluginDeploymentStore, deploymentConflict } from './plugin-deployment.store'
import { ProjectPluginInstallationAuthorizationStore } from './plugin-installation-authorization.store'
import { ProjectPluginInstallationAuthorizationService } from './plugin-installation-authorization.service'

@Injectable()
@ProjectPipelineRuntimeAdapterProvider('operation', projectPluginDeploymentRefs.operation)
export class ProjectPluginDeploymentService {
    readonly kind = 'operation' as const
    readonly ref = projectPluginDeploymentRefs.operation
    constructor(
        private readonly store: ProjectPluginDeploymentStore,
        private readonly authorizations: ProjectPluginInstallationAuthorizationStore,
        private readonly installation: ProjectPluginInstallationAuthorizationService,
        private readonly access: ProjectAccessRuntimeService,
        private readonly commands: CommandBus
    ) {}

    execute(c: ProjectPipelineOperationContext) {
        return this.run(c, 'install')
    }
    inspect(c: ProjectPipelineOperationContext) {
        return this.run(c, 'inspect')
    }
    async cancel(c: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
        // Installation already dispatched cannot be rolled back automatically.
        return { status: 'cancelled', receiptKey: c.work.operationId }
    }

    private async run(
        c: ProjectPipelineOperationContext,
        action: 'install' | 'inspect'
    ): Promise<ProjectPipelineOperationReceipt> {
        await this.access.assertEdit(c)
        const claim = await this.store.claim(c)
        if (action === 'install' && claim.state !== 'dispatching') throw deploymentConflict()
        const { request, approval } = await this.installation.input(c)
        const authorization = await this.authorizations.read(claim)
        if (!authorization)
            return { status: 'pending', receiptKey: claim.id, code: 'PLUGIN_INSTALL_AUTHORIZATION_REQUIRED' }
        const actor = { ...c.actor, userId: authorization.actorId }
        const status = await this.commands
            .execute(new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' }))
            .then((identity) =>
                runWithExecutionIdentity(identity, async () => {
                    const { buffer, status } = await this.installation.inspect({ ...c, actor }, c)
                    const current = await this.store.claim(c)
                    if (current.leaseOwner !== claim.leaseOwner || current.leaseFence !== claim.leaseFence)
                        throw deploymentConflict()
                    // Inspection also recovers installs that completed before the previous worker lost its lease.
                    if (status.installed) return status
                    if (!(await this.authorizations.beginDispatch(c, claim, authorization))) return null
                    return this.commands.execute(
                        new DeployPluginArchiveCommand({
                            buffer,
                            action: 'install',
                            fileName: request.fileName,
                            packageName: request.packageName,
                            packageVersion: request.packageVersion,
                            sha256: request.sha256,
                            allowReplace: request.allowReplace,
                            allowRestart: request.allowRestart
                        })
                    )
                })
            )
            .catch((error: unknown) => {
                // Authorization failures are explicit waits, never evidence that a possibly dispatched install failed.
                if (error instanceof ForbiddenException) return 'denied' as const
                throw error
            })
        if (status === 'denied')
            return {
                status: (await this.authorizations.dispatched(claim)) ? 'pending' : 'failed',
                receiptKey: claim.id,
                code: 'PLUGIN_INSTALL_AUTHORIZATION_DENIED'
            }
        if (!status) return { status: 'unknown', receiptKey: claim.id }
        if (!status.installed || !status.loaded || !status.scopeKey || !status.runtimeRevision)
            return { status: 'pending', receiptKey: claim.id }
        const reference = await this.store.record(
            c,
            claim,
            {
                operationId: claim.id,
                request,
                approval: approval.reference,
                scopeKey: status.scopeKey,
                runtimeRevision: status.runtimeRevision,
                installed: true,
                loaded: true
            },
            authorization
        )
        return { status: 'succeeded', receiptKey: claim.id, outputs: { deployment: reference } }
    }
}
