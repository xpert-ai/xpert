import { AuthModule, TenantSettingModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { AgentController } from './agent.controller'
import { EventsGateway } from './agent.gateway'
import { SemanticModelModule } from '../model/model.module'

@Module({
	imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => TenantSettingModule),
    forwardRef(() => SemanticModelModule),
    CqrsModule
  ],
	controllers: [AgentController],
	providers: [EventsGateway],
  exports: [EventsGateway]
})
export class AgentModule {}
