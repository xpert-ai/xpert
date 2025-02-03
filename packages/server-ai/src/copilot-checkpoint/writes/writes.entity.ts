import { ICopilotCheckpointWrites } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('copilot_checkpoint_writes')
@Index(['organizationId', 'thread_id', 'checkpoint_ns', 'checkpoint_id', 'task_id', 'idx'], {unique: true})
export class CopilotCheckpointWrites extends TenantOrganizationBaseEntity implements ICopilotCheckpointWrites {
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
	task_id?: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@Column({ nullable: true })
	idx?: number

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ nullable: true, length: 100 })
	channel?: string

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
	value: Uint8Array
}
