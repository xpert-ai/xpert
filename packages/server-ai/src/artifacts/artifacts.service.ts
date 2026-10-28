import { readArtifactVersion } from './artifact-version-reader'
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
import {
    ArtifactLinkAccessInput,
    ArtifactLinkRecord,
    ArtifactRecord,
    ArtifactsApi,
    ArtifactShareInput,
    ArtifactShareKeyInput,
    ArtifactsRuntimeCapability,
    ArtifactVersionRecord,
    CreateArtifactInput,
    CreateArtifactLinkInput,
    CreateArtifactVersionInput,
    CreateSignedArtifactPreviewLinkInput,
    EnsureArtifactShareResult,
    EnsureArtifactVersionInput,
    EnsureArtifactVersionResult,
    FindArtifactBySourceInput,
    ListArtifactsInput,
    ListArtifactsResult,
    ListArtifactVersionsInput,
    RequestContext,
    UpdateArtifactLinkAccessInput
} from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import { RequestContext as ServerRequestContext, UserOrganizationService, UserService } from '@xpert-ai/server-core'
import { sign, verify } from 'jsonwebtoken'
import { DataSource, Repository } from 'typeorm'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { RuntimeCapabilityProvider } from '../shared/runtime/runtime-capability-provider.decorator'
import { VOLUME_CLIENT, VolumeClient } from '../shared/volume'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { ArtifactContentAccess } from './artifact-content-access'
import { ArtifactLinkPresentation } from './artifact-link-presentation'
import { ArtifactPersistence } from './artifact-persistence'
import { serializeArtifact, serializeArtifactVersion } from './artifact-records'
import type {
    ArtifactAccessPrincipal,
    ArtifactHttpRequest,
    ArtifactJwtPayload,
    ArtifactManagementResolvedVersion,
    ArtifactRepositories,
    ArtifactRequestSummary,
    ArtifactResolvedVersion,
    ArtifactSharedDescriptor,
    ArtifactShareSessionPayload,
    ArtifactsRuntimeScope
} from './artifact-service.types'
import {
    ARTIFACT_SHARE_SESSION_COOKIE,
    ARTIFACT_SHARE_SESSION_TTL_SECONDS,
    artifactToScope,
    createSignedPreviewToken,
    DEFAULT_SIGNED_PREVIEW_TTL_SECONDS,
    defaultSafeHtmlProfile,
    digestBuffer,
    digestString,
    extractBearerToken,
    getHeaderValue,
    getRequestIp,
    hashString,
    isExpired,
    linkMatchesShare,
    matchesCustomPrincipal,
    normalizeAccessInput,
    normalizeOptionalString,
    normalizeRequiredString,
    normalizeStringArray,
    normalizeVersionMode,
    readCookie,
    resolveExpiresAt,
    safeEqualString,
    sameTenant,
    sameTenantAndOrganization
} from './artifact-utils'
import { Artifact, ArtifactAccessLog, ArtifactLink, ArtifactVersion } from './entities'
import { ArtifactTypesService } from './types/artifact-types.service'
export type {
    ArtifactAccessPrincipal,
    ArtifactHeaders,
    ArtifactHttpRequest,
    ArtifactJwtPayload,
    ArtifactManagementResolvedVersion,
    ArtifactRepositories,
    ArtifactRequestSummary,
    ArtifactResolvedVersion,
    ArtifactSharedDescriptor,
    ArtifactShareSessionPayload,
    ArtifactsRuntimeScope,
    NormalizedArtifactSource
} from './artifact-service.types'
export { ARTIFACT_SHARE_SESSION_COOKIE, ARTIFACT_SHARE_SESSION_TTL_SECONDS } from './artifact-utils'

@Injectable()
@RuntimeCapabilityProvider(ArtifactsRuntimeCapability)
export class ArtifactsService implements ArtifactsApi {
    private readonly persistence: ArtifactPersistence
    private readonly presentation: ArtifactLinkPresentation
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
        private readonly dataSource?: DataSource,
        @Optional() private readonly contentAccess?: ArtifactContentAccess,
        private readonly sourcePolicies: ArtifactTypesService = undefined
    ) {
        if (!sourcePolicies) throw new Error('Artifact type service is required')
        this.presentation = new ArtifactLinkPresentation(sourcePolicies, resolveArtifactsPublicBaseUrl)
        this.persistence = new ArtifactPersistence({
            artifact: artifactRepository,
            version: versionRepository,
            link: linkRepository,
            logs: accessLogRepository,
            volume: volumeClient,
            data: dataSource,
            access: contentAccess,
            policies: sourcePolicies
        })
    }

    createScopedApi(defaults: ArtifactsRuntimeScope): ArtifactsApi {
        return {
            readArtifactVersion: (input) => this.readArtifactVersion(input, defaults),
            createArtifact: (input) => this.persistence.createArtifactWithDefaults(input, defaults),
            findArtifactBySource: (input) => this.persistence.findArtifactBySourceWithDefaults(input, defaults),
            createArtifactVersion: (input) => this.persistence.createArtifactVersionWithDefaults(input, defaults),
            listArtifactVersions: (input) => this.persistence.listArtifactVersionsWithDefaults(input, defaults),
            ensureArtifactVersion: (input) => this.persistence.ensureArtifactVersionWithDefaults(input, defaults),
            getArtifact: (idOrSlug) => this.persistence.getArtifactWithDefaults(idOrSlug, defaults),
            listArtifacts: (input) => this.persistence.listArtifactsWithDefaults(input, defaults),
            archiveArtifact: (idOrSlug) => this.persistence.archiveArtifactWithDefaults(idOrSlug, defaults),
            deleteArtifact: (idOrSlug) => this.persistence.deleteArtifactWithDefaults(idOrSlug, defaults),
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
        return this.persistence.createArtifactWithDefaults(input, {})
    }

    async findArtifactBySource(input: FindArtifactBySourceInput): Promise<ArtifactRecord | null> {
        return this.persistence.findArtifactBySourceWithDefaults(input, {})
    }

    async createArtifactVersion(input: CreateArtifactVersionInput): Promise<ArtifactVersionRecord> {
        return this.persistence.createArtifactVersionWithDefaults(input, {})
    }

    async listArtifactVersions(input: ListArtifactVersionsInput): Promise<ArtifactVersionRecord[]> {
        return this.persistence.listArtifactVersionsWithDefaults(input, {})
    }

    async ensureArtifactVersion(input: EnsureArtifactVersionInput): Promise<EnsureArtifactVersionResult> {
        return this.persistence.ensureArtifactVersionWithDefaults(input, {})
    }

    async getArtifact(idOrSlug: string): Promise<ArtifactRecord> {
        return this.persistence.getArtifactWithDefaults(idOrSlug, {})
    }

    async listArtifacts(input: ListArtifactsInput = {}): Promise<ListArtifactsResult> {
        return this.persistence.listArtifactsWithDefaults(input, {})
    }

    async archiveArtifact(idOrSlug: string): Promise<ArtifactRecord> {
        return this.persistence.archiveArtifactWithDefaults(idOrSlug, {})
    }

    async deleteArtifact(idOrSlug: string): Promise<ArtifactRecord> {
        return this.persistence.deleteArtifactWithDefaults(idOrSlug, {})
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
        return this.readArtifactVersion({ ...input, purpose: 'view' })
    }

    async readArtifactVersion(
        input: {
            artifactId: string
            artifactVersionId: string
            purpose: 'view' | 'copy'
        },
        defaults: ArtifactsRuntimeScope = {}
    ): Promise<ArtifactManagementResolvedVersion> {
        return readArtifactVersion(this.persistence, this.sourcePolicies, input, defaults)
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

    async assertPublishedTarget(input: Parameters<ArtifactsService['resolveForPublicAccess']>[0], versionId: string) {
        const current = await this.authorizeArtifactLink(input)
        if (current.version.id !== versionId) throw new GoneException('Artifact link changed while reading')
    }

    async resolveDescriptorForPublicAccess(input: {
        slug: string
        previewToken?: string | null
        principal?: ArtifactAccessPrincipal | null
        authenticatedUser?: IUser | null
        requestSummary?: ArtifactRequestSummary
    }): Promise<ArtifactSharedDescriptor> {
        const { link, artifact, version } = await this.authorizeArtifactLink(input)
        // Source policies decide which metadata may be disclosed.
        this.sourcePolicies.assertDescriptor(artifact)
        const sharedLink = this.presentation.serializeLink(link)
        sharedLink.artifact = undefined
        sharedLink.version = undefined
        const sharedVersion = serializeArtifactVersion(version)
        sharedVersion.workspaceFileRef = undefined
        return {
            link: sharedLink,
            artifact: serializeArtifact(artifact),
            version: sharedVersion
        }
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

    async resolveDescriptorForAuthenticatedAccess(input: {
        slug: string
        requestSummary?: ArtifactRequestSummary
    }): Promise<ArtifactSharedDescriptor> {
        const user = ServerRequestContext.currentUser()
        if (!user?.id || !user.tenantId) {
            throw new UnauthorizedException('Login is required to access this artifact link')
        }
        return this.resolveDescriptorForPublicAccess({
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
        const { link, artifact, version } = await this.authorizeArtifactLink(input)
        const file = await this.persistence.readWorkspaceArtifact(version.workspaceFileRef)
        const sha256 = digestBuffer(file.buffer)
        if (version.sha256 && !safeEqualString(version.sha256, sha256)) {
            await this.persistence.recordAccessLog(link, 'denied', {
                statusCode: 409,
                error: 'artifact_checksum_mismatch',
                requestSummary: input.requestSummary
            })
            throw new GoneException('Artifact changed after the link was created')
        }

        await this.sourcePolicies.validateContent(artifact, file.buffer, version.mimeType)
        const event: ArtifactAccessEvent = input.download ? 'download' : 'access'
        await this.persistence.incrementCounters(link, input.download ? 'download' : 'access')
        await this.persistence.recordAccessLog(link, event, {
            statusCode: 200,
            principalUserId: input.principal?.userId,
            requestSummary: input.requestSummary
        })

        if (this.sourcePolicies.revalidateAfterRead(artifact)) {
            const current = await this.authorizeArtifactLink(input)
            if (current.version.id !== version.id) throw new GoneException('Artifact link changed while reading')
        }
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

    private async authorizeArtifactLink(input: {
        slug: string
        download?: boolean
        previewToken?: string | null
        principal?: ArtifactAccessPrincipal | null
        authenticatedUser?: IUser | null
        requestSummary?: ArtifactRequestSummary
    }): Promise<{
        link: ArtifactLink
        artifact: Artifact
        version: ArtifactVersion
    }> {
        const link = await this.linkRepository.findOne({
            where: { slug: normalizeRequiredString(input.slug, 'slug') },
            relations: ['artifact']
        })
        if (!link || !link.artifact) {
            throw new NotFoundException('Artifact link was not found')
        }
        if (input.download && !link.allowDownload) {
            await this.persistence.recordAccessLog(link, 'denied', {
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
            await this.persistence.recordAccessLog(link, 'denied', {
                statusCode: 410,
                error: `artifact_${artifact.status}`,
                requestSummary: input.requestSummary
            })
            throw new GoneException('Artifact is no longer active')
        }

        const version = await this.persistence.resolveLinkVersion(link, artifact)
        return { link, artifact, version }
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
        const publicUrl = this.presentation.buildPublicUrl(link.slug, undefined, link.artifact)
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

    private async createArtifactLinkWithDefaults(
        input: CreateArtifactLinkInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord> {
        const artifact = await this.persistence.resolveScopedArtifact(input.artifactId, defaults)
        return this.createArtifactLinkRecord(artifact, input, defaults, this.persistence.repositories())
    }

    private async createArtifactLinkRecord(
        artifact: Artifact,
        input: CreateArtifactLinkInput,
        defaults: ArtifactsRuntimeScope,
        repositories: ArtifactRepositories,
        shareKey?: string
    ): Promise<ArtifactLinkRecord> {
        const versionMode = normalizeVersionMode(input.versionMode, input.artifactVersionId)
        const version = await this.persistence.resolveRequestedVersionFromRepository(
            artifact,
            versionMode,
            input.artifactVersionId,
            repositories.version
        )
        const access = normalizeAccessInput(input.access)
        await this.sourcePolicies.assertPublication(artifact, shareKey, access)
        const scope = artifactToScope(artifact)
        const token = this.assertAndApplyPublicLinkPolicy(access, {
            ...scope,
            userId: this.persistence.resolveCurrentScope(defaults).userId
        })
        const expiresAt = resolveExpiresAt(access)
        await this.sourcePolicies.assertLink(artifact, {
            accessMode: access.mode,
            versionMode,
            expiresAt,
            allowDownload: input.presentation?.allowDownload ?? true
        })
        const slug = await this.persistence.createUniqueSlug()
        const link = repositories.link.create({
            ...scope,
            createdById: this.persistence.resolveCurrentScope(defaults).userId ?? undefined,
            artifactId: normalizeRequiredString(artifact.id, 'artifact.id'),
            artifact,
            shareKey: normalizeOptionalString(shareKey),
            artifactVersionId: versionMode === 'version' ? normalizeRequiredString(version.id, 'version.id') : null,
            versionMode,
            slug,
            publicUrl: this.presentation.buildPublicUrl(slug, undefined, artifact),
            accessMode: access.mode,
            status: 'active',
            customPrincipals: normalizeStringArray(access.customPrincipals),
            expiresAt,
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
        return this.presentation.serializeLink(saved, token, artifact, version)
    }

    private async getArtifactShareWithDefaults(
        input: ArtifactShareKeyInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord | null> {
        const artifact = await this.persistence.resolveScopedArtifact(input.artifactId, defaults, true, 'read')
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
        const version = await this.persistence.resolveLinkVersion(link, artifact)
        return this.presentation.serializeLink(link, undefined, artifact, version)
    }

    private async ensureArtifactShareWithDefaults(
        input: ArtifactShareInput,
        defaults: ArtifactsRuntimeScope
    ): Promise<EnsureArtifactShareResult> {
        const shareKey = normalizeRequiredString(input.shareKey, 'shareKey')
        const artifact = await this.persistence.resolveScopedArtifact(input.artifactId, defaults)
        const access = normalizeAccessInput(input.access)
        await this.sourcePolicies.assertPublication(artifact, shareKey, access)
        this.assertAndApplyPublicLinkPolicy(access, {
            ...artifactToScope(artifact),
            userId: this.persistence.resolveCurrentScope(defaults).userId
        })

        return this.persistence.withLockedArtifact(artifact, async (lockedArtifact, repositories) => {
            const artifactId = normalizeRequiredString(lockedArtifact.id, 'artifact.id')
            const versionMode = normalizeVersionMode(input.versionMode, input.artifactVersionId)
            const version = await this.persistence.resolveRequestedVersionFromRepository(
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
                const canonicalUrl = this.presentation.buildPublicUrl(active.slug, undefined, lockedArtifact)
                if (active.publicUrl !== canonicalUrl) {
                    active.publicUrl = canonicalUrl
                    await repositories.link.save(active)
                }
                return {
                    link: this.presentation.serializeLink(active, undefined, lockedArtifact, version),
                    outcome: 'reused'
                }
            }

            const replacedLinkId = active?.id ?? null
            if (active) {
                active.status = 'revoked'
                active.revokedAt = new Date()
                await repositories.link.save(active)
                await this.persistence.recordAccessLog(active, 'revoked', { statusCode: 200 })
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
        const artifact = await this.persistence.resolveScopedArtifact(input.artifactId, defaults, true)
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
        await this.persistence.recordAccessLog(saved, 'revoked', { statusCode: 200 })
        return this.presentation.serializeLink(saved, undefined, artifact)
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
        const link = await this.persistence.resolveScopedLink(idOrSlug, defaults)
        // Source policies may require replacing a share instead of editing a sent URL.
        this.sourcePolicies.assertLinkUpdate(link.artifact)
        const token = patch.access ? this.applyAccessPatch(link, patch.access) : undefined
        if (patch.access) {
            link.publicUrl = this.presentation.buildPublicUrl(link.slug, undefined, link.artifact)
        }
        if (patch.presentation) {
            this.applyPresentationPatch(link, patch.presentation)
        }
        if (patch.versionMode || patch.artifactVersionId !== undefined) {
            const artifact = link.artifact ?? (await this.persistence.resolveScopedArtifact(link.artifactId, defaults))
            const versionMode = normalizeVersionMode(patch.versionMode, patch.artifactVersionId)
            const version = await this.persistence.resolveRequestedVersion(
                artifact,
                versionMode,
                patch.artifactVersionId
            )
            link.versionMode = versionMode
            link.artifactVersionId =
                versionMode === 'version' ? normalizeRequiredString(version.id, 'version.id') : null
        }
        if (link.artifact) await this.sourcePolicies.assertLink(link.artifact, link)
        const saved = await this.linkRepository.save(link)
        return this.presentation.serializeLink(saved, token)
    }

    private async revokeArtifactLinkWithDefaults(
        idOrSlug: string,
        defaults: ArtifactsRuntimeScope
    ): Promise<ArtifactLinkRecord> {
        const link = await this.persistence.resolveScopedLink(idOrSlug, defaults)
        if (link.status !== 'revoked') {
            link.status = 'revoked'
            link.revokedAt = new Date()
            await this.linkRepository.save(link)
            await this.persistence.recordAccessLog(link, 'revoked', { statusCode: 200 })
        }
        return this.presentation.serializeLink(link)
    }

    async isShareAvailableToOwner(link: ArtifactLink): Promise<boolean> {
        const artifact = link.artifact
        if (
            !artifact ||
            artifact.status !== 'active' ||
            link.status !== 'active' ||
            isExpired(link) ||
            link.userId !== artifact.userId ||
            link.tenantId !== artifact.tenantId ||
            link.organizationId !== artifact.organizationId
        )
            return false
        try {
            await this.persistence.resolveLinkVersion(link, artifact)
            return await this.canAccessLink(link, null, { tenantId: link.tenantId, userId: link.userId })
        } catch {
            return false
        }
    }

    private async assertPublicAccess(
        link: ArtifactLink,
        previewToken?: string | null,
        principal?: ArtifactAccessPrincipal | null,
        requestSummary?: ArtifactRequestSummary,
        authenticatedUser?: IUser | null
    ) {
        if (link.status === 'revoked') {
            await this.persistence.recordAccessLog(link, 'revoked', { statusCode: 410, requestSummary })
            throw new GoneException('Artifact link was revoked')
        }
        if (isExpired(link)) {
            link.status = 'expired'
            await this.linkRepository.save(link)
            await this.persistence.recordAccessLog(link, 'expired', { statusCode: 410, requestSummary })
            throw new GoneException('Artifact link expired')
        }

        const allowed = await this.canAccessLink(link, previewToken, principal ?? null, authenticatedUser ?? null)
        if (!allowed) {
            await this.persistence.recordAccessLog(link, 'denied', {
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
        const artifact = link.artifact ?? (await this.artifactRepository.findOneBy({ id: link.artifactId }))
        if (!artifact) return false
        try {
            await this.sourcePolicies.assertLink(artifact, link)
            await this.persistence.assertAccess(
                artifact,
                { ...principal, organizationId: artifact.organizationId },
                'read',
                false
            )
        } catch {
            return false
        }
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
        // Trusted plugin policy is distinct from user confirmation; callers must not bind it from tool input.
        if (
            access.mode === 'public_link' &&
            !access.userConfirmedPublicLink &&
            access.publicLinkAuthorization !== 'application_policy'
        ) {
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

function artifactShareSessionSecret() {
    return normalizeOptionalString(process.env.ARTIFACT_SHARE_SESSION_SECRET) ?? environment.JWT_SECRET
}
