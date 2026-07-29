import { IReferralRelation, IUser } from '@xpert-ai/contracts'
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { TenantBaseEntity } from '../core/entities/tenant-base.entity'
import { User } from '../user/user.entity'

@Entity('referral_relation')
@Index('UQ_referral_relation_tenant_referred_user', ['tenantId', 'referredUserId'], { unique: true })
@Index('IDX_referral_relation_tenant_referrer_user', ['tenantId', 'referrerUserId'])
export class ReferralRelation extends TenantBaseEntity implements IReferralRelation {
	@Column({ type: 'uuid', nullable: true })
	referrerUserId?: string | null

	@ManyToOne(() => User, {
		nullable: true,
		onDelete: 'SET NULL'
	})
	@JoinColumn({ name: 'referrerUserId' })
	referrerUser?: IUser | null

	@Column({ type: 'uuid', nullable: true })
	referredUserId?: string | null

	@ManyToOne(() => User, {
		nullable: true,
		onDelete: 'SET NULL'
	})
	@JoinColumn({ name: 'referredUserId' })
	referredUser?: IUser | null

	@Column({ type: 'varchar', length: 10 })
	usedCode: string

	@CreateDateColumn({ type: 'timestamptz' })
	boundAt: Date
}
