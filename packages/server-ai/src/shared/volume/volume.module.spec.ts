import { Global, Module } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { StrategyBus } from '@xpert-ai/plugin-sdk'
import {
    LOCAL_SHELL_SANDBOX_PROVIDER_TYPE,
    LocalShellWorkspacePathMapper,
    VolumeModule,
    WorkspacePathMapperFactory
} from '.'

@Global()
@Module({ providers: [StrategyBus], exports: [StrategyBus] })
class TestStrategyBusModule {}

describe('VolumeModule', () => {
    it('exposes only defined providers when loaded through the volume barrel', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VolumeModule) as unknown[]

        expect(providers).toBeDefined()
        expect(providers).not.toContain(undefined)
    })

    it('boots in Nest and discovers the built-in local workspace mapper', async () => {
        const moduleRef = await Test.createTestingModule({ imports: [TestStrategyBusModule, VolumeModule] }).compile()
        await moduleRef.init()

        expect(moduleRef.get(WorkspacePathMapperFactory).forProvider(LOCAL_SHELL_SANDBOX_PROVIDER_TYPE)).toBeInstanceOf(
            LocalShellWorkspacePathMapper
        )

        await moduleRef.close()
    })
})
