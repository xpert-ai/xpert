import {
	IProjectCore,
	IProjectSprint,
	IProjectTask,
	IProjectTaskExecution,
	IProjectTaskExecutionArtifact,
	ProjectTaskExecutionOutcomeEnum,
	ProjectTaskExecutionStatusEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsDate, IsEnum, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { ProjectCore } from '../project-core/project-core.entity'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectTask } from './project-task.entity'

@Entity('project_task_execution')
@Index(['taskId', 'status'])
@Index(['dispatchId'], { unique: true })
export class ProjectTaskExecution extends TenantOrganizationBaseEntity implements IProjectTaskExecution {
	@ApiProperty({ type: () => ProjectCore })
	@ManyToOne(() => ProjectCore, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	project?: IProjectCore

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectTaskExecution) => it.project)
	@IsString()
	@Index()
	@Column({ type: 'uuid' })
	projectId: IProjectTaskExecution['projectId']

	@ApiProperty({ type: () => ProjectSprint })
	@ManyToOne(() => ProjectSprint, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	sprint?: IProjectSprint

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectTaskExecution) => it.sprint)
	@IsString()
	@Index()
	@Column({ type: 'uuid' })
	sprintId: IProjectTaskExecution['sprintId']

	@ApiProperty({ type: () => ProjectTask })
	@ManyToOne(() => ProjectTask, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	task?: IProjectTask

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectTaskExecution) => it.task)
	@IsString()
	@Index()
	@Column({ type: 'uuid' })
	taskId: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Index()
	@Column({ type: 'uuid' })
	teamId: IProjectTaskExecution['teamId']

	@ApiProperty({ type: () => String })
	@IsString()
	@Index()
	@Column({ type: 'uuid' })
	xpertId: IProjectTaskExecution['xpertId']

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ type: 'varchar' })
	dispatchId: string

	@ApiPropertyOptional({ type: () => String, nullable: true })
	@IsOptional()
	@IsString()
	@Column({ type: 'uuid', nullable: true })
	conversationId?: string | null

	@ApiPropertyOptional({ type: () => String, nullable: true })
	@IsOptional()
	@IsString()
	@Column({ type: 'uuid', nullable: true })
	agentExecutionId?: string | null

	@ApiProperty({ enum: ProjectTaskExecutionStatusEnum })
	@IsEnum(ProjectTaskExecutionStatusEnum)
	@Index()
	@Column({ type: 'varchar', default: ProjectTaskExecutionStatusEnum.Pending })
	status: ProjectTaskExecutionStatusEnum

	@ApiPropertyOptional({ enum: ProjectTaskExecutionOutcomeEnum, nullable: true })
	@IsOptional()
	@IsEnum(ProjectTaskExecutionOutcomeEnum)
	@Column({ type: 'varchar', nullable: true })
	outcome?: ProjectTaskExecutionOutcomeEnum | null

	@ApiPropertyOptional({ type: () => String, nullable: true })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	summary?: string | null

	@ApiPropertyOptional({ type: () => Array, nullable: true })
	@IsOptional()
	@IsArray()
	@Column({ type: 'json', nullable: true })
	artifacts?: IProjectTaskExecutionArtifact[] | null

	@ApiPropertyOptional({ type: () => String, nullable: true })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	error?: string | null

	@ApiPropertyOptional({ type: () => Date, nullable: true })
	@IsOptional()
	@IsDate()
	@Column({ type: 'timestamptz', nullable: true })
	startedAt?: Date | null

	@ApiPropertyOptional({ type: () => Date, nullable: true })
	@IsOptional()
	@IsDate()
	@Column({ type: 'timestamptz', nullable: true })
	completedAt?: Date | null
}
