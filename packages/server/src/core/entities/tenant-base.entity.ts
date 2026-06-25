import { ApiProperty } from '@nestjs/swagger'
import { Column, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { IsString, IsOptional } from 'class-validator'
import { IBasePerTenantEntityModel, ITenant } from '@xpert-ai/contracts'
import { BaseEntity } from './base.entity'

export abstract class TenantBaseEntity extends BaseEntity implements IBasePerTenantEntityModel {
	@ApiProperty({ type: () => Object, readOnly: true })
	@ManyToOne('Tenant', {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	tenant?: ITenant

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((t: TenantBaseEntity) => t.tenant)
	@IsString()
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	tenantId?: string
}
