import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { RedisModule } from '@xpert-ai/server-core'
import { XpertToolsetModule } from '../xpert-toolset'
import { McpConsumerCapabilitiesService } from '../mcp-consumer'
import { ToolRuntimeService } from '../tool-runtime'
import { McpPublicationModule } from './mcp-publication.module'
import { McpClientRuntimeService } from '../mcp-consumer/runtime/mcp-client-runtime.service'
import { McpClientConnectionService } from '../mcp-consumer/runtime/mcp-client-connection.service'
import { McpClientRuntimeCapability, RUNTIME_CAPABILITY_PROVIDER } from '@xpert-ai/plugin-sdk'

describe('MCP module wiring', () => {
    it('wires the MCP client capability to the shared connection lifecycle', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, XpertToolsetModule) as object[]
        expect(providers.filter((provider) => provider === McpClientRuntimeService)).toHaveLength(1)
        expect(providers.filter((provider) => provider === McpClientConnectionService)).toHaveLength(1)
        expect(Reflect.getMetadata(RUNTIME_CAPABILITY_PROVIDER, McpClientRuntimeService)).toEqual(
            McpClientRuntimeCapability
        )
        expect(Reflect.getMetadata('design:paramtypes', McpClientRuntimeService)).toEqual([McpClientConnectionService])
    })
    it.each([
        ['McpPublicationModule', McpPublicationModule],
        ['XpertToolsetModule', XpertToolsetModule]
    ])('%s imports RedisModule for its Redis-backed providers', (_name, moduleType) => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleType) as object[]

        expect(imports).toContain(RedisModule)
    })

    it('resolves MCP consumer capability discovery with its runtime dependency', async () => {
        const parameterTypes = Reflect.getMetadata('design:paramtypes', McpConsumerCapabilitiesService) as object[]
        expect(parameterTypes).toEqual([ToolRuntimeService])

        const moduleRef = await Test.createTestingModule({
            providers: [
                McpConsumerCapabilitiesService,
                { provide: ToolRuntimeService, useValue: { loadToolsets: jest.fn() } }
            ]
        }).compile()

        expect(moduleRef.get(McpConsumerCapabilitiesService)).toBeInstanceOf(McpConsumerCapabilitiesService)
        await moduleRef.close()
    })
})
