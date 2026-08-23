import { RUNTIME_RESTART_CONFIRMATION, RolesEnum } from '@xpert-ai/contracts'
import { setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RequestContext } from '../core/context'
import { RuntimeControlService } from './runtime-control.service'
import type { RuntimeRestartCoordinatorService } from './runtime-restart-coordinator.service'

describe('RuntimeControlService', () => {
	const coordinator = {
		requestRestart: jest.fn(),
		getStatus: jest.fn(),
		getPluginConvergenceStatus: jest.fn(),
		recordPluginChange: jest.fn()
	}
	let service: RuntimeControlService

	beforeEach(() => {
		jest.resetAllMocks()
		setDefaultTenantId('tenant-default')
		jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue(null)
		jest.spyOn(RequestContext, 'hasRole').mockImplementation((role) => role === RolesEnum.SUPER_ADMIN)
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-default')
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
		coordinator.requestRestart.mockResolvedValue({
			accepted: true,
			restartId: 'restart-1',
			mode: 'rolling-self-signal',
			instanceId: 'boot-a',
			requestedAt: '2026-08-21T00:00:00.000Z',
			signalAfterMs: 750,
			drainTimeoutMs: 30_000
		})
		service = new RuntimeControlService(coordinator as unknown as RuntimeRestartCoordinatorService)
	})

	afterEach(() => {
		jest.restoreAllMocks()
		setDefaultTenantId(null)
	})

	it('requests a rolling restart for a confirmed default-tenant SuperAdmin', async () => {
		const runtimeRequirements = [
			{
				scopeKey: 'system:global',
				pluginName: '@xpert-ai/plugin-openrouter',
				version: '0.1.0',
				state: 'loaded' as const
			}
		]
		await expect(
			service.requestRestart(
				{ confirmation: RUNTIME_RESTART_CONFIRMATION, reason: 'activate staged plugin', runtimeRequirements },
				{ sourceIp: '127.0.0.1' }
			)
		).resolves.toMatchObject({
			accepted: true,
			mode: 'rolling-self-signal'
		})

		expect(coordinator.requestRestart).toHaveBeenCalledWith({
			source: 'interactive',
			reason: 'activate staged plugin',
			actorUserId: 'user-1',
			tenantId: 'tenant-default',
			sourceIp: '127.0.0.1',
			runtimeRequirements
		})
	})

	it('reports restart capability for an interactive default-tenant SuperAdmin', () => {
		expect(service.restartCapability()).toEqual({
			allowed: true,
			mode: 'rolling-self-signal',
			reason: 'allowed'
		})
	})

	it('rejects actors outside the default tenant', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-other')

		await expect(service.requestRestart({ confirmation: RUNTIME_RESTART_CONFIRMATION })).rejects.toBeInstanceOf(
			ForbiddenException
		)
		expect(coordinator.requestRestart).not.toHaveBeenCalled()
	})

	it('returns a persisted cluster restart status from any replica', async () => {
		coordinator.getStatus.mockResolvedValue({
			restartId: 'restart-1',
			mode: 'rolling-self-signal',
			status: 'in_progress',
			requestedAt: '2026-08-21T00:00:00.000Z',
			targetReplicaCount: 3,
			completedReplicaCount: 1,
			failedReplicaCount: 0,
			pluginGeneration: 4
		})

		await expect(service.restartStatus('restart-1')).resolves.toMatchObject({
			status: 'in_progress',
			completedReplicaCount: 1
		})
	})

	it('does not report a different replica as completion when the operation is missing', async () => {
		coordinator.getStatus.mockResolvedValue(null)

		await expect(service.restartStatus('missing')).rejects.toBeInstanceOf(NotFoundException)
	})

	it('returns durable plugin convergence state by generation', async () => {
		coordinator.getPluginConvergenceStatus.mockResolvedValue({
			generation: 4,
			status: 'completed',
			restartId: 'restart-1',
			targetReplicaCount: 3,
			completedReplicaCount: 3,
			failedReplicaCount: 0
		})

		await expect(service.pluginConvergenceStatus(4)).resolves.toMatchObject({
			generation: 4,
			status: 'completed'
		})
	})
})
