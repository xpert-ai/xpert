import { AiProvider, ICopilotOrganization, IOrganization } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Organization, OrganizationPublicDTO, TenantBaseEntity, TenantOrganizationBaseEntity } from '@metad/server-core'
import { Copilot } from '../core/entities/internal'

@Entity('copilot_organization')
export class CopilotOrganization extends TenantBaseEntity implements ICopilotOrganization {

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 20 })
	provider?: AiProvider | string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, })
	model?: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'integer', nullable: true })
	tokenLimit?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
	priceLimit?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'integer', nullable: true, default: 0 })
	tokenUsed?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'integer', nullable: true, default: 0 })
	tokenTotalUsed?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
	priceUsed?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
	priceTotalUsed?: number

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	currency?: string

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	@Transform(({ value }) => value && new OrganizationPublicDTO(value))
	@ApiProperty({ type: () => Organization, readOnly: true })
	@ManyToOne(() => Organization, {
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
	@Column({ nullable: true })
	organizationId?: string

	@ApiProperty({ type: () => Copilot })
	@ManyToOne(() => Copilot, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	copilot?: Copilot

	@ApiProperty({ type: () => String })
	@RelationId((it: CopilotOrganization) => it.copilot)
	@IsString()
	@Column({ nullable: true })
	copilotId?: string
}
