import { IUser, IUserGroup, UserGroupManagedByEnum, UserGroupManagedEntityTypeEnum } from '@xpert-ai/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm'
import { TenantOrganizationBaseEntity, User } from '../core/entities/internal'

@Entity('user_group')
@Index(
	'IDX_user_group_managed_entity_unique',
	['tenantId', 'organizationId', 'managedBy', 'managedEntityType', 'managedEntityId'],
	{
		unique: true,
		where: `"managedBy" IS NOT NULL AND "managedEntityType" IS NOT NULL AND "managedEntityId" IS NOT NULL`
	}
)
export class UserGroup extends TenantOrganizationBaseEntity implements IUserGroup {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	name: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	description?: string | null

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ type: 'varchar', length: 64, nullable: true })
	managedBy?: UserGroupManagedByEnum | null

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ type: 'varchar', length: 64, nullable: true })
	managedEntityType?: UserGroupManagedEntityTypeEnum | null

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ type: 'uuid', nullable: true })
	managedEntityId?: string | null

	@ApiProperty({ type: () => User, isArray: true })
	@ManyToMany(() => User, {
		onUpdate: 'CASCADE'
	})
	@JoinTable({
		name: 'user_group_to_user'
	})
	members?: IUser[]
}
