import { FeedTypeEnum, IFeed } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity } from 'typeorm'
import { IsJSON, IsOptional } from 'class-validator'

@Entity('feed')
export class Feed extends TenantOrganizationBaseEntity implements IFeed {
	@Column({ type: 'varchar' })
	type: FeedTypeEnum

	@Column({ nullable: true })
	entityId?: string

	@Column({ nullable: true })
	hidden?: boolean

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: any
}
