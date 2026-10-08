import { latestImplementationExecutor } from './project-task-executor'
import type { IXpertProjectTaskExecution } from '@xpert-ai/contracts'
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
        expect(latestImplementationExecutor([review, implementation])).toEqual({
            provider: 'codex-computer',
            toolId: 'codex'
        })
    })
    it('uses the latest retry, never an older successful executor when identity is unavailable', () => {
        const old = attempt({ runtimeProvider: 'codex-computer' })
        expect(latestImplementationExecutor([attempt({ attempt: 3, runtimeProvider: 'qwen-computer' }), old])).toEqual({
            provider: 'qwen-computer'
        })
        expect(latestImplementationExecutor([old, attempt({ attempt: 3 })])).toBeNull()
    })
})
