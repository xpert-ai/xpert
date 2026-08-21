import { InstanceRegistryService } from './instance-registry.service'

class FakeRedis {
	readonly values = new Map<string, string>()

	async setEx(key: string, _seconds: number, value: string) {
		this.values.set(key, value)
	}

	async get(key: string) {
		return this.values.get(key) ?? null
	}

	async del(...keys: string[]) {
		keys.forEach((key) => this.values.delete(key))
	}
}

describe('InstanceRegistryService', () => {
	const originalInstanceId = process.env.XPERT_INSTANCE_ID

	afterEach(() => {
		if (originalInstanceId === undefined) {
			delete process.env.XPERT_INSTANCE_ID
		} else {
			process.env.XPERT_INSTANCE_ID = originalInstanceId
		}
	})

	it('keeps reported plugin state local instead of expanding the Redis heartbeat payload', async () => {
		const redis = new FakeRedis()
		process.env.XPERT_INSTANCE_ID = 'api-1'
		const registry = new InstanceRegistryService(redis)
		registry.onModuleInit()
		await settle()

		await registry.reportPluginState({
			plugins: [{ scopeKey: 'org-1', pluginName: 'openrouter', version: '0.1.0' }],
			failures: []
		})

		expect(registry.getPluginState()).toEqual({
			reportedAt: expect.any(String),
			plugins: [{ scopeKey: 'org-1', pluginName: 'openrouter', version: '0.1.0' }],
			failures: []
		})
		const heartbeat = JSON.parse(redis.values.get('managed-connection:instance:api-1') ?? '{}')
		expect(heartbeat).toMatchObject({ instanceId: 'api-1' })
		expect(heartbeat).not.toHaveProperty('bootId')
		expect(heartbeat).not.toHaveProperty('pluginState')
		await registry.onModuleDestroy()
	})
})

async function settle() {
	await Promise.resolve()
	await Promise.resolve()
}
