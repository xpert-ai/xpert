import axios from 'axios'
import { CheckStorageQuotaCommand } from '@xpert-ai/server-core'
import { SandboxBackendTargetStrategy } from './sandbox-backend.strategy'

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }))

const source = {
    name: 'source.txt',
    originalName: 'source.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('content'),
    source: { kind: 'buffer' as const }
}
const target = {
    kind: 'sandbox' as const,
    mode: 'backend_upload' as const,
    sandboxUrl: 'https://sandbox.example.test',
    workspaceId: 'workspace'
}
const scope = { tenantId: 'tenant', organizationId: 'organization', userId: 'user' }

describe('SandboxBackendTargetStrategy storage admission', () => {
    beforeEach(() => jest.clearAllMocks())

    it('does not send a remote upload when the quota boundary rejects the destination', async () => {
        const failure = new Error('unsupported managed storage')
        const execute = jest.fn().mockRejectedValue(failure)
        const strategy = new SandboxBackendTargetStrategy({ execute } as never)
        await expect(strategy.upload(source, target, { request: scope })).rejects.toBe(failure)
        expect(execute).toHaveBeenCalledWith(
            new CheckStorageQuotaCommand({
                kind: 'sandbox',
                scope: { kind: 'user', ...scope },
                root: ''
            })
        )
        expect(axios.post).not.toHaveBeenCalled()
    })

    it('preserves remote uploads for accounts admitted by the shared policy', async () => {
        const execute = jest.fn().mockResolvedValue(null)
        const strategy = new SandboxBackendTargetStrategy({ execute } as never)
        await expect(strategy.upload(source, target, { request: scope })).resolves.toMatchObject({
            status: 'success',
            path: 'source.txt'
        })
        expect(axios.post).toHaveBeenCalledWith('https://sandbox.example.test/file/create', {
            workspace_id: 'workspace',
            file_path: 'source.txt',
            file_contents: 'content'
        })
        expect(execute.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(axios.post).mock.invocationCallOrder[0])
    })
})
