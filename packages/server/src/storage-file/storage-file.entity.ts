import { Entity, Column } from 'typeorm'
import { IStorageFile } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator'
import { Exclude } from 'class-transformer'
import { TenantOrganizationBaseEntity } from '../core/entities/tenant-organization-base.entity'

@Entity('storage_file')
export class StorageFile extends TenantOrganizationBaseEntity implements IStorageFile {
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

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ default: null, nullable: true })
	originalName?: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ default: null, nullable: true })
	encoding?: string

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

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ default: null, nullable: true })
	mimetype?: string

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
