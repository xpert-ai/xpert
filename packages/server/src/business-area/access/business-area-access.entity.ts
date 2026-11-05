import type { IBusinessAreaAccessGrant, TBusinessAreaRole } from '@xpert-ai/contracts'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { TenantOrganizationBaseEntity } from '../../core/entities/tenant-organization-base.entity'
import { BusinessArea } from '../business-area.entity'
import { User } from '../../user/user.entity'
import { UserGroup } from '../../user-group/user-group.entity'

@Entity('business_area_access_grant')
@Index('IDX_business_area_grant_user', ['tenantId', 'organizationId', 'businessAreaId', 'userId'], {
	unique: true,
	where: '"userId" IS NOT NULL'
})
@Index('IDX_business_area_grant_group', ['tenantId', 'organizationId', 'businessAreaId', 'userGroupId'], {
	unique: true,
	where: '"userGroupId" IS NOT NULL'
})
@Check(
	'CHK_business_area_grant_subject',
	`("subjectType" = 'user' AND "userId" IS NOT NULL AND "userGroupId" IS NULL) OR ("subjectType" = 'user_group' AND "userGroupId" IS NOT NULL AND "userId" IS NULL)`
)
@Check('CHK_business_area_grant_role', `"role" IN ('consumer', 'publisher', 'domain_admin')`)
export class BusinessAreaAccessGrant extends TenantOrganizationBaseEntity implements IBusinessAreaAccessGrant {
	declare id: string
	declare createdAt: Date
	declare updatedAt: Date
	@Column({ type: 'uuid' }) businessAreaId: string
	@ManyToOne(() => BusinessArea, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'businessAreaId' })
	businessArea?: BusinessArea
	@Column({ type: 'varchar', length: 20 }) subjectType: 'user' | 'user_group'
	@Column({ type: 'uuid', nullable: true }) userId?: string | null
	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'userId' })
	user?: User
	@Column({ type: 'uuid', nullable: true }) userGroupId?: string | null
	@ManyToOne(() => UserGroup, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'userGroupId' })
	userGroup?: UserGroup
	@Column({ type: 'varchar', length: 20 }) role: TBusinessAreaRole
}
