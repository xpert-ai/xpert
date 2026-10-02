// Invariants: elapsed observation returns normally; it never registers a background interrupt.
// Only explicit human interactions suspend. Repeated waits inspect the same authorized task handles.
import { interrupt } from '@langchain/langgraph'
import {
    AgentInvocation,
    AgentInvocationApi,
    TaskDependencyState,
    TaskWaitPolicy,
    TaskWaitRequest,
    TaskWaitResult,
    AgentJson,
    isAgentInvocationTerminal
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { parseInvocationTaskWait } from './invocation-task-wait.schema'
import { observeTasks } from '../runtime-task/task-wait'
import { HOST_TASK_WAIT_POLICY } from '../runtime-task/task-wait-policy'

const json: z.ZodType<AgentJson> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)
const approval = z.object({ interactionId: z.string(), response: json }).strict()

export function invocationDependencyState(task: AgentInvocation): TaskDependencyState {
    if (isAgentInvocationTerminal(task.status)) return 'completed'
    if (task.status === 'unknown') return 'unknown'
    if (task.status === 'waiting' && task.interaction) return 'attention'
    return 'pending'
}

export async function awaitInvocationTasks(
    api: AgentInvocationApi,
    input: TaskWaitRequest,
    signal?: AbortSignal,
    policy: Readonly<TaskWaitPolicy> = HOST_TASK_WAIT_POLICY
): Promise<TaskWaitResult<AgentInvocation>> {
    const request = parseInvocationTaskWait(input)
    const timeoutMs = Math.min(request.timeoutMs ?? policy.inlineWaitMs, policy.maxInlineWaitMs)
    for (;;) {
        const observed = await observeTasks(
            { read: () => Promise.all(request.taskIds.map((id) => api.inspect(id))), state: invocationDependencyState },
            request.mode,
            { ...policy, inlineWaitMs: timeoutMs },
            signal
        )
        if (observed.reason !== 'attention' || request.timeoutMs === 0) {
            return observed.reason === 'pending' && observed.tasks.some((task) => task.status === 'unknown')
                ? { reason: 'unavailable', tasks: observed.tasks }
                : observed
        }
        const task = observed.tasks.find((item) => item.status === 'waiting' && item.interaction)
        if (!task?.interaction) return observed
        // A duration expiring cannot approve an interaction, nor can an automatic completion notification.
        const resumed: unknown = interrupt({
            type: 'agent_invocation',
            invocationId: task.id,
            reason: 'user_input',
            interaction: task.interaction
        })
        const response = approval.safeParse(resumed)
        if (response.success && response.data.interactionId === task.interaction.id)
            await api.respond(task.id, response.data.interactionId, response.data.response)
    }
}
