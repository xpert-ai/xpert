import { IUser, IUserGroup } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm'
import { TenantOrganizationBaseEntity, User } from '../core/entities/internal'

@Entity('user_group')
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

	@ApiProperty({ type: () => User, isArray: true })
	@ManyToMany(() => User, {
		onUpdate: 'CASCADE'
	})
	@JoinTable({
		name: 'user_group_to_user'
	})
	members?: IUser[]
}
