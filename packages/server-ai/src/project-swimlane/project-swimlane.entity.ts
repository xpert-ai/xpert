import {
	IProjectCore,
	IProjectSprint,
	IProjectSwimlane,
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsInt, IsString, Min } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { ProjectCore } from '../project-core/project-core.entity'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'

@Entity('project_swimlane')
export class ProjectSwimlane extends TenantOrganizationBaseEntity implements IProjectSwimlane {
	@ApiProperty({ type: () => ProjectCore })
	@ManyToOne(() => ProjectCore, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	project?: IProjectCore

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectSwimlane) => it.project)
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
	@RelationId((it: ProjectSwimlane) => it.sprint)
	@IsString()
	@Index()
	@Column()
	sprintId: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	key: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	name: string

	@ApiProperty({ type: () => Number })
	@IsInt()
	@Column({ type: 'int' })
	priority: number

	@ApiProperty({ type: () => Number })
	@IsInt()
	@Column({ type: 'int' })
	weight: number

	@ApiProperty({ type: () => Number })
	@IsInt()
	@Min(0)
	@Column({ type: 'int' })
	concurrencyLimit: number

	@ApiProperty({ type: () => Number })
	@IsInt()
	@Min(0)
	@Column({ type: 'int' })
	wipLimit: number

	@ApiProperty({ enum: ProjectAgentRole })
	@IsEnum(ProjectAgentRole)
	@Column({ type: 'varchar' })
	agentRole: ProjectAgentRole

	@ApiProperty({ enum: ProjectExecutionEnvironmentType })
	@IsEnum(ProjectExecutionEnvironmentType)
	@Column({ type: 'varchar' })
	environmentType: ProjectExecutionEnvironmentType

	@ApiProperty({ type: () => Number })
	@IsInt()
	@Column({ type: 'int' })
	sortOrder: number

	@ApiProperty({ enum: ProjectSprintStrategyEnum })
	@IsEnum(ProjectSprintStrategyEnum)
	@Column({ type: 'varchar' })
	sourceStrategyType: ProjectSprintStrategyEnum
}
