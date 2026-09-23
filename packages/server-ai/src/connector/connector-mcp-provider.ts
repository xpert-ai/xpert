import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type { ConnectorRuntimeCredentialV2 } from '@xpert-ai/plugin-sdk'
import { checkResourceAllowed } from '@modelcontextprotocol/sdk-oauth/shared/auth-utils.js'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

/** Resolve on each request so disconnects and grant revocations affect cached MCP clients. */
export function connectorMcpProvider(
    resolve: () => Promise<ConnectorRuntimeCredentialV2>,
    target: { serverUrl: string; provider: string; resource?: string; scopes?: string[] }
): OAuthClientProvider {
    const unavailable = () => {
        throw new ForbiddenException(
            t('server-ai:Error.AgentPluginConnectorUnavailable', {
                defaultValue: 'Connect the required account before using this plugin.'
            })
        )
    }
    return {
        redirectUrl: 'http://localhost/connector-runtime',
        clientMetadata: { redirect_uris: [] },
        clientInformation: () => undefined,
        saveClientInformation: unavailable,
        saveTokens: unavailable,
        redirectToAuthorization: unavailable,
        saveCodeVerifier: unavailable,
        codeVerifier: unavailable,
        tokens: async () => {
            const resolved = await resolve()
            const { accessToken, resource, serverUrl } = resolved.credentials
            if (
                resolved.provider !== target.provider ||
                typeof accessToken !== 'string' ||
                !accessToken ||
                typeof resource !== 'string' ||
                !resource ||
                (serverUrl !== undefined && serverUrl !== target.serverUrl) ||
                (target.resource !== undefined && new URL(resource).href !== new URL(target.resource).href) ||
                !checkResourceAllowed({ requestedResource: target.serverUrl, configuredResource: resource }) ||
                target.scopes?.some((scope) => !resolved.scopes?.includes(scope))
            )
                return unavailable()
            return { access_token: accessToken, token_type: 'Bearer', scope: resolved.scopes?.join(' ') }
        }
    }
}
