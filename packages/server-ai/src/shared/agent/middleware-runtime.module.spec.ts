import { MODULE_METADATA } from '@nestjs/common/constants'

describe('AgentMiddlewareRuntimeModule', () => {
    it('keeps providers resolvable when loaded from the server-ai entrypoint', () => {
        const { AgentMiddlewareRuntimeModule } = require('@xpert-ai/server-ai')
        const providers = (Reflect as any).getMetadata(MODULE_METADATA.PROVIDERS, AgentMiddlewareRuntimeModule) ?? []

        expect(providers).not.toContain(undefined)
    })
})
