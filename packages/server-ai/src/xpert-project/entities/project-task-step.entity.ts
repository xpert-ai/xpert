// entities/project-task-step.entity.ts
import { IXpertProjectTaskStep } from '@metad/contracts'
import { Column, Entity, ManyToOne } from 'typeorm'
import { XpertProjectTask } from './project-task.entity'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_task_step')
export class XpertProjectTaskStep extends XpertProjectBaseEntity implements IXpertProjectTaskStep {

	@Column({ nullable: true })
	taskId: string

	@ManyToOne(() => XpertProjectTask, (task) => task.id, {
		nullable: true,
		cascade: ['insert', 'update', 'remove', 'soft-remove', 'recover']
	})
	task: XpertProjectTask

	@Column({ nullable: true })
	stepIndex: number

	@Column()
	description: string

	@Column({ nullable: true, default: '' })
	notes: string

	@Column({ nullable: true, type: 'enum', enum: ['pending', 'running', 'done', 'failed'], default: 'pending' })
	status: 'pending' | 'running' | 'done' | 'failed'
}
