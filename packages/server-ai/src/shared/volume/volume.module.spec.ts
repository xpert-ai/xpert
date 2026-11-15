import { Global, Module } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ContentResourceEntry } from '../../content-resource/catalog/content-entry.entity'
import { ContentDocument } from '../../content-resource/documents/entities'
import { ContentFileOwnershipService } from './content-file-ownership.service'
import { StrategyBus } from '@xpert-ai/plugin-sdk'
import { FileUploadTargetsModule } from '../file-upload-targets/file-upload-targets.module'
import { SandboxMountedWorkspaceTargetStrategy } from '../file-upload-targets/strategies/sandbox-mounted-workspace.strategy'
import {
    LOCAL_SHELL_SANDBOX_PROVIDER_TYPE,
    LocalShellWorkspacePathMapper,
    VolumeModule,
    WorkspacePathMapperFactory,
    XpertWorkAreaExtensionRegistry,
    XpertWorkAreaResolver
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
        const moduleRef = await Test.createTestingModule({
            imports: [TestStrategyBusModule, VolumeModule, FileUploadTargetsModule]
        })
            .overrideProvider(getRepositoryToken(ContentDocument))
            .useValue({ find: jest.fn(async () => []) })
            .overrideProvider(getRepositoryToken(ContentResourceEntry))
            .useValue({ find: jest.fn(async () => []) })
            .compile()
        await moduleRef.init()
        expect(moduleRef.get(ContentFileOwnershipService)).toBeInstanceOf(ContentFileOwnershipService)
        expect(moduleRef.get(SandboxMountedWorkspaceTargetStrategy)).toBeInstanceOf(
            SandboxMountedWorkspaceTargetStrategy
        )
        expect(moduleRef.get(XpertWorkAreaResolver)).toBeInstanceOf(XpertWorkAreaResolver)
        expect(moduleRef.get(XpertWorkAreaExtensionRegistry)).toBeInstanceOf(XpertWorkAreaExtensionRegistry)

        expect(moduleRef.get(WorkspacePathMapperFactory).forProvider(LOCAL_SHELL_SANDBOX_PROVIDER_TYPE)).toBeInstanceOf(
            LocalShellWorkspacePathMapper
        )

        await moduleRef.close()
    })
})
