// Generic task ownership, claims and durable publication; no dependency on the AI graph runtime.
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExecutionTaskControl } from './task-control.entity'
import { TaskControlStore } from './task-control.store'
import { TaskControlRunner } from './task-control.runner'
import { TaskControlPublication } from './task-control-publication.entity'

@Module({
	imports: [TypeOrmModule.forFeature([ExecutionTaskControl, TaskControlPublication])],
	providers: [TaskControlStore, TaskControlRunner],
	exports: [TaskControlStore, TaskControlRunner]
})
export class TaskControlModule {}
