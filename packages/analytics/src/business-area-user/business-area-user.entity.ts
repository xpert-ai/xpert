import { ApiProperty } from '@nestjs/swagger'
import { BusinessAreaRole, IBusinessArea, IBusinessAreaUser, IUser } from '@xpert-ai/contracts'
import {
	TenantOrganizationBaseEntity,
	User,
	UserOrganization,
} from '@xpert-ai/server-core'
import { IsNotEmpty, IsString } from 'class-validator'
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	RelationId,
} from 'typeorm'
import { AuthActions } from '../core/casl/action'
import { BusinessArea } from '../core/entities/internal'


@Entity('business_area_user')
export class BusinessAreaUser
	extends TenantOrganizationBaseEntity
	implements IBusinessAreaUser
{

	@ApiProperty({ type: () => Boolean, default: true })
	@Column({ default: true })
	isDefault: boolean

	@ApiProperty({ type: () => Boolean, default: true })
	@Column({ default: true })
	isActive: boolean

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	/**
	 * User
	 */
	@ApiProperty({ type: () => User })
	@ManyToOne(() => User, (user) => user.organizations, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	user?: IUser

	@ApiProperty({ type: () => String })
	@RelationId((it: UserOrganization) => it.user)
	@IsString()
	@IsNotEmpty()
	@Column()
	userId: string

	/**
	 * BusinessArea
	 */
	@ApiProperty({ type: () => BusinessArea })
	@ManyToOne(() => BusinessArea, (group) => group.users, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	businessArea?: IBusinessArea

	@ApiProperty({ type: () => String })
	@RelationId((it: BusinessAreaUser) => it.businessArea)
	@IsString()
	@IsNotEmpty()
	@Column()
	businessAreaId: string

	@IsNotEmpty()
	@Column({ type: 'int', default: BusinessAreaRole.Viewer })
	role: BusinessAreaRole

	@Column({type: 'json', array: true, nullable: true })
	actions: AuthActions[]
}
