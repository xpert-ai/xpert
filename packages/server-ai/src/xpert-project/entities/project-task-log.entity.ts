import { IXpertProjectTaskLog, IXpertProjectTaskStep } from '@metad/contracts'
import { Column, Entity, ManyToOne } from 'typeorm'
import { XpertProjectTaskStep } from './project-task-step.entity'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_task_log')
export class XpertProjectTaskLog extends XpertProjectBaseEntity implements IXpertProjectTaskLog {
	@Column()
	stepId: string

	@ManyToOne(() => XpertProjectTaskStep, (step) => step.id, { onDelete: 'CASCADE' })
	step: IXpertProjectTaskStep

	@Column({ type: 'enum', enum: ['input', 'output', 'error'] })
	logType: 'input' | 'output' | 'error'

	@Column('text')
	content: string
}
