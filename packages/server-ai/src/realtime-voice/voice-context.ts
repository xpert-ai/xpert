import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import type { VoiceScope } from './voice.schema'

/** Queue/socket callbacks carry identity, never HTTP cookies, tokens or provider keys. */
export function withVoiceScope<T>(scope: VoiceScope, task: () => T | Promise<T>): Promise<T> {
    return runWithCapturedRequestContext(
        captureRequestContext({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            headers: { 'x-scope-level': 'organization' },
            user: { id: scope.userId, tenantId: scope.tenantId }
        }),
        task
    )
}
