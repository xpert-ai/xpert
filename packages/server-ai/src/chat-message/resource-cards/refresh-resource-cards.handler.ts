// Providers may only refresh their supplied resources. The host retains message bindings.
// A slow or broken provider must not prevent discovery of background conversation runs.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { t } from 'i18next'
import { parseResourceCard, resourceCardId, type TMessageContentResourceCard } from '@xpert-ai/contracts'
import {
    RequestContext,
    ResourceCardProviderRegistry,
    type IResourceCardProvider,
    type ResourceCardResolution,
    type ResourceCardContext
} from '@xpert-ai/plugin-sdk'
import {
    RefreshConversationResourceCardsCommand,
    type BoundConversationResourceCard
} from '../commands/refresh-resource-cards.command'

export const RESOURCE_CARD_REFRESH_TIMEOUT_MS = 2000

function parseResolution(value: unknown): ResourceCardResolution | null {
    if (
        !value ||
        typeof value !== 'object' ||
        !('key' in value) ||
        typeof value.key !== 'string' ||
        !('status' in value)
    )
        return null
    if (value.status === 'resolved' && 'card' in value) {
        const card = parseResourceCard(value.card)
        return card ? { key: value.key, status: 'resolved', card } : null
    }
    if (
        value.status === 'unavailable' &&
        'reason' in value &&
        (value.reason === 'forbidden' || value.reason === 'not_found')
    ) {
        return { key: value.key, status: 'unavailable', reason: value.reason }
    }
    return null
}

function unavailable(card: BoundConversationResourceCard, reason: 'forbidden' | 'not_found' | 'refresh_failed') {
    return { ...card, data: { ...card.data, description: t(`server-ai:ResourceCard.Refresh.${reason}`) } }
}

@CommandHandler(RefreshConversationResourceCardsCommand)
export class RefreshConversationResourceCardsHandler implements ICommandHandler<RefreshConversationResourceCardsCommand> {
    constructor(private readonly registry: ResourceCardProviderRegistry) {}

    async execute(command: RefreshConversationResourceCardsCommand): Promise<TMessageContentResourceCard[]> {
        const groups = new Map<IResourceCardProvider, BoundConversationResourceCard[]>()
        const result = new Map<BoundConversationResourceCard, TMessageContentResourceCard>()
        for (const card of command.cards) {
            const provider = this.registry.find(card.data.resource, command.conversation.organizationId ?? undefined)
            if (!provider) {
                result.set(card, card)
                continue
            }
            const group = groups.get(provider) ?? []
            group.push(card)
            groups.set(provider, group)
        }
        await Promise.all(
            Array.from(groups, async ([provider, cards]) => {
                const refreshed = await this.refresh(provider, command, cards)
                cards.forEach((card, index) => result.set(card, refreshed[index]))
            })
        )
        return command.cards.map((card) => result.get(card) ?? card)
    }

    private async refresh(
        provider: IResourceCardProvider,
        command: RefreshConversationResourceCardsCommand,
        cards: BoundConversationResourceCard[]
    ) {
        const abort = new AbortController()
        let timer: ReturnType<typeof setTimeout>
        const requests = cards.map((card, index) => ({
            key: String(index),
            card: structuredClone(card.data),
            messageId: card.messageId,
            executionId: card.executionId
        }))
        const context: ResourceCardContext = {
            tenantId: command.conversation.tenantId,
            organizationId: command.conversation.organizationId,
            userId: RequestContext.currentUserId(),
            conversationId: command.conversation.id,
            threadId: command.threadId,
            projectId: command.conversation.projectId,
            signal: abort.signal
        }
        try {
            if (!context.userId || !context.tenantId) return cards.map((card) => unavailable(card, 'forbidden'))
            const output: unknown = await Promise.race([
                Promise.resolve().then(() => provider.resolveMany(context, requests)),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        abort.abort()
                        reject(new Error('Resource card refresh timed out'))
                    }, RESOURCE_CARD_REFRESH_TIMEOUT_MS)
                })
            ])
            const resolutions = new Map<string, ResourceCardResolution>()
            const duplicates = new Set<string>()
            if (Array.isArray(output))
                for (const item of output) {
                    const resolution = parseResolution(item)
                    if (!resolution) continue
                    if (resolutions.has(resolution.key)) duplicates.add(resolution.key)
                    resolutions.set(resolution.key, resolution)
                }
            return cards.map((card, index) => {
                const resolution = resolutions.get(String(index))
                if (!resolution || duplicates.has(String(index))) return unavailable(card, 'refresh_failed')
                if (resolution.status === 'unavailable') return unavailable(card, resolution.reason)
                if (
                    resourceCardId(resolution.card) !== card.id ||
                    resolution.card.resource.artifactId !== card.data.resource.artifactId
                ) {
                    return unavailable(card, 'refresh_failed')
                }
                return { ...card, data: resolution.card }
            })
        } catch {
            return cards.map((card) => unavailable(card, 'refresh_failed'))
        } finally {
            clearTimeout(timer)
        }
    }
}
