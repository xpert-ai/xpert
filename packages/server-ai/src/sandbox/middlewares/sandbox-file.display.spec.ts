jest.mock('./file-activity-storage.service', () => ({ FileActivityStorage: class {} }))
jest.mock('../../shared', () => ({ AgentStateAnnotation: { State: {} }, createTextChunk: jest.fn() }))

import { RunnableLambda } from '@langchain/core/runnables'
import { Logger } from '@nestjs/common'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { Subscriber } from 'rxjs'
import { createMapStreamEvents } from '../../xpert-agent/agent'
import { SandboxFileMiddleware } from './sandbox-file.middleware'

const operations = [
    { name: 'sandbox_read_file', args: { file_path: 'demo.txt' }, zh: '读取文件', en: 'Read file' },
    { name: 'sandbox_glob', args: { pattern: '*.txt' }, zh: '查找文件', en: 'Find files' },
    { name: 'sandbox_grep', args: { pattern: 'demo' }, zh: '搜索文件内容', en: 'Search file contents' },
    { name: 'sandbox_write_file', args: { file_path: 'demo.txt', content: 'demo' }, zh: '创建文件', en: 'Create file' },
    {
        name: 'sandbox_append_file',
        args: { file_path: 'demo.txt', content: 'more' },
        zh: '追加文件内容',
        en: 'Append to file'
    },
    {
        name: 'sandbox_edit_file',
        args: { file_path: 'demo.txt', old_string: 'demo', new_string: 'new' },
        zh: '编辑文件',
        en: 'Edit file'
    },
    {
        name: 'sandbox_multi_edit_file',
        args: { file_path: 'demo.txt', edits: [{ oldString: 'demo', newString: 'new' }] },
        zh: '批量编辑文件',
        en: 'Apply file edits'
    },
    { name: 'sandbox_list_dir', args: { dir_path: '.' }, zh: '列出目录', en: 'List directory' }
]

async function fileTools() {
    return new SandboxFileMiddleware({ persist: jest.fn() }).createMiddleware(
        {},
        {
            tenantId: 'tenant-1',
            userId: 'user-1',
            xpertFeatures: {
                opener: { enabled: false, message: '', questions: [] },
                suggestion: { enabled: false, prompt: '' },
                textToSpeech: { enabled: false },
                speechToText: { enabled: false },
                sandbox: { enabled: true }
            },
            node: { id: 'files', key: 'files', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: 'SandboxFile' },
            runtime: {} as never,
            tools: new Map()
        }
    )
}

describe.each([
    ['zh-Hans', 'zh'],
    ['en-US', 'en']
] as const)('Sandbox Files display events in %s', (language, locale) => {
    it.each(operations)('keeps the descriptive title through every $name lifecycle event', async (operation) => {
        const middleware = await fileTools()
        const tool = middleware.tools.find((tool) => tool.name === operation.name)
        const invokeBackend = jest.fn().mockResolvedValue('file result')
        const backend = {
            workingDirectory: '/workspace',
            read: invokeBackend,
            glob: invokeBackend,
            grep: invokeBackend,
            write: invokeBackend,
            append: invokeBackend,
            edit: invokeBackend,
            multiEdit: invokeBackend,
            listDir: invokeBackend
        }
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [], language }
        )
        const runner = RunnableLambda.from(async (_input, config) =>
            tool.invoke(
                {
                    type: 'tool_call',
                    name: tool.name,
                    id: 'file-call',
                    args: operation.args
                },
                config
            )
        )
        for await (const event of runner.streamEvents(
            {},
            {
                version: 'v2',
                metadata: { tool_call_id: 'file-call' },
                configurable: { sandbox: { backend } }
            }
        ))
            map(event)

        const rows = next.mock.calls.map(([event]) => event.data.data)
        // Native start/end and the tool's custom progress updates all use the same title.
        expect(rows.map((row) => row.data.status)).toEqual(['running', 'running', 'success', 'success'])
        for (const row of rows)
            expect(row).toMatchObject({
                id: 'file-call',
                data: { category: 'Tool', tool: operation.name, title: operation[locale] }
            })
        expect(rows[0].data.input).toEqual(
            operation.name === 'sandbox_multi_edit_file' ? { file_path: 'demo.txt', edits: [{}] } : operation.args
        )
        expect(rows[0].data.presentation.activity.kind).toBe('file')
        if (operation.name === 'sandbox_read_file') {
            expect(rows.at(-1).data.output).toBeUndefined()
            expect(rows.at(-1).data.presentation.output).toMatchObject({
                state: 'available',
                mode: 'summary',
                truncated: true
            })
        } else expect(rows.at(-1).data.output).toContain('file result')
        expect(invokeBackend).toHaveBeenCalledTimes(1)
    })

    it('retains the descriptive title when the file cannot be read', async () => {
        const middleware = await fileTools()
        const tool = middleware.tools.find((tool) => tool.name === 'sandbox_read_file')
        const backend = { workingDirectory: '/workspace', read: jest.fn().mockRejectedValue(new Error('file missing')) }
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [], language }
        )
        const runner = RunnableLambda.from(async (_input, config) => {
            try {
                return await tool.invoke(
                    {
                        type: 'tool_call',
                        name: tool.name,
                        id: 'failed-file',
                        args: { file_path: 'missing.txt' }
                    },
                    config
                )
            } catch {
                return null
            }
        })
        for await (const event of runner.streamEvents(
            {},
            {
                version: 'v2',
                metadata: { tool_call_id: 'failed-file' },
                configurable: { sandbox: { backend } }
            }
        ))
            map(event)
        const rows = next.mock.calls.map(([event]) => event.data.data)
        expect(rows.at(-1)).toMatchObject({
            id: 'failed-file',
            data: {
                category: 'Tool',
                tool: 'sandbox_read_file',
                title: operations[0][locale],
                status: 'fail',
                error: 'file missing'
            }
        })
    })
})
