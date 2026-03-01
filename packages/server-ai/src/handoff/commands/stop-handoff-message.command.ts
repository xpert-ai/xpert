import { Command } from '@nestjs/cqrs'
import { HandoffQueueName } from '../constants'
import { HandoffQueueScannableJobState } from '../dispatcher/handoff-queue-gateway.service'

export interface StopHandoffMessageInput {
	messageIds?: string[]
	executionIds?: string[]
	reason?: string
}

export interface StopHandoffMessageStoppedJobSummary {
	queueName: HandoffQueueName
	state: HandoffQueueScannableJobState
	jobId: string
	messageId: string
	executionId?: string
}

export interface StopHandoffMessageResult {
	requested: {
		messageIds: string[]
		executionIds: string[]
	}
	matched: {
		messageIds: string[]
		executionIds: string[]
	}
	removed: {
		jobs: StopHandoffMessageStoppedJobSummary[]
	}
	aborted: {
		messageIds: string[]
	}
	notFound: {
		messageIds: string[]
		executionIds: string[]
	}
}

export class StopHandoffMessageCommand extends Command<StopHandoffMessageResult> {
	static readonly type = '[Handoff] Stop Message'

	constructor(public readonly input: StopHandoffMessageInput) {
		super()
	}
}
