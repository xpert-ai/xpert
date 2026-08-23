import { ApiPropertyOptional } from '@nestjs/swagger'
import { BusinessType, type IBusinessArea } from '@xpert-ai/contracts'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, Tree, TreeChildren, TreeParent } from 'typeorm'

import { TenantOrganizationBaseEntity } from '../core/entities/internal'

@Entity('business_area')
@Tree('closure-table')
export class BusinessArea extends TenantOrganizationBaseEntity implements IBusinessArea {
	@ApiPropertyOptional({ type: () => String, enum: BusinessType })
	@IsEnum(BusinessType)
	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	type?: BusinessType

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Index()
	@Column({ type: 'varchar', length: 255, nullable: true })
	name?: string

	@TreeChildren()
	children?: BusinessArea[]

	@TreeParent({ onDelete: 'CASCADE' })
	parent?: BusinessArea | null

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ type: 'uuid', nullable: true })
	parentId?: string | null
}
