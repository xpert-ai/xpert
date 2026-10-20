jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { ProjectPipelineOperationWorkerService } from './pipeline-operation-worker.service'

const rows = Array.from({ length: 41 }, (_, index) => ({
    id: String(index).padStart(3, '0'),
    projectId: 'project',
    leaseFence: 1,
    context: { actor: { userId: 'user', tenantId: 'tenant', organizationId: 'organization' } }
}))
function fixture() {
    const due = jest.fn(async (limit: number, afterId?: string) =>
        rows.filter((row) => !afterId || row.id > afterId).slice(0, limit)
    )
    const enqueue = jest.fn(async (_request: { payload: { projectId: string; operationId: string } }) => undefined)
    const worker = new ProjectPipelineOperationWorkerService({ due } as never, {} as never, { enqueue } as never)
    return { worker, due, enqueue }
}

describe('Pipeline operation outbox fairness', () => {
    it('advances past unchanged work even after enqueue failure, then retries from the start', async () => {
        const { worker, enqueue } = fixture()
        enqueue.mockRejectedValueOnce(Error('Queue unavailable'))
        await worker.recover()
        await worker.recover()
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({ payload: { projectId: 'project', operationId: '040' } })
        )
        await worker.recover()
        expect(enqueue.mock.calls.filter(([request]) => request.payload.operationId === '000')).toHaveLength(2)
    })
    it('retains the cursor when SQL scanning fails and resumes the unfinished sweep', async () => {
        const { worker, due, enqueue } = fixture()
        await worker.recover()
        due.mockRejectedValueOnce(Error('Database unavailable'))
        await worker.recover()
        await worker.recover()
        expect(enqueue).toHaveBeenCalledTimes(41)
        expect(due.mock.calls.slice(1)).toEqual([
            [40, '039'],
            [40, '039']
        ])
    })
})
