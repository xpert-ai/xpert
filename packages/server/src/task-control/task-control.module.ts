// Generic task ownership, claims and durable publication; no dependency on the AI graph runtime.
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExecutionTaskControl } from './task-control.entity'
import { TaskControlStore } from './task-control.store'
import { TaskControlRunner } from './task-control.runner'
import { TaskControlPublication } from './task-control-publication.entity'
import { ManagedConnectionModule } from '../managed-connection/managed-connection.module'
import { ControlRuntimeAdmissionService } from './control-runtime-admission.service'

@Module({
	imports: [ManagedConnectionModule, TypeOrmModule.forFeature([ExecutionTaskControl, TaskControlPublication])],
	providers: [TaskControlStore, TaskControlRunner, ControlRuntimeAdmissionService],
	exports: [TaskControlStore, TaskControlRunner, ControlRuntimeAdmissionService]
})
export class TaskControlModule {}
