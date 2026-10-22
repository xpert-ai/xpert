import { Global, Module } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Test } from '@nestjs/testing'
import { createCache } from 'cache-manager'
import { DataSource } from 'typeorm'
import { ManualRetentionModule } from './manual-retention.module'
import { ManualRetentionService } from './manual-retention.service'
import { ManualRetentionController } from './manual-retention.controller'

@Global()
@Module({
    providers: [
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: CACHE_MANAGER, useFactory: () => createCache() }
    ],
    exports: [DataSource, CACHE_MANAGER]
})
class TestInfrastructureModule {}

describe('manual retention module wiring', () => {
    it('resolves the controller, service and guards using global infrastructure providers', async () => {
        const module = await Test.createTestingModule({
            imports: [TestInfrastructureModule, ManualRetentionModule]
        }).compile()
        expect(module.get(ManualRetentionService)).toBeInstanceOf(ManualRetentionService)
        expect(module.get(ManualRetentionController)).toBeInstanceOf(ManualRetentionController)
        await module.close()
    })
})
