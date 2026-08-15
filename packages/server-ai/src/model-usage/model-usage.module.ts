import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ModelChargeLedger } from './model-charge-ledger.entity'
import { ModelChargeLedgerService } from './model-charge-ledger.service'
import { ModelUsageLedger } from './model-usage-ledger.entity'
import { ModelUsageLedgerService } from './model-usage-ledger.service'

@Module({
    imports: [TypeOrmModule.forFeature([ModelUsageLedger, ModelChargeLedger])],
    providers: [ModelUsageLedgerService, ModelChargeLedgerService],
    exports: [ModelUsageLedgerService, ModelChargeLedgerService]
})
export class ModelUsageModule {}
