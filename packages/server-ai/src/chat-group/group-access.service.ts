// Invariants: authentication establishes identity; this service authorizes access to one group.
// Resolve tenant, organization and actor from trusted context or persisted runtime bindings.
// Recheck live membership on access; group membership never substitutes for Assistant/resource authorization.
import { ChatMessage } from '../chat-message/chat-message.entity'
import { groupDeliveryUserId } from './group-delivery-actor'
import { isGroupRuntime } from './group-runtime-context'
import { UnauthorizedException, Injectable } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { GroupParticipant, GroupMessageRecipient } from './group.entity'
import { groupDenied } from './group.errors'

/** Shared authorization policy for group APIs and background execution under a real human identity. */
@Injectable()
export class GroupAccessService {
    constructor(
        private readonly db: DataSource,
        private readonly assistants: PublishedXpertAccessService
    ) {}

    /**
     * Read an already authenticated request context. This does not authenticate a token or select an organization.
     * Missing scope and API-key contexts are rejected; never fall back to another tenant/organization.
     */
    scope() {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        // An Assistant-scoped client secret is never a group credential.
        if (!tenantId || !organizationId || !userId || RequestContext.currentApiKey()) throw groupDenied()
        return { tenantId, organizationId, userId }
    }

    /**
     * Resolve a real User Account with active membership in an active organization.
     * Callers supply scope from authentication or persisted records. This alone does not prove group membership.
     */
    async user(scope: { tenantId: string; organizationId: string }, userId: string) {
        const [user, membership] = await Promise.all([
            this.db
                .getRepository(User)
                .findOne({ where: { id: userId, tenantId: scope.tenantId, type: UserType.USER }, relations: ['role'] }),
            this.db
                .getRepository(UserOrganization)
                .findOneBy({ ...scope, userId, isActive: true, organization: { isActive: true } })
        ])
        if (!user || !membership) throw groupDenied()
        return user
    }

    /**
     * Authorize the current human against the group's live membership; manage additionally requires owner role.
     * The HTTP guard establishes identity first. When a group credential is present, also bind it to this exact
     * group, user, tenant and organization and recheck expiry. The host's ordinary login needs no group credential.
     * Returned actor.id is the membership ID; actor.subjectId is the User Account ID.
     * Reuse this check at group business entry points, including stream refreshes, instead of trusting cached access.
     */
    async authorize(groupId: string, manage = false) {
        const { tenantId, organizationId, userId } = this.scope()
        const scope = { tenantId, organizationId }
        const principal = RequestContext.currentApiPrincipal()
        if (principal) {
            if (
                principal.clientSecretBindingType !== SecretTokenBindingType.USER_CONVERSATION ||
                principal.resourceScope?.kind !== 'conversation' ||
                principal.resourceScope.conversationId !== groupId ||
                principal.tenantId !== tenantId ||
                principal.requestedOrganizationId !== organizationId
            )
                throw groupDenied()
            // SSE membership polling also enforces the credential's absolute lifetime.
            if (!principal.clientSecretExpiresAt || principal.clientSecretExpiresAt <= new Date()) {
                throw new UnauthorizedException()
            }
        }
        await this.user(scope, userId)
        const [group, actor] = await Promise.all([
            this.db.getRepository(ChatConversation).findOneBy({ ...scope, id: groupId, purpose: 'group' }),
            this.db
                .getRepository(GroupParticipant)
                .findOneBy({ ...scope, groupId, subjectId: userId, kind: 'user', active: true })
        ])
        if (!group || !actor || (manage && actor.role !== 'owner')) throw groupDenied()
        return { group, actor, scope }
    }

    /**
     * Apply the existing published-Xpert access policy under the current actor; assistantId is an Xpert ID.
     * This does not check group membership. Callers must additionally check the target participant and any
     * workspace/project permissions required by their specific operation.
     */
    async assistant(assistantId: string) {
        return this.assistants.getAccessiblePublishedXpert(assistantId, { relations: ['workspace', 'user'] })
    }

    /**
     * Background delivery entry point, only inside a server-established withGroupRuntime(conversationId) scope.
     * Revalidate the starting/steering receipt and its active Assistant runtime binding before changing identity.
     * A human input uses its persisted creator; Assistant handoffs inherit the causal root's real human.
     * Never accept a client-supplied actor or use the Assistant's technical principal as execution creator.
     */
    async withDeliveryActor<T>(deliveryId: string, tenantId: string, conversationId: string, task: () => Promise<T>) {
        if (!isGroupRuntime(conversationId)) throw groupDenied()
        const receipt = await this.db.getRepository(GroupMessageRecipient).findOneBy({ id: deliveryId, tenantId })
        if (!receipt || !['starting', 'steering'].includes(receipt.status)) throw groupDenied()
        const member = await this.db.getRepository(GroupParticipant).findOneBy({
            id: receipt.participantId,
            groupId: receipt.groupId,
            runtimeConversationId: conversationId,
            active: true,
            kind: 'assistant'
        })
        if (!member) throw groupDenied()
        const source = await this.db
            .getRepository(ChatMessage)
            .findOneByOrFail({ id: receipt.messageId, conversationId: receipt.groupId })
        const group = await this.db
            .getRepository(ChatConversation)
            .findOneByOrFail({ id: receipt.groupId, tenantId, purpose: 'group' })
        return this.withRootUser(group, groupDeliveryUserId(source), task)
    }

    /**
     * Execute task in a captured organization request context after rechecking the human's current membership.
     * Internal callers must supply a persisted/authorized group and a trusted initiating or controlling User ID;
     * this is not an impersonation API for arbitrary HTTP parameters. Downstream resource checks still apply.
     * Await task within this scope; separately queued work must resolve its identity again at execution time.
     */
    async withRootUser<T>(group: ChatConversation, userId: string, task: () => Promise<T>) {
        const user = await this.user({ tenantId: group.tenantId, organizationId: group.organizationId }, userId)
        const actor = await this.db
            .getRepository(GroupParticipant)
            .findOneBy({ groupId: group.id, subjectId: userId, kind: 'user', active: true })
        if (!actor) throw groupDenied()
        return runWithCapturedRequestContext(
            captureRequestContext({
                user,
                tenantId: group.tenantId,
                organizationId: group.organizationId,
                headers: { 'x-scope-level': 'organization' }
            }),
            task
        )
    }
}
