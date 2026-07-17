import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Inject,
    Optional,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { Public, TransformInterceptor } from '@xpert-ai/server-core'
import { ConfigService } from '@xpert-ai/server-config'
import type { ConnectorConnectRequest, ConnectorOAuthCompleteRequest } from '@xpert-ai/plugin-sdk'
import type { Response } from 'express'
import { t } from 'i18next'
import { WorkspaceGuard } from '../xpert-workspace/guards/workspace.guard'
import { WorkspaceOwnerGuard } from '../xpert-workspace/guards/workspace-owner.guard'
import { renderConnectorOAuthResultPage } from './connector-oauth-result-page'
import { ConnectorService } from './connector.service'

type ConnectRequest = ConnectorConnectRequest

type HttpRequestLike = {
    protocol?: string
    headers?: {
        host?: string
        'x-forwarded-proto'?: string
        'x-forwarded-host'?: string
        'accept-language'?: string
    }
    get?(name: string): string | undefined
}

@UseInterceptors(TransformInterceptor)
@Controller()
export class ConnectorController {
    constructor(
        private readonly service: ConnectorService,
        @Optional() @Inject(ConfigService) private readonly configService?: ConfigService
    ) {}

    @Get('provider-options')
    providerOptionsByQuery(@Query('workspaceId') workspaceId: string) {
        return this.service.providerOptions(workspaceId)
    }

    @Get('select-options')
    selectOptionsByQuery(@Query('workspaceId') workspaceId: string, @Query('provider') provider?: string) {
        return this.service.selectOptions(workspaceId, provider)
    }

    @Public()
    @Get('oauth/callback')
    async oauthCallback(
        @Query('state') state: string,
        @Query('code') code: string,
        @Req() request: HttpRequestLike,
        @Res() response: Response
    ) {
        let workspaceId: string | undefined
        let status: 'success' | 'error' = 'success'
        let errorMessage: string | undefined
        try {
            const connector = await this.service.completeOAuthCallback({ state, code })
            workspaceId = connector.workspaceId
        } catch (error) {
            status = 'error'
            errorMessage = oauthCallbackErrorMessage(error)
            const context = await this.service.getOAuthCallbackContext(state).catch(() => null)
            workspaceId = context?.workspaceId
        }

        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader(
            'Content-Security-Policy',
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        )
        response.send(
            renderConnectorOAuthResultPage({
                status,
                locale: resolveOAuthPageLocale(request.headers?.['accept-language']),
                returnUrl: buildWorkspaceReturnUrl(this.clientBaseUrl, workspaceId),
                hasWorkspace: !!workspaceId,
                errorMessage
            })
        )
    }

    @Public()
    @Post('oauth/callback')
    completeOAuthCallback(@Body() body: ConnectorOAuthCompleteRequest) {
        return this.service.completeOAuthCallback(body)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId')
    list(@Param('workspaceId') workspaceId: string) {
        return this.service.list(workspaceId)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/definitions')
    definitions(@Param('workspaceId') workspaceId: string) {
        return this.service.definitions(workspaceId)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/provider-options')
    providerOptions(@Param('workspaceId') workspaceId: string) {
        return this.service.providerOptions(workspaceId)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/select-options')
    selectOptions(@Param('workspaceId') workspaceId: string, @Query('provider') provider: string) {
        return this.service.selectOptions(workspaceId, provider)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Post(':workspaceId/:provider/connect')
    connect(
        @Param('workspaceId') workspaceId: string,
        @Param('provider') provider: string,
        @Body() body: ConnectRequest,
        @Req() request: HttpRequestLike
    ) {
        if (hasLegacyAppIntegrationReference(body)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorAppIntegrationUnsupported', {
                    defaultValue: 'Connector app integrations are not supported'
                })
            )
        }
        const { authMethodId, values, app } = body ?? {}
        return this.service.connect(workspaceId, provider, {
            authMethodId,
            values,
            app,
            redirectUri: buildCallbackUrl(request)
        })
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Get(':workspaceId/:connectorId/authorization-status')
    authorizationStatus(@Param('workspaceId') workspaceId: string, @Param('connectorId') connectorId: string) {
        return this.service.authorizationStatus(workspaceId, connectorId)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Delete(':workspaceId/:connectorId')
    disconnect(@Param('workspaceId') workspaceId: string, @Param('connectorId') connectorId: string) {
        return this.service.disconnect(workspaceId, connectorId)
    }

    private get clientBaseUrl() {
        return (
            (this.configService?.get('clientBaseUrl') as string | undefined) ||
            process.env.CLIENT_BASE_URL ||
            'http://localhost:4200'
        )
    }
}

function buildCallbackUrl(request: HttpRequestLike) {
    const forwardedProto = request.headers?.['x-forwarded-proto']
    const forwardedHost = request.headers?.['x-forwarded-host']
    const proto = forwardedProto || request.protocol || 'http'
    const host = forwardedHost || request.get?.('host') || request.headers?.host
    return `${proto}://${host}/api/connector/oauth/callback`
}

function hasLegacyAppIntegrationReference(input: ConnectRequest | undefined) {
    return !!input && Object.prototype.hasOwnProperty.call(input, 'appIntegrationId')
}

function buildWorkspaceReturnUrl(clientBaseUrl: string, workspaceId?: string) {
    const path = workspaceId ? `/xpert/w/${encodeURIComponent(workspaceId)}/connectors` : '/xpert/w'
    return new URL(path, clientBaseUrl).toString()
}

function resolveOAuthPageLocale(acceptLanguage?: string): 'en' | 'zh' {
    return acceptLanguage?.toLowerCase().includes('zh') ? 'zh' : 'en'
}

function oauthCallbackErrorMessage(error: unknown) {
    return error instanceof Error && error.message.trim() ? error.message : undefined
}
