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
import type {
    ConnectorBindingCreateRequest,
    ConnectorConnectRequest,
    ConnectorConnectResponse,
    ConnectorOAuthCompleteRequest,
    ConnectorScope
} from '@xpert-ai/plugin-sdk'
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
        cookie?: string
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
        let scope: ConnectorScope | undefined
        let callbackConnectorId: string | undefined
        let status: 'success' | 'error' = 'success'
        let errorMessage: string | undefined
        try {
            const context = await this.assertOAuthCallbackBrowser(state, request)
            callbackConnectorId = context?.connectorId
            const connector = await this.service.completeOAuthCallback({ state, code })
            scope =
                connector.scope ??
                (connector.workspaceId ? { type: 'workspace', workspaceId: connector.workspaceId } : undefined)
        } catch (error) {
            status = 'error'
            errorMessage = oauthCallbackErrorMessage(error)
            const context = await this.service.getOAuthCallbackContext(state).catch(() => null)
            callbackConnectorId = context?.connectorId ?? callbackConnectorId
            scope =
                context?.scope ??
                (context?.workspaceId ? { type: 'workspace', workspaceId: context.workspaceId } : undefined)
        }

        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader(
            'Content-Security-Policy',
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        )
        if (callbackConnectorId) {
            response.clearCookie(oauthBrowserCookieName(callbackConnectorId), {
                path: '/api/connector/oauth/callback'
            })
        }
        response.send(
            renderConnectorOAuthResultPage({
                status,
                locale: resolveOAuthPageLocale(request.headers?.['accept-language']),
                returnUrl: buildScopeReturnUrl(this.clientBaseUrl, scope),
                hasWorkspace: !!scope,
                errorMessage
            })
        )
    }

    @Public()
    @Post('oauth/callback')
    async completeOAuthCallback(
        @Body() body: ConnectorOAuthCompleteRequest,
        @Req() request: HttpRequestLike,
        @Res({ passthrough: true }) response?: Response
    ) {
        const context = await this.assertOAuthCallbackBrowser(body.state, request)
        try {
            return await this.service.completeOAuthCallback(body)
        } finally {
            if (context?.connectorId) {
                response?.clearCookie(oauthBrowserCookieName(context.connectorId), {
                    path: '/api/connector/oauth/callback'
                })
            }
        }
    }

    @Get('runtime-options')
    runtimeOptions(@Query('xpertId') xpertId: string, @Query('projectId') projectId?: string) {
        return this.service.runtimeOptions(xpertId, projectId)
    }

    @Get('bindings')
    bindings(@Query('scopeType') scopeType: string, @Query('scopeId') scopeId: string) {
        return this.service.listBindings(queryScope(scopeType, scopeId))
    }

    @Get('definitions')
    scopedDefinitions(@Query('scopeType') scopeType: string, @Query('scopeId') scopeId: string) {
        return this.service.definitionsForScope(queryScope(scopeType, scopeId))
    }

    @Post('bindings')
    createBinding(@Body() body: ConnectorBindingCreateRequest) {
        return this.service.createBinding(body)
    }

    @Delete('bindings/:connectorId')
    deleteBinding(@Param('connectorId') connectorId: string) {
        return this.service.deleteBinding(connectorId)
    }

    @Post('bindings/:connectorId/connect')
    async connectBinding(
        @Param('connectorId') connectorId: string,
        @Body() body: ConnectRequest,
        @Req() request: HttpRequestLike,
        @Res({ passthrough: true }) response?: Response
    ) {
        if (hasLegacyAppIntegrationReference(body)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorAppIntegrationUnsupported', {
                    defaultValue: 'Connector app integrations are not supported'
                })
            )
        }
        const { authMethodId, values, app, xpertId } = body ?? {}
        const result = await this.service.connectBinding(connectorId, {
            authMethodId,
            values,
            app,
            xpertId,
            redirectUri: buildCallbackUrl(request)
        })
        this.bindOAuthBrowser(result, request, response)
        return result
    }

    @Get('bindings/:connectorId/authorization-status')
    bindingAuthorizationStatus(@Param('connectorId') connectorId: string, @Query('xpertId') xpertId?: string) {
        return this.service.authorizationStatusBinding(connectorId, xpertId)
    }

    @Post('bindings/:connectorId/consent')
    consentBinding(@Param('connectorId') connectorId: string, @Body() body?: { xpertId?: string }) {
        return this.service.consentPersonalBinding(connectorId, body?.xpertId)
    }

    @Get('personal-accounts')
    personalAccounts() {
        return this.service.listPersonalAccounts()
    }

    @Delete('personal-accounts/:accountId')
    disconnectPersonalAccount(@Param('accountId') accountId: string) {
        return this.service.disconnectPersonalAccount(accountId)
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
    async connect(
        @Param('workspaceId') workspaceId: string,
        @Param('provider') provider: string,
        @Body() body: ConnectRequest,
        @Req() request: HttpRequestLike,
        @Res({ passthrough: true }) response?: Response
    ) {
        if (hasLegacyAppIntegrationReference(body)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorAppIntegrationUnsupported', {
                    defaultValue: 'Connector app integrations are not supported'
                })
            )
        }
        const { authMethodId, values, app } = body ?? {}
        const result = await this.service.connect(workspaceId, provider, {
            authMethodId,
            values,
            app,
            redirectUri: buildCallbackUrl(request)
        })
        this.bindOAuthBrowser(result, request, response)
        return result
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Post(':workspaceId/:connectorId/cancel-authorization')
    cancelAuthorization(@Param('workspaceId') workspaceId: string, @Param('connectorId') connectorId: string) {
        return this.service.cancelAuthorization(workspaceId, connectorId)
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

    private bindOAuthBrowser(
        result: ConnectorConnectResponse,
        request: HttpRequestLike,
        response?: Response
    ) {
        if (result.status !== 'pending' || !result.authorizationUrl || !response) {
            return
        }
        const state = oauthStateFromAuthorizationUrl(result.authorizationUrl)
        if (!state) {
            return
        }
        const expires = result.stateExpiresAt ? new Date(result.stateExpiresAt) : undefined
        response.cookie(oauthBrowserCookieName(result.connector.id), this.service.createOAuthBrowserBinding(state), {
            httpOnly: true,
            sameSite: 'lax',
            secure: requestProtocol(request) === 'https',
            path: '/api/connector/oauth/callback',
            ...(expires && !Number.isNaN(expires.getTime()) ? { expires } : {})
        })
    }

    private async assertOAuthCallbackBrowser(state: string, request: HttpRequestLike) {
        const context = await this.service.getOAuthCallbackContext(state)
        if (context) {
            this.service.assertOAuthBrowserBinding(
                state,
                readCookie(request.headers?.cookie, oauthBrowserCookieName(context.connectorId))
            )
        }
        return context
    }
}

function buildCallbackUrl(request: HttpRequestLike) {
    const forwardedProto = request.headers?.['x-forwarded-proto']
    const forwardedHost = request.headers?.['x-forwarded-host']
    const proto = forwardedProto || request.protocol || 'http'
    const host = forwardedHost || request.get?.('host') || request.headers?.host
    return `${proto}://${host}/api/connector/oauth/callback`
}

function requestProtocol(request: HttpRequestLike) {
    return (request.headers?.['x-forwarded-proto']?.split(',')[0]?.trim() || request.protocol || 'http').toLowerCase()
}

function oauthStateFromAuthorizationUrl(authorizationUrl: string) {
    try {
        return new URL(authorizationUrl).searchParams.get('state')?.trim() || null
    } catch {
        return null
    }
}

function oauthBrowserCookieName(connectorId: string) {
    return `xpert_connector_oauth_${connectorId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function readCookie(header: string | undefined, name: string) {
    const item = header
        ?.split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${name}=`))
    if (!item) return undefined
    try {
        return decodeURIComponent(item.slice(name.length + 1))
    } catch {
        return undefined
    }
}

function hasLegacyAppIntegrationReference(input: ConnectRequest | undefined) {
    return !!input && Object.prototype.hasOwnProperty.call(input, 'appIntegrationId')
}

function buildScopeReturnUrl(clientBaseUrl: string, scope?: ConnectorScope) {
    const path =
        scope?.type === 'workspace'
            ? `/xpert/w/${encodeURIComponent(scope.workspaceId)}/connectors`
            : scope?.type === 'project'
              ? `/project/${encodeURIComponent(scope.projectId)}`
              : '/xpert/w'
    return new URL(path, clientBaseUrl).toString()
}

function queryScope(scopeType: string, scopeId: string): ConnectorScope {
    if (scopeType === 'workspace') {
        return { type: 'workspace', workspaceId: scopeId }
    }
    if (scopeType === 'project') {
        return { type: 'project', projectId: scopeId }
    }
    throw new BadRequestException(
        t('server-ai:Error.ConnectorScopeInvalid', { defaultValue: 'Connector scope is invalid' })
    )
}

function resolveOAuthPageLocale(acceptLanguage?: string): 'en' | 'zh' {
    return acceptLanguage?.toLowerCase().includes('zh') ? 'zh' : 'en'
}

function oauthCallbackErrorMessage(error: unknown) {
    return error instanceof Error && error.message.trim() ? error.message : undefined
}
