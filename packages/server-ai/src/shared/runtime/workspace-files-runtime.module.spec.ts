import { getRepositoryToken } from '@nestjs/typeorm'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { XpertProject } from '../../xpert-project/entities/project.entity'
import { XpertProjectMembership } from '../../xpert-project/entities/project-membership.entity'
import { XpertProjectTaskExecution } from '../../xpert-project/entities/project-task-execution.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { ContentDocument } from '../../content-resource/documents/entities'
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
        const builder = Test.createTestingModule({ imports: [TestStrategyBusModule, WorkspaceFilesRuntimeModule] })
            .overrideProvider(VOLUME_CLIENT)
            .useValue({ resolve: jest.fn() })
        for (const entity of [
            XpertProject,
            XpertProjectMembership,
            XpertProjectTaskExecution,
            Xpert,
            ContentDocument
        ]) {
            builder.overrideProvider(getRepositoryToken(entity)).useValue({})
        }
        const module = await builder.compile()
        try {
            await module.init()
            expect(module.get(ProjectAccessRuntimeService)).toBeDefined()
            const registry = module.get<RuntimeCapabilityRegistry>(XPERT_RUNTIME_CAPABILITIES_TOKEN)
            expect(registry.get(WorkspaceFilesRuntimeCapability)).toBe(
                module.get(WorkspaceFilesRuntimeCapabilityService)
            )
        } finally {
            await module.close()
        }
    })
})
