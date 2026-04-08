/*
  - Request Approval is a request which is made by the employee. The employee can ask the approver for approvals different things.
  E.g. business trips, job referral awards, etc.
  - Request Approval table has the many to one relationship to ApprovalPolicy table by approvalPolicyId
  - Request Approval table has the one to many relationships to PermissionApprovalEmployee table
  - Request Approval table has the many to many relationships to the Employee table through the PermissionApprovalEmployee table.
*/
import {
	Entity,
	Column,
	OneToMany,
	RelationId,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import {
	IPermissionApproval,
	ApprovalPolicyTypesStringEnum,
	IApprovalPolicy,
	IPermissionApprovalUser,
	IIndicator,
	IBusinessArea,
} from '@metad/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum } from 'class-validator';
import { TenantOrganizationBaseEntity } from '@metad/server-core';
import { ApprovalPolicy, BusinessArea, Indicator, PermissionApprovalUser } from '../core/entities/internal';


@Entity('permission_approval')
export class PermissionApproval
	extends TenantOrganizationBaseEntity
	implements IPermissionApproval {

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@Column({ nullable: true })
	status: number;

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ nullable: true })
	createdByName: string;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@Column({ nullable: true })
	min_count: number;

	@ApiProperty({ type: () => String, readOnly: true })
	@IsString()
	@Column({ nullable: true })
	permissionId: string;

	@ApiProperty({ type: () => String, enum: ApprovalPolicyTypesStringEnum })
	@IsEnum(ApprovalPolicyTypesStringEnum)
	@Column({ type: 'varchar', nullable: true })
	permissionType: ApprovalPolicyTypesStringEnum;

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
   	
	/**
	*  ApprovalPolicy
    */
	@ApiProperty({ type: () => ApprovalPolicy })
	@ManyToOne(() => ApprovalPolicy, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	approvalPolicy: IApprovalPolicy;

	@ApiProperty({ type: () => String })
	@RelationId((it: PermissionApproval) => it.approvalPolicy)
	@IsString()
	@Column({ nullable: true })
	approvalPolicyId: string;

	/**
	*  Indicator
    */
	@ApiProperty({ type: () => Indicator })
	@ManyToOne(() => Indicator, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	indicator: IIndicator;

	@ApiProperty({ type: () => String })
	@RelationId((it: PermissionApproval) => it.indicator)
	@IsString()
	@Column({ nullable: true })
	indicatorId: string;

	@ManyToOne(() => BusinessArea, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	indicatorGroup?: IBusinessArea

	/*
    |--------------------------------------------------------------------------
    | @OneToMany 
    |--------------------------------------------------------------------------
    */

	/**
	 * PermissionApprovalUser
	 */
	@ApiPropertyOptional({ type: () => PermissionApprovalUser, isArray: true })
	@OneToMany(() => PermissionApprovalUser, (userApprovals) => userApprovals.permissionApproval, {
		cascade: true
	})
	userApprovals?: IPermissionApprovalUser[];

}
