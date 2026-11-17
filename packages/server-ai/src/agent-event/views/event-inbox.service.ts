import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import type {
    AgentEventPresentation,
    AgentEventTypeDisplay,
    OpenConversationAction,
    XpertResolvedViewHostContext,
    XpertViewQuery
} from '@xpert-ai/contracts'
import type { PluginAgentEventSource } from '@xpert-ai/plugin-sdk'
import { AgentEventBindingService } from '../agent-event-binding.service'
import { AgentEventBinding, AgentEventInbox } from '../agent-event.entity'
import { AgentEventSources, sourceContext } from '../agent-event.runtime'
import { EventBindingAccessService } from '../event-binding-access.service'

const states = ['pending', 'processing', 'retry_wait', 'handled', 'ignored', 'blocked', 'isolated'] as const
const filters = z
    .object({
        section: z.literal('result').optional(),
        assistant: z.string().uuid().optional(),
        category: z.string().min(1).max(256).optional(),
        state: z.enum([...states, 'attention']).optional()
    })
    .strict()
const id = z.string().uuid()
const conversationRef = z.object({ conversationId: id, threadId: z.string().min(1).max(100).optional() })
type Scope = { binding: AgentEventBinding; assistant: string; source?: PluginAgentEventSource }
type Kind = { binding: string; type: string; version: number; count: number }

@Injectable()
export class EventInboxService {
    constructor(
        @InjectRepository(AgentEventBinding) private readonly bindings: Repository<AgentEventBinding>,
        @InjectRepository(AgentEventInbox) private readonly receipts: Repository<AgentEventInbox>,
        private readonly access: EventBindingAccessService,
        private readonly sources: AgentEventSources,
        private readonly changes: AgentEventBindingService
    ) {}

    private async scope(context: XpertResolvedViewHostContext) {
        const { tenantId, organizationId, userId } = context
        if (!tenantId || !organizationId || !userId) throw new ForbiddenException()
        const rows = await this.bindings.findBy({
            tenantId,
            organizationId,
            userId,
            ...(context.hostType === 'agent' ? { xpertId: context.hostId } : {})
        })
        const result = new Map<string, Scope>()
        const permissions = new Map<string, Promise<string>>()
        for (const binding of rows) {
            const key = JSON.stringify([binding.xpertId, binding.workspaceId, binding.projectId])
            let allowed = permissions.get(key)
            if (!allowed) {
                allowed = this.access.assertAccessible(binding)
                permissions.set(key, allowed)
            }
            let assistant: string
            try {
                assistant = await allowed
            } catch (error) {
                if (
                    error instanceof ForbiddenException ||
                    error instanceof NotFoundException ||
                    error instanceof UnauthorizedException
                )
                    continue
                throw error
            }
            let source: PluginAgentEventSource | undefined
            try {
                source = this.sources.resolve(binding)
            } catch {
                /* Uninstalled sources retain their receipts. */
            }
            result.set(binding.id, { binding, assistant, source })
        }
        return result
    }

    async data(context: XpertResolvedViewHostContext, query: XpertViewQuery) {
        const parsed = filters.safeParse(query.parameters ?? {})
        if (
            !parsed.success ||
            (query.search?.length ?? 0) > 256 ||
            (query.cursor && (!/^\d{1,19}$/.test(query.cursor) || BigInt(query.cursor) > 9223372036854775807n))
        )
            throw new BadRequestException('invalid_inbox_filter')
        const filter = parsed.data
        if (filter.section && !query.selectionId) throw new BadRequestException('result_requires_selection')
        const scopes = await this.scope(context)
        if (query.selectionId) {
            const row = await this.findReceipt(scopes, query.selectionId)
            return { item: await this.present(row, scopes.get(row.binding)!, true, filter.section === 'result') }
        }
        const assistants = Array.from(
            new Map(
                [...scopes.values()].map((s) => [s.binding.xpertId, { id: s.binding.xpertId, name: s.assistant }])
            ).values()
        )
        const summary = {
            personal: context.hostType === 'user',
            assistants,
            categories: [] as { key: string; display?: AgentEventTypeDisplay['category']; count: number }[],
            count: 0
        }
        const ids = [...scopes.values()]
            .filter((s) => !filter.assistant || s.binding.xpertId === filter.assistant)
            .map((s) => s.binding.id)
        if (!ids.length) return { items: [], summary }
        const base = this.receipts.createQueryBuilder('r').where('r.binding IN (:...ids)', { ids })
        if (filter.state === 'attention') base.andWhere("r.state IN ('isolated','blocked')")
        else if (filter.state) base.andWhere('r.state = :state', { state: filter.state })
        const term = query.search?.trim()
        if (term) {
            const labelKinds = ids.flatMap((binding) =>
                (scopes.get(binding)?.source?.eventTypes ?? [])
                    .filter(
                        (d) =>
                            d.display &&
                            Object.values(d.display.label).some(
                                (l) => typeof l === 'string' && l.toLowerCase().includes(term.toLowerCase())
                            )
                    )
                    .map((d) => ({ binding, type: d.type, version: d.schemaVersion }))
            )
            const references = (
                await Promise.all(
                    ids.map(async (binding) => {
                        const scope = scopes.get(binding)!
                        const source = scope.source
                        if (!source?.searchTitles) return []
                        const matches = await optionalProjection((signal) =>
                            source.searchTitles!(sourceContext(scope.binding, signal), term)
                        )
                        return (matches ?? []).map((m) =>
                            'subject' in m
                                ? { binding, subject: m.subject }
                                : { binding, kind: m.result.kind, key: m.result.key }
                        )
                    })
                )
            ).flat()
            base.andWhere(
                `(strpos(lower(concat_ws(' ',r.id::text,r."sourceEventId",r.event->>'type',r.event->'subject'->>'key',
                r.decision->'resultRef'->>'key')),lower(:term))>0 OR ${matchesKind('labels')} OR EXISTS
                (SELECT 1 FROM jsonb_to_recordset(CAST(:refs AS jsonb)) AS m(binding uuid,subject text,kind text,key text)
                 WHERE m.binding=r.binding AND (m.subject=r.event->'subject'->>'key' OR
                 (m.kind=r.decision->'resultRef'->>'kind' AND m.key=r.decision->'resultRef'->>'key'))))`,
                { term, labels: JSON.stringify(labelKinds), refs: JSON.stringify(references) }
            )
        }
        const kinds = await base
            .clone()
            .select('r.binding', 'binding')
            .addSelect("r.event->>'type'", 'type')
            .addSelect("(r.event->>'schemaVersion')::int", 'version')
            .addSelect('count(*)::int', 'count')
            .groupBy('1,2,3')
            .getRawMany<Kind>()
        const categories = new Map<string, (typeof summary.categories)[number]>()
        const selected = kinds.filter((k) => {
            const display = this.definition(scopes.get(k.binding)!, k.type, k.version)?.category
            const key = display?.key ?? 'uncategorized'
            const group = categories.get(key) ?? { key, display, count: 0 }
            group.count += k.count
            categories.set(key, group)
            summary.count += k.count
            return key === filter.category
        })
        summary.categories = [...categories.values()].sort((a, b) => a.key.localeCompare(b.key))
        if (filter.category) base.andWhere(matchesKind('kinds'), { kinds: JSON.stringify(selected) })
        if (query.cursor)
            base.andWhere(
                `(r."receivedAt",r.seq) < (SELECT "receivedAt",seq FROM agent_event_inbox
            WHERE seq=:cursor AND binding IN (:...ids))`,
                { cursor: query.cursor }
            )
        const take = Math.max(1, Math.min(query.pageSize ?? 30, 100))
        const rows = await base
            .orderBy('r.receivedAt', 'DESC')
            .addOrderBy('r.seq', 'DESC')
            .take(take + 1)
            .getMany()
        const page = rows.slice(0, take)
        const items = await Promise.all(page.map((row) => this.present(row, scopes.get(row.binding)!, false)))
        return { items, summary, nextCursor: rows.length > take ? page.at(-1)?.seq : undefined }
    }

    private definition(scope: Scope, type: string, version: number) {
        return scope.source?.eventTypes.find((d) => d.type === type && d.schemaVersion === version)?.display
    }

    private async findReceipt(scopes: Map<string, Scope>, receiptId: string) {
        if (!id.safeParse(receiptId).success || !scopes.size) throw new NotFoundException()
        const row = await this.receipts
            .createQueryBuilder('r')
            .where('r.id=:receiptId AND r.binding IN (:...ids)', { receiptId, ids: [...scopes.keys()] })
            .getOne()
        if (!row) throw new NotFoundException()
        return row
    }

    private async present(row: AgentEventInbox, scope: Scope, detail: boolean, includeResult = false) {
        const { binding, source, assistant } = scope
        const { type, schemaVersion, subject, occurredAt } = row.event
        let conversationAction: OpenConversationAction | undefined
        let presentation: AgentEventPresentation | null = null
        if (source?.describe) {
            // A domain projection is optional. A revoked resource must never disclose its former title or fields.
            presentation = await optionalProjection((signal) =>
                source.describe!(sourceContext(binding, signal), row.event, row.decision, {
                    includeConversation: detail
                })
            )
        }
        const ref = detail ? conversationRef.safeParse(presentation?.conversation) : undefined
        if (ref?.success) {
            try {
                conversationAction = await this.access.conversationAction(
                    binding,
                    ref.data.conversationId,
                    ref.data.threadId
                )
            } catch {
                // Receipt visibility does not grant conversation access.
            }
        }
        return {
            id: row.id,
            type,
            schemaVersion,
            display: this.definition(scope, type, schemaVersion),
            state: row.state,
            subject: subject.key,
            receivedAt: row.receivedAt,
            assistant,
            assistantId: binding.xpertId,
            title: presentation?.title,
            ...(detail
                ? {
                      ...(conversationAction ? { conversationAction } : {}),
                      occurredAt,
                      sourceEventId: row.sourceEventId,
                      attempt: row.attempt,
                      error: row.error,
                      decision: row.decision,
                      fields: presentation?.fields,
                      result:
                          presentation?.result &&
                          (includeResult ? presentation.result : { action: presentation.result.action }),
                      canRetry:
                          this.supportsReceipt(source, row) &&
                          row.state === 'isolated' &&
                          !row.decision &&
                          binding.state === 'enabled' &&
                          binding.revision === row.event.bindingRevision
                  }
                : {})
        }
    }

    private supportsReceipt(source: PluginAgentEventSource | undefined, row: AgentEventInbox) {
        return !!source?.eventTypes.some(
            (d) => d.type === row.event.type && d.schemaVersion === row.event.schemaVersion
        )
    }

    async retry(context: XpertResolvedViewHostContext, receiptId: string) {
        const scopes = await this.scope(context)
        const row = await this.findReceipt(scopes, receiptId)
        const scope = scopes.get(row.binding)!
        if (!this.supportsReceipt(scope.source, row)) throw new ConflictException('event_source_unavailable')
        await this.changes.retry(scope.binding, receiptId)
        return { success: true, refresh: true }
    }
}

// Plugins may ignore cancellation. Bound the host wait as well as signaling the plugin.
async function optionalProjection<T>(project: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    const controller = new AbortController()
    let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
            resolve(null)
            controller.abort()
        }, 4000)
    })
    try {
        return await Promise.race([deadline, project(controller.signal)])
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

function matchesKind(parameter: 'labels' | 'kinds') {
    return `EXISTS (SELECT 1 FROM jsonb_to_recordset(CAST(:${parameter} AS jsonb)) AS k(binding uuid,type text,version int)
        WHERE k.binding=r.binding AND k.type=r.event->>'type' AND k.version=(r.event->>'schemaVersion')::int)`
}
