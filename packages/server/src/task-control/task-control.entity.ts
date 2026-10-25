import { TenantOrganizationBaseEntity } from '../core/entities/tenant-organization-base.entity'
import { Column, Entity, Index } from 'typeorm'
import type {
	IExecutionTaskControl,
	TaskControlIntent,
	TaskControlKind,
	TaskControlPolicy,
	TaskControlState
} from '@xpert-ai/contracts'

/** Stable task identity survives graph attempts. Terminal receipts never reopen a task. */
@Entity('execution_task_control')
@Index(['rootId'])
@Index(['kind', 'resourceId', 'tenantId', 'organizationId'], { unique: true })
export class ExecutionTaskControl extends TenantOrganizationBaseEntity implements IExecutionTaskControl {
	// TaskControlStore supplies a deterministic id; inherit the single persistence primary key.
	declare id: string
	declare tenantId: string
	@Column({ type: 'uuid' }) rootId: string
	@Column({ type: 'uuid', nullable: true }) parentId: string | null
	@Column({ type: 'varchar' }) kind: TaskControlKind
	@Column({ type: 'varchar' }) resourceId: string
	@Column({ type: 'varchar' }) policy: TaskControlPolicy
	@Column({ type: 'jsonb' }) ancestors: string[]
	@Column({ type: 'varchar', nullable: true }) threadId: string | null
	@Column({ type: 'varchar', nullable: true }) currentExecutionId: string | null
	@Column({ type: 'jsonb', default: [] }) attempts: string[]
	@Column({ type: 'varchar', default: 'running' }) desired: TaskControlIntent
	@Column({ type: 'int', default: 1 }) revision: number
	@Column({ type: 'varchar', default: 'queued' }) state: TaskControlState
	@Column({ type: 'uuid', nullable: true }) claim: string | null
	/** Allows an already admitted synchronous dependency to drain during pause. */
	@Column({ type: 'boolean', default: false }) drainOnPause: boolean
	@Column({ type: 'timestamptz', default: () => 'now()' }) nextCheckAt: Date
	@Column({ type: 'uuid', nullable: true }) deliveryToken: string | null
	@Column({ type: 'timestamptz', nullable: true }) deliveryUntil: Date | null
	@Column({ type: 'varchar', nullable: true }) observation: string | null
	@Column({ type: 'varchar', nullable: true }) outcome: 'succeeded' | 'failed' | null
}
