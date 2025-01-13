import { AiProvider, ICopilotUser, IOrganization, IUser } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Organization, TenantOrganizationBaseEntity, User } from '@metad/server-core'
import { Copilot } from '../core/entities/internal'

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
	@Column({ nullable: true, length: 20 })
	provider?: AiProvider | string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, })
	model?: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	tokenLimit?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	tokenUsed?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	tokenTotalUsed?: number

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
}
