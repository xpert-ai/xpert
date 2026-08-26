import { ApiKeyOrClientSecretAuthGuard } from '../shared/guards'
import { ViewExtensionController } from './view-extension.controller'
import { ViewExtensionService } from './view-extension.service'

describe('ViewExtensionController authentication', () => {
	it('routes API keys and ChatKit client secrets through the mixed auth guard', () => {
		const guards = Reflect.getMetadata('__guards__', ViewExtensionController) as unknown[] | undefined

		expect(Reflect.getMetadata('isPublic', ViewExtensionController)).toBe(true)
		expect(guards).toContain(ApiKeyOrClientSecretAuthGuard)
	})
})

describe('ViewExtensionController slot view discovery', () => {
	it('forwards an explicit draft query without changing the default published request', async () => {
		const service = {
			listSlotViews: jest.fn().mockResolvedValue([])
		}
		const controller = new ViewExtensionController(service as unknown as ViewExtensionService)

		await controller.getSlotViews('agent', 'assistant-1', 'agent.workbench.fixed', 'true')
		await controller.getSlotViews('agent', 'assistant-1', 'agent.workbench.fixed', undefined)

		expect(service.listSlotViews).toHaveBeenNthCalledWith(1, 'agent', 'assistant-1', 'agent.workbench.fixed', {
			isDraft: true
		})
		expect(service.listSlotViews).toHaveBeenNthCalledWith(
			2,
			'agent',
			'assistant-1',
			'agent.workbench.fixed',
			undefined
		)
	})
})
