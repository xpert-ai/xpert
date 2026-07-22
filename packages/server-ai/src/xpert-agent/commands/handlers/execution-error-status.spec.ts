import { NodeInterrupt } from '@langchain/langgraph'
import { isInterruptedExecutionError } from './execution-error-status'

describe('isInterruptedExecutionError', () => {
    it.each([
        new NodeInterrupt('paused'),
        Object.assign(new Error('request aborted'), { name: 'AbortError' }),
        new Error('Aborted'),
        new Error('Canceled by user'),
        new Error('Cancelled by user')
    ])('recognizes cancellation error %#', (error) => {
        expect(isInterruptedExecutionError(error)).toBe(true)
    })

    it('does not classify an ordinary execution failure as an interruption', () => {
        expect(isInterruptedExecutionError(new Error('model unavailable'))).toBe(false)
    })
})
