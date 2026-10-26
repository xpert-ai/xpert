import { ArtifactContentAccess, assertArtifactAccess } from '../artifact-content-access'
import { t } from 'i18next'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import { DataSource, EntityManager, In, IsNull } from 'typeorm'
import { createHash } from 'node:crypto'
import {
    ArtifactDraftsRuntimeCapability,
    RequestContext,
    type ArtifactDraftsApi,
    type ArtifactDraftRecord,
    type ArtifactVersionInput,
    type PublishArtifactDraftInput,
    type SaveArtifactDraftInput
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../shared/runtime/runtime-capability-provider.decorator'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { ArtifactsService, type ArtifactsRuntimeScope } from '../artifacts.service'
import { Artifact, ArtifactLink, ArtifactVersion } from '../entities'
import { isSupportedArtifactMimeType } from '../artifact-mime-policy'
import { ArtifactDraft } from './artifact-draft.entity'

@Injectable()
@RuntimeCapabilityProvider(ArtifactDraftsRuntimeCapability)
export class ArtifactDraftsService implements ArtifactDraftsApi {
    constructor(
        private readonly dataSource: DataSource,
        private readonly artifacts: ArtifactsService,
        private readonly files: WorkspaceFilesRuntimeCapabilityService,
        private readonly contentAccess: ArtifactContentAccess
    ) {}
    createScopedApi(scope: ArtifactsRuntimeScope): ArtifactDraftsApi {
        return {
            list: (ids) => this.readMany(ids, scope),
            get: (id, options) => this.read(id, scope, options?.includeArchived),
            setRecycled: (input) => this.recycle(input, scope),
            save: (input) => this.write(input, scope),
            publish: (input) => this.commit(input, scope)
        }
    }
    list(ids: string[]) {
        return this.readMany(ids, {})
    }
    get(id: string, options?: { includeArchived?: boolean }) {
        return this.read(id, {}, options?.includeArchived)
    }
    setRecycled(input: Parameters<ArtifactDraftsApi['setRecycled']>[0]) {
        return this.recycle(input, {})
    }
    save(input: SaveArtifactDraftInput) {
        return this.write(input, {})
    }
    publish(input: PublishArtifactDraftInput) {
        return this.commit(input, {})
    }
    private async authorized(
        id: string,
        scope: ArtifactsRuntimeScope,
        operation: 'read' | 'write' | 'manage' = 'read',
        includeArchived = false
    ) {
        const artifact = await this.artifacts.createScopedApi(scope).getArtifact(id)
        const userId = scope.userId ?? RequestContext.currentUserId()
        if (
            !(artifact.status === 'active' || (includeArchived && artifact.status === 'archived')) ||
            !userId ||
            (artifact.userId ? artifact.userId !== userId : !artifact.projectId)
        )
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactDraftAccessDenied', { defaultValue: 'ARTIFACT_DRAFT_ACCESS_DENIED' })
            )
        await assertArtifactAccess(
            this.contentAccess,
            artifact,
            {
                tenantId: scope.tenantId ?? RequestContext.currentTenantId(),
                organizationId: scope.organizationId ?? RequestContext.getOrganizationId(),
                userId
            },
            operation
        )
        return artifact
    }
    private async readMany(ids: string[], scope: ArtifactsRuntimeScope) {
        if (!ids.length) return []
        const tenantId = scope.tenantId ?? RequestContext.currentTenantId(),
            userId = scope.userId ?? RequestContext.currentUserId()
        const organizationId = scope.organizationId ?? RequestContext.getOrganizationId()
        if (!tenantId || !userId || ids.length > 100)
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactDraftAccessDenied', { defaultValue: 'ARTIFACT_DRAFT_ACCESS_DENIED' })
            )
        // Reauthorize each identity before querying the projection, including Project-owned drafts.
        const allowed: string[] = []
        for (const id of new Set(ids)) {
            try {
                await this.authorized(id, scope)
                allowed.push(id)
            } catch (error) {
                if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error
            }
        }
        if (!allowed.length) return []
        const drafts = await this.dataSource
            .getRepository(ArtifactDraft)
            .find({ where: { artifactId: In(allowed), tenantId, organizationId: organizationId ?? IsNull() } })
        return drafts.map(record)
    }
    private async read(id: string, scope: ArtifactsRuntimeScope, includeArchived = false) {
        await this.authorized(id, scope, 'read', includeArchived)
        const draft = await this.dataSource.getRepository(ArtifactDraft).findOneBy({ artifactId: id })
        return draft ? record(draft) : null
    }
    private async recycle(input: Parameters<ArtifactDraftsApi['setRecycled']>[0], scope: ArtifactsRuntimeScope) {
        const authorized = await this.authorized(input.artifactId, scope, 'manage', true)
        if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
            throw new BadRequestException(t('server-ai:Error.ArtifactDraftRevisionInvalid'))
        return this.dataSource.transaction(async (manager) => {
            // Use the same artifact lock as save/publish. Incrementing the draft revision
            // also invalidates editor tabs kept open across a trash/restore round trip.
            const artifact = await manager
                .getRepository(Artifact)
                .findOne({ where: { id: input.artifactId }, lock: { mode: 'pessimistic_write' } })
            if (
                !artifact ||
                !['active', 'archived'].includes(artifact.status) ||
                artifact.tenantId !== authorized.tenantId ||
                artifact.organizationId !== authorized.organizationId ||
                artifact.projectId !== authorized.projectId ||
                artifact.userId !== authorized.userId
            )
                throw new ForbiddenException(t('server-ai:Error.ArtifactDraftAccessDenied'))
            await this.authorized(input.artifactId, scope, 'manage', true)
            const drafts = manager.getRepository(ArtifactDraft),
                draft = await drafts.findOneBy({ artifactId: input.artifactId })
            if (!draft || draft.revision !== input.expectedRevision)
                throw new ConflictException(t('server-ai:Error.ArtifactDraftConflict'))
            const status = input.recycled ? 'archived' : 'active'
            if (artifact.status === status) return record(draft)
            if (input.recycled) {
                await manager
                    .getRepository(ArtifactLink)
                    .update({ artifactId: artifact.id, status: 'active' }, { status: 'revoked', revokedAt: new Date() })
            }
            artifact.status = status
            await manager.getRepository(Artifact).save(artifact)
            draft.revision += 1
            return record(await drafts.save(draft))
        })
    }
    private async verified(content: ArtifactVersionInput, scope: ArtifactsRuntimeScope, projectId?: string | null) {
        const mimeType = content.mimeType?.trim().toLowerCase()
        if (!mimeType || !isSupportedArtifactMimeType(mimeType))
            throw new BadRequestException(
                t('server-ai:Error.ArtifactDraftMimeInvalid', { defaultValue: 'ARTIFACT_DRAFT_MIME_INVALID' })
            )
        if (content.workspaceFileRef?.source !== 'platform.workspace.files')
            throw new BadRequestException(
                t('server-ai:Error.ArtifactDraftFileInvalid', { defaultValue: 'ARTIFACT_DRAFT_FILE_INVALID' })
            )
        const tenantId = scope.tenantId ?? RequestContext.currentTenantId(),
            userId = scope.userId ?? RequestContext.currentUserId()
        if (
            (content.workspaceFileRef.tenantId && content.workspaceFileRef.tenantId !== tenantId) ||
            (content.workspaceFileRef.userId &&
                content.workspaceFileRef.userId !== userId &&
                !(
                    projectId &&
                    content.workspaceFileRef.catalog === 'projects' &&
                    content.workspaceFileRef.projectId === projectId &&
                    content.workspaceFileRef.scopeId === projectId
                ))
        )
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactDraftAccessDenied', { defaultValue: 'ARTIFACT_DRAFT_ACCESS_DENIED' })
            )
        const file = await this.files
            .createScopedApi({ ...scope, tenantId, userId })
            .readBuffer(content.workspaceFileRef)
        const sha256 = createHash('sha256').update(file.buffer).digest('hex')
        if (content.sha256 && content.sha256 !== sha256)
            throw new BadRequestException(
                t('server-ai:Error.ArtifactDraftContentChanged', { defaultValue: 'ARTIFACT_DRAFT_CONTENT_CHANGED' })
            )
        return { ...content, mimeType, sha256, size: file.buffer.length }
    }
    private async locked<T>(
        id: string,
        scope: ArtifactsRuntimeScope,
        work: (manager: EntityManager, artifact: Artifact) => Promise<T>,
        operation: 'write' | 'manage' = 'write'
    ) {
        const authorized = await this.authorized(id, scope, operation)
        return this.dataSource.transaction(async (manager) => {
            const artifact = await manager
                .getRepository(Artifact)
                .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })
            if (
                !artifact ||
                artifact.status !== 'active' ||
                artifact.userId !== authorized.userId ||
                artifact.tenantId !== authorized.tenantId ||
                artifact.organizationId !== authorized.organizationId ||
                artifact.projectId !== authorized.projectId
            )
                throw new ForbiddenException(
                    t('server-ai:Error.ArtifactDraftAccessDenied', { defaultValue: 'ARTIFACT_DRAFT_ACCESS_DENIED' })
                )
            return work(manager, artifact)
        })
    }
    private async write(input: SaveArtifactDraftInput, scope: ArtifactsRuntimeScope) {
        const authorized = await this.authorized(input.artifactId, scope, 'write')
        if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
            throw new BadRequestException(
                t('server-ai:Error.ArtifactDraftRevisionInvalid', { defaultValue: 'ARTIFACT_DRAFT_REVISION_INVALID' })
            )
        const { artifactId, expectedRevision, expectedCurrentVersionId, setCurrent, ...payload } = input
        const content = await this.verified(payload, scope, !authorized.userId ? authorized.projectId : null)
        return this.locked(artifactId, scope, async (manager, artifact) => {
            const repository = manager.getRepository(ArtifactDraft)
            const existing = await repository.findOneBy({ artifactId })
            if (
                (artifact.currentVersionId ?? null) !== expectedCurrentVersionId ||
                (existing?.revision ?? 0) !== expectedRevision
            )
                throw new ConflictException(
                    t('server-ai:Error.ArtifactDraftConflict', { defaultValue: 'ARTIFACT_DRAFT_CONFLICT' })
                )
            const draft =
                existing ??
                repository.create({
                    artifactId,
                    tenantId: artifact.tenantId,
                    organizationId: artifact.organizationId,
                    publishedRevision: null,
                    publishedVersionId: null
                })
            draft.revision = expectedRevision + 1
            draft.baseVersionId = expectedCurrentVersionId
            draft.content = content
            return record(await repository.save(draft))
        })
    }
    private async commit(input: PublishArtifactDraftInput, scope: ArtifactsRuntimeScope) {
        return this.locked(
            input.artifactId,
            scope,
            async (manager, artifact) => {
                const drafts = manager.getRepository(ArtifactDraft),
                    versions = manager.getRepository(ArtifactVersion)
                const draft = await drafts.findOneBy({ artifactId: input.artifactId })
                if (!draft)
                    throw new NotFoundException(
                        t('server-ai:Error.ArtifactDraftNotFound', { defaultValue: 'ARTIFACT_DRAFT_NOT_FOUND' })
                    )
                if (draft.revision !== input.expectedRevision)
                    throw new ConflictException(
                        t('server-ai:Error.ArtifactDraftConflict', { defaultValue: 'ARTIFACT_DRAFT_CONFLICT' })
                    )
                if (
                    draft.publishedRevision === draft.revision &&
                    artifact.currentVersionId === draft.publishedVersionId
                ) {
                    const published = await versions.findOneByOrFail({ id: draft.publishedVersionId })
                    return { ...published, id: published.id! }
                }
                if (
                    (artifact.currentVersionId ?? null) !== input.expectedCurrentVersionId ||
                    draft.baseVersionId !== input.expectedCurrentVersionId
                )
                    throw new ConflictException(
                        t('server-ai:Error.ArtifactDraftBaseConflict', { defaultValue: 'ARTIFACT_DRAFT_BASE_CONFLICT' })
                    )
                const content = await this.verified(draft.content, scope, !artifact.userId ? artifact.projectId : null)
                const previous = await versions.findOne({
                    where: { artifactId: input.artifactId },
                    order: { versionNumber: 'DESC' }
                })
                const version = await versions.save(
                    versions.create({
                        ...content,
                        artifactId: input.artifactId,
                        tenantId: artifact.tenantId,
                        organizationId: artifact.organizationId,
                        userId: artifact.userId,
                        workspaceId: artifact.workspaceId,
                        projectId: artifact.projectId,
                        xpertId: artifact.xpertId,
                        versionNumber: (previous?.versionNumber ?? 0) + 1,
                        status: 'active',
                        idempotencyKey: `draft:${draft.id}:${draft.revision}`,
                        createdById: scope.userId ?? RequestContext.currentUserId(),
                        metadata: {
                            ...content.metadata,
                            publication: {
                                draftId: draft.id,
                                revision: draft.revision,
                                confirmedBy: scope.userId ?? RequestContext.currentUserId(),
                                confirmedAt: new Date().toISOString()
                            }
                        }
                    })
                )
                artifact.currentVersionId = version.id!
                artifact.title = content.title ?? artifact.title
                await manager.getRepository(Artifact).save(artifact)
                draft.baseVersionId = version.id!
                draft.publishedRevision = draft.revision
                draft.publishedVersionId = version.id!
                await drafts.save(draft)
                return { ...version, id: version.id! }
            },
            'manage'
        )
    }
}
function record(draft: ArtifactDraft): ArtifactDraftRecord {
    return {
        ...draft.content,
        id: draft.id!,
        artifactId: draft.artifactId,
        revision: draft.revision,
        baseVersionId: draft.baseVersionId,
        publishedRevision: draft.publishedRevision,
        publishedVersionId: draft.publishedVersionId,
        updatedAt: draft.updatedAt
    }
}
