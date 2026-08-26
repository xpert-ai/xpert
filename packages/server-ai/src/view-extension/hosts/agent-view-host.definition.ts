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
    XpertViewSlot
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
import { XpertService } from '../../xpert/xpert.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../../shared/volume'

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
        const agentContext = this.resolveAgentContext(runtimeXpert)

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
                hostState: agentContext.hostState
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
        const uploaded = await this.createWorkspaceVolumeClient(context.tenantId, context.hostId).uploadFile(
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

    private createWorkspaceVolumeClient(tenantId: string, xpertId: string) {
        return new VolumeSubtreeClient(
            this.volumeClient.resolve({
                tenantId,
                catalog: 'xperts',
                xpertId,
                isolateByUser: false
            }),
            {
                allowRootWorkspace: true
            }
        )
    }

    private resolveAgentContext(xpert: IXpert): {
        agentKey: string | null
        capabilities: XpertViewHostCapabilities
        hostState: XpertViewHostState
    } {
        const features = new Set<string>(this.getEnabledXpertFeatures(xpert.features))
        const middlewareProviders = new Set<string>()
        const middlewareNodeKeys = new Set<string>()
        const graph = xpert.graph
        const agentKey = xpert.agent?.key ?? this.findPrimaryAgentKey(graph)
        const knowledgebaseIds = xpert.agent?.knowledgebaseIds ?? []

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
