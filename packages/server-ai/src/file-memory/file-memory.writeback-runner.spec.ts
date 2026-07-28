import { HumanMessage } from '@langchain/core/messages'
import { FileMemoryWritebackRunner } from './file-memory.writeback-runner'

describe('FileMemoryWritebackRunner', () => {
    it('skips a background writeback when its configured model is unavailable', async () => {
        const fileMemoryService = {
            recordWritebackCandidate: jest.fn().mockResolvedValue(undefined)
        }
        const runner = new FileMemoryWritebackRunner(fileMemoryService as never)
        const getModel = jest.fn().mockRejectedValue(new Error('No AI model provided'))

        const key = runner.enqueue({
            xpert: {
                tenantId: 'tenant-1',
                id: 'xpert-1'
            },
            messages: [new HumanMessage('Remember this preference.')],
            getModel
        })

        await expect(runner.softDrain(key, 1000)).resolves.toBe(true)
        expect(fileMemoryService.recordWritebackCandidate).toHaveBeenCalled()
        expect(getModel).toHaveBeenCalled()
    })
})
