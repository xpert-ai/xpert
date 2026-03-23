import { Entity, Column } from 'typeorm'
import { IScreenshot } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator'
import { Exclude } from 'class-transformer'
import { TenantOrganizationBaseEntity } from '@metad/server-core'

@Entity('screenshot')
export class Screenshot extends TenantOrganizationBaseEntity implements IScreenshot {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	file: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ default: null, nullable: true })
	url?: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ default: null, nullable: true })
	thumb?: string

	@ApiProperty({ type: () => 'timestamptz' })
	@IsNumber()
	@IsOptional()
	@Column({ default: null, nullable: true })
	recordedAt?: Date

	@ApiProperty({ type: () => 'timestamptz' })
	@IsDateString()
	@Column({ nullable: true, default: null })
	deletedAt?: Date

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ default: 0, nullable: true })
	size?: number

	@ApiPropertyOptional({ type: () => String })
	@Exclude({ toPlainOnly: true })
	@Column({
		type: 'varchar',
		nullable: true
	})
	storageProvider?: string

	fileUrl?: string
	thumbUrl?: string
	/*
    |--------------------------------------------------------------------------
    | @ManyToOne
    |--------------------------------------------------------------------------
    */
}
