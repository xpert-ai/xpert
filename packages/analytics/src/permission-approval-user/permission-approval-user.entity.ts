/**
 * Permission Approval table 与 User table 的 Many to Many 映射表
 */
import { Entity, Column, ManyToOne, Index, RelationId } from 'typeorm';
import { IPermissionApproval, IPermissionApprovalUser, IUser } from '@xpert-ai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core';
import { PermissionApproval } from '../core/entities/internal';


@Entity('permission_approval_user')
export class PermissionApprovalUser
	extends TenantOrganizationBaseEntity
	implements IPermissionApprovalUser {

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@Column({ nullable: true })
	status: number;

	@ManyToOne(() => PermissionApproval, (permissionApproval) => permissionApproval.userApprovals, { 
		onDelete: 'CASCADE'
	})
	public permissionApproval!: IPermissionApproval;

	@ApiProperty({ type: () => String })
	@RelationId((it: PermissionApprovalUser) => it.permissionApproval)
	@IsString()
	@IsNotEmpty()
	@Index()
	@Column()
	public permissionApprovalId!: string;

	@ManyToOne(() => User)
	public user!: IUser;

	@ApiProperty({ type: () => String })
	@RelationId((it: PermissionApprovalUser) => it.user)
	@IsString()
	@IsNotEmpty()
	@Index()
	@Column()
	public userId!: string;
}
