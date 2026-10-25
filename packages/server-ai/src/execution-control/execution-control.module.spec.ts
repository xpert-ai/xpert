import { Global, Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { ExecutionControlModule } from './execution-control.module'
import { ExecutionControlStore } from './execution-control.store'
import { ExecutionCancelService } from './execution-cancel.service'

// Compilation needs repository factories, but neither this database nor Redis is connected.
const database = new DataSource({ type: 'postgres', entities: [] })

@Global()
@Module({ providers: [{ provide: DataSource, useValue: database }], exports: [DataSource] })
class TestPersistenceModule {}

@Injectable()
class ControlConsumer {
    constructor(
        readonly controls: ExecutionControlStore,
        readonly cancellations: ExecutionCancelService
    ) {}
}

@Module({ imports: [ExecutionControlModule], providers: [ControlConsumer] })
class ExplicitConsumerModule {}

@Module({ providers: [ControlConsumer] })
class MissingImportModule {}

describe('ExecutionControlModule dependency boundary', () => {
    it('provides the real store and cancellation delivery through an explicit import', async () => {
        const module = await Test.createTestingModule({ imports: [TestPersistenceModule, ExplicitConsumerModule] })
            .overrideProvider(REDIS_CLIENT)
            .useValue({})
            .compile()
        try {
            const consumer = module.select(ExplicitConsumerModule).get(ControlConsumer, { strict: true })
            expect(consumer.controls).toBeInstanceOf(ExecutionControlStore)
            expect(consumer.cancellations).toBeInstanceOf(ExecutionCancelService)
            expect(consumer.controls).toBe(module.get(ExecutionControlStore))
            expect(database.isInitialized).toBe(false)
        } finally {
            await module.close()
        }
    })

    it('does not expose providers to a sibling that omitted the module import', async () => {
        await expect(
            Test.createTestingModule({
                imports: [TestPersistenceModule, ExplicitConsumerModule, MissingImportModule]
            })
                .overrideProvider(REDIS_CLIENT)
                .useValue({})
                .compile()
        ).rejects.toThrow(/ExecutionControlStore|ControlConsumer/)
    })
})
