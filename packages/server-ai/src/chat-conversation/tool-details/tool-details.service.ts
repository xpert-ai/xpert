// Snapshots are immutable participant projections. Conversation access and the persisted
// execution binding are rechecked on every read; a hash or workspace path is not a grant.
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { DataSource, IsNull } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import type { ToolDetailReference } from '@xpert-ai/chatkit-types'
import { t } from 'i18next'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationService } from '../conversation.service'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { artifactByteStorage } from '../../shared/volume/artifact-byte-storage'
import { assertPublicXpertSessionConversationAccess } from '../../ai/public-xpert-principal'
import { assertWorkbenchPrincipal } from '../../ai/workbench-principal'
import { StoreToolDetailCommand } from './store-tool-detail.command'
import { toolDetailReferenceSchema, toolDetailSnapshotSchema } from './tool-detail.schema'

@Injectable()
export class ToolDetailsService {
    constructor(
        private readonly db: DataSource,
        private readonly conversations: ChatConversationService,
        private readonly queries: QueryBus,
        @Inject(VOLUME_CLIENT) private readonly volumes: Pick<VolumeClient, 'resolve'>
    ) {}

    private unavailable() {
        return new NotFoundException(t('server-ai:Error.ToolDetailUnavailable'))
    }

    private storage(conversation: ChatConversation) {
        return artifactByteStorage(
            this.volumes.resolve({
                tenantId: conversation.tenantId,
                organizationId: conversation.organizationId,
                catalog: conversation.projectId ? 'projects' : 'users',
                ...(conversation.projectId
                    ? { projectId: conversation.projectId }
                    : { userId: conversation.createdById })
            }),
            conversation.organizationId
        )
    }

    private async executionBound(conversation: ChatConversation, executionId: string) {
        if (!conversation.threadId) return false
        return this.db.getRepository(XpertAgentExecution).existsBy({
            id: executionId,
            threadId: conversation.threadId,
            tenantId: conversation.tenantId,
            organizationId: conversation.organizationId ?? IsNull()
        })
    }

    async store({
        conversationId,
        rootExecutionId,
        input
    }: StoreToolDetailCommand): Promise<ToolDetailReference | undefined> {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) return
        const conversation = await this.db.getRepository(ChatConversation).findOneBy({
            id: conversationId,
            tenantId,
            organizationId: RequestContext.getOrganizationId() ?? IsNull()
        })
        if (!conversation || !(await this.executionBound(conversation, rootExecutionId))) return
        const snapshot = toolDetailSnapshotSchema.parse({
            version: 1,
            conversationId,
            rootExecutionId,
            ...input,
            executionId: input.executionId ?? rootExecutionId
        })
        const buffer = Buffer.from(JSON.stringify(snapshot))
        if (buffer.length > 50 * 1024 * 1024) return
        const id = randomUUID()
        const sha256 = createHash('sha256').update(buffer).digest('hex')
        await this.storage(conversation).write(`${id}/${sha256}`, buffer)
        return {
            conversationId,
            executionId: snapshot.executionId,
            toolCallId: input.toolCallId,
            phase: input.phase,
            id,
            sha256
        }
    }

    private async authorize(conversationId: string) {
        const conversation = await this.conversations.assertAccess(conversationId, 'read')
        await assertPublicXpertSessionConversationAccess(conversation, this.queries)
        const principal = RequestContext.currentApiPrincipal()
        if (
            principal &&
            principal.clientSecretBindingType !== SecretTokenBindingType.PUBLIC_XPERT &&
            principal.clientSecretBindingType !== SecretTokenBindingType.ENTERPRISE_XPERT
        ) {
            assertWorkbenchPrincipal(principal, conversation)
        }
        return conversation
    }

    async read(ref: ToolDetailReference, offset: number) {
        const checked = toolDetailReferenceSchema.parse(ref)
        const conversation = await this.authorize(checked.conversationId)
        let raw: Buffer
        try {
            raw = await this.storage(conversation).read(`${checked.id}/${checked.sha256}`)
        } catch {
            throw this.unavailable()
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(raw.toString('utf8'))
        } catch {
            throw this.unavailable()
        }
        const snapshot = toolDetailSnapshotSchema.safeParse(parsed)
        if (!snapshot.success) throw this.unavailable()
        const value = snapshot.data
        if (
            value.conversationId !== checked.conversationId ||
            value.executionId !== checked.executionId ||
            value.toolCallId !== checked.toolCallId ||
            value.phase !== checked.phase ||
            !(await this.executionBound(conversation, value.rootExecutionId))
        )
            throw this.unavailable()
        if (!Number.isInteger(offset) || offset < 0 || offset > value.text.length) throw this.unavailable()
        let end = Math.min(offset + 16_384, value.text.length)
        if (end < value.text.length && /[\uD800-\uDBFF]/.test(value.text[end - 1])) end--
        await this.authorize(checked.conversationId)
        return {
            content: value.text.slice(offset, end),
            format: value.format,
            offset,
            nextOffset: end < value.text.length ? end : null,
            totalCharacters: value.text.length,
            byteLength: Buffer.byteLength(value.text)
        }
    }
}

@CommandHandler(StoreToolDetailCommand)
export class StoreToolDetailHandler implements ICommandHandler<StoreToolDetailCommand> {
    constructor(private readonly details: ToolDetailsService) {}
    execute(command: StoreToolDetailCommand) {
        return this.details.store(command)
    }
}
