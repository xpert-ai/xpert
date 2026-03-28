import { SharedModule, TenantModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AssistantConfigController } from './assistant-config.controller'
import { AssistantConfig } from './assistant-config.entity'
import { AssistantConfigService } from './assistant-config.service'

@Module({
  imports: [
    RouterModule.register([{ path: '/assistant-config', module: AssistantConfigModule }]),
    TypeOrmModule.forFeature([AssistantConfig]),
    forwardRef(() => TenantModule),
    SharedModule
  ],
  controllers: [AssistantConfigController],
  providers: [AssistantConfigService],
  exports: [AssistantConfigService]
})
export class AssistantConfigModule {}
