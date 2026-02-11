import { LarkExecutionQueueService } from './lark-execution-queue.service'
import { LarkCoreApi } from './lark-core-api.service'
import {
	LARK_HANDOFF_MESSAGE_TYPE,
	LARK_HANDOFF_XPERT_TYPE
} from './lark-handoff.constants'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	CORE_PLUGIN_API_TOKENS: {
		handoff: Symbol('core:handoff')
	}
}))

describe('LarkExecutionQueueService', () => {
	let runtime: LarkExecutionQueueService
	let handoff: {
		enqueue: jest.Mock
		abortByRunId: jest.Mock
		abortBySessionKey: jest.Mock
		abortByIntegration: jest.Mock
		getIntegrationRunCount: jest.Mock
		getIntegrationRunIds: jest.Mock
	}

	beforeEach(() => {
		handoff = {
			enqueue: jest.fn().mockImplementation(async (message) => ({ id: message.id })),
			abortByRunId: jest.fn(() => true),
			abortBySessionKey: jest.fn(() => []),
			abortByIntegration: jest.fn(() => ['run-1']),
			getIntegrationRunCount: jest.fn(() => 2),
			getIntegrationRunIds: jest.fn(() => ['run-1', 'run-2'])
		}

		runtime = new LarkExecutionQueueService({
			handoff
		} as unknown as LarkCoreApi)
	})

	afterEach(() => {
		runtime.onModuleDestroy()
	})

	it('enqueues message task as core handoff message', async () => {
		const id = await runtime.enqueueMessageTask({
			kind: 'message',
			tenantId: 'tenant-1',
			integrationId: 'integration-1',
			accountId: 'account-1',
			accountKey: 'channel:lark:integration:integration-1:account:account-1',
			sessionKey: 'channel:lark:integration:integration-1:chat:c1:user:u1',
			organizationId: 'org-1',
			language: 'en-US',
			user: { id: 'user-1' },
			payload: {
				tenant: { id: 'tenant-1' } as any,
				organizationId: 'org-1',
				integrationId: 'integration-1',
				userId: 'user-1',
				chatId: 'c1',
				senderOpenId: 'u1',
				message: {
					message: {
						message_id: 'm1'
					}
				}
			}
		})

		expect(id).toBeTruthy()
		expect(handoff.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				type: LARK_HANDOFF_MESSAGE_TYPE,
				tenantId: 'tenant-1',
				sessionKey: 'channel:lark:integration:integration-1:chat:c1:user:u1',
				headers: expect.objectContaining({
					integrationId: 'channel:lark:integration:integration-1:account:account-1'
				})
			})
		)
	})

	it('enqueues xpert task as core handoff message', async () => {
		const id = await runtime.enqueueXpertTask({
			kind: 'xpert',
			tenantId: 'tenant-1',
			integrationId: 'integration-1',
			accountId: 'account-1',
			accountKey: 'channel:lark:integration:integration-1:account:account-1',
			sessionKey: 'channel:lark:integration:integration-1:chat:c1:user:u1',
			organizationId: 'org-1',
			language: 'en-US',
			user: { id: 'user-1' },
			xpertId: 'xpert-1',
			input: 'hello',
			larkMessage: {
				context: {
					tenant: { id: 'tenant-1' } as any,
					organizationId: 'org-1',
					integrationId: 'integration-1',
					userId: 'user-1',
					chatId: 'c1',
					chatType: 'p2p',
					senderOpenId: 'u1'
				},
				fields: {}
			}
		})

		expect(id).toBeTruthy()
		expect(handoff.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				type: LARK_HANDOFF_XPERT_TYPE,
				tenantId: 'tenant-1'
			})
		)
	})

	it('delegates account abort and run snapshot to core handoff api', () => {
		const accountKey = 'channel:lark:integration:integration-1:account:account-1'
		expect(runtime.abortByAccount(accountKey, 'stop')).toEqual(['run-1'])
		expect(runtime.getAccountRunCount(accountKey)).toBe(2)
		expect(runtime.getAccountRunIds(accountKey)).toEqual(['run-1', 'run-2'])
		expect(handoff.abortByIntegration).toHaveBeenCalledWith(accountKey, 'stop')
		expect(handoff.getIntegrationRunCount).toHaveBeenCalledWith(accountKey)
		expect(handoff.getIntegrationRunIds).toHaveBeenCalledWith(accountKey)
	})
})
