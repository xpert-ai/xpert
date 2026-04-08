import { AiModelTypeEnum, ICopilotProvider, ICopilotProviderModel } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { CopilotProvider } from '../../core/entities/internal'

@Entity('copilot_provider_model')
export class CopilotProviderModel extends TenantOrganizationBaseEntity implements ICopilotProviderModel {
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	providerName?: string

	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	modelName?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	modelType?: AiModelTypeEnum

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	modelProperties?: Record<string, any>

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
	isValid?: boolean

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => CopilotProvider })
	@IsOptional()
	@ManyToOne(() => CopilotProvider, (provider) => provider.models, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	provider?: ICopilotProvider

	@ApiProperty({ type: () => String })
	@RelationId((it: CopilotProviderModel) => it.provider)
	@IsString()
	@Column({ nullable: true })
	providerId?: string

	// Temporary properties
}
