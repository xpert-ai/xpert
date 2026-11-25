import { SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'

/** The authenticated account owns preferences for its authorized Assistant. */
export function isAssistantUserSession(): boolean {
    const userId = RequestContext.currentUserId()
    if (!userId) return false
    const principal = RequestContext.currentApiPrincipal()
    if (!principal) return RequestContext.currentUser()?.type === UserType.USER
    if (principal.principalType !== 'client_secret') return false
    switch (principal.clientSecretBindingType) {
        case SecretTokenBindingType.USER_XPERT:
        case SecretTokenBindingType.ENTERPRISE_XPERT:
            return principal.requestedUserId === userId
        default:
            return false
    }
}
