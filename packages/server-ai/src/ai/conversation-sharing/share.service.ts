// Invariants: sharing is an explicit export, never a new credential for a live conversation.
// Only the human owner can export private non-Project chats. Recheck membership on every read.
// Artifact versions and links own persistence; this layer owns conversation export authorization.
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { getConfig } from '@xpert-ai/server-config'
import { UserOrganization } from '@xpert-ai/server-core'
import {
    SecretTokenBindingType,
    ConversationShareInfo,
    ConversationShareCreated,
    ConversationSharePreview,
    SharedConversation,
    ConversationShareList
} from '@xpert-ai/contracts'
import { DataSource, IsNull } from 'typeorm'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import { ChatConversationService } from '../../chat-conversation/conversation.service'
import { ChatConversationThreadService } from '../../chat-conversation/conversation-thread.service'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { messageAncestorPath } from '../../chat-conversation/message-path'
import { assertPublicXpertSessionConversationAccess } from '../public-xpert-principal'
import { ConversationArtifactShares } from './conversation-artifact-shares.service'
import { ShareCreateInput, ShareListInput, RevokeAllSharesInput, invalidShare } from './share.schema'
import { shareSnapshot, shareMessageQuery } from './share-projection'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const denied = () => new ForbiddenException(t('server-ai:Error.ConversationShareForbidden'))

@Injectable()
export class ConversationSharingService {
    constructor(
        private readonly data: DataSource,
        private readonly conversations: ChatConversationService,
        private readonly threads: ChatConversationThreadService,
        private readonly queries: QueryBus,
        private readonly shares: ConversationArtifactShares
    ) {}

    private human(delegated = true) {
        const principal = RequestContext.currentApiPrincipal()
        // API keys, anonymous/public and enterprise synthetic actors cannot publish or read organization exports.
        if (
            principal &&
            !(
                delegated &&
                principal.principalType === 'client_secret' &&
                principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT
            )
        )
            throw denied()
        const id = RequestContext.currentUserId()
        if (!id) throw denied()
        return id
    }

    private async member(tenantId: string, organizationId: string, userId: string) {
        if (!tenantId || !organizationId || !userId) return false
        return !!(await this.data.getRepository(UserOrganization).findOne({
            where: {
                tenantId,
                organizationId,
                userId,
                isActive: true,
                organization: { isActive: true },
                user: { id: userId, deletedAt: IsNull() }
            }
        }))
    }

    private async owner(id: string) {
        const userId = this.human()
        const source = await this.conversations.assertAccess(id, 'manage')
        if (
            source.createdById !== userId ||
            source.projectId ||
            (source.purpose && source.purpose !== 'private') ||
            source.tenantId !== RequestContext.currentTenantId() ||
            source.organizationId !== RequestContext.getOrganizationId() ||
            !(await this.member(source.tenantId, source.organizationId, userId))
        )
            throw denied()
        await assertPublicXpertSessionConversationAccess(source, this.queries)
        return { ...source, id: source.id!, tenantId: source.tenantId!, organizationId: source.organizationId!, userId }
    }

    async preview(id: string, threadId: string): Promise<ConversationSharePreview> {
        const source = await this.owner(id)
        const thread = await this.threads.requireByThreadId(threadId)
        if (thread.conversationId !== source.id || !thread.headMessageId) throw invalidShare()
        const messages = this.data.getTreeRepository(ChatMessage)
        const rows = await shareMessageQuery(messages, source.id, thread.headMessageId).getMany()
        if (rows.length > 1000) throw invalidShare()
        const snapshot = shareSnapshot(source.title, messageAncestorPath(rows, thread.headMessageId))
        const clientBaseUrl = getConfig().clientBaseUrl
        return {
            snapshot,
            digest: hash(JSON.stringify(snapshot)),
            publicSharingEnabled: true,
            ...(clientBaseUrl
                ? {
                      managementUrl: new URL('/settings/account/profile?dialog=shared-links', clientBaseUrl).toString()
                  }
                : {})
        }
    }

    async create(id: string, input: ShareCreateInput): Promise<ConversationShareCreated> {
        const preview = await this.preview(id, input.threadId)
        if (preview.digest !== input.digest) throw new ConflictException(t('server-ai:Error.ConversationShareChanged'))
        if (input.audience === 'public' && input.acknowledgePublic !== true) throw denied()
        const source = await this.owner(id)
        return this.shares.publish(source, preview.snapshot, {
            threadId: input.threadId,
            digest: input.digest,
            audience: input.audience,
            expiresInDays: input.expiresInDays,
            acknowledgePublic: input.acknowledgePublic
        })
    }

    async list(id: string): Promise<ConversationShareInfo[]> {
        const source = await this.owner(id)
        return this.shares.list(source)
    }

    async revoke(id: string, shareId: string) {
        const source = await this.owner(id)
        await this.shares.revoke(source, shareId)
    }

    async read(slug: string, authenticated: boolean): Promise<SharedConversation> {
        const principal = authenticated
            ? { userId: this.human(false), tenantId: RequestContext.currentTenantId() }
            : undefined
        return this.shares.read(slug, principal)
    }

    private personalScope() {
        const userId = this.human(false)
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) throw denied()
        return { userId, tenantId }
    }

    async listMine(input: ShareListInput): Promise<ConversationShareList> {
        return this.shares.listMine(this.personalScope(), {
            limit: input.limit ?? 20,
            offset: input.offset ?? 0,
            search: input.search ?? '',
            before: input.before
        })
    }

    async previewMine(id: string): Promise<SharedConversation> {
        return this.shares.previewMine(this.personalScope(), id)
    }

    async revokeMine(id: string) {
        return this.shares.revokeMine(this.personalScope(), id)
    }

    async revokeAllMine(input: RevokeAllSharesInput): Promise<{ revoked: number }> {
        return this.shares.revokeAllMine(this.personalScope(), input.before)
    }
}
