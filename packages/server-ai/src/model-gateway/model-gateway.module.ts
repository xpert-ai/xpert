import { TenantSetting, User } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MembershipModule } from '../membership/membership.module'
import { ModelAccessModule } from '../model-access/model-access.module'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime.module'
import { ModelGatewayApiKey } from './model-gateway-api-key.entity'
import { ModelGatewayCall } from './model-gateway-call.entity'
import { ModelGatewayController } from './model-gateway.controller'
import { ModelGatewayPublication } from './model-gateway-publication.entity'
import { ModelGatewayService } from './model-gateway.service'
import { ModelGatewaySettings } from './model-gateway-settings.entity'
import { ModelGatewayOpenAIController } from './openai.controller'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ModelGatewayPublication,
            ModelGatewayApiKey,
            ModelGatewaySettings,
            ModelGatewayCall,
            TenantSetting,
            User
        ]),
        ModelAccessModule,
        MembershipModule,
        AgentMiddlewareRuntimeModule,
        CqrsModule
    ],
    controllers: [ModelGatewayController, ModelGatewayOpenAIController],
    providers: [ModelGatewayService],
    exports: [ModelGatewayService]
})
export class ModelGatewayModule {}
