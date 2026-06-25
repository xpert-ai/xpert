import { ApiProperty } from '@nestjs/swagger'
import { Column, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { IsOptional, IsString } from 'class-validator'
import { IOrganization, IBasePerTenantAndOrganizationEntityModel } from '@xpert-ai/contracts'
import { TenantBaseEntity } from './tenant-base.entity'

export abstract class TenantOrganizationBaseEntity
	extends TenantBaseEntity
	implements IBasePerTenantAndOrganizationEntityModel
{
	@ApiProperty({ type: () => Object, readOnly: true })
	@ManyToOne('Organization', {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	organization?: IOrganization

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: TenantOrganizationBaseEntity) => it.organization)
	@IsString()
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	organizationId?: string
}
