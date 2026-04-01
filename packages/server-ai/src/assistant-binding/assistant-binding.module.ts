import { SharedModule, TenantModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertModule } from '../xpert'
import { Xpert } from '../xpert/xpert.entity'
import { AssistantBindingController } from './assistant-binding.controller'
import { AssistantBinding } from './assistant-binding.entity'
import { AssistantBindingService } from './assistant-binding.service'

@Module({
  imports: [
    RouterModule.register([{ path: '/assistant-binding', module: AssistantBindingModule }]),
    TypeOrmModule.forFeature([AssistantBinding, Xpert]),
    forwardRef(() => TenantModule),
    forwardRef(() => XpertModule),
    SharedModule
  ],
  controllers: [AssistantBindingController],
  providers: [AssistantBindingService],
  exports: [AssistantBindingService]
})
export class AssistantBindingModule {}
