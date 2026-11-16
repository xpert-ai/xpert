import { BadRequestException, Injectable } from '@nestjs/common'
import { type TXpertTeamDraft, type TXpertTeamNode } from '@xpert-ai/contracts'
import { t } from 'i18next'
import {
    AssistantCapabilityProvider,
    applyAssistantMiddleware,
    hasAssistantMiddleware,
    type AssistantCapabilityApplyContext,
    type AssistantCapabilityContext,
    type IAssistantCapabilityProvider
} from '@xpert-ai/plugin-sdk'
import { STANDARD_REPLIES, replyDescription, replyLabel } from './standard-reply.middleware'

function structuredOutputConflict(node: TXpertTeamNode<'agent'>) {
    return t('server-ai:MemoryReply.StructuredOutputConflict', { agent: node.entity.title || node.key })
}

export function validateStandardReplyDraft(draft: TXpertTeamDraft) {
    for (const node of draft.nodes) {
        if (
            node.type === 'agent' &&
            node.entity.options?.structuredOutputMethod &&
            hasAssistantMiddleware(draft, STANDARD_REPLIES, node.key)
        ) {
            throw new BadRequestException(structuredOutputConflict(node))
        }
    }
}

@Injectable()
@AssistantCapabilityProvider(STANDARD_REPLIES)
export class StandardReplyCapability implements IAssistantCapabilityProvider {
    readonly key = STANDARD_REPLIES
    readonly label = replyLabel
    readonly description = replyDescription
    readonly availableForBlankAssistant = true
    readonly supportsQuickCreation = true
    isEnabled(draft: TXpertTeamDraft) {
        return hasAssistantMiddleware(draft, this.key)
    }
    async check({ draft }: AssistantCapabilityContext) {
        const agent = draft.nodes.find((node) => node.type === 'agent' && node.key === draft.team.agent?.key)
        if (agent?.type === 'agent' && agent.entity.options?.structuredOutputMethod) {
            return { available: false, reason: structuredOutputConflict(agent) }
        }
        return {
            available:
                agent?.type === 'agent' &&
                !agent.entity.options?.hidden &&
                !agent.entity.promptTemplates?.length &&
                !agent.entity.options?.disableMessageHistory
        }
    }
    async apply(context: AssistantCapabilityApplyContext) {
        const { available, reason } = await this.check(context)
        if (!available) {
            throw new BadRequestException(
                reason ?? t('server-ai:Error.TemplateCapabilityUnavailable', { capability: this.key })
            )
        }
        applyAssistantMiddleware(context.draft, {
            provider: this.key,
            key: 'Capability_StandardReplies',
            title: 'Standard replies',
            instructions: '',
            preserveToolConcurrency: true
        })
    }
}
