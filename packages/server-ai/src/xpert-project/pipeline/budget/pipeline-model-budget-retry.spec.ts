import { QueryFailedError } from 'typeorm'
import { Logger } from '@nestjs/common'
import { retryPipelineModelAdmission } from './pipeline-model-budget-retry'

const call = { executionId: 'execution', requestId: 'request' }
const locked = () =>
    new QueryFailedError('SELECT project FOR UPDATE', [], Object.assign(new Error('lock timeout'), { code: '55P03' }))

beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined))
afterEach(() => jest.restoreAllMocks())

it('re-enters admission after rollback and admits exactly once when contention clears', async () => {
    const transaction = jest
        .fn()
        .mockRejectedValueOnce(locked())
        .mockRejectedValueOnce(locked())
        .mockResolvedValue(true)
    expect(await retryPipelineModelAdmission(call, transaction)).toBe(true)
    expect(transaction).toHaveBeenCalledTimes(3)
    expect(Logger.prototype.warn).toHaveBeenLastCalledWith({
        event: 'pipeline.model.admission.recovered',
        ...call,
        attempt: 3
    })
})
it('returns a freshly checked cancellation instead of retrying or admitting stale work', async () => {
    const denied = new Error('execution was cancelled while waiting')
    const transaction = jest.fn().mockRejectedValueOnce(locked()).mockRejectedValueOnce(denied)
    await expect(retryPipelineModelAdmission(call, transaction)).rejects.toBe(denied)
    expect(transaction).toHaveBeenCalledTimes(2)
})
it('bounds repeated contention and retains the first failure', async () => {
    const first = locked()
    const transaction = jest
        .fn()
        .mockRejectedValueOnce(first)
        .mockImplementation(async () => {
            throw locked()
        })
    await expect(retryPipelineModelAdmission(call, transaction)).rejects.toBe(first)
    expect(transaction).toHaveBeenCalledTimes(3)
})
it.each(['budget_exceeded', false, true])('does not repeat a committed admission outcome: %s', async (result) => {
    const transaction = jest.fn().mockResolvedValue(result)
    expect(await retryPipelineModelAdmission(call, transaction)).toBe(result)
    expect(transaction).toHaveBeenCalledTimes(1)
})
it('does not retry a connection failure with an uncertain commit outcome', async () => {
    const failure = new QueryFailedError('COMMIT', [], Object.assign(new Error('connection lost'), { code: '08006' }))
    const transaction = jest.fn().mockRejectedValue(failure)
    await expect(retryPipelineModelAdmission(call, transaction)).rejects.toBe(failure)
    expect(transaction).toHaveBeenCalledTimes(1)
})
