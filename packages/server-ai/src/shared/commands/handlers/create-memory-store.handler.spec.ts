import { RequestContext } from '@xpert-ai/plugin-sdk'
import { withGroupRuntime } from '../../../chat-group/group-runtime-context'
import { CreateCopilotStoreCommand } from '../../../copilot-store'
import { CreateMemoryStoreCommand } from '../create-memory-store.command'
import { CreateMemoryStoreHandler } from './create-memory-store.handler'

describe('group personal-memory isolation', () => {
    const commands = { execute: jest.fn() }
    const queries = { execute: jest.fn() }
    const handler = new CreateMemoryStoreHandler(commands as never, queries as never, {} as never)
    const request = new CreateMemoryStoreCommand('tenant', 'org', undefined, {})
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('human-A')
    })
    afterEach(() => jest.restoreAllMocks())
    it('does not even resolve personal memory configuration during a group run', async () => {
        await expect(withGroupRuntime('runtime', () => handler.execute(request))).resolves.toBeNull()
        expect(queries.execute).not.toHaveBeenCalled()
        expect(commands.execute).not.toHaveBeenCalled()
    })
    it('restores normal personal-memory creation after the group dispatch scope exits', async () => {
        await withGroupRuntime('runtime', () => handler.execute(request))
        const embeddings = { embedQuery: jest.fn(), embedDocuments: jest.fn() }
        queries.execute
            .mockResolvedValueOnce({ enabled: true, copilotModel: {}, modelProvider: {} })
            .mockResolvedValueOnce(embeddings)
        const store = { testStore: true }
        commands.execute.mockResolvedValueOnce(store)
        await expect(handler.execute(request)).resolves.toBe(store)
        expect(commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                options: {
                    tenantId: 'tenant',
                    organizationId: 'org',
                    userId: 'human-A',
                    index: { dims: null, embeddings }
                }
            })
        )
        expect(commands.execute).toHaveBeenCalledWith(expect.any(CreateCopilotStoreCommand))
    })
})
