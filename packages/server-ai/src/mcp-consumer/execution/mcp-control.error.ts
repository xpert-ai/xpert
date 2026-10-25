import { t } from 'i18next'

/** Safe UI message; the stable reason remains available to backend diagnostics. */
export class McpControlError extends Error {
    constructor(readonly reason: 'scope' | 'evidence' | 'actor' | 'transport' | 'connection' | 'handle') {
        super(
            t('server-ai:Error.McpControlUnavailable', {
                defaultValue: 'The original operation cannot currently be confirmed.'
            })
        )
    }
}
