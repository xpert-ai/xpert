import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common'
import { TransformInterceptor } from '@xpert-ai/server-core'
import type { ConnectorOAuthCompleteRequest, ConnectorOAuthStartRequest } from '@xpert-ai/plugin-sdk'
import { WorkspaceGuard } from '../guards/workspace.guard'
import { WorkspaceOwnerGuard } from '../guards/workspace-owner.guard'
import { XpertWorkspaceConnectorService } from './workspace-connector.service'

type ConnectRequest = ConnectorOAuthStartRequest

type HttpRequestLike = {
    protocol?: string
    headers?: {
        host?: string
        'x-forwarded-proto'?: string
        'x-forwarded-host'?: string
    }
    get?(name: string): string | undefined
}

@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertWorkspaceConnectorController {
    constructor(private readonly service: XpertWorkspaceConnectorService) {}

    @Get('connectors/provider-options')
    providerOptionsByQuery(@Query('workspaceId') workspaceId: string) {
        return this.service.providerOptions(workspaceId)
    }

    @Get('connectors/select-options')
    selectOptionsByQuery(@Query('workspaceId') workspaceId: string, @Query('provider') provider?: string) {
        return this.service.selectOptions(workspaceId, provider)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/connectors')
    list(@Param('workspaceId') workspaceId: string) {
        return this.service.list(workspaceId)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/connectors/definitions')
    definitions(@Param('workspaceId') workspaceId: string) {
        return this.service.definitions(workspaceId)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/connectors/provider-options')
    providerOptions(@Param('workspaceId') workspaceId: string) {
        return this.service.providerOptions(workspaceId)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/connectors/select-options')
    selectOptions(@Param('workspaceId') workspaceId: string, @Query('provider') provider: string) {
        return this.service.selectOptions(workspaceId, provider)
    }

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/connectors/:provider/app-integrations/select-options')
    appIntegrationSelectOptions(@Param('workspaceId') workspaceId: string, @Param('provider') provider: string) {
        return this.service.appIntegrationSelectOptions(workspaceId, provider)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Post(':workspaceId/connectors/:provider/connect')
    connect(
        @Param('workspaceId') workspaceId: string,
        @Param('provider') provider: string,
        @Body() body: ConnectRequest,
        @Req() request: HttpRequestLike
    ) {
        const { appIntegrationId, app } = body ?? {}
        return this.service.startOAuth(workspaceId, provider, {
            appIntegrationId,
            app,
            redirectUri: buildCallbackUrl(request)
        })
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Get(':workspaceId/connectors/:connectorId/authorization-status')
    authorizationStatus(@Param('workspaceId') workspaceId: string, @Param('connectorId') connectorId: string) {
        return this.service.authorizationStatus(workspaceId, connectorId)
    }

    @Get('connectors/oauth/callback')
    oauthCallback(@Query('state') state: string, @Query('code') code: string) {
        return this.service.completeOAuthCallback({ state, code })
    }

    @Post('connectors/oauth/callback')
    completeOAuthCallback(@Body() body: ConnectorOAuthCompleteRequest) {
        return this.service.completeOAuthCallback(body)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Delete(':workspaceId/connectors/:connectorId')
    disconnect(@Param('workspaceId') workspaceId: string, @Param('connectorId') connectorId: string) {
        return this.service.disconnect(workspaceId, connectorId)
    }
}

function buildCallbackUrl(request: HttpRequestLike) {
    const forwardedProto = request.headers?.['x-forwarded-proto']
    const forwardedHost = request.headers?.['x-forwarded-host']
    const proto = forwardedProto || request.protocol || 'http'
    const host = forwardedHost || request.get?.('host') || request.headers?.host
    return `${proto}://${host}/api/xpert-workspace/connectors/oauth/callback`
}
