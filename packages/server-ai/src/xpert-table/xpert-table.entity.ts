import { IXpertTable, TXpertTableColumn, XpertTableStatus } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator'
import { Column, DeleteDateColumn, Entity } from 'typeorm'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'

/**
 * XpertTable
 * ==============
 * This is the entity definition for custom database tables (Meta layer)
 * A Workspace can contain multiple custom tables
 */
@Entity('xpert_table')
export class XpertTable extends WorkspaceBaseEntity implements IXpertTable {
	/*
	|--------------------------------------------------------------------------
	| Logical Table Definition (Meta)
	|--------------------------------------------------------------------------
	*/

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	name: string // Logical table name (user-facing name, e.g., "customer_orders")

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	database?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	schema?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsObject()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	columns?: TXpertTableColumn[]

	/*
	|--------------------------------------------------------------------------
	| Status Control (for physical table activation / version migration)
	|--------------------------------------------------------------------------
	*/

	@ApiProperty({ enum: XpertTableStatus })
	@IsEnum(XpertTableStatus)
	@Column({ length: 30, default: XpertTableStatus.DRAFT })
	status: XpertTableStatus

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	message?: string

	/*
	|--------------------------------------------------------------------------
	| Physical Table Structure Information (Physical Table)
	|--------------------------------------------------------------------------
	| physicalSchema: Dedicated schema, e.g., "xpert_data"
	| physicalTableName: System-generated physical table name
	| version: Schema version (default 1, increments by 1 after field modifications)
	|--------------------------------------------------------------------------
	*/

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	physicalSchema?: string // eg. 'xpert_data'

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 150 })
	physicalTableName?: string // eg. 'xd_ta3f1a_ws9b2_xpd10_cuord_v1'

	@ApiPropertyOptional({ type: () => Number })
	@IsOptional()
	@Column({ type: 'int', nullable: true, default: 1 })
	version?: number

	@ApiPropertyOptional({ type: () => 'timestamptz' })
	@IsOptional()
	@Column({ type: 'timestamptz', nullable: true })
	activatedAt?: Date

	/*
	|--------------------------------------------------------------------------
	| Soft Delete
	|--------------------------------------------------------------------------
	*/

	@ApiPropertyOptional({ type: () => 'timestamptz' })
	@DeleteDateColumn({ nullable: true })
	deletedAt?: Date
}
