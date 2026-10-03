// Invariants: executable receipts and model grants are separate. Unknown dispatches are never replayed.
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { ModelExecutionEnvironment } from '@xpert-ai/contracts'
import { Column, Entity, Index } from 'typeorm'
import { z } from 'zod/v3'
import { executionEnvironmentSchema, executionJson, executionToolSchema } from '../model-execution/execution-schema'

export const shellBindingSchema = z
    .object({
        conversationId: z.string().uuid(),
        xpertId: z.string().uuid(),
        assistantVersion: z.string().min(1),
        modelId: z.string().min(1),
        environment: executionEnvironmentSchema,
        workingDirectory: z.string().min(1),
        tokenBudget: z.number().int().positive()
    })
    .strict()
export const shellRunnerSchema = z
    .object({ receiptId: z.string().min(1), user: z.string().min(1) })
    .strict()
    .nullable()
export type ShellExecutionStatus =
    | 'preparing'
    | 'prepared'
    | 'starting'
    | 'running'
    | 'exited'
    | 'failed'
    | 'stopped'
    | 'unknown'

@Entity('shell_process_execution')
@Index(['tenantId', 'parentExecutionId', 'toolCallId'], { unique: true })
export class ShellProcessExecution extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) ownerId: string
    @Column({ type: 'uuid' }) parentExecutionId: string
    @Column({ type: 'varchar' }) toolCallId: string
    @Column({ type: 'varchar' }) commandHash: string
    @Column({ type: 'int', default: 1 }) generation: number
    @Column({ type: 'int', default: 0 }) maintenanceFence: number
    @Column({ type: 'jsonb', transformer: executionJson(shellBindingSchema) }) binding: Omit<
        z.output<typeof shellBindingSchema>,
        'environment'
    > & { environment: ModelExecutionEnvironment }
    @Column({ type: 'jsonb', nullable: true, transformer: executionJson(shellRunnerSchema) }) runner: z.output<
        typeof shellRunnerSchema
    >
    @Column({ type: 'varchar', default: 'preparing' }) status: ShellExecutionStatus
    @Column({ type: 'timestamptz' }) deadline: Date
    @Column({ type: 'timestamptz', nullable: true }) observedAt: Date | null
    @Column({ type: 'int', nullable: true }) exitCode: number | null
}

@Entity('shell_cli_execution')
@Index(['tenantId', 'shellExecutionId'])
export class ShellCliExecution extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) ownerId: string
    @Column({ type: 'uuid' }) shellExecutionId: string
    @Column({ type: 'int' }) generation: number
    @Column({ type: 'jsonb', transformer: executionJson(executionToolSchema) }) tool: { id: string; version: string }
    @Column({ type: 'varchar' }) profileRevision: string
    @Column({ type: 'varchar', default: 'preparing' }) status: ShellExecutionStatus
    @Column({ type: 'uuid', nullable: true }) grantId: string | null
    @Column({ type: 'int', nullable: true }) exitCode: number | null
}
