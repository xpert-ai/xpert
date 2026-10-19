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
import { Artifact, ArtifactVersion } from '../entities'
import { isSupportedArtifactMimeType } from '../artifact-mime-policy'
import { ArtifactDraft } from './artifact-draft.entity'

@Injectable()
@RuntimeCapabilityProvider(ArtifactDraftsRuntimeCapability)
export class ArtifactDraftsService implements ArtifactDraftsApi {
    constructor(
        private readonly dataSource: DataSource,
        private readonly artifacts: ArtifactsService,
        private readonly files: WorkspaceFilesRuntimeCapabilityService
    ) {}
    createScopedApi(scope: ArtifactsRuntimeScope): ArtifactDraftsApi {
        return {
            list: (ids) => this.readMany(ids, scope),
            get: (id) => this.read(id, scope),
            save: (input) => this.write(input, scope),
            publish: (input) => this.commit(input, scope)
        }
    }
    list(ids: string[]) {
        return this.readMany(ids, {})
    }
    get(id: string) {
        return this.read(id, {})
    }
    save(input: SaveArtifactDraftInput) {
        return this.write(input, {})
    }
    publish(input: PublishArtifactDraftInput) {
        return this.commit(input, {})
    }
    private async authorized(id: string, scope: ArtifactsRuntimeScope) {
        const artifact = await this.artifacts.createScopedApi(scope).getArtifact(id)
        const userId = scope.userId ?? RequestContext.currentUserId()
        if (artifact.status !== 'active' || !userId || artifact.userId !== userId)
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactDraftAccessDenied', { defaultValue: 'ARTIFACT_DRAFT_ACCESS_DENIED' })
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
        const drafts = await this.dataSource.getRepository(ArtifactDraft).find({
            where: {
                artifact: {
                    id: In(ids),
                    tenantId,
                    userId,
                    organizationId: organizationId ?? IsNull(),
                    status: 'active'
                }
            }
        })
        return drafts.map(record)
    }
    private async read(id: string, scope: ArtifactsRuntimeScope) {
        await this.authorized(id, scope)
        const draft = await this.dataSource.getRepository(ArtifactDraft).findOneBy({ artifactId: id })
        return draft ? record(draft) : null
    }
    private async verified(content: ArtifactVersionInput, scope: ArtifactsRuntimeScope) {
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
            (content.workspaceFileRef.userId && content.workspaceFileRef.userId !== userId)
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
        work: (manager: EntityManager, artifact: Artifact) => Promise<T>
    ) {
        const authorized = await this.authorized(id, scope)
        return this.dataSource.transaction(async (manager) => {
            const artifact = await manager
                .getRepository(Artifact)
                .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })
            if (
                !artifact ||
                artifact.status !== 'active' ||
                artifact.userId !== authorized.userId ||
                artifact.tenantId !== authorized.tenantId ||
                artifact.organizationId !== authorized.organizationId
            )
                throw new ForbiddenException(
                    t('server-ai:Error.ArtifactDraftAccessDenied', { defaultValue: 'ARTIFACT_DRAFT_ACCESS_DENIED' })
                )
            return work(manager, artifact)
        })
    }
    private async write(input: SaveArtifactDraftInput, scope: ArtifactsRuntimeScope) {
        await this.authorized(input.artifactId, scope)
        if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
            throw new BadRequestException(
                t('server-ai:Error.ArtifactDraftRevisionInvalid', { defaultValue: 'ARTIFACT_DRAFT_REVISION_INVALID' })
            )
        const { artifactId, expectedRevision, expectedCurrentVersionId, setCurrent, ...payload } = input
        const content = await this.verified(payload, scope)
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
        return this.locked(input.artifactId, scope, async (manager, artifact) => {
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
            if (draft.publishedRevision === draft.revision && artifact.currentVersionId === draft.publishedVersionId) {
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
            const content = await this.verified(draft.content, scope)
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
        })
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
