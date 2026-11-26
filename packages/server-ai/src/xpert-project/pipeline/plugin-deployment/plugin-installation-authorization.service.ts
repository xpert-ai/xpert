import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import {
    projectPluginDeploymentRefs,
    projectPluginDeploymentRequestSchema,
    SecretTokenBindingType,
    UserType,
    type ProjectPipelineOperationAction,
    type ProjectPipelineOperationActions,
    type ProjectPluginDeploymentRequest
} from '@xpert-ai/contracts'
import { RequestContext, type ProjectPipelineContext, type ProjectPipelineOperationContext } from '@xpert-ai/plugin-sdk'
import {
    DeployPluginArchiveCommand,
    ResolveExecutionIdentityCommand,
    runWithExecutionIdentity
} from '@xpert-ai/server-core'
import { ArtifactsService } from '../../../artifacts/artifacts.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineEvidenceService } from '../runtime/pipeline-evidence.service'
import type { PipelineOperationActionProvider } from '../operation-actions/operation-actions.service'
import { ProjectPluginDeploymentStore, deploymentConflict } from './plugin-deployment.store'
import { ProjectPluginInstallationAuthorizationStore } from './plugin-installation-authorization.store'

const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

@Injectable()
export class ProjectPluginInstallationAuthorizationService implements PipelineOperationActionProvider {
    readonly operationRef = projectPluginDeploymentRefs.operation
    constructor(
        private readonly store: ProjectPluginDeploymentStore,
        private readonly authorizations: ProjectPluginInstallationAuthorizationStore,
        private readonly evidence: ProjectPipelineEvidenceService,
        private readonly artifacts: ArtifactsService,
        private readonly access: ProjectAccessRuntimeService,
        private readonly commands: CommandBus
    ) {}

    async input(c: ProjectPipelineOperationContext, reader: ProjectPipelineContext = c) {
        const input = c.inputs.request
        if (input?.kind !== 'evidence') throw deploymentConflict()
        const approval = await this.store.approval(c, input.value)
        const request = projectPluginDeploymentRequestSchema.parse(
            await this.evidence.verify(reader, input.value, projectPluginDeploymentRefs.request)
        )
        return { request, approval }
    }

    private async archive(c: ProjectPipelineContext, request: ProjectPluginDeploymentRequest) {
        const archive = await this.artifacts.readArtifactVersion({
            artifactId: request.artifactId,
            artifactVersionId: request.artifactVersionId,
            purpose: 'copy'
        })
        if (
            archive.artifact.id !== request.artifactId ||
            archive.version.id !== request.artifactVersionId ||
            archive.version.artifactId !== request.artifactId ||
            archive.artifact.projectId !== c.projectId ||
            archive.artifact.tenantId !== c.actor.tenantId ||
            (archive.artifact.organizationId ?? null) !== (c.actor.organizationId ?? null) ||
            createHash('sha256').update(archive.buffer).digest('hex') !== request.sha256
        )
            throw new ConflictException(t('server-ai:Error.PluginDeploymentIdentity'))
        return archive.buffer
    }

    async inspect(c: ProjectPipelineContext, operation: ProjectPipelineOperationContext) {
        const access = await this.access.assertManage(c)
        if (access.role === 'assistant') throw new ForbiddenException()
        const { request, approval } = await this.input(operation, c)
        const actor = { ...operation.actor, userId: approval.actorId }
        const identity = await this.commands.execute(new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' }))
        // The immutable business approval delegates use of these exact bytes, not general artifact access.
        // Artifact ACL remains enforced as the approver, separately from the installer's publisher rights.
        const buffer = await runWithExecutionIdentity(identity, async () => {
            await this.access.assertManage({ ...operation, actor })
            return this.archive({ ...operation, actor }, request)
        })
        const status = await this.commands.execute(
            new DeployPluginArchiveCommand({
                buffer,
                action: 'inspect',
                fileName: request.fileName,
                packageName: request.packageName,
                packageVersion: request.packageVersion,
                sha256: request.sha256,
                allowReplace: request.allowReplace,
                allowRestart: request.allowRestart
            })
        )
        return { buffer, status, request }
    }

    async describe(
        c: ProjectPipelineContext,
        operation: ProjectPipelineOperationEntity
    ): Promise<ProjectPipelineOperationActions> {
        const result: ProjectPipelineOperationActions = { operationId: operation.id, messages: [], items: [] }
        if (
            operation.receipt?.status === 'failed' &&
            operation.receipt.code === 'PLUGIN_INSTALL_AUTHORIZATION_DENIED'
        ) {
            result.messages.push(
                label(
                    'Installation authorization is no longer valid. No installation was dispatched. Retry requires a new authorization.',
                    '安装授权已失效，尚未派发安装。重试时需要重新授权。'
                )
            )
            return result
        }
        if (['succeeded', 'accepted'].includes(operation.state)) return result
        try {
            await this.store.current(c, operation)
        } catch (error) {
            if (error instanceof ConflictException) return result
            throw error
        }
        const { request } = await this.input(operation.context, c)
        result.messages.push(
            label(
                `${request.packageName}@${request.packageVersion} · current platform`,
                `${request.packageName}@${request.packageVersion} · 当前宿主平台`
            )
        )
        result.messages.push(label(`Archive SHA-256: ${request.sha256}`, `安装包 SHA-256：${request.sha256}`))
        if (
            operation.receipt?.status === 'pending' &&
            operation.receipt.code === 'PLUGIN_INSTALL_AUTHORIZATION_DENIED'
        ) {
            result.messages.push(
                label(
                    'Installation was dispatched, but current authorization prevents inspection. Restore access to verify the result; installation will not be repeated.',
                    '安装已经派发，但当前授权失效，暂时无法核验结果。恢复该授权人的权限后继续核验；不会重复安装。'
                )
            )
            return result
        }
        if (await this.authorizations.read(operation)) {
            result.messages.push(
                label(
                    'Installation authorized. The host is verifying installation and runtime loading.',
                    '安装已授权，宿主正在核验安装与实际加载结果。'
                )
            )
            return result
        }
        result.messages.push(
            label(
                'Project approval is recorded. A project manager with plugin management rights must authorize installation.',
                '项目发布审批已记录。待同时拥有本项目管理权和平台插件管理权的人员授权安装。'
            )
        )
        try {
            await this.inspect(c, operation.context)
        } catch (error) {
            if (error instanceof ForbiddenException) return result
            throw error
        }
        const confirmation = label(
            `Authorize installation of this exact archive on the current platform. Replacement: ${request.allowReplace ? 'allowed' : 'not allowed'}; restart: ${request.allowRestart ? 'allowed' : 'not allowed'}.`,
            `确认将此精确安装包安装到当前宿主平台。${request.allowReplace ? '允许' : '不允许'}替换已有插件；${request.allowRestart ? '允许' : '不允许'}重启。`
        )
        result.items.push({
            key: 'authorize-installation',
            version: this.authorizations.version(operation),
            title: label('Authorize installation', '授权安装'),
            confirmation
        })
        return result
    }

    async submit(
        c: ProjectPipelineContext,
        operation: ProjectPipelineOperationEntity,
        input: ProjectPipelineOperationAction
    ) {
        const principal = RequestContext.currentApiPrincipal()
        const interactive =
            !principal ||
            (principal.principalType === 'client_secret' &&
                principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT &&
                principal.resourceScope?.kind === 'assistant')
        if (
            !interactive ||
            RequestContext.currentUser()?.type !== UserType.USER ||
            RequestContext.currentUserId() !== c.actor.userId
        )
            throw new ForbiddenException()
        if (
            input.operationId !== operation.id ||
            input.key !== 'authorize-installation' ||
            input.version !== this.authorizations.version(operation)
        )
            throw deploymentConflict()
        await this.store.current(c, operation)
        const { request } = await this.input(operation.context, c)
        await this.inspect(c, operation.context)
        await this.authorizations.authorize(c, operation, input.version)
    }
}
