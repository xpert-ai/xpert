import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Organization, SecretToken, User, UserOrganization } from '@xpert-ai/server-core'
import { CqrsModule } from '@nestjs/cqrs'
import { XpertAgentExecution } from '../agent-execution.entity'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { ExecutionObservationService } from './observation.service'
import { ObservationAccessService } from './observation-access.service'
import { ObservationUsageService } from './observation-usage.service'

@Module({
    imports: [
        CqrsModule,
        TypeOrmModule.forFeature([
            XpertAgentExecution,
            MembershipPointLedger,
            User,
            UserOrganization,
            Organization,
            SecretToken
        ])
    ],
    providers: [ExecutionObservationService, ObservationAccessService, ObservationUsageService],
    exports: [ExecutionObservationService]
})
export class ExecutionObservationModule {}
