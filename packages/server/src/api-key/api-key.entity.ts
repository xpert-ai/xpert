import { ApiKeyBindingType, IApiKey } from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator';
import { differenceInMinutes } from 'date-fns'
import { AfterLoad, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { TenantOrganizationBaseEntity, User } from '../core/entities/internal'

@Entity('api_key')
export class ApiKey extends TenantOrganizationBaseEntity implements IApiKey {
	
	@ApiProperty({ type: () => String })
	@Index()
	@Column()
	token: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name?: string;

	@ApiProperty({ type: () => String })
	/**
	 * Stable binding kind for resolving the technical principal behind this key.
	 */
	@Column({ type: 'varchar', nullable: true })
	type?: ApiKeyBindingType

	/**
	 * Stable binding target used together with `type` to resolve the technical principal.
	 */
	@ApiProperty({ type: () => String })
	@Column({ nullable: true })
	entityId?: string

	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2024-11-21T06:20:32.232Z'
	})
	@Column({
		type: 'timestamptz',
		nullable: true
	})
	validUntil?: Date

	expired?: boolean

	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2024-11-21T06:20:32.232Z'
	})
	@Column({
		type: 'timestamptz',
		nullable: true
	})
	lastUsedAt?: Date

	/**
	 * Explicit technical principal bound to this key.
	 * If set, auth uses this user directly instead of resolving via `type/entityId`.
	 */
	@Column({ nullable: true })
	userId?: string

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn()
	user?: User

	/**
	 * Called after entity is loaded.
	 */
	@AfterLoad()
	afterLoadEntity?() {
		this.expired = this.validUntil && (differenceInMinutes(new Date(), this.validUntil) > 0)
	}
}
