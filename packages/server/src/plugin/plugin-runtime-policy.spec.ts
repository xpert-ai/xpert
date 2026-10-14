import { parsePluginRuntimePolicy, requiresPluginRestart } from './plugin-runtime-policy'

describe('plugin runtime policy', () => {
	it('allows an explicit hot install at every authorization scope', () => {
		const policy = parsePluginRuntimePolicy({ install: 'hot', update: 'restart', uninstall: 'restart' })
		for (const level of ['system', 'tenant', 'organization'] as const) {
			expect(requiresPluginRestart(policy, level, 'install')).toBe(false)
			expect(requiresPluginRestart(policy, level, 'update')).toBe(true)
			expect(requiresPluginRestart(policy, level, 'uninstall')).toBe(true)
		}
	})

	it('preserves legacy behavior until the package declares its lifecycle capability', () => {
		expect(parsePluginRuntimePolicy(undefined)).toBeUndefined()
		expect(requiresPluginRestart(undefined, 'organization', 'install')).toBe(false)
		expect(requiresPluginRestart(undefined, 'system', 'install')).toBe(true)
		expect(requiresPluginRestart(undefined, 'tenant', 'install')).toBe(true)
	})

	it.each([null, true, 'hot', {}, { install: 'hot' }, { install: 'hot', update: 'hot', uninstall: 'auto' }])(
		'rejects malformed lifecycle declarations: %j',
		(value) => expect(() => parsePluginRuntimePolicy(value)).toThrow()
	)
})
