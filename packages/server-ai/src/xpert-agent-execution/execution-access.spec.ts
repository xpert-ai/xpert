import { ForbiddenException } from '@nestjs/common'
import { assertExecutionBelongsToThread } from './execution-access'

describe('assertExecutionBelongsToThread', () => {
    it('returns an execution that belongs to the authorized thread', () => {
        const execution = { threadId: 'thread-1' }

        expect(assertExecutionBelongsToThread(execution, 'thread-1')).toBe(execution)
    })

    it('rejects an execution from another thread before inputs or checkpoints are used', () => {
        expect(() => assertExecutionBelongsToThread({ threadId: 'thread-2' }, 'thread-1')).toThrow(ForbiddenException)
    })
})
