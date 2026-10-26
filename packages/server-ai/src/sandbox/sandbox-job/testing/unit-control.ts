import type { SandboxJobControlStore } from '../sandbox-job-control.store'
// Materialization tests isolate lifecycle persistence; PostgreSQL suites exercise the real coordinator.
import { randomUUID } from 'node:crypto'
import { SandboxJobControlService } from '../sandbox-job-control.service'
import { SandboxJobEntity } from '../sandbox-job.entity'
import type { SandboxJobOutput, SandboxJobErrorCode } from '@xpert-ai/plugin-sdk'

export function unitControl() {
    const jobs = new Map<string, SandboxJobEntity>()
    const controller = new AbortController()
    const service = {
        desired: async () => (controller.signal.aborted ? 'terminated' : 'running'),
        store: {
            assertInput: jest.fn(),
            tasks: { desired: jest.fn(async () => (controller.signal.aborted ? 'terminated' : 'running')) },
            read: async (id: string) => jobs.get(id),
            update: async (id: string, _generation: string, change: (job: SandboxJobEntity) => void) => {
                const job = jobs.get(id)
                if (!job) return undefined
                change(job)
                return job
            }
        },
        prepare: async (job: SandboxJobEntity) => {
            job.generation ??= randomUUID()
            job.control ??= {
                version: 1,
                taskId: randomUUID(),
                hostId: randomUUID(),
                claim: randomUUID(),
                providerVersion: '1',
                phase: 'creating',
                hostExited: false
            }
            jobs.set(job.id, job)
            return job
        },
        callback: async <T>(_job: SandboxJobEntity, _id: string, work: (signal: AbortSignal) => Promise<T>) =>
            work(controller.signal),
        requestStop: async (job: SandboxJobEntity) => {
            jobs.set(job.id, job)
            job.status = job.control ? 'cancelling' : 'unknown'
            job.finishedAt = null
            controller.abort()
        },
        report: async (
            job: SandboxJobEntity,
            outcome: 'succeeded' | 'failed' | 'cancelled',
            data: { outputs?: SandboxJobOutput[]; errorCode?: SandboxJobErrorCode; errorMessage?: string }
        ) => {
            job.control ??= {
                version: 1,
                taskId: randomUUID(),
                hostId: randomUUID(),
                claim: randomUUID(),
                providerVersion: '1',
                phase: 'reserved',
                hostExited: false
            }
            if (!job.control.reportedOutcome) {
                job.control.reportedOutcome = outcome
                job.status = outcome === 'cancelled' ? 'cancelling' : 'settling'
                job.outputs = data.outputs ?? []
                job.errorCode = data.errorCode ?? null
                job.errorMessage = data.errorMessage ?? null
            }
        }
    }
    return {
        service: service as unknown as SandboxJobControlService,
        store: service.store as unknown as SandboxJobControlStore,
        signal: controller.signal
    }
}
