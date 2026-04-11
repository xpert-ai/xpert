import { IXpertTemplate } from '@xpert-ai/contracts'
import { TenantBaseEntity } from '@xpert-ai/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsString } from 'class-validator'
import { Column, Entity } from 'typeorm'

@Entity('xpert_template')
export class XpertTemplate extends TenantBaseEntity implements IXpertTemplate {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	key: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ nullable: true })
	name?: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@Column({ default: 0 })
	visitCount: number

	@ApiPropertyOptional({ type: () => Date })
	@Column({ nullable: true })
	lastVisitedAt?: Date
}
