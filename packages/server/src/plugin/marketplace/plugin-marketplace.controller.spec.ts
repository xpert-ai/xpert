import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { PluginMarketplaceController } from './plugin-marketplace.controller'
import { PluginMarketplaceService } from './plugin-marketplace.service'

jest.mock('./plugin-marketplace.service', () => ({ PluginMarketplaceService: class {} }))
jest.mock('../../shared/decorators', () => ({
	Public: () => (_target: object, _key: string, descriptor: PropertyDescriptor) => {
		Reflect.defineMetadata('isPublic', true, descriptor.value)
	}
}))

describe('marketplace HTTP routes', () => {
	const pluginMarketplaceService = { listPublicMarketplace: jest.fn() }
	const controller = new PluginMarketplaceController(pluginMarketplaceService as unknown as PluginMarketplaceService)
	it('keeps private marketplace routes authenticated and icon responses privately cached', () => {
		for (const method of [
			controller.getMarketplace,
			controller.icon,
			controller.getMarketplaceSources,
			controller.getMarketplaceRegistryItems,
			controller.getMarketplacePlugin,
			controller.getMarketplacePluginDetail
		]) {
			expect(Reflect.getMetadata('isPublic', method)).not.toBe(true)
		}
		expect(Reflect.getMetadata(PATH_METADATA, controller.icon)).toBe('assets/icon')
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.icon)).toContainEqual({
			name: 'Cache-Control',
			value: 'private, max-age=86400, immutable'
		})
	})
	it('exposes the builtin marketplace catalog as a public read-only route', async () => {
		pluginMarketplaceService.listPublicMarketplace.mockResolvedValue({
			updatedAt: null,
			total: 0,
			items: [],
			sources: [],
			errors: []
		})

		await expect(controller.getPublicMarketplace('xpert')).resolves.toEqual(
			expect.objectContaining({
				total: 0,
				items: []
			})
		)
		expect(pluginMarketplaceService.listPublicMarketplace).toHaveBeenCalledWith({
			targetApp: 'xpert'
		})
		expect(Reflect.getMetadata(PATH_METADATA, controller.constructor)).toBe('plugin/marketplace')
		expect(Reflect.getMetadata(PATH_METADATA, controller.getPublicMarketplace)).toBe('public')
		expect(Reflect.getMetadata(METHOD_METADATA, controller.getPublicMarketplace)).toBe(RequestMethod.GET)
		expect(Reflect.getMetadata('isPublic', controller.getPublicMarketplace)).toBe(true)
	})
})
