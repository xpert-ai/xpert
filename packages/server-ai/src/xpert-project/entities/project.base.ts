import { IBasePerXpertProjectEntityModel, IXpertProject } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsOptional, IsString } from 'class-validator'
import { Column, DeleteDateColumn, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { XpertProject } from './project.entity'

export abstract class XpertProjectBaseEntity
	extends TenantOrganizationBaseEntity
	implements IBasePerXpertProjectEntityModel
{
	@ApiProperty({ type: () => XpertProject, readOnly: true })
	@ManyToOne(() => XpertProject, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	project?: IXpertProject

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: XpertProjectBaseEntity) => it.project)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	projectId?: string

    // Soft Delete
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2024-10-14T06:20:32.232Z'
	})
	@IsOptional()
	@IsDateString()
	// Soft delete column that records the date/time when the entity was soft-deleted
	@DeleteDateColumn() // Indicates that this column is used for soft-delete
	deletedAt?: Date
}
