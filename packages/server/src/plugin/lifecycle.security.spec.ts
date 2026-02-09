import type { INestApplicationContext } from '@nestjs/common'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	CORE_PLUGIN_API_TOKENS: {
		config: Symbol('core:config'),
		cache: Symbol('core:cache'),
		integration: Symbol('core:integration'),
		user: Symbol('core:user'),
		role: Symbol('core:role'),
		i18n: Symbol('core:i18n'),
		chat: Symbol('core:chat')
	},
	createPluginLogger: () => ({
		child: jest.fn(),
		debug: jest.fn(),
		log: jest.fn(),
		warn: jest.fn(),
		error: jest.fn()
	})
}))

jest.mock('./core-plugin-api', () => ({
	createCorePluginApi: jest.fn(() => ({
		get: jest.fn(),
		has: jest.fn().mockReturnValue(false)
	}))
}))

import { createPluginContext, resolvePluginAccessPolicy, createRestrictedPluginAppContext, attachPluginContext } from './lifecycle'

describe('Plugin lifecycle security', () => {
	it('should only allow app context and resolve for code plugins', () => {
		expect(resolvePluginAccessPolicy(undefined, 'code')).toMatchObject({
			allowResolve: true,
			allowAppContext: true
		})
		expect(resolvePluginAccessPolicy(undefined, 'marketplace')).toMatchObject({
			allowResolve: false,
			allowAppContext: false
		})
	})

	it('should block app context access for non-code plugins', () => {
		const restricted = createRestrictedPluginAppContext('evil-plugin')
		expect(() => restricted.get('any')).toThrow('non-code plugin cannot access Nest app context; use ctx.api')
		expect(() => restricted.select('any' as any)).toThrow('non-code plugin cannot access Nest app context; use ctx.api')
		expect(() => restricted.resolve('any')).toThrow('non-code plugin cannot access Nest app context; use ctx.api')
	})

	it('should attach restricted app context and disable resolve for non-code plugins', () => {
		const app = {
			get: jest.fn()
		} as unknown as INestApplicationContext

		const ctx = createPluginContext({} as INestApplicationContext, 'plugin-a', {})
		attachPluginContext(ctx, app, {
			allowed: [],
			allowResolve: false,
			allowAppContext: false,
			pluginName: 'plugin-a'
		})

		expect(() => ctx.app.get('token')).toThrow('non-code plugin cannot access Nest app context; use ctx.api')
		expect(() => ctx.resolve('token')).toThrow('Plugin context resolve is disabled')
	})
})
