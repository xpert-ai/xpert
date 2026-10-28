import { createArtifactLinkSlug } from './artifact-utils'
import { BadRequestException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import type { ArtifactAccessEvent } from '@xpert-ai/contracts'
import {
    ArtifactLinkVersionMode,
    ArtifactRecord,
    ArtifactVersionRecord,
    CreateArtifactInput,
    CreateArtifactVersionInput,
    EnsureArtifactVersionInput,
    EnsureArtifactVersionResult,
    FindArtifactBySourceInput,
    ListArtifactsInput,
    ListArtifactsResult,
    ListArtifactVersionsInput,
    RequestContext,
    WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import path from 'node:path'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { resolveWorkspaceVolumeScope } from '../file-understanding/domain/workspace-file'
import { VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { listAuthorizedArtifacts } from './artifact-authorized-list'
import { ArtifactContentAccess, assertArtifactAccess, assertArtifactPolicyUnchanged } from './artifact-content-access'
import { loadArtifactCurrentVersions } from './artifact-current-versions'
import { serializeArtifact, serializeArtifactVersion } from './artifact-records'
import type {
    ArtifactRepositories,
    ArtifactRequestSummary,
    ArtifactsRuntimeScope,
    NormalizedArtifactSource
} from './artifact-service.types'
import { artifactResourcePrefixPattern } from './artifact-source-filter'
import {
    DEFAULT_PAGE,
    DEFAULT_PAGE_SIZE,
    digestBuffer,
    isUniqueConstraintError,
    MAX_PAGE_SIZE,
    normalizeMimeType,
    normalizeOptionalString,
    normalizePositiveInteger,
    normalizeRequiredString,
    normalizeSourceInput,
    normalizeWorkspaceFilePath,
    normalizeWorkspaceFileReference,
    safeEqualString
} from './artifact-utils'
import { assertArtifactVersionPrecondition } from './artifact-version-concurrency'
import { Artifact, ArtifactAccessLog, ArtifactLink, ArtifactVersion } from './entities'
import { ArtifactTypesService } from './types/artifact-types.service'

type ArtifactPersistenceDependencies = {
    artifact: Repository<Artifact>
    version: Repository<ArtifactVersion>
    link: Repository<ArtifactLink>
    logs: Repository<ArtifactAccessLog>
    volume: VolumeClient
    data?: DataSource
    access?: ArtifactContentAccess
    policies: ArtifactTypesService
}
/** Scope, version and Workspace File operations shared by Artifact entrypoints. */
export class ArtifactPersistence {
    constructor(private readonly dependencies: ArtifactPersistenceDependencies) {}

    async createArtifactWithDefaults(
        input: CreateArtifactInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactRecord> {
        const source = normalizeSourceInput(input.source)
        const actor = this.resolveCreateScope(input.scope, defaults, 'create an artifact')
        // Explicit Project ownership does not erase the authenticated actor used for ACL and audit.
        const scope = { ...actor, userId: input.scope?.userId === null ? null : actor.userId }
        if (input.scope?.userId === null && !scope.projectId) {
            throw new BadRequestException(t('server-ai:Error.ArtifactSharedProjectRequired'))
        }
        const authorizationProviderKey = normalizeOptionalString(input.authorizationProviderKey)
        const typeBinding = this.dependencies.policies.bind({ ...scope, ...source }, input.type, input.kind ?? 'file')
        const policy = { ...scope, ...source, authorizationProviderKey, typeBinding }
        await this.assertAccess(policy, actor, 'write')
        const existing = await this.findExistingArtifact(source, scope)
        if (existing) {
            this.dependencies.policies.assertBindingUnchanged(existing, typeBinding)
            existing.typeBinding = typeBinding
            assertArtifactPolicyUnchanged(existing, policy)
            existing.status = 'active'
            existing.kind = input.kind ?? existing.kind
            existing.checksum = source.checksum ?? existing.checksum
            existing.title = normalizeOptionalString(input.title) ?? existing.title
            existing.description = normalizeOptionalString(input.description) ?? existing.description
            existing.metadata = input.metadata ?? existing.metadata ?? null
            return serializeArtifact(await this.dependencies.artifact.save(existing))
        }

        const candidate = this.dependencies.artifact.create({
            typeBinding,
            authorizationProviderKey,
            ...scope,
            createdById: actor.userId ?? undefined,
            pluginName: source.pluginName,
            resourceType: source.resourceType,
            resourceId: source.resourceId,
            checksum: source.checksum,
            kind: input.kind ?? 'file',
            status: 'active',
            title: normalizeOptionalString(input.title),
            description: normalizeOptionalString(input.description),
            currentVersionId: null,
            metadata: input.metadata ?? null
        })
        try {
            return serializeArtifact(await this.dependencies.artifact.save(candidate))
        } catch (error) {
            if (!isUniqueConstraintError(error)) throw error
            const concurrent = await this.findExistingArtifact(source, scope)
            if (!concurrent) throw error
            this.dependencies.policies.assertBindingUnchanged(concurrent, typeBinding)
            concurrent.typeBinding = typeBinding
            assertArtifactPolicyUnchanged(concurrent, policy)
            concurrent.status = 'active'
            concurrent.kind = input.kind ?? concurrent.kind
            concurrent.checksum = source.checksum ?? concurrent.checksum
            concurrent.title = normalizeOptionalString(input.title) ?? concurrent.title
            concurrent.description = normalizeOptionalString(input.description) ?? concurrent.description
            concurrent.metadata = input.metadata ?? concurrent.metadata ?? null
            return serializeArtifact(await this.dependencies.artifact.save(concurrent))
        }
    }

    async findArtifactBySourceWithDefaults(
        input: FindArtifactBySourceInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactRecord | null> {
        const source = normalizeSourceInput(input)
        const scope = this.resolveCurrentScope(defaults)
        const artifact = await this.findExistingArtifact(source, scope, true)
        if (!artifact || (!input.includeDeleted && artifact.status === 'deleted')) {
            return null
        }
        await this.assertAccess(artifact, scope, 'read')
        return serializeArtifact(artifact, await this.findCurrentVersion(artifact))
    }

    async createArtifactVersionWithDefaults(
        input: CreateArtifactVersionInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactVersionRecord> {
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults)
        if (artifact.status === 'deleted') {
            throw new GoneException('Artifact was deleted')
        }
        const versionInput = this.normalizeArtifactVersionInput(input)
        const file = await this.readWorkspaceArtifact(versionInput.workspaceFileRef)
        await this.dependencies.policies.validateContent(artifact, file.buffer, versionInput.mimeType)
        const sha256 = digestBuffer(file.buffer)
        const size = file.buffer.length
        if (versionInput.sha256 && !safeEqualString(versionInput.sha256, sha256)) {
            throw new BadRequestException('Artifact version checksum does not match the workspace file')
        }
        if (versionInput.size !== undefined && versionInput.size !== null && versionInput.size !== size) {
            throw new BadRequestException('Artifact version size does not match the workspace file')
        }

        return this.withLockedArtifact(artifact, async (lockedArtifact, repositories) => {
            const previous = await repositories.version.findOne({
                where: { artifactId: normalizeRequiredString(lockedArtifact.id, 'artifact.id') },
                order: { versionNumber: 'DESC' }
            })
            const versionNumber = Number(previous?.versionNumber ?? 0) + 1
            const version = await repositories.version.save(
                repositories.version.create({
                    tenantId: lockedArtifact.tenantId,
                    organizationId: lockedArtifact.organizationId,
                    createdById: this.resolveCurrentScope(defaults).userId ?? undefined,
                    artifactId: normalizeRequiredString(lockedArtifact.id, 'artifact.id'),
                    artifact: lockedArtifact,
                    versionNumber,
                    status: 'active',
                    sourceVersionId: versionInput.sourceVersionId,
                    checksum: versionInput.checksum,
                    workspaceFileRef: versionInput.workspaceFileRef,
                    mimeType: versionInput.mimeType,
                    fileName: versionInput.fileName ?? file.name,
                    title: versionInput.title,
                    description: versionInput.description,
                    size,
                    sha256,
                    workspaceId: lockedArtifact.workspaceId,
                    projectId: lockedArtifact.projectId,
                    xpertId: lockedArtifact.xpertId,
                    userId: lockedArtifact.userId,
                    metadata: versionInput.metadata ?? null
                })
            )

            if (versionInput.setCurrent !== false) {
                lockedArtifact.currentVersionId = normalizeRequiredString(version.id, 'version.id')
                lockedArtifact.status = 'active'
                await repositories.artifact.save(lockedArtifact)
            }
            return serializeArtifactVersion(version)
        })
    }

    async listArtifactVersionsWithDefaults(
        input: ListArtifactVersionsInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactVersionRecord[]> {
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults, true, 'read')
        const versions = await this.dependencies.version.find({
            where: {
                artifactId: normalizeRequiredString(artifact.id, 'artifact.id'),
                ...(normalizeOptionalString(input.idempotencyKey)
                    ? { idempotencyKey: normalizeOptionalString(input.idempotencyKey) }
                    : {}),
                ...(input.status && input.status !== 'all' ? { status: input.status } : {})
            },
            order: { versionNumber: 'DESC' }
        })
        return versions.map(serializeArtifactVersion)
    }

    async ensureArtifactVersionWithDefaults(
        input: EnsureArtifactVersionInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<EnsureArtifactVersionResult> {
        const idempotencyKey = normalizeRequiredString(input.idempotencyKey, 'idempotencyKey')
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults)
        const versionInput = this.normalizeArtifactVersionInput(input)
        const file = await this.readWorkspaceArtifact(versionInput.workspaceFileRef)
        await this.dependencies.policies.validateContent(artifact, file.buffer, versionInput.mimeType)
        const sha256 = digestBuffer(file.buffer)
        const size = file.buffer.length
        if (versionInput.sha256 && !safeEqualString(versionInput.sha256, sha256)) {
            throw new BadRequestException('Artifact version checksum does not match the workspace file')
        }
        if (versionInput.size !== undefined && versionInput.size !== null && versionInput.size !== size) {
            throw new BadRequestException('Artifact version size does not match the workspace file')
        }

        return this.withLockedArtifact(artifact, async (lockedArtifact, repositories) => {
            const artifactId = normalizeRequiredString(lockedArtifact.id, 'artifact.id')
            const existing = await repositories.version.findOne({ where: { artifactId, idempotencyKey } })
            assertArtifactVersionPrecondition(input, lockedArtifact.currentVersionId, existing?.id)
            if (existing) {
                if (!existing.sha256 || !safeEqualString(existing.sha256, sha256)) {
                    throw new BadRequestException(
                        'Artifact version idempotency key was already used for different content'
                    )
                }
                if (versionInput.setCurrent !== false && lockedArtifact.currentVersionId !== existing.id) {
                    lockedArtifact.currentVersionId = normalizeRequiredString(existing.id, 'version.id')
                    lockedArtifact.status = 'active'
                    await repositories.artifact.save(lockedArtifact)
                }
                return { version: serializeArtifactVersion(existing), outcome: 'reused' }
            }

            const previous = await repositories.version.findOne({
                where: { artifactId },
                order: { versionNumber: 'DESC' }
            })
            const version = await repositories.version.save(
                repositories.version.create({
                    tenantId: lockedArtifact.tenantId,
                    organizationId: lockedArtifact.organizationId,
                    createdById: this.resolveCurrentScope(defaults).userId ?? undefined,
                    artifactId,
                    artifact: lockedArtifact,
                    versionNumber: Number(previous?.versionNumber ?? 0) + 1,
                    status: 'active',
                    idempotencyKey,
                    sourceVersionId: versionInput.sourceVersionId,
                    checksum: versionInput.checksum,
                    workspaceFileRef: versionInput.workspaceFileRef,
                    mimeType: versionInput.mimeType,
                    fileName: versionInput.fileName ?? file.name,
                    title: versionInput.title,
                    description: versionInput.description,
                    size,
                    sha256,
                    workspaceId: lockedArtifact.workspaceId,
                    projectId: lockedArtifact.projectId,
                    xpertId: lockedArtifact.xpertId,
                    userId: lockedArtifact.userId,
                    metadata: versionInput.metadata ?? null
                })
            )
            if (versionInput.setCurrent !== false) {
                lockedArtifact.currentVersionId = normalizeRequiredString(version.id, 'version.id')
                lockedArtifact.status = 'active'
                await repositories.artifact.save(lockedArtifact)
            }
            return { version: serializeArtifactVersion(version), outcome: 'created' }
        })
    }

    async getArtifactWithDefaults(idOrSlug: string, defaults: ArtifactsRuntimeScope): Promise<ArtifactRecord> {
        const artifact = await this.resolveScopedArtifact(idOrSlug, defaults, true, 'read')
        return serializeArtifact(artifact, await this.findCurrentVersion(artifact))
    }

    async listArtifactsWithDefaults(
        input: ListArtifactsInput = {},
        defaults: ArtifactsRuntimeScope
    ): Promise<ListArtifactsResult> {
        const scope = this.resolveCurrentScope(defaults)
        const page = normalizePositiveInteger(input.page, DEFAULT_PAGE)
        const pageSize = Math.min(normalizePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
        const qb = this.dependencies.artifact
            .createQueryBuilder('artifact')
            .where('artifact.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('artifact.updatedAt', 'DESC')
            .addOrderBy('artifact.id', 'DESC')
        if (input.resourceIdPrefix) {
            qb.andWhere('artifact.resourceId LIKE :resourceIdPrefix', {
                resourceIdPrefix: artifactResourcePrefixPattern(input.resourceIdPrefix)
            })
        }

        if (scope.organizationId) {
            qb.andWhere('artifact.organizationId = :organizationId', { organizationId: scope.organizationId })
        } else {
            qb.andWhere('artifact.organizationId IS NULL')
        }
        if (scope.userId) {
            qb.andWhere('(artifact.userId IS NULL OR artifact.userId = :userId)', { userId: scope.userId })
        } else {
            qb.andWhere('artifact.userId IS NULL')
        }
        if (input.status && input.status !== 'all') {
            qb.andWhere('artifact.status = :status', { status: input.status })
        } else {
            qb.andWhere('artifact.status != :deletedStatus', { deletedStatus: 'deleted' })
        }
        if (input.pluginName) {
            qb.andWhere('artifact.pluginName = :pluginName', { pluginName: input.pluginName })
        }
        if (input.resourceType) {
            qb.andWhere('artifact.resourceType = :resourceType', { resourceType: input.resourceType })
        }
        if (input.resourceId) {
            qb.andWhere('artifact.resourceId = :resourceId', { resourceId: input.resourceId })
        }

        const { items, total } = await listAuthorizedArtifacts(
            qb,
            (artifact) => this.assertAccess(artifact, scope, 'read'),
            page,
            pageSize
        )
        // Query parameters may be strings; SDK callers pass a boolean. Neither changes authorization.
        const includeCurrentVersion: unknown = input.includeCurrentVersion
        const currentVersions =
            includeCurrentVersion === true || includeCurrentVersion === 'true'
                ? await loadArtifactCurrentVersions(items, this.dependencies.version)
                : new Map<string, ArtifactVersion>()
        return {
            items: items.map((artifact) => serializeArtifact(artifact, currentVersions.get(artifact.id))),
            total,
            page,
            pageSize
        }
    }

    async archiveArtifactWithDefaults(idOrSlug: string, defaults: ArtifactsRuntimeScope): Promise<ArtifactRecord> {
        const artifact = await this.resolveScopedArtifact(idOrSlug, defaults)
        artifact.status = 'archived'
        const saved = await this.dependencies.artifact.save(artifact)
        await this.recordArtifactAccessLog(saved, 'archived', { statusCode: 200 })
        return serializeArtifact(saved, await this.findCurrentVersion(saved))
    }

    async deleteArtifactWithDefaults(idOrSlug: string, defaults: ArtifactsRuntimeScope): Promise<ArtifactRecord> {
        const artifact = await this.resolveScopedArtifact(idOrSlug, defaults, true)
        artifact.status = 'deleted'
        const saved = await this.dependencies.artifact.save(artifact)
        const links = await this.dependencies.link.find({
            where: { artifactId: normalizeRequiredString(artifact.id, 'artifact.id') }
        })
        for (const link of links) {
            if (link.status !== 'revoked') {
                link.status = 'revoked'
                link.revokedAt = new Date()
                await this.dependencies.link.save(link)
            }
        }
        await this.recordArtifactAccessLog(saved, 'deleted', { statusCode: 200 })
        return serializeArtifact(saved)
    }

    async assertAccess(
        artifact: Parameters<typeof assertArtifactAccess>[1],
        actor: Parameters<typeof assertArtifactAccess>[2],
        operation: Parameters<typeof assertArtifactAccess>[3],
        checkOwner = true
    ) {
        if (!this.dependencies.access) await this.dependencies.policies.authorize(artifact, actor, operation)
        await assertArtifactAccess(this.dependencies.access, artifact, actor, operation, checkOwner)
    }

    normalizeArtifactVersionInput(input: CreateArtifactVersionInput) {
        if (!input?.workspaceFileRef) {
            throw new BadRequestException('workspaceFileRef is required')
        }
        const workspaceFileRef = normalizeWorkspaceFileReference(input.workspaceFileRef)
        const mimeType = normalizeMimeType(input.mimeType)
        return {
            ...input,
            workspaceFileRef,
            mimeType,
            fileName: normalizeOptionalString(input.fileName),
            title: normalizeOptionalString(input.title),
            description: normalizeOptionalString(input.description),
            sourceVersionId: normalizeOptionalString(input.sourceVersionId),
            checksum: normalizeOptionalString(input.checksum)
        }
    }

    resolveCreateScope(
        input: ArtifactsRuntimeScope | null | undefined,
        defaults: ArtifactsRuntimeScope,
        action: string
    ): Required<Pick<ArtifactsRuntimeScope, 'tenantId'>> & ArtifactsRuntimeScope {
        const tenantId =
            normalizeOptionalString(input?.tenantId) ??
            normalizeOptionalString(defaults.tenantId) ??
            normalizeOptionalString(RequestContext.currentTenantId())
        if (!tenantId) {
            throw new BadRequestException(`tenantId is required to ${action}`)
        }
        return {
            tenantId,
            organizationId:
                normalizeOptionalString(input?.organizationId) ??
                normalizeOptionalString(defaults.organizationId) ??
                normalizeOptionalString(RequestContext.getOrganizationId()),
            userId:
                normalizeOptionalString(input?.userId) ??
                normalizeOptionalString(defaults.userId) ??
                normalizeOptionalString(RequestContext.currentUserId()),
            workspaceId: normalizeOptionalString(input?.workspaceId) ?? normalizeOptionalString(defaults.workspaceId),
            projectId: normalizeOptionalString(input?.projectId) ?? normalizeOptionalString(defaults.projectId),
            xpertId: normalizeOptionalString(input?.xpertId) ?? normalizeOptionalString(defaults.xpertId)
        }
    }

    resolveCurrentScope(defaults: ArtifactsRuntimeScope) {
        const tenantId =
            normalizeOptionalString(defaults.tenantId) ?? normalizeOptionalString(RequestContext.currentTenantId())
        if (!tenantId) {
            throw new UnauthorizedException('Login is required')
        }
        return {
            tenantId,
            organizationId:
                normalizeOptionalString(defaults.organizationId) ??
                normalizeOptionalString(RequestContext.getOrganizationId()),
            userId: normalizeOptionalString(defaults.userId) ?? normalizeOptionalString(RequestContext.currentUserId())
        }
    }

    async findExistingArtifact(
        source: NormalizedArtifactSource,
        scope: Required<Pick<ArtifactsRuntimeScope, 'tenantId'>> & ArtifactsRuntimeScope,
        includeProjectOwned = false
    ) {
        const candidates = await this.dependencies.artifact.find({
            where: {
                tenantId: scope.tenantId,
                pluginName: source.pluginName,
                resourceType: source.resourceType,
                resourceId: source.resourceId
            }
        })
        const scoped = candidates.filter(
            (artifact) =>
                normalizeOptionalString(artifact.organizationId) === normalizeOptionalString(scope.organizationId)
        )
        // Source identity stays scoped by owner, independent of the optional resource policy.
        return (
            scoped.find(
                (artifact) => normalizeOptionalString(artifact.userId) === normalizeOptionalString(scope.userId)
            ) ??
            (includeProjectOwned ? scoped.find((artifact) => !artifact.userId && artifact.projectId) : null) ??
            null
        )
    }

    async resolveScopedArtifact(
        idOrSlug: string,
        defaults: ArtifactsRuntimeScope,
        allowDeleted = false,
        operation: 'read' | 'write' | 'manage' = 'write'
    ): Promise<Artifact> {
        const normalized = normalizeRequiredString(idOrSlug, 'artifact id')
        const scope = this.resolveCurrentScope(defaults)
        const byId = await this.dependencies.artifact.findOne({ where: { id: normalized } })
        const artifact =
            byId ??
            (
                await this.dependencies.link.findOne({
                    where: { slug: normalized },
                    relations: ['artifact']
                })
            )?.artifact
        if (!artifact || artifact.tenantId !== scope.tenantId) {
            throw new NotFoundException('Artifact was not found')
        }
        if (normalizeOptionalString(artifact.organizationId) !== normalizeOptionalString(scope.organizationId)) {
            throw new NotFoundException('Artifact was not found')
        }
        await this.assertAccess(artifact, scope, operation)
        if (!allowDeleted && artifact.status === 'deleted') {
            throw new GoneException('Artifact was deleted')
        }
        return artifact
    }

    async resolveScopedLink(idOrSlug: string, defaults: ArtifactsRuntimeScope): Promise<ArtifactLink> {
        const normalized = normalizeRequiredString(idOrSlug, 'idOrSlug')
        const scope = this.resolveCurrentScope(defaults)
        const qb = this.dependencies.link
            .createQueryBuilder('link')
            .leftJoinAndSelect('link.artifact', 'artifact')
            // PostgreSQL casts UUID parameters even inside OR; slugs must never bind to link.id.
            .where('(link.id = :linkId OR link.slug = :linkSlug)', {
                linkId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
                    ? normalized
                    : null,
                linkSlug: normalized
            })
            .andWhere('link.tenantId = :tenantId', { tenantId: scope.tenantId })
        if (scope.organizationId) {
            qb.andWhere('link.organizationId = :organizationId', { organizationId: scope.organizationId })
        } else {
            qb.andWhere('link.organizationId IS NULL')
        }
        if (scope.userId) {
            qb.andWhere('(artifact.userId IS NULL OR artifact.userId = :userId)', { userId: scope.userId })
        }
        const link = await qb.getOne()
        if (!link?.artifact) {
            throw new NotFoundException('Artifact link was not found')
        }
        await this.assertAccess(link.artifact, scope, 'manage')
        return link
    }

    async findCurrentVersion(artifact: Artifact) {
        if (!artifact.currentVersionId) {
            return null
        }
        return this.dependencies.version.findOne({ where: { id: artifact.currentVersionId, artifactId: artifact.id } })
    }

    async resolveRequestedVersion(
        artifact: Artifact,
        versionMode: ArtifactLinkVersionMode,
        artifactVersionId?: string | null
    ) {
        return this.resolveRequestedVersionFromRepository(
            artifact,
            versionMode,
            artifactVersionId,
            this.dependencies.version
        )
    }

    async resolveRequestedVersionFromRepository(
        artifact: Artifact,
        versionMode: ArtifactLinkVersionMode,
        artifactVersionId: string | null | undefined,
        repository: Repository<ArtifactVersion>
    ) {
        const id =
            versionMode === 'version'
                ? normalizeRequiredString(artifactVersionId, 'artifactVersionId')
                : artifact.currentVersionId
        if (!id) {
            throw new BadRequestException('Artifact has no current version')
        }
        const version = await repository.findOne({ where: { id, artifactId: artifact.id } })
        if (!version || version.status !== 'active') {
            throw new NotFoundException('Artifact version was not found')
        }
        return version
    }

    repositories(manager?: EntityManager): ArtifactRepositories {
        return manager
            ? {
                  artifact: manager.getRepository(Artifact),
                  version: manager.getRepository(ArtifactVersion),
                  link: manager.getRepository(ArtifactLink)
              }
            : {
                  artifact: this.dependencies.artifact,
                  version: this.dependencies.version,
                  link: this.dependencies.link
              }
    }

    async withLockedArtifact<T>(
        artifact: Artifact,
        operation: (artifact: Artifact, repositories: ArtifactRepositories) => Promise<T>
    ): Promise<T> {
        if (!this.dependencies.data?.isInitialized) {
            return operation(artifact, this.repositories())
        }
        return this.dependencies.data.transaction(async (manager) => {
            const repositories = this.repositories(manager)
            const locked = await repositories.artifact.findOne({
                where: { id: normalizeRequiredString(artifact.id, 'artifact.id') },
                lock: { mode: 'pessimistic_write' }
            })
            if (
                !locked ||
                locked.tenantId !== artifact.tenantId ||
                normalizeOptionalString(locked.organizationId) !== normalizeOptionalString(artifact.organizationId)
            ) {
                throw new NotFoundException('Artifact was not found')
            }
            if (locked.status === 'deleted') {
                throw new GoneException('Artifact was deleted')
            }
            return operation(locked, repositories)
        })
    }

    async resolveLinkVersion(link: ArtifactLink, artifact: Artifact) {
        return this.resolveRequestedVersion(artifact, link.versionMode ?? 'latest', link.artifactVersionId)
    }

    async readWorkspaceArtifact(ref: WorkspacePortableFileReference) {
        const filePath = normalizeWorkspaceFilePath(ref.filePath)
        const resolved = resolveWorkspaceVolumeScope(ref, {
            tenantId: ref.tenantId,
            userId: ref.userId,
            inferUserScope: true
        })
        if (!resolved) {
            throw new BadRequestException('Unable to resolve artifact workspace scope')
        }
        const client = new VolumeSubtreeClient(this.dependencies.volume.resolve(resolved.volumeScope), {
            allowRootWorkspace: true
        })
        const buffer = await client.readBuffer('', filePath)
        return {
            buffer,
            name: ref.originalName ?? ref.name ?? path.posix.basename(filePath)
        }
    }

    async recordArtifactAccessLog(
        artifact: Artifact,
        event: ArtifactAccessEvent,
        options: {
            statusCode?: number
            error?: string
        } = {}
    ) {
        try {
            await this.dependencies.logs.save(
                this.dependencies.logs.create({
                    tenantId: artifact.tenantId,
                    organizationId: artifact.organizationId,
                    linkId: null,
                    artifactId: artifact.id,
                    slug: `artifact:${artifact.id}`,
                    event,
                    accessMode: null,
                    statusCode: options.statusCode,
                    error: normalizeOptionalString(options.error)
                })
            )
        } catch {
            // Audit logging must not make a valid artifact operation fail.
        }
    }

    async incrementCounters(link: ArtifactLink, kind: 'access' | 'download') {
        if (!link.id) {
            return
        }
        await this.dependencies.link.increment({ id: link.id }, 'accessCount', 1)
        if (kind === 'download') {
            await this.dependencies.link.increment({ id: link.id }, 'downloadCount', 1)
            link.downloadCount += 1
        }
        link.accessCount += 1
    }

    async recordAccessLog(
        link: ArtifactLink,
        event: ArtifactAccessEvent,
        options: {
            statusCode?: number
            error?: string
            principalUserId?: string | null
            requestSummary?: ArtifactRequestSummary
        } = {}
    ) {
        try {
            await this.dependencies.logs.save(
                this.dependencies.logs.create({
                    tenantId: link.tenantId,
                    organizationId: link.organizationId,
                    linkId: link.id,
                    artifactId: link.artifactId,
                    slug: link.slug,
                    event,
                    accessMode: link.accessMode,
                    principalUserId: normalizeOptionalString(options.principalUserId),
                    ipHash: options.requestSummary?.ipHash,
                    userAgent: options.requestSummary?.userAgent,
                    statusCode: options.statusCode,
                    error: normalizeOptionalString(options.error)
                })
            )
        } catch {
            // Access logging must not make a valid artifact unreachable.
        }
    }
    /**
     * Allocates the externally visible Artifact link slug.
     *
     * Collisions are unlikely but still checked against the repository so the
     * unique database index does not become normal control flow.
     */
    async createUniqueSlug() {
        for (let index = 0; index < 8; index += 1) {
            const slug = createArtifactLinkSlug()
            const existing = await this.dependencies.link.findOne({ where: { slug } })
            if (!existing) {
                return slug
            }
        }
        throw new BadRequestException('Unable to allocate an artifact link slug')
    }
}
