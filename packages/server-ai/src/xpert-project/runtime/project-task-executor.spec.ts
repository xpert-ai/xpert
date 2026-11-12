import { latestTaskExecutor } from './project-task-executor'
import type { IXpertProjectTaskExecution, ProjectTaskExecutionPurpose } from '@xpert-ai/contracts'
const attempt = (patch: Partial<IXpertProjectTaskExecution>): IXpertProjectTaskExecution => ({
    id: 'run',
    projectId: 'project',
    taskId: 'task',
    status: 'succeeded',
    attempt: 1,
    ...patch
})
describe('task executor presentation', () => {
    it('retains implementation identity after a later independent review', () => {
        const implementation = attempt({ runtimeProvider: 'codex-computer', runtimeToolId: 'codex' })
        const review = attempt({
            attempt: 2,
            runtimeProvider: 'opencode',
            purpose: {
                type: 'review',
                implementationExecutionId: 'run',
                implementationInvocationId: 'invocation',
                specificationDigest: 'sha256:abc',
                evidence: []
            }
        })
        expect(latestTaskExecutor([review, implementation], 'implementation')).toEqual({
            provider: 'codex-computer',
            toolId: 'codex'
        })
    })
    it('uses the latest retry, never an older successful executor when identity is unavailable', () => {
        const old = attempt({ runtimeProvider: 'codex-computer' })
        expect(latestTaskExecutor([attempt({ attempt: 3, runtimeProvider: 'qwen-computer' }), old], 'implementation')).toEqual({
            provider: 'qwen-computer'
        })
        expect(latestTaskExecutor([old, attempt({ attempt: 3 })], 'implementation')).toBeNull()
    })

    const reviewPurpose: ProjectTaskExecutionPurpose = {
        type: 'review',
        implementationExecutionId: 'implementation',
        implementationInvocationId: 'invocation',
        specificationDigest: 'sha256:abc',
        evidence: []
    }

    it('selects the latest review retry despite a newer implementation attempt and unordered input', () => {
        const attempts = [
            attempt({ attempt: 3, purpose: reviewPurpose, runtimeProvider: 'review-runtime', runtimeToolId: 'review-tool' }),
            attempt({ attempt: 9, purpose: { type: 'implementation' }, runtimeProvider: 'implementation-runtime' }),
            attempt({ attempt: 1, purpose: reviewPurpose, runtimeProvider: 'old-review-runtime' })
        ]
        expect(latestTaskExecutor(attempts, 'review')).toEqual({ provider: 'review-runtime', toolId: 'review-tool' })
        expect(latestTaskExecutor(attempts, 'implementation')).toEqual({ provider: 'implementation-runtime' })
        expect(attempts.map((item) => item.attempt)).toEqual([3, 9, 1])
    })

    it.each(['running', 'failed', 'succeeded'] as const)(
        'does not reuse an older review executor when the newest %s review has no identity',
        (status) => {
            const old = attempt({ purpose: reviewPurpose, runtimeProvider: 'old-review-runtime' })
            const latest = attempt({ attempt: 2, purpose: reviewPurpose, status })
            expect(latestTaskExecutor([old, latest], 'review')).toBeNull()
        }
    )

    it('never uses legacy or implementation executions as review identity', () => {
        const legacy = attempt({ runtimeProvider: 'legacy-runtime' })
        expect(latestTaskExecutor([legacy], 'implementation')).toEqual({ provider: 'legacy-runtime' })
        expect(latestTaskExecutor([legacy, attempt({ purpose: { type: 'implementation' } })], 'review')).toBeNull()
        expect(latestTaskExecutor([attempt({ purpose: reviewPurpose, runtimeProvider: 'review-runtime' })], 'implementation')).toBeNull()
        expect(latestTaskExecutor([], 'review')).toBeNull()
    })
})
