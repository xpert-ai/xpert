// Connector owns encrypted sessions/accounts. The isolated SDK handles MCP discovery,
// registration, PKCE and resource indicators without changing existing MCP transports.
import { BadRequestException } from '@nestjs/common'
import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk-oauth/client/auth.js'
import { checkResourceAllowed } from '@modelcontextprotocol/sdk-oauth/shared/auth-utils.js'
import {
    OAuthClientInformationSchema,
    OAuthTokensSchema,
    type OAuthClientInformationMixed,
    type OAuthClientMetadata,
    type OAuthTokens
} from '@modelcontextprotocol/sdk-oauth/shared/auth.js'
import type { FetchLike } from '@modelcontextprotocol/sdk-oauth/shared/transport.js'
import type {
    ConnectorMultiAuthStrategy,
    ConnectorMultiAuthDefinition,
    ConnectorConnectInput,
    ConnectorAuthorizationCodeInput,
    ConnectorCredential,
    ConnectorCredentialRefreshInput,
    ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { z } from 'zod/v4'
import { t } from 'i18next'
import { guardedOAuthFetch } from '../mcp-publication/mcp-oauth.service'

export interface McpOAuthConnectorConfig {
    tenantId: string
    organizationId: string
    serverUrl: string
    title: string
    icon?: ConnectorMultiAuthDefinition['icon']
    scopes?: string[]
    clientRegistration?: 'dynamic' | 'preregistered'
}

const stateSchema = z.object({
    version: z.literal(1),
    serverUrl: z.string().url(),
    redirectUri: z.string().url(),
    resource: z.string().url().optional(),
    verifier: z.string().optional(),
    client: OAuthClientInformationSchema.optional(),
    tokens: OAuthTokensSchema.optional()
})
type State = z.infer<typeof stateSchema>

export function mcpConnectorProvider(config: McpOAuthConnectorConfig) {
    const identity = [
        config.tenantId,
        config.organizationId,
        new URL(config.serverUrl).href,
        [...new Set(config.scopes ?? [])].sort(),
        config.clientRegistration ?? 'dynamic'
    ]
    return `mcp-oauth:${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`
}

export const mcpOAuthFetch: FetchLike = (url, init = {}) =>
    guardedOAuthFetch(url, 'MCP OAuth', { ...init, signal: init.signal ?? AbortSignal.timeout(20000) })

export class McpOAuthConnectorStrategy implements ConnectorMultiAuthStrategy {
    readonly definition: ConnectorMultiAuthDefinition
    constructor(
        readonly config: McpOAuthConnectorConfig,
        private readonly fetcher: FetchLike = mcpOAuthFetch
    ) {
        this.definition = {
            provider: mcpConnectorProvider(config),
            label: config.title,
            icon: config.icon,
            authorizationModes: ['shared'],
            runtimeUsage: 'credential',
            authMethods: [
                {
                    id: 'mcp-oauth',
                    type: 'oauth2',
                    label: 'MCP OAuth',
                    ...(config.clientRegistration === 'preregistered'
                        ? {
                              appCredentials: {
                                  fields: [
                                      {
                                          name: 'clientId',
                                          label: { en_US: 'OAuth client ID', zh_Hans: 'OAuth Client ID' },
                                          required: true
                                      },
                                      {
                                          name: 'clientSecret',
                                          label: { en_US: 'OAuth client secret', zh_Hans: 'OAuth Client Secret' },
                                          type: 'password' as const,
                                          secret: true,
                                          required: true
                                      }
                                  ]
                              }
                          }
                        : {})
                }
            ]
        }
    }

    async connect(input: ConnectorConnectInput) {
        const state: State = { version: 1, serverUrl: this.config.serverUrl, redirectUri: input.redirectUri }
        if (this.config.clientRegistration === 'preregistered') {
            const credentials = z
                .object({ clientId: z.string().min(1), clientSecret: z.string().min(1) })
                .parse(input.values)
            state.client = { client_id: credentials.clientId, client_secret: credentials.clientSecret }
        }
        const provider = new SessionProvider(state, input.state)
        const result = await auth(provider, {
            serverUrl: this.config.serverUrl,
            scope: this.config.scopes?.join(' '),
            fetchFn: this.fetcher
        })
        if (result !== 'REDIRECT' || !provider.authorizationUrl) throw oauthError()
        return {
            status: 'pending' as const,
            authorizationUrl: provider.authorizationUrl,
            scopes: this.config.scopes,
            metadata: { payload: JSON.stringify(state) }
        }
    }

    async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
        const state = this.readState(input.metadata?.payload)
        if (state.redirectUri !== input.redirectUri || !state.verifier) throw oauthError()
        const result = await auth(new SessionProvider(state), {
            serverUrl: this.config.serverUrl,
            authorizationCode: input.code,
            scope: this.config.scopes?.join(' '),
            fetchFn: this.fetcher
        })
        if (result !== 'AUTHORIZED') throw oauthError()
        return this.credential(state)
    }

    async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
        const state = this.readState(input.credential.data.payload)
        if (!state.tokens?.refresh_token) throw oauthError()
        const result = await auth(new SessionProvider(state), {
            serverUrl: this.config.serverUrl,
            scope: this.config.scopes?.join(' '),
            fetchFn: this.fetcher
        })
        if (result !== 'AUTHORIZED') throw oauthError()
        return this.credential(state)
    }

    resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
        const state = this.readState(input.credential.data.payload)
        if (!state.tokens?.access_token || !state.resource) throw oauthError()
        return { accessToken: state.tokens.access_token, resource: state.resource, serverUrl: state.serverUrl }
    }

    private readState(payload: unknown): State {
        if (typeof payload !== 'string') throw oauthError()
        const state = stateSchema.parse(JSON.parse(payload))
        if (state.serverUrl !== this.config.serverUrl) throw oauthError()
        return state
    }

    private credential(state: State): ConnectorCredential {
        if (!state.tokens?.access_token || !state.resource) throw oauthError()
        // A verifier is needed only for the one-time authorization-code exchange.
        delete state.verifier
        const scopes = state.tokens.scope?.split(/\s+/).filter(Boolean) ?? this.config.scopes
        if (this.config.scopes?.some((scope) => !scopes?.includes(scope))) throw oauthError()
        return {
            data: { payload: JSON.stringify(state) },
            scopes,
            expiresAt:
                state.tokens.expires_in != null
                    ? new Date(Date.now() + Math.max(0, state.tokens.expires_in - 30) * 1000).toISOString()
                    : null,
            profile: { name: this.config.title }
        }
    }
}

class SessionProvider implements OAuthClientProvider {
    authorizationUrl?: string
    constructor(
        private readonly stored: State,
        private readonly nonce?: string
    ) {}
    get redirectUrl() {
        return this.stored.redirectUri
    }
    get clientMetadata(): OAuthClientMetadata {
        return {
            redirect_uris: [this.stored.redirectUri],
            client_name: 'Xpert Connectors',
            logo_uri: undefined,
            tos_uri: undefined,
            token_endpoint_auth_method: this.stored.client?.client_secret ? 'client_secret_post' : 'none',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code']
        }
    }
    state() {
        if (!this.nonce) throw oauthError()
        return this.nonce
    }
    clientInformation() {
        return this.stored.client
    }
    saveClientInformation(value: OAuthClientInformationMixed) {
        this.stored.client = OAuthClientInformationSchema.parse(value)
    }
    tokens() {
        return this.stored.tokens
    }
    saveTokens(value: OAuthTokens) {
        this.stored.tokens = { ...value, refresh_token: value.refresh_token ?? this.stored.tokens?.refresh_token }
    }
    saveCodeVerifier(value: string) {
        this.stored.verifier = value
    }
    codeVerifier() {
        if (!this.stored.verifier) throw oauthError()
        return this.stored.verifier
    }
    redirectToAuthorization(url: URL) {
        if (!this.nonce) throw oauthError()
        this.authorizationUrl = url.href
    }
    async validateResourceURL(server: string | URL, resource?: string) {
        const resolved = new URL(resource ?? server)
        if (
            !checkResourceAllowed({ requestedResource: server, configuredResource: resolved }) ||
            (this.stored.resource && this.stored.resource !== resolved.href)
        )
            throw oauthError()
        this.stored.resource = resolved.href
        return resolved
    }
}

function oauthError() {
    return new BadRequestException(
        t('server-ai:Error.AgentPluginConnectorOAuthInvalid', {
            defaultValue: 'The MCP authorization is invalid or expired. Connect the account again.'
        })
    )
}
