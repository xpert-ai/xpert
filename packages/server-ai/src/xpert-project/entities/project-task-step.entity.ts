// entities/project-task-step.entity.ts
import { IXpertProjectTaskStep } from '@metad/contracts'
import { Column, Entity, ManyToOne } from 'typeorm'
import { XpertProjectTask } from './project-task.entity'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_task_step')
export class XpertProjectTaskStep extends XpertProjectBaseEntity implements IXpertProjectTaskStep {
	@Column()
	taskId: string

	@ManyToOne(() => XpertProjectTask, (task) => task.id, { onDelete: 'CASCADE' })
	task: XpertProjectTask

	@Column()
	stepIndex: number

	@Column()
	description: string

	@Column()
	agentRole: string

	@Column({ type: 'enum', enum: ['pending', 'running', 'done', 'failed'], default: 'pending' })
	status: 'pending' | 'running' | 'done' | 'failed'
}
