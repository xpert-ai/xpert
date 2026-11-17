import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { currentPluginViewAction, withPluginViewAction } from './view-action-scope'

it('isolates simultaneous plugin view actors and expires callbacks after the authorized action returns', async () => {
	const context = {
		tenantId: 't',
		organizationId: 'o',
		userId: 'one',
		hostType: 'agent',
		hostId: 'a'
	} as XpertResolvedViewHostContext
	let unblock: () => void
	const latch = new Promise<void>((resolve) => {
		unblock = resolve
	})
	let late: Promise<ReturnType<typeof currentPluginViewAction>>
	await Promise.all(
		['one', 'two'].map((userId) => {
			const view = { ...context, userId }
			return withPluginViewAction(view, 'procurement', async () => {
				view.userId = 'mutated'
				await Promise.resolve()
				expect(currentPluginViewAction()?.context.userId).toBe(userId)
				if (userId === 'one') late = latch.then(() => currentPluginViewAction())
			})
		})
	)
	unblock!()
	expect(await late!).toBeUndefined()
	expect(currentPluginViewAction()).toBeUndefined()
})
