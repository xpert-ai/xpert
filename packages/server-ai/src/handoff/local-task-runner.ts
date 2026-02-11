import { RequestContext } from '@metad/server-core'
import { HandoffQueueService } from './dispatcher/message-queue.service'
import { ProcessResult } from './processor/processor.interface'
import {
	LocalQueueTaskService,
	LocalQueuedTaskContext,
	SYSTEM_LOCAL_TASK_MESSAGE_TYPE
} from './local-queue-task.service'
import { LaneName, RunSource } from './types'

export interface EnqueueLocalTaskOptions<T> {
	id: string
	tenantId?: string
	organizationId?: string
	userId?: string
	user?: any
	sessionKey: string
	conversationId?: string
	executionId?: string
	integrationId?: string
	source: RunSource
	requestedLane?: LaneName
	timeoutMs?: number
	task: (ctx: LocalQueuedTaskContext) => Promise<T>
}

export async function enqueueLocalTaskAndWait<T>(
	localTaskService: LocalQueueTaskService,
	handoffQueue: HandoffQueueService,
	options: EnqueueLocalTaskOptions<T>
): Promise<T> {
	const requestUser = options.user ?? RequestContext.currentUser()
	const tenantId = options.tenantId ?? requestUser?.tenantId ?? RequestContext.currentTenantId()
	if (!tenantId) {
		throw new Error(`Missing tenantId for local handoff task "${options.id}"`)
	}

	const organizationId = options.organizationId ?? RequestContext.getOrganizationId()
	const userId = options.userId ?? requestUser?.id ?? RequestContext.currentUserId()
	const language = RequestContext.getLanguageCode()
	const requestContextUser =
		requestUser
			? {
				...requestUser,
				tenantId: requestUser.tenantId ?? tenantId
			}
			: userId
				? {
					id: userId,
					tenantId
				}
				: undefined

	const requestContext = {
		user: requestContextUser,
		headers: {
			...(organizationId ? { ['organization-id']: organizationId } : {}),
			...(tenantId ? { ['tenant-id']: tenantId } : {}),
			...(language ? { language } : {})
		}
	}

	let hasOutput = false
	let output!: T

	const taskId = localTaskService.register(async (ctx) => {
		output = await options.task(ctx)
		hasOutput = true
		return { status: 'ok' }
	})

	const result = await handoffQueue.enqueueAndWait(
		{
			id: options.id,
			type: SYSTEM_LOCAL_TASK_MESSAGE_TYPE,
			version: 1,
			tenantId,
			organizationId,
			userId,
			sessionKey: options.sessionKey,
			conversationId: options.conversationId,
			businessKey: options.id,
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: Date.now(),
			traceId: options.id,
			source: options.source,
			requestedLane: options.requestedLane ?? 'main',
			payload: {
				taskId,
				executionId: options.executionId,
				integrationId: options.integrationId,
				requestContext
			}
		},
		{
			timeoutMs: options.timeoutMs
		}
	)

	assertLocalTaskResult(options.id, result)
	if (!hasOutput) {
		throw new Error(`Local handoff task "${options.id}" completed without output`)
	}

	return output
}

function assertLocalTaskResult(runId: string, result: ProcessResult) {
	if (result.status === 'dead') {
		throw new Error(result.reason)
	}
	if (result.status === 'retry') {
		throw new Error(`Local handoff task "${runId}" returned unexpected retry result`)
	}
}
