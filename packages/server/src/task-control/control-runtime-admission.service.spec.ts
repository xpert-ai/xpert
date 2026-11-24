import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import { ControlRuntimeAdmissionService } from './control-runtime-admission.service'
import { taskControlSchema } from './control-schema'

describe('control runtime schema refresh', () => {
	async function setup() {
		const query = jest.fn(async (_sql: string, _parameters: unknown[]) =>
			taskControlSchema.flatMap((requirement) =>
				requirement.columns.map((column) => ({ table_name: requirement.table, column_name: column }))
			)
		)
		const reportExecutionControl = jest.fn(async () => undefined)
		const module = await Test.createTestingModule({
			providers: [
				ControlRuntimeAdmissionService,
				{ provide: DataSource, useValue: { manager: { query } } },
				{ provide: InstanceRegistryService, useValue: { reportExecutionControl } }
			]
		}).compile()
		const service = module.get(ControlRuntimeAdmissionService)
		service.registerManagedQueue(['default'], () => [])
		service.register('mcpControl', [{ table: 'mcp_control', columns: ['id'] }])
		return { module, service, query, reportExecutionControl }
	}

	it('checks all capabilities from one fresh catalog snapshot without granting a missing schema', async () => {
		const { module, service, query, reportExecutionControl } = await setup()
		try {
			await service.refresh()
			expect(query).toHaveBeenCalledTimes(1)
			expect(query.mock.calls[0][1]).toEqual([
				['execution_task_control', 'execution_task_publication', 'mcp_control']
			])
			expect(reportExecutionControl).toHaveBeenLastCalledWith(
				expect.objectContaining({
					protocols: { taskControl: 2, managedQueue: 3 }
				})
			)
			query.mockResolvedValueOnce([])
			await service.refresh()
			expect(query).toHaveBeenCalledTimes(2)
			expect(reportExecutionControl).toHaveBeenLastCalledWith(expect.objectContaining({ protocols: {} }))
		} finally {
			await module.close()
		}
	})

	it('withdraws capabilities on an unavailable catalog and keeps the original check expiry', async () => {
		jest.useFakeTimers()
		const { module, service, query, reportExecutionControl } = await setup()
		try {
			query.mockRejectedValueOnce(new Error('temporary database failure'))
			await service.refresh()
			expect(reportExecutionControl).toHaveBeenLastCalledWith(expect.objectContaining({ protocols: {} }))
			const began = Date.now()
			query.mockImplementationOnce(async () => {
				await new Promise<void>((resolve) => setTimeout(resolve, 6_000))
				return taskControlSchema.flatMap((requirement) =>
					requirement.columns.map((column) => ({
						table_name: requirement.table,
						column_name: column
					}))
				)
			})
			const refreshing = service.refresh()
			await jest.advanceTimersByTimeAsync(6_000)
			await refreshing
			expect(reportExecutionControl).toHaveBeenLastCalledWith(
				expect.objectContaining({
					validUntil: began + 5_000,
					protocols: { taskControl: 2, managedQueue: 3 }
				})
			)
		} finally {
			await module.close()
			jest.useRealTimers()
		}
	})
})
