import { t } from 'i18next'
import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common'
import { connectorOAuthLaunchQuerySchema, type ConnectorOAuthLaunchQuery } from './connector-oauth-launch.schema'
import { Public, ZodValidationPipe } from '@xpert-ai/server-core'
import type { Response } from 'express'
import { ConnectorOAuthLaunchService } from './connector-oauth-launch.service'

@Controller()
export class ConnectorOAuthLaunchController {
    constructor(private readonly launches: ConnectorOAuthLaunchService) {}
    @Public()
    @Get('oauth/launch')
    async launch(@Query(new ZodValidationPipe(connectorOAuthLaunchQuerySchema, () => new BadRequestException(t('server-ai:Error.ConnectorOAuthBrowserBindingInvalid')))) query: ConnectorOAuthLaunchQuery, @Res() response: Response) {
        const launch = await this.launches.consume(query.ticket)
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Referrer-Policy', 'no-referrer')
        response.cookie(`xpert_connector_oauth_${launch.connectorId.replace(/[^a-zA-Z0-9_-]/g, '_')}`, launch.browserBinding, {
            httpOnly: true, sameSite: 'lax', secure: launch.secure,
            path: '/api/connector/oauth/callback', expires: new Date(launch.expiresAt)
        })
        response.redirect(303, launch.authorizationUrl)
    }
}
