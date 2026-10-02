jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { BadRequestException } from '@nestjs/common'
import { CopilotCheckpointGetTupleQuery } from '../copilot-checkpoint/queries/get-tuple.query'
import { assertInvocationResume } from './invocation-resume'
import { CheckTaskWaitClaimQuery } from './task-wait-control'

const fence = {
    invocationId: 'wait',
    waitLeaseToken: 'lease',
    checkpointId: 'checkpoint',
    checkpointNamespace: '',
    interruptId: 'interrupt'
}
function fixture(interaction?: { id: string }) {
    const execute = jest.fn().mockImplementation(async (query: unknown) =>
        query instanceof CopilotCheckpointGetTupleQuery
            ? {
                  checkpoint: { id: 'checkpoint' },
                  pendingWrites: [
                      [
                          'node',
                          '__interrupt__',
                          [{ id: 'interrupt', value: { type: 'task_wait', waitId: 'wait', interaction } }]
                      ]
                  ]
              }
            : true
    )
    return { execute }
}
it('checks the exact claim and checkpoint before accepting an automatic continuation', async () => {
    const queries = fixture()
    await expect(assertInvocationResume(queries, 'thread', 'resume', fence)).resolves.toBeUndefined()
    expect(queries.execute).toHaveBeenCalledWith(new CheckTaskWaitClaimQuery('wait', 'lease', 'thread'))
    await expect(assertInvocationResume(queries, 'thread', 'send', fence)).rejects.toBeInstanceOf(BadRequestException)
    await expect(
        assertInvocationResume(queries, 'thread', 'resume', { ...fence, checkpointId: 'old' })
    ).rejects.toBeInstanceOf(BadRequestException)
})
it('rejects a revoked lease even if the checkpoint still matches', async () => {
    const queries = fixture()
    const base = queries.execute.getMockImplementation()
    queries.execute.mockImplementation(async (query: unknown) =>
        query instanceof CheckTaskWaitClaimQuery ? false : base(query)
    )
    await expect(assertInvocationResume(queries, 'thread', 'resume', fence)).rejects.toBeInstanceOf(BadRequestException)
})
it('rejects automatic delivery to a matching human checkpoint', async () => {
    await expect(assertInvocationResume(fixture({ id: 'approval' }), 'thread', 'resume', fence)).rejects.toBeInstanceOf(
        BadRequestException
    )
})
