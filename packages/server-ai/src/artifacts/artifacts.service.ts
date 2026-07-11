import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import {
    BadRequestException,
    ForbiddenException,
    GoneException,
    Inject,
    Injectable,
    NotFoundException,
    UnauthorizedException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ArtifactAccessEvent } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import {
    ArtifactAccessMode,
    ArtifactKind,
    ArtifactLinkAccessInput,
    ArtifactLinkDisposition,
    ArtifactLinkRecord,
    ArtifactLinkStatus,
    ArtifactLinkVersionMode,
    ArtifactRecord,
    ArtifactsApi,
    ArtifactSafeHtmlProfile,
    ArtifactVersionRecord,
    CreateArtifactInput,
    CreateArtifactLinkInput,
    CreateArtifactVersionInput,
    CreateSignedArtifactPreviewLinkInput,
    ListArtifactsInput,
    ListArtifactsResult,
    RequestContext,
    UpdateArtifactLinkAccessInput,
    WORKSPACE_FILES_SOURCE,
    WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { verify } from 'jsonwebtoken'
import { Repository } from 'typeorm'
import { resolveWorkspaceVolumeScope } from '../file-understanding'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { Artifact, ArtifactAccessLog, ArtifactLink, ArtifactVersion } from './entities'

const SIGNED_PREVIEW_QUERY_PARAM = 'xpert_artifact_preview'
const DEFAULT_SIGNED_PREVIEW_TTL_SECONDS = 15 * 60
const MAX_TTL_SECONDS = 60 * 60 * 24 * 365
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
/**
 * Public Artifact links use a short random slug instead of UUIDs.
 *
 * Twelve URL-safe characters are compact enough for sharing while still giving
 * very large entropy; the database unique index remains the final collision
 * guard.
 */
const ARTIFACT_LINK_SLUG_LENGTH = 12
const ARTIFACT_LINK_SLUG_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const ALLOWED_EXACT_MIME_TYPES = new Set([
    'application/json',
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    PPTX_MIME_TYPE,
    'text/csv',
    'text/html',
    'text/markdown',
    'text/plain'
])

export type ArtifactsRuntimeScope = {
    tenantId?: string | null
    organizationId?: string | null
    userId?: string | null
    workspaceId?: string | null
    projectId?: string | null
    xpertId?: string | null
}

export type ArtifactAccessPrincipal = {
    userId?: string | null
    tenantId?: string | null
    organizationId?: string | null
}

export type ArtifactResolvedVersion = {
    link: ArtifactLink
    artifact: Artifact
    version: ArtifactVersion
    buffer: Buffer
    mimeType: string
    fileName: string
    disposition: ArtifactLinkDisposition
    safeHtmlProfile?: ArtifactSafeHtmlProfile | null
}

@Injectable()
export class ArtifactsService implements ArtifactsApi {
    constructor(
        @InjectRepository(Artifact)
        private readonly artifactRepository: Repository<Artifact>,
        @InjectRepository(ArtifactVersion)
        private readonly versionRepository: Repository<ArtifactVersion>,
        @InjectRepository(ArtifactLink)
        private readonly linkRepository: Repository<ArtifactLink>,
        @InjectRepository(ArtifactAccessLog)
        private readonly accessLogRepository: Repository<ArtifactAccessLog>,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    createScopedApi(defaults: ArtifactsRuntimeScope): ArtifactsApi {
        return {
            createArtifact: (input) => this.createArtifactWithDefaults(input, defaults),
            createArtifactVersion: (input) => this.createArtifactVersionWithDefaults(input, defaults),
            getArtifact: (idOrSlug) => this.getArtifactWithDefaults(idOrSlug, defaults),
            listArtifacts: (input) => this.listArtifactsWithDefaults(input, defaults),
            archiveArtifact: (idOrSlug) => this.archiveArtifactWithDefaults(idOrSlug, defaults),
            deleteArtifact: (idOrSlug) => this.deleteArtifactWithDefaults(idOrSlug, defaults),
            createArtifactLink: (input) => this.createArtifactLinkWithDefaults(input, defaults),
            createSignedPreviewLink: (input) => this.createSignedPreviewLinkWithDefaults(input, defaults),
            updateArtifactLinkAccess: (idOrSlug, patch) =>
                this.updateArtifactLinkAccessWithDefaults(idOrSlug, patch, defaults),
            revokeArtifactLink: (idOrSlug) => this.revokeArtifactLinkWithDefaults(idOrSlug, defaults)
        }
    }

    async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
        return this.createArtifactWithDefaults(input, {})
    }

    async createArtifactVersion(input: CreateArtifactVersionInput): Promise<ArtifactVersionRecord> {
        return this.createArtifactVersionWithDefaults(input, {})
    }

    async getArtifact(idOrSlug: string): Promise<ArtifactRecord> {
        return this.getArtifactWithDefaults(idOrSlug, {})
    }

    async listArtifacts(input: ListArtifactsInput = {}): Promise<ListArtifactsResult> {
        return this.listArtifactsWithDefaults(input, {})
    }

    async archiveArtifact(idOrSlug: string): Promise<ArtifactRecord> {
        return this.archiveArtifactWithDefaults(idOrSlug, {})
    }

    async deleteArtifact(idOrSlug: string): Promise<ArtifactRecord> {
        return this.deleteArtifactWithDefaults(idOrSlug, {})
    }

    async createArtifactLink(input: CreateArtifactLinkInput): Promise<ArtifactLinkRecord> {
        return this.createArtifactLinkWithDefaults(input, {})
    }

    async createSignedPreviewLink(input: CreateSignedArtifactPreviewLinkInput): Promise<ArtifactLinkRecord> {
        return this.createSignedPreviewLinkWithDefaults(input, {})
    }

    async updateArtifactLinkAccess(
        idOrSlug: string,
        patch: UpdateArtifactLinkAccessInput
    ): Promise<ArtifactLinkRecord> {
        return this.updateArtifactLinkAccessWithDefaults(idOrSlug, patch, {})
    }

    async revokeArtifactLink(idOrSlug: string): Promise<ArtifactLinkRecord> {
        return this.revokeArtifactLinkWithDefaults(idOrSlug, {})
    }

    async resolveForPublicAccess(input: {
        slug: string
        download?: boolean
        previewToken?: string | null
        principal?: ArtifactAccessPrincipal | null
        requestSummary?: ArtifactRequestSummary
    }): Promise<ArtifactResolvedVersion> {
        const link = await this.linkRepository.findOne({
            where: { slug: normalizeRequiredString(input.slug, 'slug') },
            relations: ['artifact']
        })
        if (!link || !link.artifact) {
            throw new NotFoundException('Artifact link was not found')
        }
        if (input.download && !link.allowDownload) {
            await this.recordAccessLog(link, 'denied', {
                statusCode: 403,
                error: 'download_not_allowed',
                requestSummary: input.requestSummary
            })
            throw new ForbiddenException('Download is not allowed for this artifact link')
        }

        await this.assertPublicAccess(link, input.previewToken, input.principal ?? null, input.requestSummary)
        const artifact = link.artifact
        if (artifact.status !== 'active') {
            await this.recordAccessLog(link, 'denied', {
                statusCode: 410,
                error: `artifact_${artifact.status}`,
                requestSummary: input.requestSummary
            })
            throw new GoneException('Artifact is no longer active')
        }

        const version = await this.resolveLinkVersion(link, artifact)
        const file = await this.readWorkspaceArtifact(version.workspaceFileRef)
        const sha256 = digestBuffer(file.buffer)
        if (version.sha256 && !safeEqualString(version.sha256, sha256)) {
            await this.recordAccessLog(link, 'denied', {
                statusCode: 409,
                error: 'artifact_checksum_mismatch',
                requestSummary: input.requestSummary
            })
            throw new GoneException('Artifact changed after the link was created')
        }

        const event: ArtifactAccessEvent = input.download ? 'download' : 'access'
        await this.incrementCounters(link, input.download ? 'download' : 'access')
        await this.recordAccessLog(link, event, {
            statusCode: 200,
            principalUserId: input.principal?.userId,
            requestSummary: input.requestSummary
        })

        return {
            link,
            artifact,
            version,
            buffer: file.buffer,
            mimeType: version.mimeType,
            fileName: version.fileName ?? file.name,
            disposition: input.download ? 'attachment' : link.disposition,
            safeHtmlProfile: link.safeHtmlProfile
        }
    }

    resolvePrincipalFromRequest(request: ArtifactHttpRequest): ArtifactAccessPrincipal {
        const token = extractBearerToken(request.headers)
        const organizationId = getHeaderValue(request.headers, 'organization-id')
        if (!token) {
            return { organizationId }
        }
        try {
            const payload = verify(token, environment.JWT_SECRET) as ArtifactJwtPayload
            return {
                userId: normalizeOptionalString(payload.id),
                tenantId: normalizeOptionalString(payload.tenantId),
                organizationId
            }
        } catch {
            return { organizationId }
        }
    }

    summarizeRequest(request: ArtifactHttpRequest): ArtifactRequestSummary {
        return {
            ipHash: hashString(getRequestIp(request)),
            userAgent: normalizeOptionalString(getHeaderValue(request.headers, 'user-agent'))
        }
    }

    private async createArtifactWithDefaults(
        input: CreateArtifactInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactRecord> {
        const source = normalizeSourceInput(input.source)
        const scope = this.resolveCreateScope(input.scope, defaults, 'create an artifact')
        const existing = await this.findExistingArtifact(source, scope)
        if (existing && existing.status !== 'deleted') {
            existing.status = existing.status === 'archived' ? 'active' : existing.status
            existing.kind = input.kind ?? existing.kind
            existing.checksum = source.checksum ?? existing.checksum
            existing.title = normalizeOptionalString(input.title) ?? existing.title
            existing.description = normalizeOptionalString(input.description) ?? existing.description
            existing.metadata = input.metadata ?? existing.metadata ?? null
            return serializeArtifact(await this.artifactRepository.save(existing))
        }

        const artifact = await this.artifactRepository.save(
            this.artifactRepository.create({
                ...scope,
                createdById: scope.userId ?? undefined,
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
        )
        return serializeArtifact(artifact)
    }

    private async createArtifactVersionWithDefaults(
        input: CreateArtifactVersionInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactVersionRecord> {
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults)
        if (artifact.status === 'deleted') {
            throw new GoneException('Artifact was deleted')
        }
        const versionInput = this.normalizeArtifactVersionInput(input)
        const file = await this.readWorkspaceArtifact(versionInput.workspaceFileRef)
        const sha256 = digestBuffer(file.buffer)
        const size = file.buffer.length
        if (versionInput.sha256 && !safeEqualString(versionInput.sha256, sha256)) {
            throw new BadRequestException('Artifact version checksum does not match the workspace file')
        }
        if (versionInput.size !== undefined && versionInput.size !== null && versionInput.size !== size) {
            throw new BadRequestException('Artifact version size does not match the workspace file')
        }

        const previous = await this.versionRepository.findOne({
            where: { artifactId: normalizeRequiredString(artifact.id, 'artifact.id') },
            order: { versionNumber: 'DESC' }
        })
        const versionNumber = Number(previous?.versionNumber ?? 0) + 1
        const version = await this.versionRepository.save(
            this.versionRepository.create({
                tenantId: artifact.tenantId,
                organizationId: artifact.organizationId,
                createdById: defaults.userId ?? artifact.userId ?? undefined,
                artifactId: normalizeRequiredString(artifact.id, 'artifact.id'),
                artifact,
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
                workspaceId: artifact.workspaceId,
                projectId: artifact.projectId,
                xpertId: artifact.xpertId,
                userId: artifact.userId,
                metadata: versionInput.metadata ?? null
            })
        )

        if (versionInput.setCurrent !== false) {
            artifact.currentVersionId = normalizeRequiredString(version.id, 'version.id')
            artifact.status = 'active'
            await this.artifactRepository.save(artifact)
        }
        return serializeArtifactVersion(version)
    }

    private async getArtifactWithDefaults(idOrSlug: string, defaults: ArtifactsRuntimeScope): Promise<ArtifactRecord> {
        const artifact = await this.resolveScopedArtifact(idOrSlug, defaults, true)
        return serializeArtifact(artifact, await this.findCurrentVersion(artifact))
    }

    private async listArtifactsWithDefaults(
        input: ListArtifactsInput = {},
        defaults: ArtifactsRuntimeScope
    ): Promise<ListArtifactsResult> {
        const scope = this.resolveCurrentScope(defaults)
        const page = normalizePositiveInteger(input.page, DEFAULT_PAGE)
        const pageSize = Math.min(normalizePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
        const qb = this.artifactRepository
            .createQueryBuilder('artifact')
            .where('artifact.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('artifact.updatedAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)

        if (scope.organizationId) {
            qb.andWhere('artifact.organizationId = :organizationId', { organizationId: scope.organizationId })
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

        const [items, total] = await qb.getManyAndCount()
        return {
            items: items.map((artifact) => serializeArtifact(artifact)),
            total,
            page,
            pageSize
        }
    }

    private async archiveArtifactWithDefaults(
        idOrSlug: string,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactRecord> {
        const artifact = await this.resolveScopedArtifact(idOrSlug, defaults)
        artifact.status = 'archived'
        const saved = await this.artifactRepository.save(artifact)
        await this.recordArtifactAccessLog(saved, 'archived', { statusCode: 200 })
        return serializeArtifact(saved, await this.findCurrentVersion(saved))
    }

    private async deleteArtifactWithDefaults(
        idOrSlug: string,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactRecord> {
        const artifact = await this.resolveScopedArtifact(idOrSlug, defaults, true)
        artifact.status = 'deleted'
        const saved = await this.artifactRepository.save(artifact)
        const links = await this.linkRepository.find({
            where: { artifactId: normalizeRequiredString(artifact.id, 'artifact.id') }
        })
        for (const link of links) {
            if (link.status !== 'revoked') {
                link.status = 'revoked'
                link.revokedAt = new Date()
                await this.linkRepository.save(link)
            }
        }
        await this.recordArtifactAccessLog(saved, 'deleted', { statusCode: 200 })
        return serializeArtifact(saved)
    }

    private async createArtifactLinkWithDefaults(
        input: CreateArtifactLinkInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord> {
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults)
        const versionMode = normalizeVersionMode(input.versionMode, input.artifactVersionId)
        const version = await this.resolveRequestedVersion(artifact, versionMode, input.artifactVersionId)
        const access = normalizeAccessInput(input.access)
        const scope = artifactToScope(artifact)
        const token = this.assertAndApplyPublicLinkPolicy(access, {
            ...scope,
            userId: defaults.userId ?? artifact.userId
        })
        const slug = await this.createUniqueSlug()
        const link = this.linkRepository.create({
            ...scope,
            createdById: defaults.userId ?? artifact.userId ?? undefined,
            artifactId: normalizeRequiredString(artifact.id, 'artifact.id'),
            artifact,
            artifactVersionId: versionMode === 'version' ? normalizeRequiredString(version.id, 'version.id') : null,
            versionMode,
            slug,
            publicUrl: this.buildPublicUrl(slug),
            accessMode: access.mode,
            status: 'active',
            customPrincipals: normalizeStringArray(access.customPrincipals),
            expiresAt: resolveExpiresAt(access),
            accessCount: 0,
            downloadCount: 0,
            disposition: input.presentation?.disposition ?? 'inline',
            allowDownload: input.presentation?.allowDownload ?? true,
            safeHtmlProfile: input.presentation?.safeHtmlProfile ?? defaultSafeHtmlProfile(version.mimeType),
            metadata: input.metadata ?? null
        })
        if (access.mode === 'signed_preview') {
            link.tokenHash = digestString(token ?? createSignedPreviewToken())
        }
        const saved = await this.linkRepository.save(link)
        return this.serializeLink(saved, token, artifact, version)
    }

    private async createSignedPreviewLinkWithDefaults(
        input: CreateSignedArtifactPreviewLinkInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord> {
        return this.createArtifactLinkWithDefaults(
            {
                ...input,
                access: {
                    mode: 'signed_preview',
                    ttlSeconds: input.ttlSeconds ?? DEFAULT_SIGNED_PREVIEW_TTL_SECONDS
                }
            },
            defaults
        )
    }

    private async updateArtifactLinkAccessWithDefaults(
        idOrSlug: string,
        patch: UpdateArtifactLinkAccessInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord> {
        const link = await this.resolveScopedLink(idOrSlug, defaults)
        const token = patch.access ? this.applyAccessPatch(link, patch.access) : undefined
        if (patch.presentation) {
            this.applyPresentationPatch(link, patch.presentation)
        }
        if (patch.versionMode || patch.artifactVersionId !== undefined) {
            const artifact = link.artifact ?? (await this.resolveScopedArtifact(link.artifactId, defaults))
            const versionMode = normalizeVersionMode(patch.versionMode, patch.artifactVersionId)
            const version = await this.resolveRequestedVersion(artifact, versionMode, patch.artifactVersionId)
            link.versionMode = versionMode
            link.artifactVersionId =
                versionMode === 'version' ? normalizeRequiredString(version.id, 'version.id') : null
        }
        const saved = await this.linkRepository.save(link)
        return this.serializeLink(saved, token)
    }

    private async revokeArtifactLinkWithDefaults(
        idOrSlug: string,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord> {
        const link = await this.resolveScopedLink(idOrSlug, defaults)
        if (link.status !== 'revoked') {
            link.status = 'revoked'
            link.revokedAt = new Date()
            await this.linkRepository.save(link)
            await this.recordAccessLog(link, 'revoked', { statusCode: 200 })
        }
        return this.serializeLink(link)
    }

    private normalizeArtifactVersionInput(input: CreateArtifactVersionInput) {
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

    private resolveCreateScope(
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

    private resolveCurrentScope(defaults: ArtifactsRuntimeScope) {
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

    private async findExistingArtifact(
        source: NormalizedArtifactSource,
        scope: Required<Pick<ArtifactsRuntimeScope, 'tenantId'>> & ArtifactsRuntimeScope
    ) {
        return this.artifactRepository.findOne({
            where: {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                pluginName: source.pluginName,
                resourceType: source.resourceType,
                resourceId: source.resourceId
            }
        })
    }

    private async resolveScopedArtifact(
        idOrSlug: string,
        defaults: ArtifactsRuntimeScope,
        allowDeleted = false
    ): Promise<Artifact> {
        const normalized = normalizeRequiredString(idOrSlug, 'artifact id')
        const scope = this.resolveCurrentScope(defaults)
        const byId = await this.artifactRepository.findOne({ where: { id: normalized } })
        const artifact =
            byId ??
            (
                await this.linkRepository.findOne({
                    where: { slug: normalized },
                    relations: ['artifact']
                })
            )?.artifact
        if (!artifact || artifact.tenantId !== scope.tenantId) {
            throw new NotFoundException('Artifact was not found')
        }
        if (scope.organizationId && artifact.organizationId !== scope.organizationId) {
            throw new NotFoundException('Artifact was not found')
        }
        if (!allowDeleted && artifact.status === 'deleted') {
            throw new GoneException('Artifact was deleted')
        }
        return artifact
    }

    private async resolveScopedLink(idOrSlug: string, defaults: ArtifactsRuntimeScope): Promise<ArtifactLink> {
        const normalized = normalizeRequiredString(idOrSlug, 'idOrSlug')
        const scope = this.resolveCurrentScope(defaults)
        const qb = this.linkRepository
            .createQueryBuilder('link')
            .leftJoinAndSelect('link.artifact', 'artifact')
            .where('(link.id = :idOrSlug OR link.slug = :idOrSlug)', { idOrSlug: normalized })
            .andWhere('link.tenantId = :tenantId', { tenantId: scope.tenantId })
        if (scope.organizationId) {
            qb.andWhere('link.organizationId = :organizationId', { organizationId: scope.organizationId })
        }
        const link = await qb.getOne()
        if (!link) {
            throw new NotFoundException('Artifact link was not found')
        }
        return link
    }

    private async findCurrentVersion(artifact: Artifact) {
        if (!artifact.currentVersionId) {
            return null
        }
        return this.versionRepository.findOne({ where: { id: artifact.currentVersionId, artifactId: artifact.id } })
    }

    private async resolveRequestedVersion(
        artifact: Artifact,
        versionMode: ArtifactLinkVersionMode,
        artifactVersionId?: string | null
    ) {
        const id =
            versionMode === 'version'
                ? normalizeRequiredString(artifactVersionId, 'artifactVersionId')
                : artifact.currentVersionId
        if (!id) {
            throw new BadRequestException('Artifact has no current version')
        }
        const version = await this.versionRepository.findOne({ where: { id, artifactId: artifact.id } })
        if (!version || version.status !== 'active') {
            throw new NotFoundException('Artifact version was not found')
        }
        return version
    }

    private async resolveLinkVersion(link: ArtifactLink, artifact: Artifact) {
        return this.resolveRequestedVersion(artifact, link.versionMode ?? 'latest', link.artifactVersionId)
    }

    private async assertPublicAccess(
        link: ArtifactLink,
        previewToken?: string | null,
        principal?: ArtifactAccessPrincipal | null,
        requestSummary?: ArtifactRequestSummary
    ) {
        if (link.status === 'revoked') {
            await this.recordAccessLog(link, 'revoked', { statusCode: 410, requestSummary })
            throw new GoneException('Artifact link was revoked')
        }
        if (isExpired(link)) {
            link.status = 'expired'
            await this.linkRepository.save(link)
            await this.recordAccessLog(link, 'expired', { statusCode: 410, requestSummary })
            throw new GoneException('Artifact link expired')
        }

        const allowed = this.canAccessLink(link, previewToken, principal ?? null)
        if (!allowed) {
            await this.recordAccessLog(link, 'denied', {
                statusCode: principal?.userId ? 403 : 401,
                principalUserId: principal?.userId,
                requestSummary
            })
            if (!principal?.userId && link.accessMode !== 'public_link' && link.accessMode !== 'signed_preview') {
                throw new UnauthorizedException('Login is required to access this artifact link')
            }
            throw new ForbiddenException('You do not have access to this artifact link')
        }
    }

    /**
     * Evaluates link policy without mutating state.
     *
     * Revoked/expired transitions and audit writes are handled by assertPublicAccess;
     * this helper only answers whether the supplied principal/token is allowed.
     */
    private canAccessLink(
        link: ArtifactLink,
        previewToken?: string | null,
        principal?: ArtifactAccessPrincipal | null
    ) {
        switch (link.accessMode) {
            case 'public_link':
                return true
            case 'signed_preview':
                return this.verifySignedPreviewToken(link, previewToken)
            case 'owner_only':
                return Boolean(
                    principal?.userId && (principal.userId === link.createdById || principal.userId === link.userId)
                )
            case 'workspace_all':
            case 'organization_all':
                return sameTenantAndOrganization(link, principal)
            case 'custom_principals':
                return sameTenantAndOrganization(link, principal) && matchesCustomPrincipal(link, principal)
            default:
                return false
        }
    }

    private verifySignedPreviewToken(link: ArtifactLink, token?: string | null) {
        const normalized = normalizeOptionalString(token)
        if (!normalized || !link.tokenHash) {
            return false
        }
        return safeEqualString(link.tokenHash, digestString(normalized))
    }

    private assertAndApplyPublicLinkPolicy(
        access: ArtifactLinkAccessInput,
        scope: ArtifactsRuntimeScope
    ): string | undefined {
        if (access.mode === 'public_link' && !access.userConfirmedPublicLink) {
            throw new BadRequestException('public_link requires explicit user confirmation')
        }
        if (access.mode === 'signed_preview') {
            return createSignedPreviewToken()
        }
        if (access.mode === 'custom_principals' && !normalizeStringArray(access.customPrincipals)?.length) {
            throw new BadRequestException('custom_principals requires customPrincipals')
        }
        if (!scope.userId && access.mode === 'public_link') {
            throw new BadRequestException('public_link requires a user-scoped operation')
        }
        return undefined
    }

    private applyAccessPatch(link: ArtifactLink, access: ArtifactLinkAccessInput): string | undefined {
        const normalized = normalizeAccessInput(access)
        const token = this.assertAndApplyPublicLinkPolicy(normalized, {
            tenantId: link.tenantId,
            organizationId: link.organizationId,
            userId: RequestContext.currentUserId()
        })
        link.accessMode = normalized.mode
        link.customPrincipals = normalizeStringArray(normalized.customPrincipals)
        link.expiresAt = resolveExpiresAt(normalized)
        link.status = 'active'
        link.revokedAt = null
        link.tokenHash = normalized.mode === 'signed_preview' ? digestString(token ?? createSignedPreviewToken()) : null
        return token
    }

    private applyPresentationPatch(
        link: ArtifactLink,
        presentation: NonNullable<UpdateArtifactLinkAccessInput['presentation']>
    ) {
        if (presentation.disposition) {
            link.disposition = presentation.disposition
        }
        if (presentation.allowDownload !== undefined && presentation.allowDownload !== null) {
            link.allowDownload = presentation.allowDownload
        }
        if (presentation.safeHtmlProfile !== undefined) {
            link.safeHtmlProfile = presentation.safeHtmlProfile
        }
    }

    private async readWorkspaceArtifact(ref: WorkspacePortableFileReference) {
        const filePath = normalizeWorkspaceFilePath(ref.filePath)
        const resolved = resolveWorkspaceVolumeScope(ref, {
            tenantId: ref.tenantId,
            userId: ref.userId,
            inferUserScope: true
        })
        if (!resolved) {
            throw new BadRequestException('Unable to resolve artifact workspace scope')
        }
        const client = new VolumeSubtreeClient(this.volumeClient.resolve(resolved.volumeScope), {
            allowRootWorkspace: true
        })
        const buffer = await client.readBuffer('', filePath)
        return {
            buffer,
            name: ref.originalName ?? ref.name ?? path.posix.basename(filePath)
        }
    }

    /**
     * Allocates the externally visible Artifact link slug.
     *
     * Collisions are unlikely but still checked against the repository so the
     * unique database index does not become normal control flow.
     */
    private async createUniqueSlug() {
        for (let index = 0; index < 8; index += 1) {
            const slug = createArtifactLinkSlug()
            const existing = await this.linkRepository.findOne({ where: { slug } })
            if (!existing) {
                return slug
            }
        }
        throw new BadRequestException('Unable to allocate an artifact link slug')
    }

    /**
     * Builds the browser-facing Artifact URL from the configured public base.
     *
     * The API may be configured with a `/api` base URL locally, so this strips
     * that suffix before appending `/artifacts/share/:artifactLinkSlug`.
     */
    private buildPublicUrl(slug: string, previewToken?: string) {
        const parsed = new URL(resolveArtifactsPublicBaseUrl())
        const normalizedPathname = parsed.pathname.replace(/\/+$/, '')
        const basePath = normalizedPathname.endsWith('/api') ? normalizedPathname.slice(0, -4) : normalizedPathname
        parsed.pathname = path.posix.join(basePath || '/', 'artifacts', 'share', encodeURIComponent(slug))
        parsed.search = ''
        parsed.hash = ''
        if (previewToken) {
            parsed.searchParams.set(SIGNED_PREVIEW_QUERY_PARAM, previewToken)
        }
        return parsed.toString()
    }

    private serializeLink(
        link: ArtifactLink,
        previewToken?: string,
        artifact?: Artifact,
        version?: ArtifactVersion
    ): ArtifactLinkRecord {
        const resolvedArtifact = artifact ?? link.artifact
        return {
            id: normalizeRequiredString(link.id, 'link.id'),
            artifactId: link.artifactId,
            artifactVersionId: link.artifactVersionId,
            versionMode: link.versionMode ?? 'latest',
            slug: link.slug,
            publicUrl:
                link.accessMode === 'signed_preview' && previewToken
                    ? this.buildPublicUrl(link.slug, previewToken)
                    : link.publicUrl,
            accessMode: link.accessMode,
            status: normalizeLinkStatus(link),
            customPrincipals: link.customPrincipals ?? null,
            expiresAt: link.expiresAt ?? null,
            revokedAt: link.revokedAt ?? null,
            accessCount: link.accessCount,
            downloadCount: link.downloadCount,
            disposition: link.disposition,
            allowDownload: link.allowDownload,
            safeHtmlProfile: link.safeHtmlProfile ?? null,
            tenantId: link.tenantId,
            organizationId: link.organizationId,
            userId: link.userId,
            workspaceId: link.workspaceId,
            projectId: link.projectId,
            xpertId: link.xpertId,
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
            ...(resolvedArtifact ? { artifact: serializeArtifact(resolvedArtifact) } : {}),
            ...(version ? { version: serializeArtifactVersion(version) } : {})
        }
    }

    private async incrementCounters(link: ArtifactLink, kind: 'access' | 'download') {
        if (!link.id) {
            return
        }
        await this.linkRepository.increment({ id: link.id }, 'accessCount', 1)
        if (kind === 'download') {
            await this.linkRepository.increment({ id: link.id }, 'downloadCount', 1)
            link.downloadCount += 1
        }
        link.accessCount += 1
    }

    private async recordArtifactAccessLog(
        artifact: Artifact,
        event: ArtifactAccessEvent,
        options: {
            statusCode?: number
            error?: string
        } = {}
    ) {
        try {
            await this.accessLogRepository.save(
                this.accessLogRepository.create({
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

    private async recordAccessLog(
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
            await this.accessLogRepository.save(
                this.accessLogRepository.create({
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
}

type ArtifactJwtPayload = {
    id?: string
    tenantId?: string
}

type ArtifactHeaders = Record<string, string | string[] | undefined>

type NormalizedArtifactSource = {
    pluginName: string
    resourceType: string
    resourceId: string
    checksum?: string
}

export type ArtifactHttpRequest = {
    headers: ArtifactHeaders
    ip?: string
    ips?: string[]
    socket?: {
        remoteAddress?: string
    }
}

export type ArtifactRequestSummary = {
    ipHash?: string
    userAgent?: string
}

function normalizeSourceInput(input?: CreateArtifactInput['source']): NormalizedArtifactSource {
    if (!input) {
        throw new BadRequestException('source is required')
    }
    return {
        pluginName: normalizeRequiredString(input.pluginName, 'source.pluginName'),
        resourceType: normalizeRequiredString(input.resourceType, 'source.resourceType'),
        resourceId: normalizeRequiredString(input.resourceId, 'source.resourceId'),
        checksum: normalizeOptionalString(input.checksum)
    }
}

function normalizeAccessInput(input?: ArtifactLinkAccessInput | null): ArtifactLinkAccessInput {
    if (!input?.mode) {
        throw new BadRequestException('access.mode is required')
    }
    return {
        ...input,
        mode: input.mode
    }
}

function normalizeVersionMode(
    mode?: ArtifactLinkVersionMode | null,
    artifactVersionId?: string | null
): ArtifactLinkVersionMode {
    if (mode === 'latest' || mode === 'version') {
        return mode
    }
    return artifactVersionId ? 'version' : 'latest'
}

function normalizeWorkspaceFileReference(ref: WorkspacePortableFileReference): WorkspacePortableFileReference {
    if (ref.source !== WORKSPACE_FILES_SOURCE) {
        throw new BadRequestException('workspaceFileRef must be a platform workspace file reference')
    }
    return {
        ...ref,
        filePath: normalizeWorkspaceFilePath(ref.filePath),
        workspacePath: normalizeWorkspaceFilePath(ref.workspacePath ?? ref.filePath)
    }
}

function normalizeWorkspaceFilePath(value?: string | null) {
    const raw = normalizeRequiredString(value, 'workspace file path')
    if (raw.includes('\0')) {
        throw new BadRequestException('workspace file path contains an invalid character')
    }
    const normalized = path.posix.normalize(raw.replace(/\\/g, '/').replace(/^\/+/, ''))
    if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
        throw new BadRequestException('workspace file path is invalid')
    }
    return normalized
}

function normalizeMimeType(value?: string | null) {
    const mimeType = normalizeRequiredString(value, 'mimeType').toLowerCase()
    if (mimeType === 'image/svg+xml') {
        throw new BadRequestException('SVG artifacts cannot be shared directly')
    }
    if (ALLOWED_EXACT_MIME_TYPES.has(mimeType) || mimeType.startsWith('image/')) {
        return mimeType
    }
    throw new BadRequestException(`Unsupported artifact MIME type: ${mimeType}`)
}

function inferArtifactKind(mimeType: string): ArtifactKind {
    if (mimeType === 'text/html') return 'html'
    if (mimeType === 'text/markdown') return 'markdown'
    if (mimeType === 'application/pdf') return 'pdf'
    if (mimeType === PPTX_MIME_TYPE) return 'pptx'
    if (mimeType.startsWith('image/')) return 'image'
    return 'file'
}

function defaultSafeHtmlProfile(mimeType: string): ArtifactSafeHtmlProfile | null {
    return mimeType === 'text/html' ? 'strict' : null
}

function resolveExpiresAt(access: ArtifactLinkAccessInput) {
    if (access.expiresAt) {
        const expiresAt = access.expiresAt instanceof Date ? access.expiresAt : new Date(access.expiresAt)
        if (!Number.isFinite(expiresAt.getTime())) {
            throw new BadRequestException('access.expiresAt is invalid')
        }
        return expiresAt
    }
    if (access.ttlSeconds !== undefined && access.ttlSeconds !== null) {
        const ttlSeconds = normalizePositiveInteger(access.ttlSeconds, DEFAULT_SIGNED_PREVIEW_TTL_SECONDS)
        if (ttlSeconds > MAX_TTL_SECONDS) {
            throw new BadRequestException('access.ttlSeconds is too large')
        }
        return new Date(Date.now() + ttlSeconds * 1000)
    }
    if (access.mode === 'signed_preview') {
        return new Date(Date.now() + DEFAULT_SIGNED_PREVIEW_TTL_SECONDS * 1000)
    }
    return null
}

function serializeArtifact(artifact: Artifact, currentVersion?: ArtifactVersion | null): ArtifactRecord {
    return {
        id: normalizeRequiredString(artifact.id, 'artifact.id'),
        pluginName: artifact.pluginName,
        resourceType: artifact.resourceType,
        resourceId: artifact.resourceId,
        checksum: artifact.checksum,
        kind: artifact.kind,
        status: artifact.status,
        title: artifact.title,
        description: artifact.description,
        currentVersionId: artifact.currentVersionId,
        currentVersion: currentVersion ? serializeArtifactVersion(currentVersion) : null,
        tenantId: artifact.tenantId,
        organizationId: artifact.organizationId,
        userId: artifact.userId,
        workspaceId: artifact.workspaceId,
        projectId: artifact.projectId,
        xpertId: artifact.xpertId,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt
    }
}

function serializeArtifactVersion(version: ArtifactVersion): ArtifactVersionRecord {
    return {
        id: normalizeRequiredString(version.id, 'version.id'),
        artifactId: version.artifactId,
        versionNumber: version.versionNumber,
        status: version.status,
        sourceVersionId: version.sourceVersionId,
        checksum: version.checksum,
        mimeType: version.mimeType,
        fileName: version.fileName,
        title: version.title,
        description: version.description,
        size: version.size,
        sha256: version.sha256,
        createdAt: version.createdAt
    }
}

function normalizeLinkStatus(link: ArtifactLink): ArtifactLinkStatus {
    if (link.status === 'active' && isExpired(link)) {
        return 'expired'
    }
    return link.status
}

function isExpired(link: Pick<ArtifactLink, 'expiresAt'>) {
    return Boolean(link.expiresAt && link.expiresAt.getTime() <= Date.now())
}

function sameTenantAndOrganization(
    link: Pick<ArtifactLink, 'tenantId' | 'organizationId'>,
    principal?: ArtifactAccessPrincipal | null
) {
    return Boolean(
        principal?.tenantId &&
        principal.tenantId === link.tenantId &&
        principal.organizationId &&
        principal.organizationId === link.organizationId
    )
}

function matchesCustomPrincipal(
    link: Pick<ArtifactLink, 'customPrincipals'>,
    principal?: ArtifactAccessPrincipal | null
) {
    const customPrincipals = normalizeStringArray(link.customPrincipals) ?? []
    const candidates = [
        principal?.userId,
        principal?.userId ? `user:${principal.userId}` : null,
        principal?.organizationId ? `organization:${principal.organizationId}` : null
    ].filter((item): item is string => Boolean(item))
    return candidates.some((candidate) => customPrincipals.includes(candidate))
}

/** Resolves the host used in copied Artifact links, preferring the frontend origin. */
function resolveArtifactsPublicBaseUrl() {
    return (
        normalizeOptionalString(process.env.PUBLIC_BASE_URL) ??
        normalizeOptionalString(process.env.ARTIFACTS_PUBLIC_BASE_URL) ??
        normalizeOptionalString(environment.clientBaseUrl) ??
        normalizeOptionalString(environment.baseUrl) ??
        'http://localhost:3000'
    )
}

function artifactToScope(
    artifact: Artifact
): Required<Pick<ArtifactsRuntimeScope, 'tenantId'>> & ArtifactsRuntimeScope {
    return {
        tenantId: normalizeRequiredString(artifact.tenantId, 'artifact.tenantId'),
        organizationId: artifact.organizationId,
        userId: artifact.userId,
        workspaceId: artifact.workspaceId,
        projectId: artifact.projectId,
        xpertId: artifact.xpertId
    }
}

/** Creates a short-lived bearer token for signed Artifact previews. */
function createSignedPreviewToken() {
    return randomBytes(24).toString('base64url')
}

/** Creates one URL-safe, non-guessable Artifact link slug. */
function createArtifactLinkSlug() {
    const bytes = randomBytes(ARTIFACT_LINK_SLUG_LENGTH)
    let slug = ''
    for (const byte of bytes) {
        slug += ARTIFACT_LINK_SLUG_ALPHABET[byte % ARTIFACT_LINK_SLUG_ALPHABET.length]
    }
    return slug
}

function digestBuffer(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex')
}

function digestString(value: string) {
    return createHash('sha256').update(value).digest('hex')
}

function hashString(value?: string | null) {
    return value ? digestString(value) : undefined
}

function safeEqualString(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function normalizeRequiredString(value: unknown, field: string) {
    const normalized = normalizeOptionalString(value)
    if (!normalized) {
        throw new BadRequestException(`${field} is required`)
    }
    return normalized
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringArray(value?: string[] | null) {
    const result = Array.isArray(value)
        ? value.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))
        : []
    return result.length ? Array.from(new Set(result)) : null
}

function normalizePositiveInteger(value: unknown, fallback: number) {
    const numberValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
        return fallback
    }
    return Math.trunc(numberValue)
}

function getHeaderValue(headers: ArtifactHeaders, key: string) {
    const value = headers[key] ?? headers[key.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
}

function extractBearerToken(headers: ArtifactHeaders) {
    const authorization = getHeaderValue(headers, 'authorization')
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]
}

function getRequestIp(request: ArtifactHttpRequest) {
    return request.ips?.[0] ?? request.ip ?? request.socket?.remoteAddress
}
