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
        AgentMiddlewareStrategy: () => (target: unknown) => target
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
        const middleware = new SandboxFileMiddleware()

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
        const middleware = new SandboxFileMiddleware()

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
            'sandbox_list_dir'
        ])
    })

    it('returns the caller workspace path instead of the provider absolute path after writing', async () => {
        const middleware = new SandboxFileMiddleware()
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
