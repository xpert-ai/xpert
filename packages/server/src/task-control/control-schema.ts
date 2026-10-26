// Only inspect the current database/schema. Never migrate or infer historical completion on a read.
import { ServiceUnavailableException } from '@nestjs/common'
import { t } from 'i18next'
import type { EntityManager } from 'typeorm'
import { z } from 'zod'

export type ControlSchemaRequirement = Readonly<{ table: string; columns: readonly string[] }>
export const taskControlSchema: readonly ControlSchemaRequirement[] = [
	{
		table: 'execution_task_control',
		columns: [
			'id',
			'createdAt',
			'updatedAt',
			'createdById',
			'updatedById',
			'rootId',
			'parentId',
			'tenantId',
			'organizationId',
			'kind',
			'resourceId',
			'policy',
			'ancestors',
			'currentExecutionId',
			'threadId',
			'attempts',
			'desired',
			'revision',
			'state',
			'claim',
			'drainOnPause',
			'nextCheckAt',
			'deliveryToken',
			'deliveryUntil',
			'observation',
			'outcome'
		]
	},
	{
		table: 'execution_task_publication',
		columns: [
			'id',
			'tenantId',
			'organizationId',
			'createdAt',
			'updatedAt',
			'createdById',
			'updatedById',
			'targetId',
			'transport',
			'payload',
			'result',
			'nextAttemptAt',
			'publishedAt'
		]
	}
]
const columnsSchema = z.array(z.object({ table_name: z.string(), column_name: z.string() }))

export async function controlSchemaReady(manager: EntityManager, requirements: readonly ControlSchemaRequirement[]) {
	const rows = columnsSchema.parse(
		await manager.query(
			'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY($1::text[])',
			[requirements.map((item) => item.table)]
		)
	)
	return requirements.every((item) =>
		item.columns.every((column) => rows.some((row) => row.table_name === item.table && row.column_name === column))
	)
}

export function controlAdmissionUnavailable(reason: 'schema' | 'handler' | 'worker' | 'protocol') {
	return new ServiceUnavailableException({
		statusCode: 503,
		errorCode: 'EXECUTION_CONTROL_UNAVAILABLE',
		reason,
		retryAfter: 5,
		message: t('server-ai:Error.ExecutionControlUnavailable', {
			defaultValue: 'Execution control is temporarily unavailable. Please try again later.'
		})
	})
}

export async function requireControlSchema(manager: EntityManager, requirements: readonly ControlSchemaRequirement[]) {
	try {
		if (await controlSchemaReady(manager, requirements)) return
	} catch {
		/* A failed schema read never admits new work. */
	}
	throw controlAdmissionUnavailable('schema')
}
