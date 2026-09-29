import type { XpertExtensionViewManifest, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { readProviderViewManifests } from './workbench-manifest'

const slots = ['agent.workbench.fixed', 'agent.workbench.main']
const context: XpertResolvedViewHostContext = {
	tenantId: 'tenant',
	organizationId: 'org',
	userId: 'user',
	locale: 'en_US',
	hostType: 'agent',
	hostId: 'assistant',
	slots: slots.map((key) => ({ key, mode: 'sections' }))
}
function manifest(slot: string): XpertExtensionViewManifest {
	return {
		key: 'tasks',
		title: { en_US: 'Tasks' },
		hostType: 'agent',
		slot,
		source: { provider: 'tasks' },
		view: { type: 'raw_json' },
		dataSource: { mode: 'platform' },
		activation: { requiredFeatures: ['tasks'] },
		permissions: ['read-tasks'],
		workbench: { fixed: true, openMode: 'on-demand', menu: { enabled: false } }
	}
}

describe('Workbench slot compatibility', () => {
	it.each(slots)('preserves %s and its opening policy without consulting other slots', async (slot) => {
		const view = manifest(slot)
		const provider = { getViewManifests: jest.fn(() => [view]) }
		expect(await readProviderViewManifests(provider, context, slot)).toEqual([view])
		expect(provider.getViewManifests).toHaveBeenCalledTimes(1)
	})
	it.each(slots)('allows installed transitional providers to serve %s', async (slot) => {
		const view = manifest('agent.workbench')
		const provider = {
			getViewManifests: jest.fn((_context: XpertResolvedViewHostContext, requested: string) =>
				requested === view.slot ? [view] : []
			)
		}
		expect(await readProviderViewManifests(provider, context, slot)).toEqual([{ ...view, slot }])
	})
	it('preserves disabled visibility independently of on-demand opening', async () => {
		const view = manifest(slots[0])
		view.workbench = { fixed: false, openMode: 'on-demand', menu: { enabled: true } }
		const [resolved] = await readProviderViewManifests({ getViewManifests: () => [view] }, context, slots[0])
		expect(resolved).toEqual({ ...view, visible: false })
	})
	it('does not move a main-only view into the fixed slot', async () => {
		const provider = {
			getViewManifests: (_context: XpertResolvedViewHostContext, slot: string) =>
				slot === slots[1] ? [manifest(slot)] : []
		}
		expect(await readProviderViewManifests(provider, context, slots[0])).toEqual([])
	})
	it('leaves an invalid provider slot for the normal manifest validator to reject', async () => {
		const view = manifest('unrelated')
		expect((await readProviderViewManifests({ getViewManifests: () => [view] }, context, slots[0]))[0].slot).toBe(
			'unrelated'
		)
	})
	it('does not query fallback slots for another host or slot', async () => {
		const provider = { getViewManifests: jest.fn(() => []) }
		await readProviderViewManifests(provider, context, 'agent.profile.tabs')
		await readProviderViewManifests(provider, { ...context, hostType: 'project' }, slots[0])
		expect(provider.getViewManifests).toHaveBeenCalledTimes(2)
	})
})
