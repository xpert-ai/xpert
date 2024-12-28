import { ICopilot, ICopilotProvider, IAiProviderEntity, ICopilotProviderModel } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsBoolean, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, OneToMany, OneToOne, RelationId } from 'typeorm'
import { Copilot } from '../core/entities/internal'
import { CopilotProviderModel } from './models/copilot-provider-model.entity'


@Entity('copilot_provider')
export class CopilotProvider extends TenantOrganizationBaseEntity implements ICopilotProvider {

	@ApiPropertyOptional({type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	providerName?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	providerType?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	credentials?: Record<string, any>

    @ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
    isValid?: boolean

    @ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: Record<string, any>

	/*
    |--------------------------------------------------------------------------
    | @OneToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Copilot })
	@IsOptional()
	@OneToOne(() => Copilot, { onDelete: 'CASCADE' })
	@JoinColumn()
	copilot?: ICopilot

	@ApiProperty({ type: () => String })
	@RelationId((it: CopilotProvider) => it.copilot)
	@IsString()
	@Column({ nullable: true })
	copilotId?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => CopilotProviderModel, isArray: true })
	@OneToMany(() => CopilotProviderModel, (model) => model.provider)
	public models?: ICopilotProviderModel[]

	// Temporary properties
	provider?: IAiProviderEntity
}
