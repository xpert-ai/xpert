import { MODULE_METADATA } from '@nestjs/common/constants'

describe('AgentMiddlewareRuntimeModule', () => {
    it('keeps module metadata resolvable when loaded from the server-ai entrypoint', () => {
        const { AgentMiddlewareRuntimeModule } = require('@xpert-ai/server-ai')
        const imports = (Reflect as any).getMetadata(MODULE_METADATA.IMPORTS, AgentMiddlewareRuntimeModule) ?? []
        const providers = (Reflect as any).getMetadata(MODULE_METADATA.PROVIDERS, AgentMiddlewareRuntimeModule) ?? []

        expect(imports).not.toContain(undefined)
        expect(providers).not.toContain(undefined)
    })
})
