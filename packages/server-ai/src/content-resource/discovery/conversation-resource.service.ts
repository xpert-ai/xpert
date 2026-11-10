import { createHash } from 'node:crypto'
import { BadRequestException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { ConversationResourcesApi, ConversationResourceScope } from '@xpert-ai/plugin-sdk'
import type { ConversationResourceItem, ConversationResourcePage, ConversationResourceQuery } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { ContentCatalogService } from '../catalog/content-catalog.service'
import { ResolveConversationResourceScopeCommand } from '../../chat-group/commands/conversation-resource-scope.command'
import { DiscoverGroupResourcesCommand } from '../../artifacts/group-references/commands/discover-group-resources.command'
import { conversationResourceCursorSchema, conversationResourceQuerySchema } from './conversation-resource.schema'

/** Discovery is a projection, never a Project catalog registration or an authorization fallback. */
@Injectable()
export class ConversationResourceService implements ConversationResourcesApi {
    constructor(
        private readonly catalog: ContentCatalogService,
        private readonly commands: CommandBus
    ) {}

    async list(scope: ConversationResourceScope, input: ConversationResourceQuery): Promise<ConversationResourcePage> {
        const query = conversationResourceQuerySchema.parse(input)
        const audience = await this.commands.execute(new ResolveConversationResourceScopeCommand(scope))
        const signature = createHash('sha256')
            .update(
                JSON.stringify([
                    scope.actor.tenantId,
                    scope.actor.organizationId,
                    scope.actor.userId,
                    scope.projectId,
                    scope.assistantId,
                    scope.conversationId,
                    audience.groupId,
                    query.search,
                    query.typeId,
                    query.origin,
                    query.limit
                ])
            )
            .digest('hex')
        const cursor = this.cursor(query.cursor, signature)
        let source = cursor?.source ?? (query.origin === 'shared' ? 'shared' : 'project')
        let offset = cursor?.offset ?? 0
        if (query.origin !== 'all' && source !== query.origin) throw this.invalidCursor()
        const items: ConversationResourceItem[] = []
        const result = (nextCursor: string | null): ConversationResourcePage => ({
            items,
            nextCursor,
            sharedAvailable: !!audience.groupId
        })
        const next = (source: 'project' | 'shared', offset: number) =>
            Buffer.from(JSON.stringify({ source, offset, scope: signature })).toString('base64url')
        if (source === 'project') {
            const page = await this.catalog.list({
                ...scope,
                search: query.search,
                typeId: query.typeId,
                offset,
                limit: query.limit
            })
            for (const item of page.items) {
                if (item.availability === 'provider-unavailable') continue
                items.push({
                    resource: { kind: 'project-content', id: item.contentId },
                    title: item.title,
                    typeId: item.typeId,
                    projectId: scope.projectId,
                    contentSource: item.resourceRef,
                    access: { canOpen: true, canEdit: item.canWrite, analysis: 'none' }
                })
            }
            if (page.hasMore) return result(next('project', offset + query.limit))
            if (query.origin === 'project' || !audience.groupId) return result(null)
            source = 'shared'
            offset = 0
            if (items.length === query.limit) return result(next(source, offset))
        }
        if (!audience.groupId) return result(null)
        const shared = await this.commands.execute(
            new DiscoverGroupResourcesCommand(scope.actor, audience.groupId, {
                search: query.search,
                typeId: query.typeId,
                offset,
                limit: query.limit - items.length
            })
        )
        items.push(...shared.items)
        return result(shared.nextOffset === null ? null : next('shared', shared.nextOffset))
    }

    private cursor(value: string | undefined, scope: string) {
        if (!value) return null
        try {
            const cursor = conversationResourceCursorSchema.parse(
                JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
            )
            if (cursor.scope !== scope) throw this.invalidCursor()
            return cursor
        } catch {
            throw this.invalidCursor()
        }
    }
    private invalidCursor() {
        return new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
    }
}
