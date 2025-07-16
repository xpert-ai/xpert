import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
	BusinessType,
	IBusinessArea,
	IIndicator,
	ISemanticModel,
	IStory,
	IUser,
} from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import {
	Column,
	Entity,
	Index,
	OneToMany,
	Tree,
	TreeChildren,
	TreeParent,
} from 'typeorm'
import { BusinessAreaUser, Indicator, SemanticModel, Story } from '../core/entities/internal'


@Entity('business_area')
@Tree('closure-table')
export class BusinessArea extends TenantOrganizationBaseEntity implements IBusinessArea
{
	@ApiProperty({ type: () => String, enum: BusinessType })
	@IsEnum(BusinessType)
	@IsOptional()
	@Column({ nullable: true })
	type?: BusinessType

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	name?: string

	@TreeChildren()
	children?: IBusinessArea[]

	@ApiPropertyOptional({ type: () => BusinessArea })
	@TreeParent({
		onDelete: 'CASCADE'
	})
	parent?: IBusinessArea

	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	parentId?: string

	/**
	 * Indicators
	 */
	@ApiProperty({ type: () => Indicator, isArray: true })
	@OneToMany(() => Indicator, (m) => m.businessArea)
	indicators?: IIndicator[]

	/**
	 * SemanticModels
	 */
	@ApiProperty({ type: () => SemanticModel, isArray: true })
	@OneToMany(() => SemanticModel, (m) => m.businessArea, {
		cascade: true,
	})
	models?: ISemanticModel[]

	/**
	 * Stories
	 */
	@ApiProperty({ type: () => Story, isArray: true })
	@OneToMany(() => Story, (m) => m.businessArea, {
		cascade: true,
	})
	stories?: IStory[]

	/**
	 * UserBusinessGroup
	 */
	@ApiProperty({ type: () => BusinessAreaUser, isArray: true })
	@OneToMany(() => BusinessAreaUser, (userGroup) => userGroup.businessArea, {
		cascade: true,
	})
	users?: IUser[]
}
