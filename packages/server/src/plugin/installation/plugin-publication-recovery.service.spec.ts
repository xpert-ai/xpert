import { Test, TestingModule } from '@nestjs/testing'
import { PluginPublicationRecovery } from './plugin-publication-recovery.service'
import { PluginInstanceService } from '../plugin-instance.service'
import { RuntimeControlService } from '../../runtime-control/runtime-control.service'
import { PluginStoreLease } from './plugin-store-lock'
import { withOrganizationPluginStoreLock } from '../organization-plugin.store'
import type { PluginInstance } from '../plugin-instance.entity'

jest.mock('../plugin-instance.service', () => ({ PluginInstanceService: class {} }))
jest.mock('../../runtime-control/runtime-control.service', () => ({ RuntimeControlService: class {} }))
jest.mock('../organization-plugin.store', () => ({ withOrganizationPluginStoreLock: jest.fn() }))

// Test the actual Nest provider lifecycle, rather than invoking recovery directly.
describe('PluginPublicationRecovery lifecycle', () => {
	let module: TestingModule
	const publication = {
		publicationId: 'fcfe874b-8b5a-4abd-b5de-8d9817221156',
		scopeKey: 'org-1',
		pluginName: '@test/plugin',
		version: '2'
	}
	const row: PluginInstance = {
		pluginName: publication.pluginName,
		packageName: publication.pluginName,
		scopeKey: publication.scopeKey,
		config: {},
		level: 'organization',
		runtimePublication: publication
	}
	const instances = {
		hasPendingRuntimePublications: jest.fn<Promise<boolean>, []>(),
		pendingRuntimePublications: jest.fn<Promise<PluginInstance[]>, []>(),
		acknowledgeRuntimePublication: jest.fn()
	}
	const runtime = { recordPluginRuntimeChange: jest.fn() }
	beforeEach(async () => {
		jest.useFakeTimers()
		jest.resetAllMocks()
		jest.spyOn(Math, 'random').mockReturnValue(0.5)
		const lease = new PluginStoreLease('/unused', 60000)
		jest.spyOn(lease, 'assertOwned').mockResolvedValue(undefined)
		jest.mocked(withOrganizationPluginStoreLock).mockImplementation(async (_options, action) => action(lease))
		instances.pendingRuntimePublications.mockResolvedValue([row])
		instances.hasPendingRuntimePublications.mockResolvedValue(true)
		runtime.recordPluginRuntimeChange.mockResolvedValue({ scheduled: true, generation: 1 })
		module = await Test.createTestingModule({
			providers: [
				PluginPublicationRecovery,
				{ provide: PluginInstanceService, useValue: instances },
				{ provide: RuntimeControlService, useValue: runtime }
			]
		}).compile()
		await module.init()
	})
	afterEach(async () => {
		await module.close()
		jest.restoreAllMocks()
		jest.useRealTimers()
	})

	it('replays on bootstrap, retries failure on the next poll, and stops after module shutdown', async () => {
		runtime.recordPluginRuntimeChange.mockResolvedValueOnce({ scheduled: false, generation: 0 })
		await jest.advanceTimersByTimeAsync(0)
		expect(instances.acknowledgeRuntimePublication).not.toHaveBeenCalled()
		await jest.advanceTimersByTimeAsync(10000)
		expect(instances.acknowledgeRuntimePublication).toHaveBeenCalledWith(
			'org-1',
			'@test/plugin',
			publication.publicationId
		)
		await module.close()
		const reads = instances.hasPendingRuntimePublications.mock.calls.length
		await jest.advanceTimersByTimeAsync(30000)
		expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(reads)
	})

	it('does not take the installation lease or publish anything when no intents remain', async () => {
		instances.hasPendingRuntimePublications.mockResolvedValue(false)
		await jest.advanceTimersByTimeAsync(0)
		expect(withOrganizationPluginStoreLock).not.toHaveBeenCalled()
		expect(runtime.recordPluginRuntimeChange).not.toHaveBeenCalled()
		expect(instances.pendingRuntimePublications).not.toHaveBeenCalled()
	})

	it('backs off empty checks to the jittered 60-second ceiling without loading records', async () => {
		instances.hasPendingRuntimePublications.mockResolvedValue(false)
		await jest.advanceTimersByTimeAsync(0)
		let reads = 1
		for (const delay of [9000, 18000, 36000, 54000, 54000]) {
			await jest.advanceTimersByTimeAsync(delay - 1)
			expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(reads)
			await jest.advanceTimersByTimeAsync(1)
			expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(++reads)
		}
		expect(instances.pendingRuntimePublications).not.toHaveBeenCalled()
		expect(withOrganizationPluginStoreLock).not.toHaveBeenCalled()
	})

	it('returns to a short retry after finding a pending publication at the idle ceiling', async () => {
		instances.hasPendingRuntimePublications.mockResolvedValue(false)
		await jest.advanceTimersByTimeAsync(63000)
		instances.hasPendingRuntimePublications.mockResolvedValue(true)
		runtime.recordPluginRuntimeChange.mockResolvedValueOnce({ scheduled: false, generation: 0 })
		await jest.advanceTimersByTimeAsync(54000)
		expect(runtime.recordPluginRuntimeChange).toHaveBeenCalledTimes(1)
		expect(instances.acknowledgeRuntimePublication).not.toHaveBeenCalled()
		await jest.advanceTimersByTimeAsync(9000)
		expect(runtime.recordPluginRuntimeChange).toHaveBeenCalledTimes(2)
		expect(instances.acknowledgeRuntimePublication).toHaveBeenCalledTimes(1)
	})

	it('resets idle backoff after a database error and keeps checking', async () => {
		instances.hasPendingRuntimePublications.mockResolvedValue(false)
		await jest.advanceTimersByTimeAsync(27000)
		instances.hasPendingRuntimePublications.mockRejectedValueOnce(new Error('database unavailable'))
		await jest.advanceTimersByTimeAsync(36000)
		expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(4)
		await jest.advanceTimersByTimeAsync(9000)
		expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(5)
		await jest.advanceTimersByTimeAsync(9000)
		expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(6)
	})

	it.each([
		[0, 8000],
		[0.9999, 9999]
	])('uses random value %s to spread the next check to %s ms', async (random, delay) => {
		jest.mocked(Math.random).mockReturnValue(random)
		instances.hasPendingRuntimePublications.mockResolvedValue(false)
		await jest.advanceTimersByTimeAsync(0)
		await jest.advanceTimersByTimeAsync(delay - 1)
		expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(1)
		await jest.advanceTimersByTimeAsync(1)
		expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(2)
	})

	it('does not overlap a slow check or reschedule if shutdown happens while it is running', async () => {
		let finish: (pending: boolean) => void
		instances.hasPendingRuntimePublications.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
		await jest.advanceTimersByTimeAsync(120000)
		expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(1)
		await module.close()
		finish(false)
		await jest.advanceTimersByTimeAsync(120000)
		expect(instances.hasPendingRuntimePublications).toHaveBeenCalledTimes(1)
	})
})
