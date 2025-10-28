import { IIntegration, IntegrationEnum, IntegrationFeatureEnum, ITag, TAvatar } from '@metad/contracts'
import { Optional } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, ManyToMany } from 'typeorm'
import { Tag, TenantOrganizationBaseEntity } from '../core/entities/internal'

@Entity('integration')
export class Integration extends TenantOrganizationBaseEntity implements IIntegration {
	@ApiProperty({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@Index()
	@Column()
	name: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	description?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	avatar?: TAvatar

	@ApiProperty({ type: () => String, minLength: 10, maxLength: 100 })
	@IsString()
	@Index({ unique: true })
	@IsOptional()
	@Column({ nullable: true })
	slug: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@Column()
	provider: string | IntegrationEnum

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: any

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	features?: IntegrationFeatureEnum[]

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
	// Tags
	@ApiProperty({ type: () => Tag })
	@ManyToMany(() => Tag)
	tags: ITag[]
}
