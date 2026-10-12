import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
    WorkspaceFilesRuntimeCapability,
    StrategyBus,
    XPERT_RUNTIME_CAPABILITIES_TOKEN,
    type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { WorkspaceFilesRuntimeModule } from './workspace-files-runtime.module'
import { WorkspaceFilesRuntimeCapabilityService } from './workspace-files-runtime-capability.service'
import { VOLUME_CLIENT } from '../volume'

@Global()
@Module({ providers: [StrategyBus], exports: [StrategyBus] })
class TestStrategyBusModule {}

describe('Workspace files runtime module', () => {
    it('registers the capability through the real runtime module and provider explorer', async () => {
        const module = await Test.createTestingModule({ imports: [TestStrategyBusModule, WorkspaceFilesRuntimeModule] })
            .overrideProvider(VOLUME_CLIENT)
            .useValue({ resolve: jest.fn() })
            .compile()
        try {
            await module.init()
            const registry = module.get<RuntimeCapabilityRegistry>(XPERT_RUNTIME_CAPABILITIES_TOKEN)
            expect(registry.get(WorkspaceFilesRuntimeCapability)).toBe(
                module.get(WorkspaceFilesRuntimeCapabilityService)
            )
        } finally {
            await module.close()
        }
    })
})
