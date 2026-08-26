import { FeatureOrganization, Organization, RedisModule, User } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AIModelModule } from '../ai-model'
import { Copilot } from '../copilot/copilot.entity'
import { CopilotProviderModel } from '../copilot-provider/models/copilot-provider-model.entity'
import { MembershipModule } from '../membership/membership.module'
import { ModelAccessController } from './model-access.controller'
import { ModelAccessEvent } from './model-access-event.entity'
import { ModelAccessRequest } from './model-access-request.entity'
import { ModelAccessSchedulerService } from './model-access-scheduler.service'
import { ModelAccessService } from './model-access.service'
import { UserModelGrant } from './user-model-grant.entity'
import { ModelGatewayPublication } from '../model-gateway/model-gateway-publication.entity'

@Module({
    imports: [
        RouterModule.register([{ path: '/model-access', module: ModelAccessModule }]),
        TypeOrmModule.forFeature([
            ModelAccessRequest,
            UserModelGrant,
            ModelAccessEvent,
            ModelGatewayPublication,
            Copilot,
            CopilotProviderModel,
            User,
            Organization,
            FeatureOrganization
        ]),
        CqrsModule,
        RedisModule,
        AIModelModule,
        MembershipModule
    ],
    controllers: [ModelAccessController],
    providers: [ModelAccessService, ModelAccessSchedulerService],
    exports: [ModelAccessService]
})
export class ModelAccessModule {}
