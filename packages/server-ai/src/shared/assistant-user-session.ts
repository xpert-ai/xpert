import { SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'

/** The authenticated account or public visitor owns preferences for its authorized Assistant. */
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
        case SecretTokenBindingType.PUBLIC_XPERT:
            // The public session issuer creates a visitor identity scoped to this Assistant and visitor cookie.
            return true
        default:
            return false
    }
}
