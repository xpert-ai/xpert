import type { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { invocationCanRelease } from '../../agent-invocation/invocation-control-evidence'
import type { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'

export function holdsProjectTaskReservation(attempt: XpertProjectTaskExecution, invocation?: AgentInvocation): boolean {
    if (attempt.invocationId) return !invocation || !invocationCanRelease(invocation)
    // A native Pipeline Assistant coordinates project tasks without reserving their execution environment.
    if (attempt.agentExecutionId && attempt.task?.controlKind === 'pipeline') return false
    return attempt.status === 'queued' || attempt.status === 'running'
}
