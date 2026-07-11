import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common'
import { Public } from '@xpert-ai/server-core'
import type {
    CreateArtifactInput,
    CreateArtifactLinkInput,
    CreateArtifactVersionInput,
    CreateSignedArtifactPreviewLinkInput,
    ListArtifactsInput,
    UpdateArtifactLinkAccessInput
} from '@xpert-ai/plugin-sdk'
import type { Request, Response } from 'express'
import { ArtifactsService } from './artifacts.service'

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
        const principal = this.service.resolvePrincipalFromRequest(req)
        const artifact = await this.service.resolveForPublicAccess({
            slug: artifactLinkSlug,
            previewToken,
            principal,
            requestSummary: this.service.summarizeRequest(req)
        })
        sendArtifactResponse(res, artifact)
    }

    @Public()
    @Get(':artifactLinkSlug/download')
    async download(
        @Param('artifactLinkSlug') artifactLinkSlug: string,
        @Query(SIGNED_PREVIEW_QUERY_PARAM) previewToken: string,
        @Req() req: Request,
        @Res() res: Response
    ) {
        const principal = this.service.resolvePrincipalFromRequest(req)
        const artifact = await this.service.resolveForPublicAccess({
            slug: artifactLinkSlug,
            download: true,
            previewToken,
            principal,
            requestSummary: this.service.summarizeRequest(req)
        })
        sendArtifactResponse(res, artifact)
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
            "default-src 'self' data: blob:",
            "script-src 'unsafe-inline' 'unsafe-eval' data: blob:",
            "style-src 'unsafe-inline' data: blob:",
            "img-src 'self' data: blob:",
            "font-src 'self' data: blob:",
            "media-src 'self' data: blob:",
            "connect-src 'self' data: blob:",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'"
        ].join('; ')
    }
    return [
        "default-src 'none'",
        "style-src 'unsafe-inline'",
        'img-src data: blob:',
        'font-src data:',
        'media-src data: blob:',
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'"
    ].join('; ')
}
