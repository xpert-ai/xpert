import { IBasePerProjectEntityModel } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { Column, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Project } from './internal'

export class ProjectBaseEntity extends TenantOrganizationBaseEntity implements IBasePerProjectEntityModel {
	@ApiProperty({ type: () => Project, readOnly: true })
	@ManyToOne(() => Project, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	project?: Project

	@ApiProperty({ type: () => String })
	@RelationId((it: ProjectBaseEntity) => it.project)
	@IsString()
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	projectId: string
}
