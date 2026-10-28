import { Injectable, ForbiddenException } from '@nestjs/common'
import { ArtifactTypeProvider } from '@xpert-ai/plugin-sdk'
import type {
    IArtifactTypeProvider,
    ArtifactTypeDefinition,
    ArtifactTypeSource,
    ArtifactTypeActor,
    ArtifactLinkAccessInput,
    ContentOperation,
    ArtifactSnapshotContext
} from '@xpert-ai/plugin-sdk'
import { CONVERSATION_SHARE_ARTIFACT_SOURCE } from '@xpert-ai/contracts'
import { getConfig } from '@xpert-ai/server-config'
import { UserOrganization } from '@xpert-ai/server-core'
import { DataSource, IsNull } from 'typeorm'
import { t } from 'i18next'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { snapshotSchema } from './conversation-snapshot.schema'

type SnapshotSource = { pluginName?: string; resourceType?: string }
export type ConversationSnapshotTarget = SnapshotSource & {
    resourceId: string
    tenantId?: string | null
    organizationId?: string | null
    userId?: string | null
}
export const CONVERSATION_SNAPSHOT_SHARE_KEY = 'conversation'
const denied = () => new ForbiddenException(t('server-ai:Error.ConversationShareUnavailable'))
export function isConversationSnapshot(source?: SnapshotSource | null) {
    return (
        source?.pluginName === CONVERSATION_SHARE_ARTIFACT_SOURCE.pluginName &&
        source.resourceType === CONVERSATION_SHARE_ARTIFACT_SOURCE.resourceType
    )
}
export function conversationSnapshotUrl(slug: string) {
    const base = getConfig().clientBaseUrl
    if (!base) throw denied()
    return new URL(`/s/${encodeURIComponent(slug)}`, base).toString()
}

/** Built-in Artifact plugin: immutable text exports remain governed by the live source. */
@Injectable()
@ArtifactTypeProvider('conversation_snapshot')
export class ConversationArtifactPlugin implements IArtifactTypeProvider {
    readonly definition: ArtifactTypeDefinition = {
        title: { en_US: 'Shared conversation', zh_Hans: '分享会话', zh_Hant: '分享對話' },
        kinds: ['file'],
        content: { mimeTypes: ['application/json'], maxBytes: 1024 * 1024 },
        sharing: {
            accessModes: ['public_link', 'organization_all'],
            versionModes: ['version'],
            maxTtlSeconds: 30 * 86400,
            allowDownload: false,
            mutableLinks: false,
            descriptor: false,
            shareKey: CONVERSATION_SNAPSHOT_SHARE_KEY
        },
        presentation: { mode: 'snapshot' }
    }
    readonly snapshot = {
        kind: 'host' as const,
        read: async ({ content }: ArtifactSnapshotContext) => snapshotSchema.parse(JSON.parse(content.toString('utf8')))
    }
    constructor(private readonly data: DataSource) {}
    authorize(source: ArtifactTypeSource, actor: ArtifactTypeActor, operation: ContentOperation) {
        return this.assert(source, actor, operation)
    }
    validateContent(content: Buffer, mimeType: string) {
        try {
            if (mimeType !== 'application/json' || content.length > 1024 * 1024) throw denied()
            snapshotSchema.parse(JSON.parse(content.toString('utf8')))
        } catch {
            throw denied()
        }
    }
    assertPublication(_source: ArtifactTypeSource, access: ArtifactLinkAccessInput) {
        if (access.mode === 'public_link' && access.userConfirmedPublicLink !== true) throw denied()
    }
    async assert(
        source: ConversationSnapshotTarget,
        actor: { tenantId?: string | null; userId?: string | null },
        operation: string
    ) {
        // Owners may revoke exports after source deletion or membership loss.
        if (operation === 'manage' && source.userId === actor.userId && source.tenantId === actor.tenantId) return
        if (operation !== 'read' && (source.userId !== actor.userId || source.tenantId !== actor.tenantId))
            throw denied()
        if (!(await this.available(source))) throw denied()
    }

    async available(target: ConversationSnapshotTarget): Promise<boolean> {
        if (
            !target.tenantId ||
            !target.organizationId ||
            !target.userId ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.resourceId)
        )
            return false
        const source = await this.data.getRepository(ChatConversation).findOne({
            where: {
                id: target.resourceId,
                tenantId: target.tenantId,
                organizationId: target.organizationId,
                createdById: target.userId
            }
        })
        if (!source || source.projectId || (source.purpose && source.purpose !== 'private')) return false
        return !!(await this.data.getRepository(UserOrganization).findOne({
            where: {
                tenantId: target.tenantId,
                organizationId: target.organizationId,
                userId: target.userId,
                isActive: true,
                organization: { isActive: true },
                user: { id: target.userId, deletedAt: IsNull() }
            }
        }))
    }
}
