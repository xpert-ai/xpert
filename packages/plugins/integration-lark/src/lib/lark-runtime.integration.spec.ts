import { LarkChannelRuntimeManager } from './lark-channel-runtime.manager'
import { LarkExecutionQueueService } from './lark-execution-queue.service'
import { LarkHooksController } from './lark.hooks.controller'
import { LarkCoreApi } from './lark-core-api.service'

jest.mock('@metad/contracts', () => ({
	mapTranslationLanguage: (lang: string) => lang,
	TranslationLanguageMap: {}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		getLanguageCode: () => 'en-US'
	},
	ChatChannel: () => (target: any) => target,
	CHAT_CHANNEL_TEXT_LIMITS: {
		lark: 4000
	}
}))

function createRuntime() {
	const handoff = {
		enqueue: jest.fn(async (message: any) => ({ id: message.id })),
		abortByRunId: jest.fn(() => true),
		abortBySessionKey: jest.fn(() => []),
		abortByIntegration: jest.fn(() => ['lark-run-1']),
		getIntegrationRunCount: jest.fn(() => 1),
		getIntegrationRunIds: jest.fn(() => ['lark-run-1'])
	}
	return new LarkExecutionQueueService({ handoff } as unknown as LarkCoreApi)
}

describe('Lark runtime integration', () => {
	let runtime: LarkExecutionQueueService
	let manager: LarkChannelRuntimeManager

	beforeEach(() => {
		runtime = createRuntime()
		manager = new LarkChannelRuntimeManager(runtime)
	})

	afterEach(() => {
		runtime.onModuleDestroy()
	})

	it('stopAccount aborts active runs for that account', async () => {
		const accountKey = manager.buildAccountKey('lark', 'integration-1', 'integration-1')
		expect(manager.getAccountStatus('lark', 'integration-1', 'integration-1').activeRuns).toBe(1)

		const stopResult = manager.stopAccount(
			'lark',
			'integration-1',
			'integration-1',
			'manual stop'
		)

		expect(stopResult.abortedRunIds).toContain('lark-run-1')
		expect(runtime.getAccountRunCount(accountKey)).toBe(1)
	})

	it('switches account runtime state via stop/start', async () => {
		expect(manager.isAccountRunning('lark', 'integration-2', 'integration-2')).toBe(true)

		const stopResult = manager.stopAccount('lark', 'integration-2', 'integration-2', 'manual stop')
		expect(stopResult.status.running).toBe(false)
		expect(manager.isAccountRunning('lark', 'integration-2', 'integration-2')).toBe(false)

		const startResult = manager.startAccount('lark', 'integration-2', 'integration-2')
		expect(startResult.running).toBe(true)
		expect(manager.isAccountRunning('lark', 'integration-2', 'integration-2')).toBe(true)
	})

	it('rejects webhook processing when account is stopped', async () => {
		const integration = {
			id: 'integration-3',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			options: {},
			tenant: {}
		}

		const core = {
			integration: {
				findById: jest.fn().mockResolvedValue(integration)
			}
		}
		const larkChannel = {
			createEventHandler: jest.fn()
		}
		const conversation = {
			handleMessage: jest.fn(),
			handleCardAction: jest.fn()
		}

		const controller = new LarkHooksController(
			{} as any,
			larkChannel as any,
			conversation as any,
			core as any,
			manager
		)

		manager.stopAccount('lark', integration.id, integration.id, 'manual stop')

		const res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn()
		}

		await controller.webhook(integration.id, { body: {} } as any, res as any)

		expect(larkChannel.createEventHandler).not.toHaveBeenCalled()
		expect(res.status).toHaveBeenCalledWith(503)
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				code: 'ACCOUNT_RUNTIME_STOPPED',
				integrationId: integration.id,
				accountId: integration.id
			})
		)
	})
})
