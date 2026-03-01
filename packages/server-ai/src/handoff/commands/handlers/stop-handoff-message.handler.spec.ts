import { HandoffMessage } from '@xpert-ai/plugin-sdk'
import { buildCanceledReason } from '../../cancel-reason'
import { HandoffQueueMatchedJob } from '../../dispatcher/handoff-queue-gateway.service'
import { StopHandoffMessageHandler } from './stop-handoff-message.handler'
import { StopHandoffMessageCommand } from '../stop-handoff-message.command'

describe('StopHandoffMessageHandler', () => {
	const createMessage = (
		id: string,
		payload: Record<string, unknown> = {}
	): HandoffMessage<Record<string, unknown>> => ({
		id,
		type: 'agent.chat.v1',
		version: 1,
		tenantId: 'tenant-id',
		sessionKey: 'session-id',
		businessKey: 'business-id',
		attempt: 1,
		maxAttempts: 1,
		enqueuedAt: Date.now(),
		traceId: 'trace-id',
		payload
	})

	it('stops queued and active jobs by messageId/executionId', async () => {
		const queuedMessage = createMessage('message-queued', {
			executionId: 'execution-1',
			taskId: 'task-1'
		})
		const activeMessage = createMessage('message-active', {
			executionId: 'execution-2'
		})
		const queuedMatch = {
			queueName: 'handoff',
			state: 'waiting',
			job: {
				id: 'job-queued',
				data: queuedMessage
			}
		} as HandoffQueueMatchedJob
		const activeMatch = {
			queueName: 'handoff',
			state: 'active',
			job: {
				id: 'job-active',
				data: activeMessage
			}
		} as HandoffQueueMatchedJob

		const queueGateway = {
			findJobs: jest.fn().mockResolvedValue([queuedMatch, activeMatch]),
			removeJobs: jest.fn().mockResolvedValue([
				{
					queueName: 'handoff',
					state: 'waiting',
					jobId: 'job-queued',
					message: queuedMessage
				}
			])
		}
		const pendingResults = { cancel: jest.fn() }
		const handoffCancelService = { cancelMessages: jest.fn().mockResolvedValue(['message-active']) }
		const localTaskService = { remove: jest.fn().mockReturnValue(true) }
		const handler = new StopHandoffMessageHandler(
			queueGateway as any,
			handoffCancelService as any,
			pendingResults as any,
			localTaskService as any
		)

		const result = await handler.execute(
			new StopHandoffMessageCommand({
				messageIds: ['message-queued', 'message-missing'],
				executionIds: ['execution-2', 'execution-missing'],
				reason: 'Canceled by user'
			})
		)

		expect(queueGateway.findJobs).toHaveBeenCalledTimes(1)
		expect(queueGateway.removeJobs).toHaveBeenCalledWith([queuedMatch])
		expect(localTaskService.remove).toHaveBeenCalledWith('task-1')
		expect(handoffCancelService.cancelMessages).toHaveBeenCalledWith(
			['message-active'],
			'Canceled by user'
		)
		expect(pendingResults.cancel).toHaveBeenCalledWith(
			'message-queued',
			buildCanceledReason('Canceled by user')
		)
		expect(pendingResults.cancel).toHaveBeenCalledWith(
			'message-active',
			buildCanceledReason('Canceled by user')
		)
		expect(result).toEqual({
			requested: {
				messageIds: ['message-queued', 'message-missing'],
				executionIds: ['execution-2', 'execution-missing']
			},
			matched: {
				messageIds: ['message-queued', 'message-active'],
				executionIds: ['execution-1', 'execution-2']
			},
			removed: {
				jobs: [
					{
						queueName: 'handoff',
						state: 'waiting',
						jobId: 'job-queued',
						messageId: 'message-queued',
						executionId: 'execution-1'
					}
				]
			},
			aborted: {
				messageIds: ['message-active']
			},
			notFound: {
				messageIds: ['message-missing'],
				executionIds: ['execution-missing']
			}
		})
	})
})
