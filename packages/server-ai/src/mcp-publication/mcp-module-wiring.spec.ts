import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { RedisModule } from '@xpert-ai/server-core'
import { XpertToolsetModule } from '../xpert-toolset'
import { McpConsumerCapabilitiesService } from '../mcp-consumer'
import { ToolRuntimeService } from '../tool-runtime'
import { McpPublicationModule } from './mcp-publication.module'

describe('MCP module wiring', () => {
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
