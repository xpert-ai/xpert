import { ICertification, IUser } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'

@Entity('certification')
export class Certification extends TenantOrganizationBaseEntity implements ICertification {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	name?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string

	@ApiProperty({ type: () => User })
	@ManyToOne(() => User)
	@JoinColumn()
	owner: IUser

	@ApiProperty({ type: () => String })
	@RelationId((it: Certification) => it.owner)
	@IsString()
	@Column({ nullable: true })
	ownerId: string
}
