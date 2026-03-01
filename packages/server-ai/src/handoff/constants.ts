export const XPERT_HANDOFF_QUEUE = 'handoff'
export const XPERT_HANDOFF_QUEUE_REALTIME = 'handoff:realtime'
export const XPERT_HANDOFF_QUEUE_BATCH = 'handoff:batch'
export const XPERT_HANDOFF_QUEUE_INTEGRATION = 'handoff:integration'

export const XPERT_HANDOFF_QUEUES = [
	XPERT_HANDOFF_QUEUE,
	XPERT_HANDOFF_QUEUE_REALTIME,
	XPERT_HANDOFF_QUEUE_BATCH,
	XPERT_HANDOFF_QUEUE_INTEGRATION
] as const

export type HandoffQueueName = (typeof XPERT_HANDOFF_QUEUES)[number]

export const XPERT_HANDOFF_JOB = 'dispatch'
export const DEFAULT_HANDOFF_MAX_ATTEMPTS = 3
