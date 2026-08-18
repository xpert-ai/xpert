import { CacheModule } from '@nestjs/cache-manager'
import { Global, Module } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { CqrsModule } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { StrategyBus } from '@xpert-ai/plugin-sdk'
import { PermissionGuard } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { AgentEvolutionModule } from './agent-evolution.module'

const dataSource = {
    entityMetadatas: [],
    options: { type: 'postgres' },
    getRepository: jest.fn(() => ({}))
}

@Global()
@Module({
    imports: [CacheModule.register()],
    providers: [{ provide: DataSource, useValue: dataSource }, StrategyBus],
    exports: [CacheModule, DataSource, StrategyBus]
})
class AgentEvolutionTestInfrastructureModule {}

describe('AgentEvolutionModule', () => {
    it('imports CqrsModule so PermissionGuard can resolve CommandBus', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentEvolutionModule) as object[]

        expect(imports).toContain(CqrsModule)
    })

    it('resolves PermissionGuard with CommandBus in the real module context', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AgentEvolutionTestInfrastructureModule, AgentEvolutionModule]
        }).compile()

        expect(moduleRef.get(PermissionGuard, { strict: false })).toBeInstanceOf(PermissionGuard)
        await moduleRef.close()
    })
})
