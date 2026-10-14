import { Exclude } from 'class-transformer'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import type { IUser } from '@xpert-ai/contracts'
import { TenantBaseEntity } from '../../core/entities/tenant-base.entity'

@Entity('personal_api_key')
@Index(['tenantId', 'userId'])
export class PersonalApiKey extends TenantBaseEntity {
	@Column({ type: 'uuid' })
	userId: string

	@ManyToOne('User', { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user?: IUser

	@Column({ type: 'varchar', length: 100 })
	name: string

	@Exclude()
	@Index({ unique: true })
	@Column({ type: 'varchar', length: 64, select: false })
	tokenHash: string

	@Column({ type: 'varchar', length: 20 })
	prefix: string

	@Column({ type: 'timestamptz', nullable: true })
	expiresAt: Date | null

	@Column({ type: 'timestamptz', nullable: true })
	lastUsedAt: Date | null

	@Column({ type: 'timestamptz', nullable: true })
	revokedAt: Date | null
}
