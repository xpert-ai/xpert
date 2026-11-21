import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { MessageWidgetProviderRegistry, RequestContext, type MessageWidgetReference } from '@xpert-ai/plugin-sdk'
import type { TMessageContentWidget } from '@xpert-ai/contracts'
import { DataSource, EntityManager } from 'typeorm'

export const MESSAGE_WIDGET_RESOLVE_TIMEOUT_MS = 2000

type MessageWidgetTarget = Omit<MessageWidgetReference, 'messageId'> &
    ({ messageId: string; executionId?: never } | { executionId: string; messageId?: never })

/** The caller owns the transaction. A replay may reaffirm the same binding, never replace its producer. */
export async function attachMessageWidget(manager: EntityManager, conversationId: string, ref: MessageWidgetTarget) {
    const { messageId, widgetId, threadId, provider } = ref
    const rows: Array<{ message_id: string }> = await manager.query(
        `INSERT INTO chat_message_widget_reference AS w (message_id, widget_id, provider, thread_id)
         SELECT m.id, $2, $3, $4::varchar FROM chat_message m JOIN chat_conversation c ON c.id=m."conversationId"
         JOIN chat_conversation_thread t ON t."conversationId"=c.id AND t."threadId"=$4::varchar
         WHERE ((m.id=$1::uuid) OR ($1::uuid IS NULL AND m.id=t."headMessageId" AND m."executionId"=$8::uuid)) AND m.role IN ('ai','assistant') AND COALESCE(m."createdInThreadId",c."threadId")=$4::varchar
           AND c."tenantId"=$5 AND c."organizationId" IS NOT DISTINCT FROM $6 AND c.id=$7
         ON CONFLICT (message_id,widget_id) DO UPDATE SET provider=w.provider
         WHERE w.provider=excluded.provider AND w.thread_id=excluded.thread_id RETURNING message_id`,
        [
            messageId,
            widgetId,
            provider,
            threadId,
            RequestContext.currentTenantId(),
            RequestContext.getOrganizationId() ?? null,
            conversationId,
            ref.executionId ?? null
        ]
    )
    if (!rows.length) throw new ConflictException('Unavailable Widget message or conflicting Widget identity')
    return { messageId: rows[0].message_id, widgetId, threadId, provider }
}

export type ResolvedMessageWidget = { messageId: string; widget: TMessageContentWidget }

@Injectable()
export class MessageWidgets {
    private readonly logger = new Logger(MessageWidgets.name)
    constructor(
        private readonly db: DataSource,
        private readonly providers: MessageWidgetProviderRegistry
    ) {}

    async resolve(threadId: string, ids: string[], restricted: boolean): Promise<ResolvedMessageWidget[]> {
        if (!ids.length) return []
        const references: MessageWidgetReference[] = await this.db.query(
            `SELECT thread_id AS "threadId", message_id AS "messageId", widget_id AS "widgetId", provider
             FROM chat_message_widget_reference WHERE thread_id=$1 AND message_id=ANY($2::uuid[]) ORDER BY message_id,widget_id`,
            [threadId, ids]
        )
        const groups = new Map<string, MessageWidgetReference[]>()
        for (const ref of references) {
            if (!groups.has(ref.provider)) groups.set(ref.provider, [])
            groups.get(ref.provider).push(ref)
        }
        const groupsOfCards = await Promise.all(
            Array.from(groups, ([name, refs]) => this.resolveProvider(name, refs, restricted))
        )
        return groupsOfCards.flat()
    }

    private async resolveProvider(name: string, refs: MessageWidgetReference[], restricted: boolean) {
        const provider = this.providers.findByName(name)
        if (!provider || (restricted && !provider.visibleInRestrictedSessions)) return []
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            // Bound each provider independently so one plugin cannot hold up history or message completion.
            const resolved = await Promise.race([
                Promise.resolve().then(() => provider.resolve(refs)),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error('Widget resolution timed out')),
                        MESSAGE_WIDGET_RESOLVE_TIMEOUT_MS
                    )
                })
            ])
            const cards: ResolvedMessageWidget[] = []
            // Preserve reference order and accept only the exact message/Widget pairs issued to this provider.
            for (const ref of refs) {
                const card = resolved.find(
                    (c) =>
                        c.messageId === ref.messageId &&
                        c.widget?.id === ref.widgetId &&
                        c.widget.type === 'component' &&
                        c.widget.data?.type === 'Widget'
                )
                if (card) cards.push(card)
            }
            return cards
        } catch {
            this.logger.warn(`Widget provider ${name} could not restore its cards`)
            return []
        } finally {
            clearTimeout(timer)
        }
    }
}
