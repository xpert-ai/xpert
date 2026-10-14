// Preserve old provider/binding identities and dispatch old credentials/callbacks
// by their persisted auth method. Only new connections use the native provider.
import { BadRequestException } from '@nestjs/common'
import { getConnectorAuthMethods, type ConnectorStrategyRuntime } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { McpOAuthConnectorStrategy } from './mcp-oauth.strategy'

export function adaptMcpConnector(
    strategy: ConnectorStrategyRuntime,
    registered: ConnectorStrategyRuntime[]
): ConnectorStrategyRuntime {
    if (!(strategy instanceof McpOAuthConnectorStrategy)) return strategy
    const native = registered.find((item) =>
        item.definition.mcpOAuthResources?.some(
            (resource) => URL.canParse(resource) && new URL(resource).href === new URL(strategy.config.serverUrl).href
        )
    )
    if (!native?.connect || !native.exchangeAuthorizationCode || !native.resolveRuntimeCredential) return strategy
    const legacy = (authMethodId: string) => authMethodId === 'mcp-oauth'
    return {
        definition: {
            ...native.definition,
            provider: strategy.definition.provider,
            canonicalProvider: native.definition.provider,
            runtimeUsage: 'credential',
            legacyAuthMethodId: 'mcp-oauth',
            authMethods: [
                ...getConnectorAuthMethods(native.definition),
                ...getConnectorAuthMethods(strategy.definition).map((method) => ({ ...method, deprecated: true }))
            ]
        },
        connect: (input) => {
            if (legacy(input.authMethodId))
                throw new BadRequestException(t('server-ai:Error.ConnectorAuthMethodRetired'))
            return native.connect(input)
        },
        exchangeAuthorizationCode: (input) =>
            legacy(input.authMethodId)
                ? strategy.exchangeAuthorizationCode(input)
                : native.exchangeAuthorizationCode(input),
        refreshConnectionCredential: (input) => {
            if (legacy(input.authMethodId)) return strategy.refreshConnectionCredential(input)
            if (!native.refreshConnectionCredential)
                throw new BadRequestException(t('server-ai:Error.ConnectorIntegrationUnavailable'))
            return native.refreshConnectionCredential(input)
        },
        resolveRuntimeCredential: (input) =>
            legacy(input.authMethodId)
                ? strategy.resolveRuntimeCredential(input)
                : native.resolveRuntimeCredential(input),
        revokeCredential: async (input) => {
            if (!legacy(input.authMethodId)) await native.revokeCredential?.(input)
        }
    }
}
