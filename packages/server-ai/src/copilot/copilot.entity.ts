import { AiProviderRole, ICopilot, ICopilotModel, ICopilotProvider, TCopilotTokenUsage } from '@metad/contracts'
import { IsSecret, TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { IsBoolean, IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, OneToOne, RelationId } from 'typeorm'
import { CopilotModel, CopilotProvider } from '../core/entities/internal'

@Entity('copilot')
export class Copilot extends TenantOrganizationBaseEntity implements ICopilot {

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ default: false })
	enabled?: boolean

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 10 })
	role: AiProviderRole

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
	showTokenizer?: boolean

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: any

	@ApiProperty({ type: () => String })
	@Expose({ toPlainOnly: true, name: 'apiKey' })
	@IsSecret()
	secretKey?: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	tokenBalance?: number

	/*
    |--------------------------------------------------------------------------
    | @OneToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => CopilotProvider })
	@OneToOne(() => CopilotProvider, (provider) => provider.copilot, { eager: true })
	@IsOptional()
	modelProvider?: ICopilotProvider

	@ApiProperty({ type: () => CopilotModel })
	@IsOptional()
	@OneToOne(() => CopilotModel, { 
		eager: true,
		cascade: ["insert", "update", "remove", "soft-remove", "recover"]
	})
	@JoinColumn()
	copilotModel?: ICopilotModel

	@ApiProperty({ type: () => String })
	@RelationId((it: Copilot) => it.copilotModel)
	@IsString()
	@Column({ nullable: true })
	readonly copilotModelId?: string

	// Temporary properties
	usage?: TCopilotTokenUsage

	// @AfterLoad()
	// afterLoadEntity?() {
	// 	this.secretKey = this.apiKey
	// 	WrapSecrets(this, this)
	// }
}
