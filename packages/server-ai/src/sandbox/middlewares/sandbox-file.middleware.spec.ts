jest.mock('./file-activity-storage.service', () => ({ FileActivityStorage: class {} }))
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { SandboxFileMiddleware } from './sandbox-file.middleware'

jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@xpert-ai/contracts', () => ({
    ChatMessageEventTypeEnum: {
        ON_TOOL_MESSAGE: 'ON_TOOL_MESSAGE'
    },
    ChatMessageStepCategory: {
        Program: 'Program'
    },
    WorkflowNodeTypeEnum: {
        MIDDLEWARE: 'middleware'
    },
    getToolCallIdFromConfig: (config: { metadata?: { tool_call_id?: string } }) => config?.metadata?.tool_call_id
}))

jest.mock('@xpert-ai/plugin-sdk', () => {
    class BaseSandbox {
        workingDirectory = ''
    }

    return {
        __esModule: true,
        BaseSandbox,
        AgentMiddlewareStrategy: () => (target: unknown) => target,
        ...jest.requireActual('../../../../plugin-sdk/src/lib/runtime/workspace-file-tools')
    }
})

describe('SandboxFileMiddleware', () => {
    const createXpertFeatures = () => ({
        opener: {
            enabled: false,
            message: '',
            questions: []
        },
        suggestion: {
            enabled: false,
            prompt: ''
        },
        textToSpeech: {
            enabled: false
        },
        speechToText: {
            enabled: false
        },
        sandbox: {
            enabled: true
        }
    })

    it('requires the sandbox xpert feature before creating middleware', async () => {
        const middleware = new SandboxFileMiddleware({ persist: jest.fn() })

        expect(() =>
            middleware.createMiddleware(
                {},
                {
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    xpertFeatures: null,
                    node: {
                        id: 'middleware-1',
                        key: 'middleware-1',
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'sandbox-file'
                    },
                    runtime: {} as never,
                    tools: new Map()
                }
            )
        ).toThrow('SandboxFile requires the xpert sandbox feature to be enabled.')
    })

    it('creates middleware tools when the sandbox xpert feature is enabled', async () => {
        const middleware = new SandboxFileMiddleware({ persist: jest.fn() })

        const agentMiddleware = await Promise.resolve(
            middleware.createMiddleware(
                {},
                {
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    xpertFeatures: createXpertFeatures(),
                    node: {
                        id: 'middleware-1',
                        key: 'middleware-1',
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'sandbox-file'
                    },
                    runtime: {} as never,
                    tools: new Map()
                }
            )
        )

        expect(agentMiddleware.tools.map((tool) => tool.name)).toEqual([
            'sandbox_read_file',
            'sandbox_glob',
            'sandbox_grep',
            'sandbox_write_file',
            'sandbox_append_file',
            'sandbox_edit_file',
            'sandbox_multi_edit_file',
            'sandbox_list_dir',
            'present_files'
        ])
        const fields = {
            sandbox_write_file: ['content', 'file_path'],
            sandbox_append_file: ['content', 'file_path'],
            sandbox_edit_file: ['file_path', 'new_string', 'old_string', 'replace_all'],
            sandbox_multi_edit_file: ['edits', 'file_path'],
            present_files: ['paths']
        }
        for (const [name, expected] of Object.entries(fields)) {
            const schema = agentMiddleware.tools.find((tool) => tool.name === name)?.schema
            if (!schema || !('shape' in schema)) throw new Error('Expected object schema')
            expect(Object.keys(schema.shape).sort()).toEqual(expected)
        }
    })

    const createFileTools = () =>
        new SandboxFileMiddleware({ persist: jest.fn() }).createMiddleware(
            {},
            {
                tenantId: 'tenant-1',
                userId: 'user-1',
                xpertFeatures: createXpertFeatures(),
                node: { id: 'files', key: 'files', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: 'SandboxFile' },
                runtime: {} as never,
                tools: new Map()
            }
        )

    it.each([
        { name: 'sandbox_read_file', valid: {}, invalid: [] },
        {
            name: 'sandbox_write_file',
            valid: { content: 'page' },
            invalid: [{ html: 'page' }, { content: ['page'] }, {}]
        },
        {
            name: 'sandbox_append_file',
            valid: { content: 'page' },
            invalid: [{ html: 'page' }, { content: ['page'] }, {}]
        },
        {
            name: 'sandbox_edit_file',
            valid: { old_string: 'old', new_string: 'new' },
            invalid: [{ old_string: 'old', new_string: 'new', replaceAll: true }]
        },
        {
            name: 'sandbox_multi_edit_file',
            valid: { edits: [{ oldString: 'old', newString: 'new' }] },
            invalid: [{ edits: [] }, { edits: [{ oldString: 'old', newString: 'new', replace_all: true }] }]
        }
    ])('rejects invalid $name arguments before invoking the backend', async ({ name, valid, invalid }) => {
        const created = await createFileTools()
        const fileTool = created.tools.find((tool) => tool.name === name)
        const backend = {
            workingDirectory: '/workspace',
            read: jest.fn(),
            write: jest.fn(),
            append: jest.fn(),
            edit: jest.fn(),
            multiEdit: jest.fn()
        }
        const config = { configurable: { sandbox: { backend } } }
        for (const file_path of ['  .html', '../page.html', '/workspace/page.html']) {
            await expect(fileTool.invoke({ ...valid, file_path }, config)).rejects.toThrow('file_path')
        }
        for (const args of invalid) {
            await expect(fileTool.invoke({ file_path: 'page.html', ...args }, config)).rejects.toThrow()
        }
        for (const operation of [backend.read, backend.write, backend.append, backend.edit, backend.multiEdit]) {
            expect(operation).not.toHaveBeenCalled()
        }
    })

    it('declares mutation intent only on tools that change file content', async () => {
        const created = await createFileTools()
        expect(created.tools.filter((tool) => tool.metadata?.workspaceFileOperation).map((tool) => tool.name)).toEqual([
            'sandbox_write_file',
            'sandbox_append_file',
            'sandbox_edit_file',
            'sandbox_multi_edit_file'
        ])
        for (const tool of created.tools.filter((tool) => tool.metadata?.workspaceFileOperation)) {
            expect(tool.metadata.workspaceFileOperation).toEqual({ type: 'mutation', pathArgument: 'file_path' })
        }
    })

    it('returns the caller workspace path instead of the provider absolute path after writing', async () => {
        const middleware = new SandboxFileMiddleware({ persist: jest.fn() })
        const agentMiddleware = await Promise.resolve(
            middleware.createMiddleware(
                {},
                {
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    xpertFeatures: createXpertFeatures(),
                    node: {
                        id: 'middleware-1',
                        key: 'middleware-1',
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'sandbox-file'
                    },
                    runtime: {} as never,
                    tools: new Map()
                }
            )
        )
        const writeTool = agentMiddleware.tools.find((tool) => tool.name === 'sandbox_write_file')
        const backend = {
            workingDirectory: '/workspace',
            write: jest.fn().mockResolvedValue({
                path: '/workspace/reports/report.md',
                filesUpdate: null
            })
        }

        const result = await writeTool?.invoke(
            { file_path: 'reports/report.md', content: '# Report' },
            {
                configurable: { sandbox: { backend } },
                metadata: { tool_call_id: 'tool-call-1' }
            }
        )

        expect(backend.write).toHaveBeenCalledWith('/workspace/reports/report.md', '# Report')
        expect(JSON.parse(result as string)).toEqual({
            path: 'reports/report.md',
            filesUpdate: null
        })
    })
})
