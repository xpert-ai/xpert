import { UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'

/** Preserve only the authenticated user marker; workers reload permissions, never serialize tokens or role snapshots. */
export function authenticatedRuntimeUserHeaders(): { authenticatedUserId?: string } {
    const user = RequestContext.currentUser()
    return user?.type === UserType.USER && user.id && !('apiKey' in user) && !('resourceScope' in user)
        ? { authenticatedUserId: user.id }
        : {}
}
