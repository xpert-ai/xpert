jest.mock('./present-files', () => ({ MAX_PRESENT_FILES: 20, presentFiles: jest.fn() }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn().mockResolvedValue(undefined) }))
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { WorkflowNodeTypeEnum, ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import { presentFiles } from './present-files'
import { createPresentFilesTool, presentFilesSchema } from './present-files.tool'
import { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    resolveSandboxBackend: (sandbox: { backend?: unknown }) => sandbox?.backend
}))
const context: IAgentMiddlewareContext = {
    tenantId: 'tenant',
    userId: 'user',
    threadId: 'thread',
    tools: new Map(),
    node: { id: 'file', key: 'file', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: 'SandboxFile' },
    runtime: {
        createModelClient: async () => {
            throw new Error('unused')
        },
        wrapWorkflowNodeExecution: async () => {
            throw new Error('unused')
        }
    }
}

describe('present_files tool contract', () => {
    beforeEach(() => jest.clearAllMocks())
    it.each([
        {},
        { paths: [] },
        { paths: Array(21).fill('a.txt') },
        { paths: [''] },
        { paths: ['a.txt'], delivery: true },
        { paths: ['a.txt'], title: 'Report' },
        { paths: ['a.txt'], tenantId: 'other' }
    ])('rejects malformed or additional arguments: %j', (input) => {
        expect(presentFilesSchema.safeParse(input).success).toBe(false)
    })
    it('uses the current sandbox and emits exactly one real tool execution', async () => {
        const storage = { persist: jest.fn() },
            backend = { workingDirectory: '/workspace' }
        const value = { status: 'success' as const, files: [{ path: 'report.pdf', name: 'report.pdf', size: 100 }] }
        jest.mocked(presentFiles).mockResolvedValue(value)
        const tool = createPresentFilesTool(storage, context)
        expect(Object.keys(presentFilesSchema.shape)).toEqual(['paths'])
        expect(tool.metadata?.toolName).toEqual({ en_US: 'Present files', zh_Hans: '交付文件' })
        const result = await tool.invoke(
            { paths: ['report.pdf'] },
            { configurable: { sandbox: { backend } }, metadata: { tool_call_id: 'call' } }
        )
        expect(JSON.parse(result)).toEqual(value)
        expect(presentFiles).toHaveBeenCalledWith(storage, context, backend, 'call', ['report.pdf'])
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(2)
        const events = jest.mocked(dispatchCustomEvent).mock.calls
        expect(events.map(([kind]) => kind)).toEqual([
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE
        ])
        expect(events[0][1]).toMatchObject({ id: 'call', tool: 'present_files', status: 'running' })
        expect(events[1][1]).toMatchObject({ id: 'call', tool: 'present_files', status: 'success' })
    })
    it('marks the real tool as failed when presentation fails', async () => {
        jest.mocked(presentFiles).mockRejectedValue(new Error('Cannot present selected file'))
        const tool = createPresentFilesTool({ persist: jest.fn() }, context)
        await expect(
            tool.invoke(
                { paths: ['missing.pdf'] },
                { configurable: { sandbox: { backend: {} } }, metadata: { tool_call_id: 'failed' } }
            )
        ).rejects.toThrow('Cannot present selected file')
        expect(jest.mocked(dispatchCustomEvent).mock.calls[1][1]).toMatchObject({
            id: 'failed',
            tool: 'present_files',
            status: 'fail'
        })
    })
})
