// Invariants: an unfinished task is not itself an approval request. Static
// interruptBefore stops have no interrupt payload; only configured nodes qualify.
// Dynamic approvals and manual thread pauses retain their separate semantics.
import type { StateSnapshot } from '@langchain/langgraph'
import { t } from 'i18next'
import { isThreadPause } from '../../../shared/agent/thread-pause'

export function toolApprovalTasks(
    state: Pick<StateSnapshot, 'tasks' | 'next'>,
    interruptBefore?: readonly string[] | '*'
) {
    const unfinished = (state.tasks ?? []).filter((task) => task.result === undefined)
    const approvals = unfinished.filter((task) =>
        task.interrupts?.length
            ? task.interrupts.some((item) => !isThreadPause(item.value))
            : state.next?.includes(task.name) && (interruptBefore === '*' || interruptBefore?.includes(task.name))
    )
    const paused = unfinished.some((task) => task.interrupts?.some((item) => isThreadPause(item.value)))
    if (!approvals.length && !paused && unfinished.some((task) => state.next?.includes(task.name))) {
        throw new Error(
            t('server-ai:Error.AgentTasksUnfinished', {
                defaultValue: 'Agent execution stopped with unfinished tasks and no approval or pause request.'
            })
        )
    }
    return approvals
}
