// One-use tickets move an authorized View's OAuth flow into a top-level browser.
// The callback still requires the existing HttpOnly browser-binding cookie.
import { BadRequestException, Injectable } from '@nestjs/common'
import { RedisEphemeralService } from '@xpert-ai/server-core'
import { type ConnectorConnectResponse } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { t } from 'i18next'
import { ConnectorService } from '../connector.service'

const namespace = 'connector.oauth.launch'
const launchSchema = z.object({ connectorId: z.string(), state: z.string(), authorizationUrl: z.string().url(), expiresAt: z.number(), secure: z.boolean() }).strict()
const invalid = () => new BadRequestException(t('server-ai:Error.ConnectorOAuthBrowserBindingInvalid'))

@Injectable()
export class ConnectorOAuthLaunchService {
    constructor(private readonly tickets: RedisEphemeralService, private readonly connectors: ConnectorService) {}
    async issue(result: ConnectorConnectResponse, callbackUrl: string) {
        if (result.status !== 'pending' || !result.authorizationUrl) return { status: result.status }
        const url = new URL(result.authorizationUrl)
        const state = url.searchParams.get('state')
        if (!['http:', 'https:'].includes(url.protocol) || !state) throw invalid()
        const expiresAt = result.stateExpiresAt ? new Date(result.stateExpiresAt).getTime() : Date.now() + 600000
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw invalid()
        const ticket = await this.tickets.issueTicket(namespace, JSON.stringify({ connectorId: result.connector.id, state,
            authorizationUrl: result.authorizationUrl, expiresAt, secure: new URL(callbackUrl).protocol === 'https:' }), Math.max(1, Math.min(120000, expiresAt - Date.now())))
        const launchUrl = new URL('/api/connector/oauth/launch', callbackUrl)
        launchUrl.searchParams.set('ticket', ticket)
        return { status: 'pending', authorizationUrl: launchUrl.toString(), stateExpiresAt: new Date(expiresAt).toISOString() }
    }
    async consume(ticket: string) {
        const stored = await this.tickets.consumeTicket(namespace, ticket)
        if (!stored) throw invalid()
        const value = launchSchema.parse(JSON.parse(stored))
        if (value.expiresAt <= Date.now()) throw invalid()
        const context = await this.connectors.getOAuthCallbackContext(value.state)
        if (!context || context.connectorId !== value.connectorId) throw invalid()
        return { ...value, browserBinding: this.connectors.createOAuthBrowserBinding(value.state) }
    }
}
