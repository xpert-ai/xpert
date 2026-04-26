import { IProjectTeamBinding, ProjectAgentRole, ProjectExecutionEnvironmentType } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('project_team_binding')
@Index(['projectId', 'teamId'])
export class ProjectTeamBinding extends TenantOrganizationBaseEntity implements IProjectTeamBinding {
	@ApiProperty({ type: () => String })
	@IsString()
	@Index()
	@Column({ type: 'uuid' })
	projectId: IProjectTeamBinding['projectId']

	@ApiProperty({
		type: () => String,
		description:
			'Project-facing Team id. In this phase it stores ITeamDefinition.id, which is projected from a published Xpert id.'
	})
	@IsString()
	@Index()
	@Column({ type: 'uuid' })
	teamId: IProjectTeamBinding['teamId']

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	role?: string

	@ApiProperty({ type: () => Number })
	@IsInt()
	@Min(0)
	@Column({ type: 'int', default: 0 })
	sortOrder: number

	@ApiProperty({ enum: ProjectAgentRole, isArray: true, default: [] })
	@IsArray()
	@IsEnum(ProjectAgentRole, { each: true })
	@Column({ type: 'json', default: [] })
	agentRoles: ProjectAgentRole[]

	@ApiPropertyOptional({ enum: ProjectExecutionEnvironmentType, isArray: true, nullable: true })
	@IsOptional()
	@IsArray()
	@IsEnum(ProjectExecutionEnvironmentType, { each: true })
	@Column({ type: 'json', nullable: true })
	environmentTypes?: ProjectExecutionEnvironmentType[] | null

	@ApiPropertyOptional({ type: () => [String], nullable: true })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Column({ type: 'json', nullable: true })
	swimlaneKeys?: string[] | null

	@ApiProperty({ type: () => Number, default: 0 })
	@IsInt()
	@Column({ type: 'int', default: 0 })
	assignmentPriority: number

	@ApiPropertyOptional({ type: () => Number, nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Column({ type: 'int', nullable: true })
	maxConcurrentTasks?: number | null
}
