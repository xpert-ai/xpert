import { t } from 'i18next'

export class KnowledgeIdentityError extends Error {
    constructor(readonly code: 'invalid' | 'stale' | 'busy') {
        const messages = {
            invalid: ['KnowledgeIdentityInvalid', 'Knowledge identity data or model output is invalid.'],
            stale: ['KnowledgeIdentityStale', 'The identity source changed during processing. Please retry.'],
            busy: ['KnowledgeIdentityBusy', 'The identity catalogue changed during processing. Please retry.']
        }
        const [key, defaultValue] = messages[code]
        super(t(`server-ai:Error.${key}`, { defaultValue }) || defaultValue)
    }
}
