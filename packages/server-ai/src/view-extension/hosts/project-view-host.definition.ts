import {
    AIPermissionsEnum,
    getAgentMiddlewareNodes,
    IWFNMiddleware,
    IXpert,
    normalizeMiddlewareProvider,
    resolveRuntimeXpert,
    TXpertFeatures,
    XpertViewHostContext,
    XpertViewSlot
} from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { RequestContext, ViewHostDefinition, ViewHostDefinitionContract } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { XpertProjectService } from '../../xpert-project/project.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../../xpert-project/services/project-xpert-binding.service'

@Injectable()
@ViewHostDefinition('project')
export class ProjectViewHostDefinition implements ViewHostDefinitionContract {
    readonly hostType = 'project'
    readonly slots: XpertViewSlot[] = [
        {
            key: 'detail.sections',
            mode: 'sections',
            order: 0,
            manifestPolicy: { requireFeatureActivation: true }
        }
    ]

    constructor(
        private readonly projectService: XpertProjectService,
        private readonly projectAccessService: XpertProjectAccessService,
        private readonly xpertBindingService: XpertProjectXpertBindingService,
        private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry
    ) {}

    async resolve(hostId: string) {
        const access = await this.projectAccessService.assertCanRead(hostId)
        const project = await this.projectService.findOne({ where: { id: hostId }, relations: ['xperts'] })
        await this.xpertBindingService.normalize(project)
        const featureProviders: Record<string, Array<{ xpertId: string; name: string }>> = {}
        for (const linkedXpert of project.xperts ?? []) {
            const xpert = resolveRuntimeXpert(linkedXpert as IXpert, false)
            for (const feature of collectXpertFeatures(xpert, this.agentMiddlewareRegistry)) {
                const providers = featureProviders[feature] ?? []
                providers.push({ xpertId: xpert.id, name: xpert.name ?? xpert.title ?? xpert.id })
                featureProviders[feature] = providers
            }
        }

        return {
            workspaceId: project.workspaceId ?? null,
            hostSnapshot: {
                id: project.id,
                name: project.name,
                status: project.status ?? null,
                ownerId: project.ownerId ?? null,
                workspaceId: project.workspaceId ?? null
            },
            context: {
                capabilities: {
                    features: Object.keys(featureProviders).sort(),
                    featureProviders
                },
                runtimeScope: {
                    projectId: project.id,
                    conversationId: null,
                    dataScopeKey: `project:${project.id}`,
                    project: { id: project.id, name: project.name, status: project.status },
                    projectAccess: toProjectViewAccess(access.role, project.status),
                    workspaceFiles: { catalog: 'projects', scopeId: project.id, projectId: project.id }
                }
            }
        }
    }

    async canRead(context: XpertViewHostContext) {
        if (
            !RequestContext.hasPermission(AIPermissionsEnum.CHAT_VIEW, false) &&
            !RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)
        ) {
            return false
        }

        try {
            await this.projectAccessService.assertCanRead(context.hostId)
            return true
        } catch {
            return false
        }
    }
}

function collectXpertFeatures(xpert: IXpert, registry: AgentMiddlewareRegistry) {
    const features = new Set<string>(getEnabledXpertFeatures(xpert.features))
    const agentKey = xpert.agent?.key ?? xpert.graph?.nodes?.find((node) => node.type === 'agent')?.key
    if (!xpert.graph || !agentKey) return features

    for (const node of getAgentMiddlewareNodes(xpert.graph, agentKey)) {
        const entity = node?.entity as unknown as IWFNMiddleware | undefined
        const provider = normalizeMiddlewareProvider(entity?.provider)
        if (!provider) continue
        try {
            const strategy = registry.get(provider, xpert.organizationId ?? undefined)
            for (const feature of strategy.meta.features ?? []) {
                if (typeof feature === 'string' && feature.trim()) features.add(feature.trim())
            }
        } catch {
            // A missing optional middleware must not hide the rest of the Project capabilities.
        }
    }
    return features
}

function getEnabledXpertFeatures(features?: TXpertFeatures | null): string[] {
    if (!features) return []
    return Object.entries(features)
        .filter(([, value]) => Boolean(value && typeof value === 'object' && 'enabled' in value && value.enabled))
        .map(([key]) => key)
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
