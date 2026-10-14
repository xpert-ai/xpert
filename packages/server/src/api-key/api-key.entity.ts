import { ApiKeyBindingType, IApiKey } from '@xpert-ai/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { differenceInMinutes } from 'date-fns'
import { AfterLoad, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { TenantOrganizationBaseEntity, User } from '../core/entities/internal'

@Entity('api_key')
@Index('IDX_api_key_personal_token', ['token'], { unique: true, where: `"type" = 'user'` })
export class ApiKey extends TenantOrganizationBaseEntity implements IApiKey {
	@ApiProperty({ type: () => String })
	@Index()
	@Column()
	token: string

	@Column({ type: 'varchar', length: 20, nullable: true })
	prefix?: string | null

	@Column({ type: 'timestamptz', nullable: true })
	revokedAt?: Date | null

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name?: string

	@ApiProperty({ type: () => String })
	/**
	 * Stable binding kind for resolving the human or resource principal behind this key.
	 */
	@Column({ type: 'varchar', nullable: true })
	type?: ApiKeyBindingType

	/**
	 * Stable binding target used together with `type` to resolve the principal.
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
	 * Bound principal: a fixed human owner for USER keys, otherwise the technical principal.
	 * USER bindings must also match entityId; resource bindings prefer this explicit principal.
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
		this.expired = this.validUntil && differenceInMinutes(new Date(), this.validUntil) > 0
	}
}
