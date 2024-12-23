import { ICopilotStore, IUser } from '@metad/contracts'
import { TenantOrganizationBaseEntity, User, UserPublicDTO } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

@Entity('copilot_store')
@Index('key_in_org', ['organizationId', 'prefix', 'key'], { unique: true })
@Index('key_in_namespace', ['prefix', 'key'], { unique: true })
export class CopilotStore extends TenantOrganizationBaseEntity implements ICopilotStore {
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column()
	prefix: string

	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column()
	key: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'jsonb' })
	value: any

	@ApiProperty({ type: () => User, readOnly: true })
	@Transform(({ value }) => new UserPublicDTO(value))
	@ManyToOne(() => User, {
		nullable: true,
		onDelete: 'RESTRICT'
	})
	@JoinColumn()
	@IsOptional()
	declare createdBy?: IUser
}
