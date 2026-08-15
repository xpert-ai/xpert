import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { ModelInvocation } from './model-invocation.entity'
import { ModelUsageLedger } from './model-usage-ledger.entity'
import { ModelUsageLedgerService } from './model-usage-ledger.service'
import { ModelChargeLedger } from './model-charge-ledger.entity'
import { ModelChargeLedgerService } from './model-charge-ledger.service'
import { ModelInvocationQueueService } from './model-invocation-queue.service'
import { ModelInvocationProcessor } from './model-invocation.processor'
import { ModelInvocationReconciliationService } from './model-invocation-reconciliation.service'
import { ModelInvocationSchedulerService } from './model-invocation-scheduler.service'
import { ModelInvocationService } from './model-invocation.service'

@Module({
    imports: [TypeOrmModule.forFeature([ModelInvocation, ModelUsageLedger, ModelChargeLedger]), CqrsModule],
    providers: [
        ModelUsageLedgerService,
        ModelChargeLedgerService,
        ModelInvocationQueueService,
        ModelInvocationService,
        ModelInvocationReconciliationService,
        ModelInvocationProcessor,
        ModelInvocationSchedulerService
    ],
    exports: [ModelInvocationService, ModelUsageLedgerService, ModelChargeLedgerService]
})
export class ModelInvocationModule {}
