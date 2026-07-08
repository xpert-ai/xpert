import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common'
import { TransformInterceptor } from '@xpert-ai/server-core'
import type { ConnectorOAuthCompleteRequest, ConnectorOAuthStartRequest } from '@xpert-ai/plugin-sdk'
import { WorkspaceGuard } from '../xpert-workspace/guards/workspace.guard'
import { WorkspaceOwnerGuard } from '../xpert-workspace/guards/workspace-owner.guard'
import { ConnectorService } from './connector.service'

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
export class ConnectorController {
    constructor(private readonly service: ConnectorService) {}

    @Get('provider-options')
    providerOptionsByQuery(@Query('workspaceId') workspaceId: string) {
        return this.service.providerOptions(workspaceId)
    }

    @Get('select-options')
    selectOptionsByQuery(@Query('workspaceId') workspaceId: string, @Query('provider') provider?: string) {
        return this.service.selectOptions(workspaceId, provider)
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
            throw new BadRequestException('Connector app integrations are not supported')
        }
        const { app } = body ?? {}
        return this.service.startOAuth(workspaceId, provider, {
            app,
            redirectUri: buildCallbackUrl(request)
        })
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Get(':workspaceId/:connectorId/authorization-status')
    authorizationStatus(@Param('workspaceId') workspaceId: string, @Param('connectorId') connectorId: string) {
        return this.service.authorizationStatus(workspaceId, connectorId)
    }

    @Get('oauth/callback')
    oauthCallback(@Query('state') state: string, @Query('code') code: string) {
        return this.service.completeOAuthCallback({ state, code })
    }

    @Post('oauth/callback')
    completeOAuthCallback(@Body() body: ConnectorOAuthCompleteRequest) {
        return this.service.completeOAuthCallback(body)
    }

    @UseGuards(WorkspaceOwnerGuard)
    @Delete(':workspaceId/:connectorId')
    disconnect(@Param('workspaceId') workspaceId: string, @Param('connectorId') connectorId: string) {
        return this.service.disconnect(workspaceId, connectorId)
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
