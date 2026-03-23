import { z } from 'zod'
import { PluginConfigError } from './errors'
import { buildConfig, inspectConfig, mergeConfigWithDefaults } from './config'

describe('plugin config helpers', () => {
	it('merges defaults without validating during non-save flows', () => {
		const spec = {
			defaults: {
				enabled: true
			},
			schema: z.object({
				enabled: z.boolean()
			})
		}

		expect(mergeConfigWithDefaults('demo-plugin', { enabled: 'definitely-not-a-boolean' }, spec as any)).toEqual({
			enabled: 'definitely-not-a-boolean'
		})
	})

	it('still validates when configuration is explicitly saved', () => {
		const spec = {
			defaults: {
				enabled: true
			},
			schema: z.object({
				enabled: z.boolean()
			})
		}

		expect(() => buildConfig('demo-plugin', { enabled: 'definitely-not-a-boolean' }, spec as any)).toThrow(
			PluginConfigError
		)
	})

	it('inspects invalid configuration without blocking install-time flows', () => {
		const spec = {
			defaults: {
				enabled: true
			},
			schema: z.object({
				enabled: z.boolean()
			})
		}

		expect(inspectConfig('demo-plugin', { enabled: 'definitely-not-a-boolean' }, spec as any)).toEqual({
			config: {
				enabled: 'definitely-not-a-boolean'
			},
			error: expect.stringContaining('boolean')
		})
	})
})
