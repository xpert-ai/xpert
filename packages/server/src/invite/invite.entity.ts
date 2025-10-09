import {
	IInvite,
	InviteStatusEnum,
	IOrganizationContact,
	IUser,
	IRole
} from '@metad/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import {
	Column,
	Entity,
	Index,
	JoinColumn,
	JoinTable,
	ManyToMany,
	ManyToOne,
	RelationId
} from 'typeorm';
import {
	OrganizationContact,
	Role,
	TenantOrganizationBaseEntity,
	User
} from '../core/entities/internal';

@Entity('invite')
export class Invite extends TenantOrganizationBaseEntity implements IInvite {
	
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Index({ unique: true })
	@Column()
	token: string;

	@ApiProperty({ type: () => String, minLength: 3, maxLength: 100 })
	@IsEmail()
	@IsNotEmpty()
	@Index({ unique: true })
	@Column()
	email: string;

	@ApiProperty({ type: () => String, enum: InviteStatusEnum })
	@IsEnum(InviteStatusEnum)
	@IsNotEmpty()
	@Column()
	status: string;

	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@Column({ nullable: true })
	expireDate: Date;

	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@Column({ nullable: true })
	actionDate?: Date;

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */

	// Invited By User
	@ApiPropertyOptional({ type: () => User })
	@ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn()
	invitedBy?: IUser;

	@ApiProperty({ type: () => String })
	@RelationId((it: Invite) => it.invitedBy)
	@IsString()
	@Index()
	@Column({ nullable: true })
	invitedById: string;

	// Invited User Role
	@ApiPropertyOptional({ type: () => Role })
	@ManyToOne(() => Role, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn()
	role?: IRole;

	@ApiProperty({ type: () => String })
	@RelationId((invite: Invite) => invite.role)
	@IsString()
	@Index()
	@Column({ nullable: true })
	roleId: string;

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */

	@ApiPropertyOptional({ type: () => OrganizationContact })
	@ManyToMany(() => OrganizationContact)
	@JoinTable({
		name: 'invite_organization_contact'
	})
	organizationContact?: IOrganizationContact[];

}
