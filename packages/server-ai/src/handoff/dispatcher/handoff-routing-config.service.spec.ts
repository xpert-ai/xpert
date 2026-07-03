import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { HandoffMessage } from '@xpert-ai/plugin-sdk'
import { HandoffRouteResolver } from './handoff-route-resolver.service'
import { HandoffRoutingConfigService } from './handoff-routing-config.service'

describe('HandoffRoutingConfigService idle timeout policy', () => {
	const previousConfigPath = process.env.HANDOFF_ROUTING_CONFIG_PATH
	let tempRoot: string | undefined

	afterEach(() => {
		if (previousConfigPath === undefined) {
			delete process.env.HANDOFF_ROUTING_CONFIG_PATH
		} else {
			process.env.HANDOFF_ROUTING_CONFIG_PATH = previousConfigPath
		}
		if (tempRoot) {
			fs.rmSync(tempRoot, { recursive: true, force: true })
			tempRoot = undefined
		}
	})

	const createService = () => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-routing-'))
		fs.writeFileSync(
			path.join(tempRoot, 'routing.yaml'),
			[
				'version: 1',
				'defaultQueue: handoff',
				'defaultLane: main',
				'typePolicies:',
				'  agent.chat_dispatch.v1:',
				'    queue: realtime',
				'    lane: high',
				'    idleTimeoutMs: 120000',
				'    timeoutMs: 600000',
				'routes:',
				'  - match:',
				'      typePrefix: agent.',
				'    target:',
				'      queue: batch',
				'      lane: normal',
				'      idleTimeoutMs: 45000',
				'      timeoutMs: 90000',
				'  - match:',
				'      typePrefix: channel.wechat.',
				'    target:',
				'      queue: integration',
				'      lane: normal',
				'      idleTimeoutMs: 30000',
				''
			].join('\n')
		)
		process.env.HANDOFF_ROUTING_CONFIG_PATH = 'routing.yaml'
		const service = new HandoffRoutingConfigService({
			assetOptions: { serverRoot: tempRoot }
		} as any)
		service.onModuleInit()
		return service
	}

	const createMessage = (overrides?: Partial<HandoffMessage>): HandoffMessage => ({
		id: 'message-id',
		type: 'agent.chat_dispatch.v1',
		version: 1,
		tenantId: 'tenant-id',
		sessionKey: 'session-id',
		businessKey: 'business-id',
		attempt: 1,
		maxAttempts: 1,
		enqueuedAt: Date.now(),
		traceId: 'trace-id',
		payload: {},
		...overrides
	})

	it('parses idle timeout from type policies and route targets', () => {
		const service = createService()
		const snapshot = service.getSnapshot()

		expect(snapshot.typePolicies['agent.chat_dispatch.v1']).toMatchObject({
			timeoutMs: 600000,
			idleTimeoutMs: 120000
		})
		expect(snapshot.routes[0].target).toMatchObject({
			timeoutMs: 90000,
			idleTimeoutMs: 45000
		})
		expect(snapshot.routes[1].target).toMatchObject({
			idleTimeoutMs: 30000
		})
	})

	it('resolves header timeout policy ahead of type policy', () => {
		const resolver = new HandoffRouteResolver(createService())

		const resolution = resolver.resolve(
			createMessage({
				headers: {
					policyTimeoutMs: '1000',
					policyIdleTimeoutMs: '2000'
				}
			})
		)

		expect(resolution.policy).toEqual({
			lane: 'main',
			timeoutMs: 1000,
			idleTimeoutMs: 2000
		})
	})

	it('resolves type policy ahead of matching route target', () => {
		const resolver = new HandoffRouteResolver(createService())

		const resolution = resolver.resolve(createMessage())

		expect(resolution.policy).toEqual({
			lane: 'main',
			timeoutMs: 600000,
			idleTimeoutMs: 120000
		})
	})

	it('resolves route target idle timeout when type policy is absent', () => {
		const resolver = new HandoffRouteResolver(createService())

		const resolution = resolver.resolve(
			createMessage({
				type: 'channel.wechat.chat_callback.v1'
			})
		)

		expect(resolution.policy).toEqual({
			lane: 'main',
			idleTimeoutMs: 30000
		})
	})
})
