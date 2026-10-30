import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { ContextCompressionMiddleware, ContextCompressionMiddlewareOptions } from './context-compression.middleware'

jest.mock('../chat-conversation/context-evidence/context-evidence.service', () => ({
    ContextEvidenceService: class {}
}))

/** Retain regression coverage of the explicit legacy rollback and manual /compact behavior. */
export class LegacyContextCompressionMiddleware extends ContextCompressionMiddleware {
    constructor() {
        super({
            bind: () => {
                throw new Error('Legacy rollback must not access evidence storage')
            }
        })
    }

    override createMiddleware(options: ContextCompressionMiddlewareOptions, context: IAgentMiddlewareContext) {
        return super.createMiddleware({ ...options, recoverableHistory: false }, context)
    }
}
