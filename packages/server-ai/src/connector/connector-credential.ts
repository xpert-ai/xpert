import { BadRequestException } from '@nestjs/common'
import type { ConnectorAppCredentialPayload, ConnectorCredential, ConnectorOAuthCredential } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

export function parseConnectorValues(value: unknown): ConnectorAppCredentialPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorCredentialValuesInvalid', {
                defaultValue: 'Connector credential values are invalid'
            })
        )
    }
    return { ...value }
}

/** Preserve legacy application credentials and token metadata when bridging to the multi-auth contract. */
export function normalizeLegacyCredential(
    credential: ConnectorOAuthCredential,
    fallbackApp?: ConnectorAppCredentialPayload
): ConnectorCredential {
    return {
        data: {
            appId: credential.appId,
            ...(credential.brand ? { brand: credential.brand } : {}),
            app: credential.app ? parseConnectorValues(credential.app) : fallbackApp,
            accessToken: credential.accessToken,
            ...(credential.refreshToken ? { refreshToken: credential.refreshToken } : {})
        },
        expiresAt: credential.expiresAt,
        refreshExpiresAt: credential.refreshExpiresAt,
        scopes: credential.scopes,
        profile: credential.profile
    }
}
