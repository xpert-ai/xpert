import { IProjectTeamBinding } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('project_team_binding')
@Index(['projectId', 'teamId'])
export class ProjectTeamBinding extends TenantOrganizationBaseEntity implements IProjectTeamBinding {
	@ApiProperty({ type: () => String })
	@IsString()
	@Index()
	@Column()
	projectId: string

	@ApiProperty({
		type: () => String,
		description:
			'Project-facing Team id. In this phase it stores ITeamDefinition.id, which is projected from a published Xpert id.'
	})
	@IsString()
	@Index()
	@Column()
	teamId: string

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
}
