import { Entity, Index, Column, AfterLoad } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'

import { IPasswordReset } from '@xpert-ai/contracts'
import { resetTokenLifetimeMs } from './reset-token'
import { BaseEntity } from './../core/entities/base.entity'

@Entity('password_reset')
@Index('UQ_password_reset_bound_token', ['token'], { unique: true, where: '"userId" IS NOT NULL' })
export class PasswordReset extends BaseEntity implements IPasswordReset {
	@ApiProperty({ type: () => String })
	@Index()
	@Column()
	email: string

	@ApiProperty({ type: () => String })
	@Index()
	@Column()
	token: string

	// NULL userId identifies historical emailed JWTs, retained only for access-token revocation.
	@Column({ type: 'uuid', nullable: true })
	userId?: string | null

	@Column({ type: 'uuid', nullable: true })
	tenantId?: string

	expired?: boolean

	/**
	 * Called after entity is loaded.
	 */
	@AfterLoad()
	afterLoadEntity?() {
		this.expired = !this.createdAt || Date.now() - this.createdAt.getTime() >= resetTokenLifetimeMs
	}
}
