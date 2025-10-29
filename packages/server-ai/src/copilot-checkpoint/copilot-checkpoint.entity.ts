import { ICopilotCheckpoint } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('copilot_checkpoint')
@Index(['thread_id', 'checkpoint_ns', 'checkpoint_id'])
@Index(['organizationId', 'thread_id', 'checkpoint_ns', 'checkpoint_id'], {unique: true})
export class CopilotCheckpoint extends TenantOrganizationBaseEntity implements ICopilotCheckpoint {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	thread_id: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ length: 1000 })
	checkpoint_ns: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	checkpoint_id: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ nullable: true, length: 100 })
	parent_id?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ nullable: true, length: 100 })
	type?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({
		type: 'bytea',
		// transformer: {
		// 	to: (value?: string) => (value ? Buffer.from(value, 'utf-8') : value),
		// 	from: (value?: Buffer) => (Buffer.isBuffer(value) ? value.toString('utf-8') : value)
		// }
	})
	checkpoint: Uint8Array

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({
		type: 'bytea',
	})
	metadata: Uint8Array
}
