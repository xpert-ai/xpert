import { IReferralCode, IUser } from '@xpert-ai/contracts'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { TenantBaseEntity } from '../core/entities/tenant-base.entity'
import { User } from '../user/user.entity'

@Entity('referral_code')
@Index('UQ_referral_code_tenant_code', ['tenantId', 'code'], { unique: true })
@Index('UQ_referral_code_tenant_user', ['tenantId', 'userId'], { unique: true })
@Check('CHK_referral_code_uppercase', '"code" = UPPER("code")')
@Check('CHK_referral_code_format', `"code" ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$'`)
export class ReferralCode extends TenantBaseEntity implements IReferralCode {
	@Column({ type: 'varchar', length: 10 })
	code: string

	@Column({ type: 'uuid', nullable: true })
	userId?: string | null

	@ManyToOne(() => User, {
		nullable: true,
		onDelete: 'SET NULL'
	})
	@JoinColumn({ name: 'userId' })
	user?: IUser | null
}
