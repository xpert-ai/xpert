import { SYSTEM_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import { NotFoundException } from '@nestjs/common'
import { resolveLoadedPluginResourceRoot } from './plugin-resource-components'

describe('resolveLoadedPluginResourceRoot', () => {
    it('reports a genuinely missing loaded plugin', () => {
        expect(() => resolveLoadedPluginResourceRoot('@xpert-ai/plugin-missing', [])).toThrow(
            new NotFoundException("Loaded plugin '@xpert-ai/plugin-missing' was not found")
        )
    })

    it('distinguishes an active plugin with no portable resource manifest', () => {
        const loaded = [
            {
                organizationId: '__global__',
                scopeKey: SYSTEM_GLOBAL_SCOPE,
                name: '@xpert-ai/plugin-domain',
                packageName: '@xpert-ai/plugin-domain@1.2.3',
                baseDir: '/path/that/does/not/expose/a/plugin-resource-manifest'
            }
        ] as any

        expect(() => resolveLoadedPluginResourceRoot('@xpert-ai/plugin-domain@1.2.3', loaded)).toThrow(
            new NotFoundException(
                "Loaded plugin '@xpert-ai/plugin-domain' does not expose a portable resource manifest"
            )
        )
    })
})
