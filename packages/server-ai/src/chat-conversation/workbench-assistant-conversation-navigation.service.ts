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
        if (isExternalAssistant && !(await this.isDirectRequiredExternalAssistant(requesterXpert, targetXpert))) {
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

    private async isDirectRequiredExternalAssistant(requesterXpert: IXpert, targetXpert: IXpert) {
        const requesterAgentKey = resolvePrimaryAgentKey(requesterXpert)
        if (!requesterAgentKey) {
            return false
        }

        const scope = {
            tenantId: requesterXpert.tenantId,
            organizationId: requesterXpert.organizationId
        }
        const candidates = await Promise.all(
            directExternalAssistantIds(requesterXpert, requesterAgentKey).map((candidateId) =>
                this.xpertBindingService.resolveCurrentById(candidateId, scope)
            )
        )
        return candidates.some(
            (candidate) => candidate !== null && this.xpertBindingService.isSameXpert(candidate, targetXpert)
        )
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
