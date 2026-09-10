import type { IXpert, WorkbenchAssistantConversationResolution } from '@xpert-ai/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { ChatConversationService } from './conversation.service'
import { directExternalAssistantIds } from '../xpert/external-assistant-binding'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../xpert-project/services/project-xpert-binding.service'

@Injectable()
export class WorkbenchAssistantConversationNavigationService {
    constructor(
        private readonly conversationService: ChatConversationService,
        private readonly projectAccessService: XpertProjectAccessService,
        private readonly xpertBindingService: XpertProjectXpertBindingService
    ) {}

    async resolve(conversationId: string, requesterXpertId: string): Promise<WorkbenchAssistantConversationResolution> {
        const normalizedRequesterXpertId = normalizeRequiredId(requesterXpertId)
        const conversation = await this.conversationService.assertAccess(conversationId)
        const threadId = normalizeRequiredId(conversation.threadId)
        const targetXpertId = normalizeRequiredId(conversation.xpertId)
        const projectId = normalizeOptionalId(conversation.projectId)
        const tenantId = normalizeRequiredId(conversation.tenantId)
        const organizationId = normalizeOptionalId(conversation.organizationId)
        const xpertScope = { tenantId, organizationId }

        if (projectId) {
            await Promise.all([
                this.projectAccessService.assertCanReadXpert(projectId, normalizedRequesterXpertId),
                this.projectAccessService.assertCanReadXpert(projectId, targetXpertId)
            ])
        }

        const [requesterXpert, targetXpert] = await Promise.all([
            this.xpertBindingService.resolveCurrentById(normalizedRequesterXpertId, xpertScope),
            this.xpertBindingService.resolveCurrentById(targetXpertId, xpertScope)
        ])
        if (!requesterXpert || !targetXpert) {
            throw navigationDenied()
        }

        const isExternalAssistant = !this.xpertBindingService.isSameXpert(requesterXpert, targetXpert)
        if (isExternalAssistant && !(await this.isConnectedExternalAssistant(requesterXpert, targetXpert, projectId))) {
            throw navigationDenied()
        }

        return {
            conversationId: conversation.id,
            threadId,
            xpertId: targetXpert.id,
            projectId,
            isExternalAssistant
        }
    }

    // Read navigation follows required Assistant edges; runtime tool grants remain direct-only.
    // Conversation access, tenant scope and Project membership are checked independently.
    private async isConnectedExternalAssistant(requesterXpert: IXpert, targetXpert: IXpert, projectId: string | null) {
        const scope = {
            tenantId: requesterXpert.tenantId,
            organizationId: requesterXpert.organizationId
        }
        const queue = [{ xpert: requesterXpert, depth: 0 }]
        const visited = new Set([requesterXpert.id])
        let remaining = 32
        while (queue.length) {
            const { xpert, depth } = queue.shift()!
            const agentKey = resolvePrimaryAgentKey(xpert)
            if (!agentKey || depth >= 8) continue
            for (const id of directExternalAssistantIds(xpert, agentKey)) {
                if (visited.has(id)) continue
                if (remaining-- <= 0) return false
                visited.add(id)
                const candidate = await this.xpertBindingService.resolveCurrentById(id, scope)
                if (
                    !candidate ||
                    candidate.tenantId !== scope.tenantId ||
                    (candidate.organizationId ?? null) !== (scope.organizationId ?? null)
                )
                    continue
                if (projectId) {
                    try {
                        await this.projectAccessService.assertCanReadXpert(projectId, candidate.id)
                    } catch (error) {
                        if (error instanceof ForbiddenException) continue
                        throw error
                    }
                }
                if (this.xpertBindingService.isSameXpert(candidate, targetXpert)) return true
                if (id !== candidate.id && visited.has(candidate.id)) continue
                visited.add(candidate.id)
                queue.push({ xpert: candidate, depth: depth + 1 })
            }
        }
        return false
    }
}

function resolvePrimaryAgentKey(xpert: IXpert) {
    return xpert.agent?.key ?? xpert.graph?.nodes.find((node) => node.type === 'agent')?.key ?? null
}

function normalizeRequiredId(value?: string | null) {
    const normalized = value?.trim()
    if (!normalized) {
        throw navigationDenied()
    }
    return normalized
}

function normalizeOptionalId(value?: string | null) {
    return value?.trim() || null
}

function navigationDenied() {
    return new ForbiddenException('This Assistant conversation is not available from the current Workbench.')
}
