import type { ITaskControlPublication, TaskControlTransport } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '../core/entities/tenant-organization-base.entity'
import { Column, Entity, Index } from 'typeorm'

/** Transactional queue publication; consumers validate the payload at their transport boundary. */
@Entity('execution_task_publication')
export class TaskControlPublication extends TenantOrganizationBaseEntity implements ITaskControlPublication {
	declare tenantId: string
	@Index('IDX_execution_task_publication_target', { unique: true })
	@Column({ type: 'uuid' })
	targetId: string
	@Column({ type: 'varchar' }) transport: TaskControlTransport
	@Column({ type: 'jsonb' }) payload: unknown
	@Column({ type: 'jsonb', nullable: true }) result: unknown | null
	@Column({ type: 'timestamptz', default: () => 'now()' }) nextAttemptAt: Date
	@Column({ type: 'timestamptz', nullable: true }) publishedAt: Date | null
}
