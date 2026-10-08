import { observeTasks, DEFAULT_TASK_WAIT_POLICY } from './task-wait'
import { TaskDependencyState, taskWaitReason } from '@xpert-ai/plugin-sdk'

describe('provider-neutral dependency observation', () => {
    afterEach(() => jest.useRealTimers())
    it('any completes without treating other running tasks as finished', async () => {
        const tasks: TaskDependencyState[] = ['completed', 'pending']
        const result = await observeTasks({ read: async () => tasks, state: (s) => s }, 'any', DEFAULT_TASK_WAIT_POLICY)
        expect(result).toEqual({ reason: 'completed', tasks })
        expect(taskWaitReason(tasks, 'all')).toBeUndefined()
    })
    it('unknown is not success and attention interrupts an all-wait', () => {
        expect(taskWaitReason(['unknown'], 'all')).toBeUndefined()
        expect(taskWaitReason(['completed', 'attention'], 'all')).toBe('attention')
        expect(taskWaitReason([], 'all')).toBeUndefined()
    })
    it('short work completes in the bounded observation window', async () => {
        jest.useFakeTimers()
        let state: TaskDependencyState = 'pending'
        const read = jest.fn(async () => [state])
        const promise = observeTasks({ read, state: (s) => s }, 'all', DEFAULT_TASK_WAIT_POLICY)
        await jest.advanceTimersByTimeAsync(500)
        state = 'completed'
        await jest.advanceTimersByTimeAsync(500)
        expect((await promise).reason).toBe('completed')
        expect(jest.getTimerCount()).toBe(0)
    })
    it('long work yields pending after a bounded wait without relaunching', async () => {
        jest.useFakeTimers()
        const promise = observeTasks(
            { read: async () => ['pending' as const], state: (s) => s },
            'all',
            DEFAULT_TASK_WAIT_POLICY
        )
        await jest.advanceTimersByTimeAsync(2000)
        expect((await promise).reason).toBe('pending')
        expect(jest.getTimerCount()).toBe(0)
    })
    it('abort clears observation timers without cancelling the domain job', async () => {
        jest.useFakeTimers()
        const controller = new AbortController()
        const promise = observeTasks(
            { read: async () => ['pending' as const], state: (s) => s },
            'all',
            DEFAULT_TASK_WAIT_POLICY,
            controller.signal
        )
        const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
        await jest.advanceTimersByTimeAsync(50)
        controller.abort()
        await rejection
        expect(jest.getTimerCount()).toBe(0)
    })
})
