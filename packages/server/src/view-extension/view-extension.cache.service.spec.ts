import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Test } from '@nestjs/testing'
import type { XpertResolvedViewHostContext, XpertViewProjectAccess } from '@xpert-ai/contracts'
import { StrategyBus } from '@xpert-ai/plugin-sdk'
import { ViewExtensionCacheService } from './view-extension.cache.service'

it('recomputes project slot manifests when the current user loses project management', async () => {
	const entries = new Map<string, unknown>()
	const module = await Test.createTestingModule({
		providers: [
			ViewExtensionCacheService,
			{ provide: StrategyBus, useValue: {} },
			{
				provide: CACHE_MANAGER,
				useValue: {
					get: (key: string) => entries.get(key),
					set: (key: string, value: unknown) => entries.set(key, value)
				}
			}
		]
	}).compile()
	const cache = module.get(ViewExtensionCacheService)
	const scope = (projectAccess: XpertViewProjectAccess): XpertResolvedViewHostContext => ({
		tenantId: 'tenant',
		organizationId: 'org',
		userId: 'reviewer',
		hostType: 'agent',
		hostId: 'assistant',
		slots: [],
		runtimeScope: {
			projectId: 'project',
			conversationId: null,
			dataScopeKey: 'project:project',
			projectAccess,
			workspaceFiles: { catalog: 'projects', projectId: 'project', scopeId: 'project' }
		}
	})
	const manager = scope({ role: 'manager', canManage: true, canEdit: true, canRead: true, canUse: true })
	const editor = scope({ role: 'editor', canManage: false, canEdit: true, canRead: true, canUse: true })
	const load = jest.fn(async () => [])
	await cache.getOrSetSlotViews(manager, 'agent.workbench', 60_000, load)
	await cache.getOrSetSlotViews(editor, 'agent.workbench', 60_000, load)
	await cache.getOrSetSlotViews(editor, 'agent.workbench', 60_000, load)
	expect(load).toHaveBeenCalledTimes(2)
})
