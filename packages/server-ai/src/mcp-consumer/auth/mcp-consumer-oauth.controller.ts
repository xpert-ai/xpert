import {
    Body,
    Controller,
    Delete,
    Get,
    Inject,
    Optional,
    Param,
    Post,
    Query,
    Res,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { ConfigService } from '@xpert-ai/server-config'
import { Public, TransformInterceptor } from '@xpert-ai/server-core'
import type { Response } from 'express'
import { WorkspaceGuard } from '../../xpert-workspace/guards/workspace.guard'
import { WorkspaceOwnerGuard } from '../../xpert-workspace/guards/workspace-owner.guard'
import { McpConsumerOAuthService } from './mcp-consumer-oauth.service'
import { renderMcpConsumerOAuthResultPage } from './mcp-consumer-oauth-result-page'

@UseInterceptors(TransformInterceptor)
@Controller('mcp-consumer/oauth')
export class McpConsumerOAuthController {
    constructor(
        private readonly service: McpConsumerOAuthService,
        @Optional() @Inject(ConfigService) private readonly configService?: ConfigService
    ) {}

    @UseGuards(WorkspaceOwnerGuard)
    @Post(':workspaceId/:toolsetId/authorize')
    authorize(
        @Param('workspaceId') workspaceId: string,
        @Param('toolsetId') toolsetId: string,
        @Body() body: { serverName: string }
    ) {
        return this.service.begin({
            workspaceId,
            toolsetId,
            serverName: body.serverName,
            redirectUri: this.callbackUrl
        })
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/:toolsetId/status')
    status(
        @Param('workspaceId') workspaceId: string,
        @Param('toolsetId') toolsetId: string,
        @Query('serverName') serverName: string
    ) {
        return this.service.status({ workspaceId, toolsetId, serverName })
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Delete(':workspaceId/:toolsetId')
    disconnect(
        @Param('workspaceId') workspaceId: string,
        @Param('toolsetId') toolsetId: string,
        @Query('serverName') serverName: string
    ) {
        return this.service.disconnect({ workspaceId, toolsetId, serverName })
    }

    @Public()
    @Get('callback')
    async callback(@Query('state') state: string, @Query('code') code: string, @Res() response: Response) {
        let status: 'success' | 'error' = 'success'
        let context: { workspaceId: string; toolsetId: string } | null = null
        let errorMessage: string | undefined
        try {
            context = await this.service.complete({ state, code })
        } catch (error) {
            status = 'error'
            errorMessage = error instanceof Error ? error.message : undefined
            context = await this.service.callbackContext(state).catch(() => null)
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader(
            'Content-Security-Policy',
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        )
        response.send(
            renderMcpConsumerOAuthResultPage({
                status,
                returnUrl: buildReturnUrl(this.clientBaseUrl, context?.workspaceId),
                errorMessage
            })
        )
    }

    private get clientBaseUrl() {
        return (
            (this.configService?.get('clientBaseUrl') as string | undefined) ||
            process.env.CLIENT_BASE_URL ||
            'http://localhost:4200'
        )
    }

    private get callbackUrl() {
        const apiBaseUrl =
            (this.configService?.get('baseUrl') as string | undefined) ||
            process.env.API_BASE_URL ||
            'http://localhost:3000'
        return new URL('/api/xpert-toolset/mcp-consumer/oauth/callback', apiBaseUrl).toString()
    }
}

function buildReturnUrl(clientBaseUrl: string, workspaceId?: string) {
    const path = workspaceId ? `/xpert/w/${encodeURIComponent(workspaceId)}/mcp` : '/xpert/w'
    return new URL(path, clientBaseUrl).toString()
}
