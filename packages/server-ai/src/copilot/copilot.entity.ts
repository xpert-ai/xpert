import { AiProvider, AiProviderRole, ICopilot, ICopilotProvider } from '@metad/contracts'
import { IsSecret, TenantOrganizationBaseEntity, WrapSecrets } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'
import { IsBoolean, IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { AfterLoad, Column, Entity, OneToOne } from 'typeorm'
import { CopilotProvider } from '../core/entities/internal'

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

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 20 })
	provider?: AiProvider

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Exclude({ toPlainOnly: true })
	@Column({ nullable: true })
	apiKey?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	apiHost?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	defaultModel?: string

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
	@OneToOne(() => CopilotProvider, provider => provider.copilot, { eager: true })
	@IsOptional()
	modelProvider?: ICopilotProvider

	@AfterLoad()
	afterLoadEntity?() {
		this.secretKey = this.apiKey
		WrapSecrets(this, this)
	}
}
