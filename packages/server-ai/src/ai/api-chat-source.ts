import { SecretTokenBindingType, TEnterpriseH5Platform } from '@xpert-ai/contracts'
import { UnauthorizedException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'

/** Server-derived attribution for a direct API or verified enterprise H5 chat request. */
export type TrustedApiChatSource =
    | {
          from: 'api'
      }
    | {
          from: TEnterpriseH5Platform
          fromEndUserId: string
          sourceIntegrationId: string
          integrationId: string
          channelType: 'enterprise_h5'
      }

/** Conversation attribution derived from the same trusted request principal. */
export type TrustedApiConversationSource =
    | {
          from: 'api'
      }
    | {
          from: TEnterpriseH5Platform
          fromEndUserId: string
          sourceAudit: {
              sourceIntegrationId: string
              channelType: 'enterprise_h5'
          }
      }

/**
 * Derives chat attribution from the authenticated server-side principal so an
 * enterprise H5 client cannot spoof its channel, integration, or end user.
 */
export function getTrustedApiChatSource(): TrustedApiChatSource {
    const principal = RequestContext.currentApiPrincipal()
    if (
        principal?.principalType !== 'client_secret' ||
        principal.clientSecretBindingType !== SecretTokenBindingType.ENTERPRISE_XPERT
    ) {
        return { from: 'api' }
    }

    const fromEndUserId = RequestContext.currentUserId()
    const platform = principal.enterpriseH5Scope?.platform
    const integrationId = principal.enterpriseH5Scope?.integrationId?.trim()
    if (!fromEndUserId || !platform || !integrationId) {
        throw new UnauthorizedException()
    }

    return {
        from: platform,
        fromEndUserId,
        sourceIntegrationId: integrationId,
        integrationId,
        channelType: 'enterprise_h5'
    }
}

export function getTrustedApiConversationSource(): TrustedApiConversationSource {
    const source = getTrustedApiChatSource()
    if (source.from === 'api') {
        return source
    }

    return {
        from: source.from,
        fromEndUserId: source.fromEndUserId,
        sourceAudit: {
            sourceIntegrationId: source.sourceIntegrationId,
            channelType: source.channelType
        }
    }
}
