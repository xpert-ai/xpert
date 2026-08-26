import { _BaseToolset, closeToolsets } from './toolset'

function toolsetWithClose(close: jest.Mock<Promise<void>, []>) {
    return { close } as unknown as _BaseToolset
}

describe('closeToolsets', () => {
    it('closes every runtime and reports individual close failures', async () => {
        const failure = new Error('close failed')
        const firstClose = jest.fn<Promise<void>, []>().mockRejectedValue(failure)
        const secondClose = jest.fn<Promise<void>, []>().mockResolvedValue(undefined)
        const onError = jest.fn()

        await closeToolsets([toolsetWithClose(firstClose), toolsetWithClose(secondClose)], onError)

        expect(firstClose).toHaveBeenCalledTimes(1)
        expect(secondClose).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(failure)
    })
})
