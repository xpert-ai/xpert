import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    ASSISTANT_USER_PREFERENCES_VERSION,
    IChatConversation,
    TChatConversationSidebarState
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { AssistantUserPreference } from '../xpert/assistant-user-preference.entity'
import { ChatConversationService } from './conversation.service'

const EMPTY_STATE: TChatConversationSidebarState = { pinned: false, archived: false }

@Injectable()
export class ChatConversationSidebarService {
    constructor(
        private readonly conversations: ChatConversationService,
        @InjectRepository(AssistantUserPreference)
        private readonly preferences: Repository<AssistantUserPreference>
    ) {}

    async list(xpertId: string, take = 10, skip = 0, archived = false) {
        const scope = this.scope()
        const preference = await this.preferences.findOne({ where: this.preferenceWhere(scope, xpertId) })
        const states = preference?.preferences.conversationSidebar ?? {}
        const archivedIds = Object.keys(states).filter((id) => states[id].archived)
        const pinnedIds = Object.keys(states).filter((id) => states[id].pinned)
        const query = this.conversations.repository
            .createQueryBuilder('conversation')
            .select([
                'conversation.id',
                'conversation.threadId',
                'conversation.title',
                'conversation.updatedAt',
                'conversation.xpertId',
                'conversation.projectId',
                'conversation.from'
            ])
            .where({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? IsNull(),
                createdById: scope.userId,
                xpertId
            })
            .andWhere('conversation.threadId IS NOT NULL')
        if (archived && !archivedIds.length) return { items: [], total: 0 }
        if (archivedIds.length) {
            query.andWhere(`conversation.id ${archived ? 'IN' : 'NOT IN'} (:...archivedIds)`, { archivedIds })
        }
        if (pinnedIds.length) {
            query
                .orderBy('CASE WHEN conversation.id IN (:...pinnedIds) THEN 0 ELSE 1 END', 'ASC')
                .setParameter('pinnedIds', pinnedIds)
        }
        const [items, total] = await query
            .addOrderBy('conversation.updatedAt', 'DESC')
            .addOrderBy('conversation.id', 'ASC')
            .take(Math.min(Math.max(take, 1), 100))
            .skip(Math.max(skip, 0))
            .getManyAndCount()
        return {
            items: items.map(
                (conversation): IChatConversation => ({
                    ...conversation,
                    sidebar: { ...EMPTY_STATE, ...states[conversation.id] }
                })
            ),
            total
        }
    }

    async update(id: string, patch: Partial<TChatConversationSidebarState>) {
        if (
            !patch ||
            Array.isArray(patch) ||
            (patch.pinned === undefined && patch.archived === undefined) ||
            Object.keys(patch).some((key) => key !== 'pinned' && key !== 'archived') ||
            (patch.pinned !== undefined && typeof patch.pinned !== 'boolean') ||
            (patch.archived !== undefined && typeof patch.archived !== 'boolean')
        ) {
            throw new BadRequestException(
                t('server-ai:Error.InvalidConversationSidebarState', {
                    defaultValue: 'Conversation pin and archive values must be booleans.'
                })
            )
        }
        const scope = this.scope()
        const conversation = await this.conversations.assertAccess(id)
        if (
            conversation.createdById !== scope.userId ||
            !conversation.xpertId ||
            conversation.tenantId !== scope.tenantId ||
            (conversation.organizationId ?? null) !== scope.organizationId
        ) {
            throw new ForbiddenException(
                t('server-ai:Error.ConversationSidebarOwnerRequired', {
                    defaultValue: 'Only your own conversations can be managed in the sidebar.'
                })
            )
        }
        const where = this.preferenceWhere(scope, conversation.xpertId)
        await this.preferences
            .createQueryBuilder()
            .insert()
            .values({
                ...scope,
                assistantId: conversation.xpertId,
                preferences: { version: ASSISTANT_USER_PREFERENCES_VERSION }
            })
            .orIgnore()
            .execute()
        // Merge one conversation atomically; concurrent actions must preserve other
        // conversations and preference domains such as the selected model.
        await this.preferences
            .createQueryBuilder()
            .update()
            .set({
                preferences: () => `jsonb_set("preferences", '{conversationSidebar}',
                COALESCE("preferences" -> 'conversationSidebar', '{}'::jsonb) ||
                jsonb_build_object(CAST(:conversationId AS text),
                    COALESCE("preferences" -> 'conversationSidebar' -> :conversationId, '{}'::jsonb) ||
                    CAST(:sidebarPatch AS jsonb)), true)`
            })
            .where(where)
            .setParameters({ conversationId: id, sidebarPatch: JSON.stringify(patch) })
            .execute()
        const preference = await this.preferences.findOne({ where })
        return { ...EMPTY_STATE, ...preference?.preferences.conversationSidebar?.[id] }
    }

    private scope() {
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !userId) {
            throw new ForbiddenException(
                t('server-ai:Error.AssistantUserPreferenceUserRequired', {
                    defaultValue: 'A user context is required to persist Assistant preferences.'
                })
            )
        }
        return { tenantId, userId, organizationId: RequestContext.getOrganizationId() ?? null }
    }

    private preferenceWhere(scope: ReturnType<ChatConversationSidebarService['scope']>, assistantId: string) {
        return { ...scope, organizationId: scope.organizationId ?? IsNull(), assistantId }
    }
}
