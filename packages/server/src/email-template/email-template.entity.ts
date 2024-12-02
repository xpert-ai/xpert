import { IEmailTemplate } from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '../core/entities/internal'

@Entity('email_template')
export class EmailTemplate extends TenantOrganizationBaseEntity implements IEmailTemplate {
	@ApiProperty({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@Index()
	@Column()
	name: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@Index()
	@Column()
	languageCode: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ type: 'text', nullable: true })
	@IsOptional()
	mjml: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@Column()
	hbs: string

	title?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany 
    |--------------------------------------------------------------------------
    */
}
