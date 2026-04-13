/*
 *  Approval Policy is predefined approval types for the organization.
 *	E.g. for example, "Business Trip", "Borrow Items", ...
 *  Approval Policy table has the many to one relationship to the Organization table and Tenant by organizationId and tenantId
 */
import { Entity, Index, Column } from 'typeorm';
import { IApprovalPolicy } from '@xpert-ai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core';

@Entity('approval_policy')
export class ApprovalPolicy extends TenantOrganizationBaseEntity
	implements IApprovalPolicy {

	@ApiProperty({ type: () => String })
	@Index()
	@Column()
	name: string;

	@ApiProperty({ type: () => String })
	@Column({ nullable: true })
	description: string;

	@ApiProperty({ type: () => String })
	@Column({ nullable: true })
	approvalType: string;
}
