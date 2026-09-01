import {
    AIPermissionsEnum,
    getAgentMiddlewareNodes,
    IWFNMiddleware,
    IXpert,
    normalizeMiddlewareProvider,
    resolveRuntimeXpert,
    type TXpertTeamNode,
    TXpertFeatures,
    XpertResolvedViewHostContext,
    XpertViewActionRequest,
    XpertViewHostContext,
    XpertTypeEnum,
    XpertViewHostCapabilities,
    XpertViewHostState,
    XpertViewSlot,
    XpertViewRuntimeScope
} from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import {
    RequestContext,
    ViewExtensionFileActionFile,
    ViewHostDefinition,
    ViewHostDefinitionContract,
    ViewHostResolution,
    ViewHostResolutionOptions
} from '@xpert-ai/server-core'
import { normalizeUploadedFileName } from '@xpert-ai/server-common'
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { XpertService } from '../../xpert/xpert.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { resolveXpertDataVolumeScope, VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../../shared/volume'
import {
    describeExternalAssistantBinding,
    directExternalAssistantIds,
    safeExternalAssistantBinding
} from '../../xpert/external-assistant-binding'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../../xpert-project/services/project-xpert-binding.service'

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

@Injectable()
@ViewHostDefinition('agent')
export class AgentViewHostDefinition implements ViewHostDefinitionContract {
    readonly hostType = 'agent'
    readonly slots: XpertViewSlot[] = [
        { key: 'detail.sidebar', mode: 'sidebar', order: 0 },
        {
            key: AGENT_WORKBENCH_MAIN_SLOT,
            mode: 'sections',
            order: 10,
            manifestPolicy: { requireFeatureActivation: true }
        },
        {
            key: AGENT_WORKBENCH_FIXED_SLOT,
            mode: 'sections',
            order: 20,
            manifestPolicy: { requireFeatureActivation: true }
        }
    ]

    constructor(
        private readonly xpertService: XpertService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService,
        private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry,
        @InjectRepository(ChatConversation)
        private readonly conversationRepository: Repository<ChatConversation>,
        private readonly projectAccessService: XpertProjectAccessService,
        private readonly xpertBindingService: XpertProjectXpertBindingService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    async resolve(hostId: string, options?: ViewHostResolutionOptions) {
        const xpert = await this.xpertService.findOneByIdWithinTenant(hostId, {
            relations: ['agent']
        })
        if (xpert.type !== XpertTypeEnum.Agent) {
            return null
        }

        const runtimeXpert = resolveRuntimeXpert(xpert as IXpert, options?.isDraft === true)
        const agentContext = await this.resolveAgentContext(runtimeXpert)
        const runtimeScope = await this.resolveRuntimeScope(runtimeXpert, options)

        return {
            workspaceId: runtimeXpert.workspaceId ?? null,
            hostSnapshot: {
                id: runtimeXpert.id,
                name: runtimeXpert.name,
                title: runtimeXpert.title ?? null,
                type: runtimeXpert.type,
                active: runtimeXpert.active ?? true,
                environmentId: runtimeXpert.environmentId ?? null,
                workspaceId: runtimeXpert.workspaceId ?? null,
                agent: {
                    key: agentContext.agentKey ?? null
                }
            },
            context: {
                capabilities: agentContext.capabilities,
                hostState: agentContext.hostState,
                runtimeScope
            }
        }
    }

    async canRead(context: XpertViewHostContext, resolution: ViewHostResolution, options?: ViewHostResolutionOptions) {
        if (options?.isDraft) {
            if (!RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)) {
                return false
            }

            try {
                await this.xpertService.assertCanAuthorById(context.hostId, resolution.workspaceId)
                return true
            } catch (error) {
                if (error instanceof ForbiddenException || error instanceof NotFoundException) {
                    return false
                }
                throw error
            }
        }

        if (RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)) {
            return true
        }

        try {
            await this.publishedXpertAccessService.getAccessiblePublishedXpert(context.hostId)
            return true
        } catch {
            return false
        }
    }

    async prepareFileAction(
        context: XpertResolvedViewHostContext,
        request: XpertViewActionRequest,
        file: ViewExtensionFileActionFile
    ): Promise<XpertViewActionRequest> {
        const input = isRecord(request.input) ? request.input : {}
        const workspaceUploadPath = getNonEmptyString(input.workspaceUploadPath)
        if (!workspaceUploadPath) {
            return request
        }

        const uploadFileName =
            normalizeWorkspaceUploadFileName(
                getNonEmptyString(input.originalFileName) ??
                    getNonEmptyString(input.fileName) ??
                    getNonEmptyString(input.name) ??
                    file.originalname
            ) ?? 'upload'
        const xpert = await this.xpertService.findOneByIdWithinTenant(context.hostId)
        const uploaded = await this.createWorkspaceVolumeClient(context, xpert.workspaceDataScope).uploadFile(
            '',
            workspaceUploadPath,
            normalizeWorkspaceUploadFile(file, uploadFileName)
        )
        const uploadedFileName = normalizeWorkspaceUploadedFileName(uploaded.filePath, uploadFileName)

        return {
            ...request,
            input: {
                ...input,
                workspaceFile: {
                    ...uploaded,
                    workspacePath: uploaded.filePath,
                    filePath: uploaded.filePath,
                    fileUrl: uploaded.fileUrl ?? uploaded.url,
                    url: uploaded.fileUrl ?? uploaded.url,
                    originalName: uploadedFileName,
                    name: uploadedFileName,
                    mimeType: uploaded.mimeType ?? file.mimetype,
                    size: uploaded.size ?? file.size
                }
            }
        }
    }

    private createWorkspaceVolumeClient(
        context: XpertResolvedViewHostContext,
        workspaceDataScope?: IXpert['workspaceDataScope']
    ) {
        const projectId = context.runtimeScope?.projectId
        return new VolumeSubtreeClient(
            this.volumeClient.resolve(
                projectId
                    ? { tenantId: context.tenantId, catalog: 'projects', projectId }
                    : resolveXpertDataVolumeScope({
                          tenantId: context.tenantId,
                          userId: context.userId,
                          xpertId: context.hostId,
                          workspaceDataScope
                      })
            ),
            {
                allowRootWorkspace: true
            }
        )
    }

    private async resolveRuntimeScope(xpert: IXpert, options?: ViewHostResolutionOptions): Promise<XpertViewRuntimeScope> {
        const requestedProjectId = options?.runtimeScope?.projectId ?? null
        const conversationId = options?.runtimeScope?.conversationId ?? null
        let projectId = requestedProjectId

        if (conversationId) {
            const conversation = await this.conversationRepository.findOne({
                where: {
                    id: conversationId,
                    tenantId: RequestContext.currentTenantId(),
                    organizationId: RequestContext.getOrganizationId() ?? IsNull()
                },
                relations: ['xpert']
            })
            if (!conversation) throw new NotFoundException('The requested conversation was not found')
            if (requestedProjectId && requestedProjectId !== (conversation.projectId ?? null)) {
                throw new ForbiddenException('The requested Project does not match the conversation Project')
            }
            if (!conversation.xpert || !this.xpertBindingService.isSameXpert(conversation.xpert, xpert)) {
                throw new ForbiddenException('The conversation does not belong to this Xpert')
            }
            projectId = conversation.projectId ?? null
        }

        if (projectId) {
            const access = conversationId
                ? await this.projectAccessService.assertCanReadXpert(projectId, xpert.id)
                : await this.projectAccessService.assertCanUseXpert(projectId, xpert.id)
            return {
                projectId,
                conversationId,
                dataScopeKey: `project:${projectId}`,
                project: { id: access.project.id, name: access.project.name, status: access.project.status },
                projectAccess: toProjectViewAccess(access.role, access.project.status),
                workspaceFiles: { catalog: 'projects', scopeId: projectId, projectId }
            }
        }

        const fileScope = resolveXpertDataVolumeScope({
            tenantId: xpert.tenantId,
            userId: RequestContext.currentUserId(),
            xpertId: xpert.id,
            workspaceDataScope: xpert.workspaceDataScope
        })
        const scopeId = xpert.id
        const dataScopeKey = fileScope.catalog === 'user-xperts'
            ? `${fileScope.catalog}:${fileScope.userId}:${scopeId}`
            : `${fileScope.catalog}:${scopeId}`
        return {
            projectId: null,
            conversationId,
            dataScopeKey,
            project: null,
            projectAccess: null,
            workspaceFiles: {
                catalog: fileScope.catalog,
                scopeId,
                xpertId: xpert.id,
                userId: fileScope.userId ?? null,
                isolateByUser: fileScope.catalog === 'xperts' ? fileScope.isolateByUser : true
            }
        }
    }

    private async resolveAgentContext(xpert: IXpert): Promise<{
        agentKey: string | null
        capabilities: XpertViewHostCapabilities
        hostState: XpertViewHostState
    }> {
        const features = new Set<string>(this.getEnabledXpertFeatures(xpert.features))
        const middlewareProviders = new Set<string>()
        const middlewareNodeKeys = new Set<string>()
        const graph = xpert.graph
        const agentKey = xpert.agent?.key ?? this.findPrimaryAgentKey(graph)
        const availableAgents = (graph?.nodes ?? [])
            .filter((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')
            .map((node) => ({
                key: node.entity?.key ?? node.key,
                title: node.entity?.title ?? node.entity?.name ?? node.entity?.key ?? node.key,
                role:
                    node.entity?.description ?? node.entity?.title ?? node.entity?.name ?? node.entity?.key ?? node.key
            }))
            .filter((agent) => Boolean(agent.key))
            .sort((left, right) => left.key.localeCompare(right.key))
        const knowledgebaseIds = xpert.agent?.knowledgebaseIds ?? []
        const externalAssistants = agentKey ? await this.resolveExternalAssistants(xpert, agentKey) : []

        if (graph && agentKey) {
            for (const node of getAgentMiddlewareNodes(graph, agentKey)) {
                const entity = node?.entity as unknown as IWFNMiddleware | undefined
                const provider = normalizeMiddlewareProvider(entity?.provider)
                if (!provider) {
                    continue
                }

                middlewareProviders.add(provider)
                if (node.key) {
                    middlewareNodeKeys.add(node.key)
                }

                try {
                    const strategy = this.agentMiddlewareRegistry.get(provider, xpert.organizationId ?? undefined)
                    for (const feature of strategy.meta.features ?? []) {
                        if (typeof feature === 'string' && feature.trim()) {
                            features.add(feature.trim())
                        }
                    }
                } catch {
                    // A missing strategy should not make the host unavailable. The
                    // provider name is still exposed so manifests may gate on it.
                }
            }
        }

        return {
            agentKey,
            capabilities: {
                features: Array.from(features).sort()
            },
            hostState: {
                agent: {
                    key: agentKey,
                    availableAgents,
                    ...(externalAssistants.length ? { externalAssistants } : {}),
                    middlewareProviders: Array.from(middlewareProviders).sort(),
                    middlewareNodeKeys: Array.from(middlewareNodeKeys).sort(),
                    connections: knowledgebaseIds.map((id) => ({
                        type: 'knowledgebase',
                        id
                    }))
                }
            }
        }
    }

    /** Resolve required direct bindings and strip internal identifiers before projecting host state. */
    private async resolveExternalAssistants(xpert: IXpert, agentKey: string) {
        const targetIds = directExternalAssistantIds(xpert, agentKey)
        const candidates = await Promise.all(
            targetIds.map(async (id) => {
                try {
                    return await this.xpertService.findOneByIdWithinTenant(id, { relations: ['agent'] })
                } catch {
                    return null
                }
            })
        )
        return candidates
            .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
            .map((candidate) => safeExternalAssistantBinding(describeExternalAssistantBinding(xpert, candidate)))
    }

    private getEnabledXpertFeatures(features?: TXpertFeatures | null): string[] {
        if (!features) {
            return []
        }

        return Object.entries(features)
            .filter(([, value]) => Boolean(value && typeof value === 'object' && 'enabled' in value && value.enabled))
            .map(([key]) => key)
    }

    private findPrimaryAgentKey(graph?: IXpert['graph'] | null): string | null {
        const agentNode = graph?.nodes?.find((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')
        return agentNode?.key ?? agentNode?.entity?.key ?? null
    }
}

function toProjectViewAccess(role: 'owner' | 'manager' | 'editor' | 'member', status?: string | null) {
    const writable = status !== 'archived'
    return {
        role,
        canRead: true,
        canEdit: writable && role !== 'member',
        canManage: writable && (role === 'owner' || role === 'manager'),
        canUse: writable
    }
}

function normalizeWorkspaceUploadFile(file: ViewExtensionFileActionFile, fileName: string) {
    return {
        originalname: fileName,
        buffer: file.buffer,
        mimetype: file.mimetype
    }
}

function normalizeWorkspaceUploadedFileName(filePath?: string, fallback?: string) {
    const fileName = getFileNameFromPath(filePath)
    if (fileName) {
        return normalizeWorkspaceUploadFileName(fileName) ?? fileName
    }
    return normalizeWorkspaceUploadFileName(fallback) ?? 'upload'
}

function normalizeWorkspaceUploadFileName(fileName?: string) {
    try {
        return normalizeUploadedFileName(fileName)
    } catch {
        return getNonEmptyString(fileName)
    }
}

function getFileNameFromPath(filePath?: string) {
    const value = getNonEmptyString(filePath)
    if (!value) {
        return undefined
    }
    const clean = value.split('?')[0].split('#')[0]
    const segments = clean.split('/').filter(Boolean)
    return getNonEmptyString(segments[segments.length - 1])
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
