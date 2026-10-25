// Owns durable execution control and local delivery; consumers import this module explicitly.
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExecutionControl } from './execution-control.entity'
import { ExecutionControlStore } from './execution-control.store'
import { Module } from '@nestjs/common'
import { RedisModule, TaskControlModule } from '@xpert-ai/server-core'
import { ExecutionCancelService } from './execution-cancel.service'

@Module({
    imports: [RedisModule, TaskControlModule, TypeOrmModule.forFeature([ExecutionControl])],
    providers: [ExecutionCancelService, ExecutionControlStore],
    exports: [ExecutionCancelService, ExecutionControlStore]
})
export class ExecutionControlModule {}
