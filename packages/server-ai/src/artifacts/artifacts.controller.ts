import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Req,
    Res,
    UnauthorizedException
} from '@nestjs/common'
import { Public } from '@xpert-ai/server-core'
import type {
    CreateArtifactInput,
    CreateArtifactLinkInput,
    CreateArtifactVersionInput,
    CreateSignedArtifactPreviewLinkInput,
    EnsureArtifactVersionInput,
    ListArtifactsInput,
    ArtifactShareInput,
    UpdateArtifactLinkAccessInput
} from '@xpert-ai/plugin-sdk'
import type { Request, Response } from 'express'
import {
    ARTIFACT_SHARE_SESSION_COOKIE,
    ARTIFACT_SHARE_SESSION_TTL_SECONDS,
    ArtifactsService
} from './artifacts.service'

const SIGNED_PREVIEW_QUERY_PARAM = 'xpert_artifact_preview'

@Controller('artifacts/share')
export class ArtifactsPublicController {
    constructor(private readonly service: ArtifactsService) {}

    @Public()
    @Get(':artifactLinkSlug')
    async open(
        @Param('artifactLinkSlug') artifactLinkSlug: string,
        @Query(SIGNED_PREVIEW_QUERY_PARAM) previewToken: string,
        @Req() req: Request,
        @Res() res: Response
    ) {
        await this.sendOrRedirect(artifactLinkSlug, previewToken, req, res, false)
    }

    @Public()
    @Get(':artifactLinkSlug/download')
    async download(
        @Param('artifactLinkSlug') artifactLinkSlug: string,
        @Query(SIGNED_PREVIEW_QUERY_PARAM) previewToken: string,
        @Req() req: Request,
        @Res() res: Response
    ) {
        await this.sendOrRedirect(artifactLinkSlug, previewToken, req, res, true)
    }

    private async sendOrRedirect(slug: string, previewToken: string, req: Request, res: Response, download: boolean) {
        const access = await this.service.resolveAccessContextFromRequest(req)
        try {
            const artifact = await this.service.resolveForPublicAccess({
                slug,
                download,
                previewToken,
                principal: access.principal,
                authenticatedUser: access.authenticatedUser,
                requestSummary: this.service.summarizeRequest(req)
            })
            sendArtifactResponse(res, artifact)
        } catch (error) {
            if (!(error instanceof UnauthorizedException)) throw error
            const suffix = download ? '?download=1' : ''
            res.redirect(302, `/artifacts/auth/${encodeURIComponent(slug)}${suffix}`)
        }
    }
}

@Controller('artifacts/share-session')
export class ArtifactsShareSessionController {
    constructor(private readonly service: ArtifactsService) {}

    @Post(':artifactLinkSlug')
    async create(
        @Param('artifactLinkSlug') artifactLinkSlug: string,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response
    ) {
        const session = await this.service.createArtifactShareSession({
            slug: artifactLinkSlug,
            requestSummary: this.service.summarizeRequest(req)
        })
        res.cookie(ARTIFACT_SHARE_SESSION_COOKIE, session.token, artifactShareCookieOptions(req))
        return { publicUrl: session.publicUrl }
    }

    @Public()
    @Delete()
    clear(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        res.clearCookie(ARTIFACT_SHARE_SESSION_COOKIE, artifactShareCookieOptions(req))
        return { cleared: true }
    }
}

@Controller('artifacts')
export class ArtifactsManagementController {
    constructor(private readonly service: ArtifactsService) {}

    @Post()
    async createArtifact(@Body() input: CreateArtifactInput) {
        return this.service.createArtifact(input)
    }

    @Get()
    async listArtifacts(@Query() query: ListArtifactsInput) {
        return this.service.listArtifacts(query)
    }

    @Get('by-source')
    async findBySource(
        @Query('pluginName') pluginName: string,
        @Query('resourceType') resourceType: string,
        @Query('resourceId') resourceId: string,
        @Query('includeDeleted') includeDeleted?: string
    ) {
        return this.service.findArtifactBySource({
            pluginName,
            resourceType,
            resourceId,
            includeDeleted: includeDeleted === 'true'
        })
    }

    @Get(':artifactId/versions/:artifactVersionId/content')
    async getVersionContent(
        @Param('artifactId') artifactId: string,
        @Param('artifactVersionId') artifactVersionId: string,
        @Res() res: Response
    ) {
        const resolved = await this.service.resolveForManagementAccess({ artifactId, artifactVersionId })
        res.setHeader('Content-Type', resolved.mimeType)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Referrer-Policy', 'no-referrer')
        res.setHeader('Cache-Control', 'private, no-store')
        res.setHeader('X-Xpert-Artifact-Version', resolved.version.id)
        if (resolved.version.sha256) {
            res.setHeader('X-Xpert-Artifact-SHA256', resolved.version.sha256)
        }
        res.setHeader('Content-Disposition', buildContentDisposition('inline', resolved.fileName))
        if (resolved.mimeType === 'text/html') {
            res.setHeader('Content-Security-Policy', buildHtmlCsp('interactive'))
        }
        res.send(resolved.buffer)
    }

    @Get(':idOrSlug')
    async getArtifact(@Param('idOrSlug') idOrSlug: string) {
        return this.service.getArtifact(idOrSlug)
    }

    @Post(':artifactId/versions')
    async createVersion(
        @Param('artifactId') artifactId: string,
        @Body() input: Omit<CreateArtifactVersionInput, 'artifactId'>
    ) {
        return this.service.createArtifactVersion({ ...input, artifactId })
    }

    @Get(':artifactId/versions')
    async listVersions(
        @Param('artifactId') artifactId: string,
        @Query('idempotencyKey') idempotencyKey?: string,
        @Query('status') status?: 'active' | 'deleted' | 'all'
    ) {
        return this.service.listArtifactVersions({ artifactId, idempotencyKey, status })
    }

    @Post(':artifactId/versions/ensure')
    async ensureVersion(
        @Param('artifactId') artifactId: string,
        @Body() input: Omit<EnsureArtifactVersionInput, 'artifactId'>
    ) {
        return this.service.ensureArtifactVersion({ ...input, artifactId })
    }

    @Patch(':idOrSlug/archive')
    async archiveArtifact(@Param('idOrSlug') idOrSlug: string) {
        return this.service.archiveArtifact(idOrSlug)
    }

    @Delete(':idOrSlug')
    async deleteArtifact(@Param('idOrSlug') idOrSlug: string) {
        return this.service.deleteArtifact(idOrSlug)
    }

    @Post(':artifactId/links')
    async createLink(
        @Param('artifactId') artifactId: string,
        @Body() input: Omit<CreateArtifactLinkInput, 'artifactId'>
    ) {
        return this.service.createArtifactLink({ ...input, artifactId })
    }

    @Get(':artifactId/shares/:shareKey')
    async getShare(@Param('artifactId') artifactId: string, @Param('shareKey') shareKey: string) {
        return this.service.getArtifactShare({ artifactId, shareKey })
    }

    @Post(':artifactId/shares/:shareKey')
    async ensureShare(
        @Param('artifactId') artifactId: string,
        @Param('shareKey') shareKey: string,
        @Body() input: Omit<ArtifactShareInput, 'artifactId' | 'shareKey'>
    ) {
        return this.service.ensureArtifactShare({ ...input, artifactId, shareKey })
    }

    @Delete(':artifactId/shares/:shareKey')
    async revokeShare(@Param('artifactId') artifactId: string, @Param('shareKey') shareKey: string) {
        return this.service.revokeArtifactShare({ artifactId, shareKey })
    }

    @Post(':artifactId/links/signed-preview')
    async createSignedPreviewLink(
        @Param('artifactId') artifactId: string,
        @Body() input: Omit<CreateSignedArtifactPreviewLinkInput, 'artifactId'>
    ) {
        return this.service.createSignedPreviewLink({ ...input, artifactId })
    }

    @Patch('links/:idOrSlug/access')
    async updateLinkAccess(@Param('idOrSlug') idOrSlug: string, @Body() patch: UpdateArtifactLinkAccessInput) {
        return this.service.updateArtifactLinkAccess(idOrSlug, patch)
    }

    @Delete('links/:idOrSlug')
    async revokeLink(@Param('idOrSlug') idOrSlug: string) {
        return this.service.revokeArtifactLink(idOrSlug)
    }
}

type ArtifactResponse = Awaited<ReturnType<ArtifactsService['resolveForPublicAccess']>>

function sendArtifactResponse(res: Response, artifact: ArtifactResponse) {
    res.setHeader('Content-Type', artifact.mimeType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', buildContentDisposition(artifact.disposition, artifact.fileName))
    if (artifact.mimeType === 'text/html') {
        res.setHeader('X-Xpert-Artifact-Html-Profile', artifact.safeHtmlProfile ?? 'strict')
        res.setHeader('Content-Security-Policy', buildHtmlCsp(artifact.safeHtmlProfile))
    }
    res.send(artifact.buffer)
}

function buildContentDisposition(disposition: 'inline' | 'attachment', fileName: string) {
    const safeFileName = fileName.replace(/[\r\n"]/g, '_')
    const encoded = encodeURIComponent(safeFileName)
    return `${disposition}; filename="${encoded}"; filename*=UTF-8''${encoded}`
}

function buildHtmlCsp(profile?: 'strict' | 'interactive' | null) {
    if (profile === 'interactive') {
        return [
            'sandbox allow-scripts',
            "default-src 'none'",
            "script-src 'unsafe-inline'",
            "style-src 'unsafe-inline' data: blob: https:",
            'img-src data: blob:',
            'font-src data: https:',
            'media-src data: blob:',
            "connect-src 'none'",
            "object-src 'none'",
            "frame-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'"
        ].join('; ')
    }
    return [
        'sandbox',
        "default-src 'none'",
        "style-src 'unsafe-inline' https:",
        'img-src data: blob:',
        'font-src data: https:',
        'media-src data: blob:',
        "connect-src 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'"
    ].join('; ')
}

function artifactShareCookieOptions(req: Request) {
    const forwardedProtocol = req.headers['x-forwarded-proto']
    const secure = req.secure || forwardedProtocol === 'https'
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure,
        path: '/artifacts/share',
        maxAge: ARTIFACT_SHARE_SESSION_TTL_SECONDS * 1000
    }
}
