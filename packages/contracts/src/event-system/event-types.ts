export const XPERT_EVENT_TYPES = {
	ChatConversationStarted: 'chat.conversation_started',
	ChatMessageDelta: 'chat.message_delta',
	ChatMessageStarted: 'chat.message_started',
	ChatMessageEnded: 'chat.message_ended',
	ChatEvent: 'chat.event',
	AgentExecutionStarted: 'agent.execution_started',
	AgentExecutionEnded: 'agent.execution_ended',
	AgentInterrupted: 'agent.interrupted',
	ToolMessage: 'tool.message',
	ToolFailed: 'tool.failed',
	HandoffEnqueued: 'handoff.enqueued',
	HandoffStarted: 'handoff.started',
	HandoffCompleted: 'handoff.completed',
	HandoffFailed: 'handoff.failed',
	ProjectTaskClaimed: 'project.task_claimed',
	ProjectTaskDispatchEnqueued: 'project.task_dispatch_enqueued',
	ProjectTaskExecutionStarted: 'project.task_execution_started',
	ProjectTaskExecutionUpdated: 'project.task_execution_updated',
	ProjectTaskExecutionSucceeded: 'project.task_execution_succeeded',
	ProjectTaskExecutionFailed: 'project.task_execution_failed'
} as const

export type XpertEventType = (typeof XPERT_EVENT_TYPES)[keyof typeof XPERT_EVENT_TYPES]

export const XPERT_PROJECT_TASK_EVENT_TYPES = [
	XPERT_EVENT_TYPES.ProjectTaskClaimed,
	XPERT_EVENT_TYPES.ProjectTaskDispatchEnqueued,
	XPERT_EVENT_TYPES.ProjectTaskExecutionStarted,
	XPERT_EVENT_TYPES.ProjectTaskExecutionUpdated,
	XPERT_EVENT_TYPES.ProjectTaskExecutionSucceeded,
	XPERT_EVENT_TYPES.ProjectTaskExecutionFailed
] as const

export type XpertProjectTaskEventType = (typeof XPERT_PROJECT_TASK_EVENT_TYPES)[number]

export function isXpertProjectTaskEventType(type: string): type is XpertProjectTaskEventType {
	return XPERT_PROJECT_TASK_EVENT_TYPES.includes(type as XpertProjectTaskEventType)
}
