import {
	AGENT_WORKBENCH_SLOT,
	LEGACY_AGENT_WORKBENCH_SLOTS,
	type XpertExtensionViewManifest,
	type XpertResolvedViewHostContext
} from '@xpert-ai/contracts'
import { normalizeWorkbenchSlot, readProviderViewManifests } from './workbench-manifest'
import { normalizeManifest } from './view-extension.utils'

const context: XpertResolvedViewHostContext = {
	tenantId: 'tenant',
	organizationId: 'org',
	userId: 'user',
	locale: 'en_US',
	hostType: 'agent',
	hostId: 'assistant',
	slots: [{ key: AGENT_WORKBENCH_SLOT, mode: 'sections', manifestPolicy: { requireFeatureActivation: true } }]
}
function manifest(slot: string, key = 'tasks'): XpertExtensionViewManifest {
	return {
		key,
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
function providerFor(views: XpertExtensionViewManifest[]) {
	return {
		getViewManifests: jest.fn((_context: XpertResolvedViewHostContext, slot: string) =>
			views.filter((view) => view.slot === slot)
		)
	}
}

describe('Workbench slot compatibility', () => {
	it.each([AGENT_WORKBENCH_SLOT, ...LEGACY_AGENT_WORKBENCH_SLOTS])(
		'uses the unified declaration for %s without consulting legacy slots',
		async (slot) => {
			const view = manifest(AGENT_WORKBENCH_SLOT)
			const provider = providerFor([view, manifest(LEGACY_AGENT_WORKBENCH_SLOTS[0], 'old')])
			expect(await readProviderViewManifests(provider, context, slot)).toEqual([view])
			expect(provider.getViewManifests).toHaveBeenCalledTimes(1)
			expect(provider.getViewManifests).toHaveBeenCalledWith(context, 'agent.workbench')
			expect(normalizeWorkbenchSlot('agent', slot)).toBe('agent.workbench')
		}
	)

	it.each(LEGACY_AGENT_WORKBENCH_SLOTS)(
		'adapts a %s-only plugin without losing its access or opening policy',
		async (slot) => {
			const legacy = manifest(slot)
			const provider = providerFor([legacy])
			const [resolved] = await readProviderViewManifests(provider, context, AGENT_WORKBENCH_SLOT)
			expect(resolved).toEqual({ ...legacy, slot: AGENT_WORKBENCH_SLOT })
			expect(provider.getViewManifests).toHaveBeenNthCalledWith(1, context, AGENT_WORKBENCH_SLOT)
			expect(normalizeManifest(resolved, 'tasks', context, AGENT_WORKBENCH_SLOT)).toMatchObject({
				key: 'tasks__tasks',
				permissions: ['read-tasks'],
				activation: { requiredFeatures: ['tasks'] }
			})
		}
	)

	it('merges both legacy catalogs once per key and keeps the fixed declaration intact on collisions', async () => {
		const [fixed, main] = LEGACY_AGENT_WORKBENCH_SLOTS
		const preferred = { ...manifest(fixed), visible: false }
		const provider = providerFor([
			preferred,
			{ ...manifest(main), permissions: [], workbench: { openMode: 'auto' } },
			manifest(fixed, 'files'),
			manifest(main, 'preview')
		])
		expect(await readProviderViewManifests(provider, context, AGENT_WORKBENCH_SLOT)).toEqual([
			{ ...preferred, slot: AGENT_WORKBENCH_SLOT },
			{ ...manifest(fixed, 'files'), slot: AGENT_WORKBENCH_SLOT },
			{ ...manifest(main, 'preview'), slot: AGENT_WORKBENCH_SLOT }
		])
	})

	it.each([AGENT_WORKBENCH_SLOT, ...LEGACY_AGENT_WORKBENCH_SLOTS])(
		'preserves disabled visibility in %s independently of on-demand opening',
		async (slot) => {
			const view = manifest(slot)
			view.workbench = { fixed: false, openMode: 'on-demand', menu: { enabled: true } }
			const [resolved] = await readProviderViewManifests(providerFor([view]), context, AGENT_WORKBENCH_SLOT)
			expect(resolved).toEqual({ ...view, slot: AGENT_WORKBENCH_SLOT, visible: false })
		}
	)

	it('keeps the previous automatic-opening default when a legacy view has no explicit policy', async () => {
		const view = manifest(LEGACY_AGENT_WORKBENCH_SLOTS[1])
		view.workbench = { menu: { enabled: true } }
		const [resolved] = await readProviderViewManifests(providerFor([view]), context, AGENT_WORKBENCH_SLOT)
		expect(resolved.workbench).toEqual({ ...view.workbench, openMode: 'auto' })
	})

	it.each([AGENT_WORKBENCH_SLOT, ...LEGACY_AGENT_WORKBENCH_SLOTS])(
		'does not repair an invalid provider slot returned for %s',
		async (slot) => {
			const provider = {
				getViewManifests: (_context: XpertResolvedViewHostContext, requested: string) =>
					requested === slot ? [manifest('unrelated')] : []
			}
			const [resolved] = await readProviderViewManifests(provider, context, AGENT_WORKBENCH_SLOT)
			expect(resolved.slot).toBe('unrelated')
			expect(() => normalizeManifest(resolved, 'tasks', context, AGENT_WORKBENCH_SLOT)).toThrow('invalid slot')
		}
	)

	it('does not normalize or query compatibility slots for other hosts or areas', async () => {
		const provider = providerFor([])
		await readProviderViewManifests(provider, context, 'agent.profile.tabs')
		const project = { ...context, hostType: 'project' }
		await readProviderViewManifests(provider, project, LEGACY_AGENT_WORKBENCH_SLOTS[0])
		expect(provider.getViewManifests.mock.calls).toEqual([
			[context, 'agent.profile.tabs'],
			[project, LEGACY_AGENT_WORKBENCH_SLOTS[0]]
		])
		expect(normalizeWorkbenchSlot('project', LEGACY_AGENT_WORKBENCH_SLOTS[0])).toBe(LEGACY_AGENT_WORKBENCH_SLOTS[0])
	})
})
