// Conversations publish immutable Workspace Files through the existing Artifact version/link lifecycle.
// Personal management always scopes by the human creator; revocation never deletes the source chat.
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import {
    CONVERSATION_SHARE_ARTIFACT_SOURCE,
    type ConversationShareSnapshot,
    type ConversationShareCreate,
    type ConversationShareCreated,
    type ConversationShareInfo,
    type ConversationShareList,
    type ManagedConversationShare,
    type SharedConversation
} from '@xpert-ai/contracts'
import { type ArtifactLinkRecord } from '@xpert-ai/plugin-sdk'
import { createHash, randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { ArtifactsService } from '../../artifacts/artifacts.service'
import { ArtifactShareQueries, OwnedArtifactShare } from '../../artifacts/artifact-share-queries'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { CONVERSATION_SNAPSHOT_SHARE_KEY, isConversationSnapshot } from './conversation-artifact.plugin'
import { snapshotSchema } from './conversation-snapshot.schema'
import { ArtifactSnapshotsService } from '../../artifacts/presentation/artifact-snapshots.service'

type Owner = { tenantId: string; userId: string }
type Source = Owner & { id: string; organizationId: string }
type ListInput = { limit: number; offset: number; search: string; before?: string }
const SHARE_KEY = CONVERSATION_SNAPSHOT_SHARE_KEY
const unavailable = () => new NotFoundException(t('server-ai:Error.ConversationShareUnavailable'))

@Injectable()
export class ConversationArtifactShares {
    constructor(
        private readonly artifacts: ArtifactsService,
        private readonly files: WorkspaceFilesRuntimeCapabilityService,
        private readonly queries: ArtifactShareQueries,
        private readonly snapshots: ArtifactSnapshotsService
    ) {}

    async publish(
        source: Source,
        snapshot: ConversationShareSnapshot,
        input: ConversationShareCreate
    ): Promise<ConversationShareCreated> {
        const scope = { tenantId: source.tenantId, organizationId: source.organizationId, userId: source.userId }
        const api = this.artifacts.createScopedApi(scope)
        const artifact = await api.createArtifact({
            type: CONVERSATION_SHARE_ARTIFACT_SOURCE,
            source: { ...CONVERSATION_SHARE_ARTIFACT_SOURCE, resourceId: source.id },
            kind: 'file',
            title: snapshot.title
        })
        const buffer = Buffer.from(JSON.stringify(snapshot))
        const digest = createHash('sha256').update(buffer).digest('hex')
        const existing = await api.listArtifactVersions({
            artifactId: artifact.id,
            idempotencyKey: digest,
            status: 'active'
        })
        let version = existing[0]
        if (!version) {
            const fileName = 'conversation.json'
            const file = await this.files.uploadBuffer({
                ...scope,
                catalog: 'users',
                scopeId: source.userId,
                folder: `artifact-snapshots/${randomUUID()}`,
                originalName: fileName,
                mimeType: 'application/json',
                buffer
            })
            version = (
                await api.ensureArtifactVersion({
                    artifactId: artifact.id,
                    idempotencyKey: digest,
                    sha256: digest,
                    size: buffer.length,
                    mimeType: 'application/json',
                    fileName,
                    title: snapshot.title,
                    workspaceFileRef: {
                        ...scope,
                        source: 'platform.workspace.files',
                        catalog: 'users',
                        scopeId: source.userId,
                        filePath: file.filePath,
                        workspacePath: file.workspacePath,
                        originalName: fileName,
                        mimeType: 'application/json',
                        size: buffer.length
                    }
                })
            ).version
        }
        const { link } = await api.ensureArtifactShare({
            artifactId: artifact.id,
            shareKey: SHARE_KEY,
            versionMode: 'version',
            artifactVersionId: version.id,
            access: {
                mode: input.audience === 'public' ? 'public_link' : 'organization_all',
                expiresAt: new Date(Date.now() + input.expiresInDays * 86400000),
                userConfirmedPublicLink: input.acknowledgePublic === true
            },
            presentation: { disposition: 'inline', allowDownload: false }
        })
        return { ...this.info(link, true), url: link.publicUrl }
    }

    async list(source: Source): Promise<ConversationShareInfo[]> {
        const rows = await this.queries.listForSource(source, this.filter(source.id))
        return rows.map((row) => this.info(row))
    }

    revoke(source: Source, id: string) {
        return this.queries.revokeOwned(source, this.filter(source.id), id)
    }

    async read(slug: string, principal?: Owner): Promise<SharedConversation> {
        if (!/^[A-Za-z0-9]{12}$/.test(slug)) throw unavailable()
        try {
            const { resolved: result, data } = await this.snapshots.read({ slug, principal })
            if (
                !isConversationSnapshot(result.artifact) ||
                result.link.shareKey !== SHARE_KEY ||
                result.buffer.length > 1024 * 1024
            )
                throw unavailable()
            const snapshot = snapshotSchema.parse(data)
            return {
                title: snapshot.title,
                messages: snapshot.messages.map(({ role, text }) => ({ role, text })),
                audience: result.link.accessMode === 'public_link' ? 'public' : 'organization',
                sharedAt: result.link.createdAt.toISOString(),
                expiresAt: result.link.expiresAt.toISOString()
            }
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error
            throw unavailable()
        }
    }

    async listMine(owner: Owner, input: ListInput): Promise<ConversationShareList> {
        const page = await this.queries.list(owner, this.filter(), input)
        return {
            ...page,
            items: page.items.map(
                (row): ManagedConversationShare => ({
                    ...this.info(row),
                    type: 'conversation',
                    title: row.title.slice(0, 300),
                    status: row.status
                })
            )
        }
    }

    async previewMine(owner: Owner, id: string) {
        const row = await this.queries.findOwned(owner, this.filter(), id)
        if (!row) throw unavailable()
        return this.read(row.slug, owner)
    }
    revokeMine(owner: Owner, id: string) {
        return this.queries.revokeOwned(owner, this.filter(), id)
    }
    revokeAllMine(owner: Owner, before: string) {
        return this.queries.revokeAllOwned(owner, this.filter(), before)
    }

    private filter(resourceId?: string) {
        return { ...CONVERSATION_SHARE_ARTIFACT_SOURCE, shareKey: SHARE_KEY, resourceId }
    }

    private info(row: ArtifactLinkRecord | OwnedArtifactShare, includeUrl = true): ConversationShareInfo {
        if (!row.id || !row.createdAt || !row.expiresAt) throw unavailable()
        return {
            id: row.id,
            audience: row.accessMode === 'public_link' ? 'public' : 'organization',
            createdAt: new Date(row.createdAt).toISOString(),
            expiresAt: new Date(row.expiresAt).toISOString(),
            ...(includeUrl && row.publicUrl ? { url: row.publicUrl } : {})
        }
    }
}
