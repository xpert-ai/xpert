import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import {
    BadRequestException,
    ForbiddenException,
    GoneException,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
    UnauthorizedException
} from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import type { ArtifactAccessEvent, IUser } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { RequestContext as ServerRequestContext, UserOrganizationService, UserService } from '@xpert-ai/server-core'
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
    ArtifactShareInput,
    ArtifactShareKeyInput,
    CreateArtifactInput,
    CreateArtifactLinkInput,
    CreateArtifactVersionInput,
    CreateSignedArtifactPreviewLinkInput,
    EnsureArtifactShareResult,
    EnsureArtifactVersionInput,
    EnsureArtifactVersionResult,
    FindArtifactBySourceInput,
    ListArtifactVersionsInput,
    ListArtifactsInput,
    ListArtifactsResult,
    RequestContext,
    UpdateArtifactLinkAccessInput,
    WORKSPACE_FILES_SOURCE,
    WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { sign, verify } from 'jsonwebtoken'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { resolveWorkspaceVolumeScope } from '../file-understanding'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { Artifact, ArtifactAccessLog, ArtifactLink, ArtifactVersion } from './entities'

const SIGNED_PREVIEW_QUERY_PARAM = 'xpert_artifact_preview'
const DEFAULT_SIGNED_PREVIEW_TTL_SECONDS = 15 * 60
export const ARTIFACT_SHARE_SESSION_COOKIE = 'xpert_artifact_share_session'
export const ARTIFACT_SHARE_SESSION_TTL_SECONDS = 15 * 60
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

export type ArtifactManagementResolvedVersion = {
    artifact: ArtifactRecord
    version: ArtifactVersionRecord
    buffer: Buffer
    mimeType: string
    fileName: string
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
        private readonly volumeClient: VolumeClient,
        @Optional()
        private readonly userOrganizationService?: UserOrganizationService,
        @Optional()
        private readonly workspaceAccessService?: XpertWorkspaceAccessService,
        @Optional()
        private readonly userService?: UserService,
        @Optional()
        @InjectDataSource()
        private readonly dataSource?: DataSource
    ) {}

    createScopedApi(defaults: ArtifactsRuntimeScope): ArtifactsApi {
        return {
            createArtifact: (input) => this.createArtifactWithDefaults(input, defaults),
            findArtifactBySource: (input) => this.findArtifactBySourceWithDefaults(input, defaults),
            createArtifactVersion: (input) => this.createArtifactVersionWithDefaults(input, defaults),
            listArtifactVersions: (input) => this.listArtifactVersionsWithDefaults(input, defaults),
            ensureArtifactVersion: (input) => this.ensureArtifactVersionWithDefaults(input, defaults),
            getArtifact: (idOrSlug) => this.getArtifactWithDefaults(idOrSlug, defaults),
            listArtifacts: (input) => this.listArtifactsWithDefaults(input, defaults),
            archiveArtifact: (idOrSlug) => this.archiveArtifactWithDefaults(idOrSlug, defaults),
            deleteArtifact: (idOrSlug) => this.deleteArtifactWithDefaults(idOrSlug, defaults),
            createArtifactLink: (input) => this.createArtifactLinkWithDefaults(input, defaults),
            getArtifactShare: (input) => this.getArtifactShareWithDefaults(input, defaults),
            ensureArtifactShare: (input) => this.ensureArtifactShareWithDefaults(input, defaults),
            revokeArtifactShare: (input) => this.revokeArtifactShareWithDefaults(input, defaults),
            createSignedPreviewLink: (input) => this.createSignedPreviewLinkWithDefaults(input, defaults),
            updateArtifactLinkAccess: (idOrSlug, patch) =>
                this.updateArtifactLinkAccessWithDefaults(idOrSlug, patch, defaults),
            revokeArtifactLink: (idOrSlug) => this.revokeArtifactLinkWithDefaults(idOrSlug, defaults)
        }
    }

    async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
        return this.createArtifactWithDefaults(input, {})
    }

    async findArtifactBySource(input: FindArtifactBySourceInput): Promise<ArtifactRecord | null> {
        return this.findArtifactBySourceWithDefaults(input, {})
    }

    async createArtifactVersion(input: CreateArtifactVersionInput): Promise<ArtifactVersionRecord> {
        return this.createArtifactVersionWithDefaults(input, {})
    }

    async listArtifactVersions(input: ListArtifactVersionsInput): Promise<ArtifactVersionRecord[]> {
        return this.listArtifactVersionsWithDefaults(input, {})
    }

    async ensureArtifactVersion(input: EnsureArtifactVersionInput): Promise<EnsureArtifactVersionResult> {
        return this.ensureArtifactVersionWithDefaults(input, {})
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

    async getArtifactShare(input: ArtifactShareKeyInput): Promise<ArtifactLinkRecord | null> {
        return this.getArtifactShareWithDefaults(input, {})
    }

    async ensureArtifactShare(input: ArtifactShareInput): Promise<EnsureArtifactShareResult> {
        return this.ensureArtifactShareWithDefaults(input, {})
    }

    async revokeArtifactShare(input: ArtifactShareKeyInput): Promise<ArtifactLinkRecord | null> {
        return this.revokeArtifactShareWithDefaults(input, {})
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

    async resolveForManagementAccess(input: {
        artifactId: string
        artifactVersionId: string
    }): Promise<ArtifactManagementResolvedVersion> {
        const artifact = await this.resolveScopedArtifact(input.artifactId, {}, true)
        if (artifact.status !== 'active') {
            throw new GoneException('Artifact is no longer active')
        }
        const version = await this.resolveRequestedVersion(artifact, 'version', input.artifactVersionId)
        const file = await this.readWorkspaceArtifact(version.workspaceFileRef)
        const sha256 = digestBuffer(file.buffer)
        if (version.sha256 && !safeEqualString(version.sha256, sha256)) {
            throw new GoneException('Artifact content checksum mismatch')
        }
        return {
            artifact: serializeArtifact(artifact, version),
            version: serializeArtifactVersion(version),
            buffer: file.buffer,
            mimeType: version.mimeType,
            fileName: version.fileName ?? file.name
        }
    }

    async resolveForPublicAccess(input: {
        slug: string
        download?: boolean
        previewToken?: string | null
        principal?: ArtifactAccessPrincipal | null
        authenticatedUser?: IUser | null
        requestSummary?: ArtifactRequestSummary
    }): Promise<ArtifactResolvedVersion> {
        return this.resolveArtifactLink(input)
    }

    async resolveForAuthenticatedAccess(input: {
        slug: string
        requestSummary?: ArtifactRequestSummary
    }): Promise<ArtifactResolvedVersion> {
        const user = ServerRequestContext.currentUser()
        if (!user?.id || !user.tenantId) {
            throw new UnauthorizedException('Login is required to access this artifact link')
        }
        return this.resolveArtifactLink({
            slug: input.slug,
            principal: { userId: user.id, tenantId: user.tenantId },
            authenticatedUser: user,
            requestSummary: input.requestSummary
        })
    }

    private async resolveArtifactLink(input: {
        slug: string
        download?: boolean
        previewToken?: string | null
        principal?: ArtifactAccessPrincipal | null
        authenticatedUser?: IUser | null
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

        await this.assertPublicAccess(
            link,
            input.previewToken,
            input.principal ?? null,
            input.requestSummary,
            input.authenticatedUser ?? null
        )
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
        if (!token) {
            return {}
        }
        try {
            const payload = verify(token, environment.JWT_SECRET) as ArtifactJwtPayload
            return {
                userId: normalizeOptionalString(payload.id),
                tenantId: normalizeOptionalString(payload.tenantId)
            }
        } catch {
            return {}
        }
    }

    async resolveAccessContextFromRequest(request: ArtifactHttpRequest): Promise<{
        principal: ArtifactAccessPrincipal
        authenticatedUser?: IUser | null
    }> {
        const bearerToken = extractBearerToken(request.headers)
        if (bearerToken) {
            try {
                const payload = verify(bearerToken, environment.JWT_SECRET) as ArtifactJwtPayload
                const user = await this.loadAuthenticatedUser(payload)
                if (user?.id && user.tenantId) {
                    return {
                        principal: { userId: user.id, tenantId: user.tenantId },
                        authenticatedUser: user
                    }
                }
            } catch {
                return { principal: {} }
            }
        }

        const sessionToken = readCookie(request.headers, ARTIFACT_SHARE_SESSION_COOKIE)
        if (!sessionToken) return { principal: {} }
        try {
            const payload = verify(sessionToken, artifactShareSessionSecret()) as ArtifactShareSessionPayload
            if (payload.purpose !== 'artifact_share' || !payload.id || !payload.tenantId) {
                return { principal: {} }
            }
            const user = await this.loadAuthenticatedUser(payload)
            if (!user?.id || user.tenantId !== payload.tenantId) {
                return { principal: {} }
            }
            return {
                principal: { userId: user.id, tenantId: user.tenantId },
                authenticatedUser: user
            }
        } catch {
            return { principal: {} }
        }
    }

    async createArtifactShareSession(input: {
        slug: string
        requestSummary?: ArtifactRequestSummary
    }): Promise<{ token: string; publicUrl: string }> {
        const user = ServerRequestContext.currentUser()
        if (!user?.id || !user.tenantId) {
            throw new UnauthorizedException('Login is required to access this artifact link')
        }
        const link = await this.linkRepository.findOne({
            where: { slug: normalizeRequiredString(input.slug, 'slug') },
            relations: ['artifact']
        })
        if (!link?.artifact) {
            throw new NotFoundException('Artifact link was not found')
        }
        await this.assertPublicAccess(
            link,
            null,
            { userId: user.id, tenantId: user.tenantId },
            input.requestSummary,
            user
        )
        if (link.artifact.status !== 'active') {
            throw new GoneException('Artifact is no longer active')
        }
        const publicUrl = this.buildPublicUrl(link.slug)
        if (link.publicUrl !== publicUrl) {
            link.publicUrl = publicUrl
            await this.linkRepository.save(link)
        }
        return {
            token: sign(
                {
                    purpose: 'artifact_share',
                    id: user.id,
                    tenantId: user.tenantId
                } satisfies ArtifactShareSessionPayload,
                artifactShareSessionSecret(),
                { expiresIn: ARTIFACT_SHARE_SESSION_TTL_SECONDS }
            ),
            publicUrl
        }
    }

    private async loadAuthenticatedUser(payload: ArtifactJwtPayload) {
        if (!this.userService) return null
        try {
            return payload.thirdPartyId
                ? await this.userService.getIfExistsThirdParty(payload.thirdPartyId)
                : payload.id
                  ? await this.userService.getIfExists(payload.id)
                  : null
        } catch {
            return null
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
        if (existing) {
            existing.status = 'active'
            existing.kind = input.kind ?? existing.kind
            existing.checksum = source.checksum ?? existing.checksum
            existing.title = normalizeOptionalString(input.title) ?? existing.title
            existing.description = normalizeOptionalString(input.description) ?? existing.description
            existing.metadata = input.metadata ?? existing.metadata ?? null
            return serializeArtifact(await this.artifactRepository.save(existing))
        }

        const candidate = this.artifactRepository.create({
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
        try {
            return serializeArtifact(await this.artifactRepository.save(candidate))
        } catch (error) {
            if (!isUniqueConstraintError(error)) throw error
            const concurrent = await this.findExistingArtifact(source, scope)
            if (!concurrent) throw error
            concurrent.status = 'active'
            concurrent.kind = input.kind ?? concurrent.kind
            concurrent.checksum = source.checksum ?? concurrent.checksum
            concurrent.title = normalizeOptionalString(input.title) ?? concurrent.title
            concurrent.description = normalizeOptionalString(input.description) ?? concurrent.description
            concurrent.metadata = input.metadata ?? concurrent.metadata ?? null
            return serializeArtifact(await this.artifactRepository.save(concurrent))
        }
    }

    private async findArtifactBySourceWithDefaults(
        input: FindArtifactBySourceInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactRecord | null> {
        const source = normalizeSourceInput(input)
        const scope = this.resolveCurrentScope(defaults)
        const artifact = await this.findExistingArtifact(source, scope)
        if (!artifact || (!input.includeDeleted && artifact.status === 'deleted')) {
            return null
        }
        return serializeArtifact(artifact, await this.findCurrentVersion(artifact))
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

    private async listArtifactVersionsWithDefaults(
        input: ListArtifactVersionsInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactVersionRecord[]> {
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults, true)
        const versions = await this.versionRepository.find({
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

    private async ensureArtifactVersionWithDefaults(
        input: EnsureArtifactVersionInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<EnsureArtifactVersionResult> {
        const idempotencyKey = normalizeRequiredString(input.idempotencyKey, 'idempotencyKey')
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults)
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

        return this.withLockedArtifact(artifact, async (lockedArtifact, repositories) => {
            const artifactId = normalizeRequiredString(lockedArtifact.id, 'artifact.id')
            const existing = await repositories.version.findOne({ where: { artifactId, idempotencyKey } })
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
                    createdById: defaults.userId ?? lockedArtifact.userId ?? undefined,
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
        } else {
            qb.andWhere('artifact.organizationId IS NULL')
        }
        if (scope.userId) {
            qb.andWhere('(artifact.userId IS NULL OR artifact.userId = :userId)', { userId: scope.userId })
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
        return this.createArtifactLinkRecord(artifact, input, defaults, this.repositories())
    }

    private async createArtifactLinkRecord(
        artifact: Artifact,
        input: CreateArtifactLinkInput,
        defaults: ArtifactsRuntimeScope,
        repositories: ArtifactRepositories,
        shareKey?: string
    ): Promise<ArtifactLinkRecord> {
        const versionMode = normalizeVersionMode(input.versionMode, input.artifactVersionId)
        const version = await this.resolveRequestedVersionFromRepository(
            artifact,
            versionMode,
            input.artifactVersionId,
            repositories.version
        )
        const access = normalizeAccessInput(input.access)
        const scope = artifactToScope(artifact)
        const token = this.assertAndApplyPublicLinkPolicy(access, {
            ...scope,
            userId: defaults.userId ?? artifact.userId
        })
        const slug = await this.createUniqueSlug()
        const link = repositories.link.create({
            ...scope,
            createdById: defaults.userId ?? artifact.userId ?? undefined,
            artifactId: normalizeRequiredString(artifact.id, 'artifact.id'),
            artifact,
            shareKey: normalizeOptionalString(shareKey),
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
        const saved = await repositories.link.save(link)
        return this.serializeLink(saved, token, artifact, version)
    }

    private async getArtifactShareWithDefaults(
        input: ArtifactShareKeyInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord | null> {
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults, true)
        const shareKey = normalizeRequiredString(input.shareKey, 'shareKey')
        const link = await this.linkRepository.findOne({
            where: {
                artifactId: normalizeRequiredString(artifact.id, 'artifact.id'),
                shareKey,
                status: 'active'
            },
            relations: ['artifact']
        })
        if (!link) return null
        if (isExpired(link)) {
            link.status = 'expired'
            await this.linkRepository.save(link)
            return null
        }
        const version = await this.resolveLinkVersion(link, artifact)
        return this.serializeLink(link, undefined, artifact, version)
    }

    private async ensureArtifactShareWithDefaults(
        input: ArtifactShareInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<EnsureArtifactShareResult> {
        const shareKey = normalizeRequiredString(input.shareKey, 'shareKey')
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults)
        const access = normalizeAccessInput(input.access)
        this.assertAndApplyPublicLinkPolicy(access, {
            ...artifactToScope(artifact),
            userId: defaults.userId ?? artifact.userId
        })

        return this.withLockedArtifact(artifact, async (lockedArtifact, repositories) => {
            const artifactId = normalizeRequiredString(lockedArtifact.id, 'artifact.id')
            const versionMode = normalizeVersionMode(input.versionMode, input.artifactVersionId)
            const version = await this.resolveRequestedVersionFromRepository(
                lockedArtifact,
                versionMode,
                input.artifactVersionId,
                repositories.version
            )
            const current = await repositories.link.findOne({
                where: { artifactId, shareKey, status: 'active' },
                relations: ['artifact']
            })
            if (current && isExpired(current)) {
                current.status = 'expired'
                await repositories.link.save(current)
            }
            const active = current && current.status === 'active' ? current : null
            if (active && linkMatchesShare(active, input, versionMode, version)) {
                const canonicalUrl = this.buildPublicUrl(active.slug)
                if (active.publicUrl !== canonicalUrl) {
                    active.publicUrl = canonicalUrl
                    await repositories.link.save(active)
                }
                return {
                    link: this.serializeLink(active, undefined, lockedArtifact, version),
                    outcome: 'reused'
                }
            }

            const replacedLinkId = active?.id ?? null
            if (active) {
                active.status = 'revoked'
                active.revokedAt = new Date()
                await repositories.link.save(active)
                await this.recordAccessLog(active, 'revoked', { statusCode: 200 })
            }
            const link = await this.createArtifactLinkRecord(lockedArtifact, input, defaults, repositories, shareKey)
            return {
                link,
                outcome: replacedLinkId ? 'replaced' : 'created',
                ...(replacedLinkId ? { replacedLinkId } : {})
            }
        })
    }

    private async revokeArtifactShareWithDefaults(
        input: ArtifactShareKeyInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord | null> {
        const artifact = await this.resolveScopedArtifact(input.artifactId, defaults, true)
        const shareKey = normalizeRequiredString(input.shareKey, 'shareKey')
        const link = await this.linkRepository.findOne({
            where: {
                artifactId: normalizeRequiredString(artifact.id, 'artifact.id'),
                shareKey,
                status: 'active'
            }
        })
        if (!link) return null
        link.status = 'revoked'
        link.revokedAt = new Date()
        const saved = await this.linkRepository.save(link)
        await this.recordAccessLog(saved, 'revoked', { statusCode: 200 })
        return this.serializeLink(saved, undefined, artifact)
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
        if (patch.access) {
            link.publicUrl = this.buildPublicUrl(link.slug)
        }
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
        const candidates = await this.artifactRepository.find({
            where: {
                tenantId: scope.tenantId,
                pluginName: source.pluginName,
                resourceType: source.resourceType,
                resourceId: source.resourceId
            }
        })
        return (
            candidates.find(
                (artifact) =>
                    normalizeOptionalString(artifact.organizationId) ===
                        normalizeOptionalString(scope.organizationId) &&
                    normalizeOptionalString(artifact.userId) === normalizeOptionalString(scope.userId)
            ) ?? null
        )
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
        if (normalizeOptionalString(artifact.organizationId) !== normalizeOptionalString(scope.organizationId)) {
            throw new NotFoundException('Artifact was not found')
        }
        if (artifact.userId && artifact.userId !== scope.userId) {
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
        } else {
            qb.andWhere('link.organizationId IS NULL')
        }
        if (scope.userId) {
            qb.andWhere('(artifact.userId IS NULL OR artifact.userId = :userId)', { userId: scope.userId })
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
        return this.resolveRequestedVersionFromRepository(
            artifact,
            versionMode,
            artifactVersionId,
            this.versionRepository
        )
    }

    private async resolveRequestedVersionFromRepository(
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

    private repositories(manager?: EntityManager): ArtifactRepositories {
        return manager
            ? {
                  artifact: manager.getRepository(Artifact),
                  version: manager.getRepository(ArtifactVersion),
                  link: manager.getRepository(ArtifactLink)
              }
            : {
                  artifact: this.artifactRepository,
                  version: this.versionRepository,
                  link: this.linkRepository
              }
    }

    private async withLockedArtifact<T>(
        artifact: Artifact,
        operation: (artifact: Artifact, repositories: ArtifactRepositories) => Promise<T>
    ): Promise<T> {
        if (!this.dataSource?.isInitialized) {
            return operation(artifact, this.repositories())
        }
        return this.dataSource.transaction(async (manager) => {
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

    private async resolveLinkVersion(link: ArtifactLink, artifact: Artifact) {
        return this.resolveRequestedVersion(artifact, link.versionMode ?? 'latest', link.artifactVersionId)
    }

    private async assertPublicAccess(
        link: ArtifactLink,
        previewToken?: string | null,
        principal?: ArtifactAccessPrincipal | null,
        requestSummary?: ArtifactRequestSummary,
        authenticatedUser?: IUser | null
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

        const allowed = await this.canAccessLink(link, previewToken, principal ?? null, authenticatedUser ?? null)
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
    private async canAccessLink(
        link: ArtifactLink,
        previewToken?: string | null,
        principal?: ArtifactAccessPrincipal | null,
        authenticatedUser?: IUser | null
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
            case 'organization_all':
                return this.hasOrganizationAccess(link, principal)
            case 'workspace_all':
                return this.hasWorkspaceAccess(link, principal, authenticatedUser)
            case 'custom_principals':
                return sameTenantAndOrganization(link, principal) && matchesCustomPrincipal(link, principal)
            default:
                return false
        }
    }

    private async hasOrganizationAccess(link: ArtifactLink, principal?: ArtifactAccessPrincipal | null) {
        if (!sameTenant(link, principal) || !principal?.userId || !link.organizationId) {
            return false
        }
        const membership = await this.userOrganizationService?.findMembershipByUserAndOrganization({
            organizationId: link.organizationId,
            tenantId: link.tenantId,
            userId: principal.userId
        })
        return Boolean(membership?.isActive)
    }

    private async hasWorkspaceAccess(
        link: ArtifactLink,
        principal?: ArtifactAccessPrincipal | null,
        authenticatedUser?: IUser | null
    ) {
        const workspaceId = link.workspaceId
        if (
            !sameTenant(link, principal) ||
            !principal?.userId ||
            !workspaceId ||
            authenticatedUser?.id !== principal.userId ||
            !this.workspaceAccessService
        ) {
            return false
        }
        const context = captureRequestContext({
            tenantId: link.tenantId,
            organizationId: link.organizationId,
            user: authenticatedUser
        })
        try {
            await runWithCapturedRequestContext(context, () => this.workspaceAccessService.assertCanRead(workspaceId))
            return true
        } catch {
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
        if (access.mode === 'organization_all' && !scope.organizationId) {
            throw new BadRequestException('organization_all requires an organization-scoped Artifact')
        }
        if (access.mode === 'workspace_all' && !scope.workspaceId) {
            throw new BadRequestException('workspace_all requires a workspace-scoped Artifact')
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
            userId: RequestContext.currentUserId(),
            workspaceId: link.workspaceId,
            projectId: link.projectId,
            xpertId: link.xpertId
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
            shareKey: link.shareKey,
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
            metadata: link.metadata ?? null,
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

type ArtifactRepositories = {
    artifact: Repository<Artifact>
    version: Repository<ArtifactVersion>
    link: Repository<ArtifactLink>
}

function linkMatchesShare(
    link: ArtifactLink,
    input: ArtifactShareInput,
    versionMode: ArtifactLinkVersionMode,
    version: ArtifactVersion
) {
    if (input.access.mode === 'signed_preview') return false
    const presentation = input.presentation
    const expiresAt = resolveExpiresAt(input.access)
    const linkPrincipals = normalizeStringArray(link.customPrincipals) ?? []
    const inputPrincipals = normalizeStringArray(input.access.customPrincipals) ?? []
    return (
        link.status === 'active' &&
        link.accessMode === input.access.mode &&
        link.versionMode === versionMode &&
        (versionMode === 'latest' || link.artifactVersionId === version.id) &&
        linkPrincipals.length === inputPrincipals.length &&
        [...linkPrincipals].sort().every((principal, index) => principal === [...inputPrincipals].sort()[index]) &&
        (link.expiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null) &&
        link.disposition === (presentation?.disposition ?? 'inline') &&
        link.allowDownload === (presentation?.allowDownload ?? true) &&
        (link.safeHtmlProfile ?? null) ===
            (presentation?.safeHtmlProfile ?? defaultSafeHtmlProfile(version.mimeType) ?? null)
    )
}

type ArtifactJwtPayload = {
    id?: string
    tenantId?: string
    thirdPartyId?: string
}

type ArtifactShareSessionPayload = {
    purpose: 'artifact_share'
    id: string
    tenantId: string
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
        metadata: artifact.metadata ?? null,
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
        idempotencyKey: version.idempotencyKey,
        sourceVersionId: version.sourceVersionId,
        checksum: version.checksum,
        mimeType: version.mimeType,
        fileName: version.fileName,
        title: version.title,
        description: version.description,
        size: version.size,
        sha256: version.sha256,
        workspaceFileRef: version.workspaceFileRef,
        metadata: version.metadata ?? null,
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

function sameTenant(link: Pick<ArtifactLink, 'tenantId'>, principal?: ArtifactAccessPrincipal | null) {
    return Boolean(principal?.tenantId && principal.tenantId === link.tenantId)
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

function isUniqueConstraintError(error: unknown) {
    if (!(error instanceof Error)) return false
    const code = Reflect.get(error, 'code')
    return (
        code === '23505' ||
        code === 1062 ||
        code === 'SQLITE_CONSTRAINT' ||
        /duplicate key|unique constraint|duplicate entry/i.test(error.message)
    )
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

function readCookie(headers: ArtifactHeaders, name: string) {
    const cookieHeader = getHeaderValue(headers, 'cookie')
    if (!cookieHeader) return undefined
    for (const pair of cookieHeader.split(';')) {
        const separator = pair.indexOf('=')
        if (separator < 0 || pair.slice(0, separator).trim() !== name) continue
        const value = pair.slice(separator + 1).trim()
        try {
            return decodeURIComponent(value)
        } catch {
            return undefined
        }
    }
    return undefined
}

function artifactShareSessionSecret() {
    return normalizeOptionalString(process.env.ARTIFACT_SHARE_SESSION_SECRET) ?? environment.JWT_SECRET
}

function getRequestIp(request: ArtifactHttpRequest) {
    return request.ips?.[0] ?? request.ip ?? request.socket?.remoteAddress
}
