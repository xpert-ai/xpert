import { ApiKeyOrClientSecretAuthGuard } from '../shared/guards'
import { ViewExtensionController } from './view-extension.controller'

describe('ViewExtensionController authentication', () => {
	it('routes API keys and ChatKit client secrets through the mixed auth guard', () => {
		const guards = Reflect.getMetadata('__guards__', ViewExtensionController) as unknown[] | undefined

		expect(Reflect.getMetadata('isPublic', ViewExtensionController)).toBe(true)
		expect(guards).toContain(ApiKeyOrClientSecretAuthGuard)
	})
})
