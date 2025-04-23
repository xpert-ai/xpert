import { IXpertProjectTask, IXpertProjectTaskStep } from '@metad/contracts'
import { Column, Entity, OneToMany } from 'typeorm'
import { XpertProjectTaskStep } from './project-task-step.entity'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_task')
export class XpertProjectTask extends XpertProjectBaseEntity implements IXpertProjectTask {

	@Column()
	name: string

	@Column()
	type: string

	@Column({ type: 'enum', enum: ['pending', 'in_progress', 'completed', 'failed'] })
	status: 'pending' | 'in_progress' | 'completed' | 'failed'

	@Column({ nullable: true })
	startTime: Date

	@Column({ nullable: true })
	endTime: Date

	@OneToMany(() => XpertProjectTaskStep, (step) => step.task)
	steps: IXpertProjectTaskStep[]
}
