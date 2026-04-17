import { IProjectCore, ProjectCoreStatusEnum } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('project_core')
export class ProjectCore extends TenantOrganizationBaseEntity implements IProjectCore {
	@ApiProperty({ type: () => String })
	@IsString()
	@Index()
	@Column()
	name: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ type: 'text' })
	goal: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	description?: string

	@ApiProperty({ enum: ProjectCoreStatusEnum })
	@IsEnum(ProjectCoreStatusEnum)
	@Index()
	@Column({ type: 'varchar', default: ProjectCoreStatusEnum.Active })
	status: ProjectCoreStatusEnum
}
