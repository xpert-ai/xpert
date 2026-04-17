import {
	IProjectCore,
	IProjectSprint,
	ProjectSprintStatusEnum,
	ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { ProjectCore } from '../project-core/project-core.entity'

@Entity('project_sprint')
export class ProjectSprint extends TenantOrganizationBaseEntity implements IProjectSprint {
	@ApiProperty({ type: () => ProjectCore })
	@ManyToOne(() => ProjectCore, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	project?: IProjectCore

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectSprint) => it.project)
	@IsString()
	@Index()
	@Column()
	projectId: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ type: 'text' })
	goal: string

	@ApiProperty({ enum: ProjectSprintStatusEnum })
	@IsEnum(ProjectSprintStatusEnum)
	@Index()
	@Column({ type: 'varchar', default: ProjectSprintStatusEnum.Planned })
	status: ProjectSprintStatusEnum

	@ApiProperty({ enum: ProjectSprintStrategyEnum })
	@IsEnum(ProjectSprintStrategyEnum)
	@Column({ type: 'varchar' })
	strategyType: ProjectSprintStrategyEnum

	@ApiPropertyOptional({ type: () => String, format: 'date-time' })
	@IsOptional()
	@IsDateString()
	@Column({ type: 'timestamptz', nullable: true })
	startAt?: Date

	@ApiPropertyOptional({ type: () => String, format: 'date-time' })
	@IsOptional()
	@IsDateString()
	@Column({ type: 'timestamptz', nullable: true })
	endAt?: Date

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	retrospective?: string
}
