import {
	IProjectCore,
	IProjectSprint,
	IProjectSwimlane,
	IProjectTask,
	ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { ProjectCore } from '../project-core/project-core.entity'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'

@Entity('project_task')
export class ProjectTask extends TenantOrganizationBaseEntity implements IProjectTask {
	@ApiProperty({ type: () => ProjectCore })
	@ManyToOne(() => ProjectCore, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	project?: IProjectCore

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectTask) => it.project)
	@IsString()
	@Index()
	@Column()
	projectId: string

	@ApiProperty({ type: () => ProjectSprint })
	@ManyToOne(() => ProjectSprint, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	sprint?: IProjectSprint

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectTask) => it.sprint)
	@IsString()
	@Index()
	@Column()
	sprintId: string

	@ApiProperty({ type: () => ProjectSwimlane })
	@ManyToOne(() => ProjectSwimlane, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	swimlane?: IProjectSwimlane

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectTask) => it.swimlane)
	@IsString()
	@Index()
	@Column()
	swimlaneId: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	title: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	description?: string

	@ApiProperty({ type: () => Number })
	@IsInt()
	@Min(0)
	@Column({ type: 'int', default: 0 })
	sortOrder: number

	@ApiProperty({ enum: ProjectTaskStatusEnum })
	@IsEnum(ProjectTaskStatusEnum)
	@Index()
	@Column({ type: 'varchar', default: ProjectTaskStatusEnum.Todo })
	status: ProjectTaskStatusEnum

	@ApiProperty({ type: () => [String] })
	@IsArray()
	@Column({ type: 'json' })
	dependencies: string[]

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	assignedAgentId?: string

	@ApiPropertyOptional({
		type: () => String,
		nullable: true,
		description:
			'Project-facing Team id for task routing. In this phase it stores ITeamDefinition.id, which is projected from a published Xpert id.'
	})
	@IsOptional()
	@IsString()
	@Index()
	@Column({ type: 'uuid', nullable: true })
	teamId?: string | null
}
