import { AiProvider, ICopilotUser, IOrganization, IUser } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Organization, TenantOrganizationBaseEntity, User } from '@metad/server-core'
import { Copilot } from '../core/entities/internal'

/**
 * Unique index: user, provider, model
 */
@Entity('copilot_user')
export class CopilotUser extends TenantOrganizationBaseEntity implements ICopilotUser {

	@ApiProperty({ type: () => User })
	@ManyToOne(() => User, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	user?: IUser

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: CopilotUser) => it.user)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	userId?: string

	/*
    |--------------------------------------------------------------------------
    | Attributes 
    |--------------------------------------------------------------------------
    */
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	provider?: AiProvider | string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, })
	model?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 13 })
	usageHour: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'integer', nullable: true })
	tokenLimit?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ 
		type: 'numeric', 
		precision: 10, 
		scale: 7, 
		nullable: true,
		transformer: {
			to: (value?: number) => value,
			from: (value: string | null) => value !== null ? parseFloat(value) : null,
		},
	 })
	priceLimit?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'integer', nullable: true, default: 0 })
	tokenUsed?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'integer', nullable: true, default: 0 })
	tokenTotalUsed?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ 
		type: 'numeric', 
		precision: 10, 
		scale: 7, 
		nullable: true,
		transformer: {
			to: (value?: number) => value,
			from: (value: string | null) => value !== null ? parseFloat(value) : null,
		},
	 })
	priceUsed?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ 
		type: 'numeric', 
		precision: 10, 
		scale: 7, 
		nullable: true,
		transformer: {
			to: (value?: number) => value,
			from: (value: string | null) => value !== null ? parseFloat(value) : null,
		},
	 })
	priceTotalUsed?: number

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	currency?: string

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Organization, readOnly: true })
	@ManyToOne(() => Organization, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	org?: IOrganization

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: CopilotUser) => it.org)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	orgId?: string

	@ApiProperty({ type: () => Copilot })
	@ManyToOne(() => Copilot, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	copilot?: Copilot

	@ApiProperty({ type: () => String })
	@RelationId((it: CopilotUser) => it.copilot)
	@IsString()
	@Column({ nullable: true })
	copilotId?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	xpertId?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	threadId: string
}
