jest.mock('../../skill-package.entity', () => ({ SkillPackage: class {} }))
jest.mock('../../skill-package.service', () => ({ SkillPackageService: class {} }))
jest.mock('../../../skill-repository/repository-index/skill-repository-index.service', () => ({
    SkillRepositoryIndexService: class {}
}))
jest.mock('../../../xpert-workspace', () => ({ getWorkspaceRoot: () => '/workspace-root' }))
jest.mock('../../../sandbox', () => ({
    SandboxAcquireBackendCommand: class {},
    SandboxCopyTreeCommand: class {}
}))
jest.mock('../../../agent-plugin/runtime-resource-skill-file', () => ({
    readRuntimeResourceSkillFile: jest.fn().mockResolvedValue('instructions')
}))
jest.mock('../../../shared', () => ({
    AgentStateAnnotation: { State: {} },
    createTextChunk: jest.fn()
}))

import { AIMessage, isToolMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { appendMessageContent, ChatMessageEventTypeEnum, type IChatMessage } from '@xpert-ai/contracts'
import type { ChatSkillUsage, TMessageContentComponent, TMessageContent } from '@xpert-ai/chatkit-types'
import { SkillsMiddleware } from './index'
import { readSkillUsageArtifact } from './skill-usage'
import { RUNTIME_RESOURCE_SKILLS, RuntimeResourceSkillSource } from '../../../agent-plugin/runtime-resource-context'
import { readRuntimeResourceSkillFile } from '../../../agent-plugin/runtime-resource-skill-file'
import { createMapStreamEvents } from '../../../xpert-agent/agent'
import { extractChatMessageTaskSummary } from '../../../chat-message/task-summary'
import { ChatMessageUpsertHandler } from '../../../chat-message/commands/handlers/upsert.handler'
import { ChatMessageUpsertCommand } from '../../../chat-message/commands/upsert.command'
import { toolErrorEvent } from '../../../xpert-agent/tool-presentation'

const root = '/root/.xpert/skills'
const source: RuntimeResourceSkillSource = {
    id: 'skill-a',
    name: 'Research',
    description: 'Research things',
    rootPath: '/resources/research',
    runtimePath: 'plugins/research',
    version: 'digest-1',
    origin: { type: 'plugin', id: 'plugin-1' }
}

async function setup(mode: 'resource' | 'sandbox' | 'fallback', name = source.name) {
    const execute = jest.fn().mockResolvedValue({ exitCode: 0, output: 'instructions' })
    const backend = { id: `backend-${name}`, execute }
    const strategy = new SkillsMiddleware(
        { find: jest.fn().mockResolvedValue([]) } as never,
        {} as never,
        {} as never,
        {} as never
    )
    Reflect.set(strategy, 'commandBus', { execute: jest.fn().mockResolvedValue({ backend }) })
    if (mode === 'fallback') {
        Reflect.set(
            strategy,
            'loadWorkspaceSkillMetadata',
            jest.fn().mockResolvedValue([
                {
                    id: 'skill-a',
                    name,
                    version: 'digest-1',
                    workspaceId: 'workspace-1',
                    path: `${root}/plugins/research/SKILL.md`
                }
            ])
        )
    }
    const instance = await strategy.createMiddleware(
        { resourceOnly: mode !== 'fallback' },
        {
            tenantId: 'tenant-1',
            userId: 'user-1',
            workspaceId: 'workspace-1',
            node: {} as never,
            tools: new Map(),
            runtime: {} as never,
            ...{ [RUNTIME_RESOURCE_SKILLS]: mode === 'fallback' ? [] : [{ ...source, name }] }
        }
    )
    await instance.wrapModelCall(
        {
            runtime: { configurable: { sandbox: mode === 'sandbox' ? { backend } : {} } },
            state: {},
            systemMessage: new SystemMessage('base')
        } as never,
        jest.fn(async () => new AIMessage('answer'))
    )
    const tool = instance.tools.find((tool) => tool.name === 'read_skill_file')
    const read = async (path = `${root}/plugins/research/SKILL.md`, callId = 'call-1', executionId = 'run-1') => {
        const result = await tool.invoke(
            { type: 'tool_call', name: tool.name, id: callId, args: { path } },
            {
                configurable: { executionId }
            }
        )
        if (!isToolMessage(result)) throw new Error('Expected ToolMessage')
        return result
    }
    return { read, execute, tool }
}

describe('skill observations through runtime, stream and persistence', () => {
    beforeEach(() => jest.mocked(readRuntimeResourceSkillFile).mockReset().mockResolvedValue('instructions'))

    it.each([
        ['zh-Hans', 'SKILL.md', '读取技能文件'],
        ['zh-Hans', 'examples/demo.csv', '读取技能文件'],
        ['en-US', 'SKILL.md', 'Read skill file'],
        ['en-US', 'references/notes.md', 'Read skill file']
    ])('displays %s titles for %s through ordinary tool events', async (language, file, title) => {
        const { tool } = await setup('sandbox')
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [], language }
        )
        const runner = RunnableLambda.from(async (args: { path: string }, config) =>
            tool.invoke({ type: 'tool_call', name: tool.name, id: 'display-call', args }, config)
        )
        for await (const event of runner.streamEvents(
            { path: `${root}/plugins/research/${file}` },
            { version: 'v2', metadata: { tool_call_id: 'display-call' } }
        ))
            map(event)

        const rows = next.mock.calls.map(([event]) => event.data.data)
        expect(rows).toHaveLength(2)
        for (const row of rows) {
            expect(row).toMatchObject({
                id: 'display-call',
                data: {
                    category: 'Tool',
                    tool: 'read_skill_file',
                    title,
                    icon: { type: 'svg', color: 'currentColor' }
                }
            })
            expect(row.data.icon.value).toContain('stroke-width="2"')
        }
        expect(rows.map((row) => row.data.status)).toEqual(['running', 'success'])
        expect(rows[1].data.output).toBeUndefined()
        expect(rows[1].data.presentation).toMatchObject({
            version: 1,
            activity: { kind: 'skill', action: 'read' },
            output: { state: 'available', mode: 'summary', truncated: true, byteLength: 12 }
        })
        if (file !== 'SKILL.md') expect(rows[1].data.taskSummary).toBeUndefined()
    })

    it('retains the registered title and icon when reading fails', async () => {
        const { tool, execute } = await setup('sandbox')
        execute.mockResolvedValueOnce({ exitCode: 1, output: 'read failed' })
        const message: Pick<IChatMessage, 'id' | 'content' | 'role'> = { id: 'answer', content: '', role: 'ai' }
        const next = jest.fn((event: { data: { data: TMessageContentComponent } }) => {
            appendMessageContent(message, event.data.data)
        })
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            {
                unmutes: [],
                language: 'zh-Hans'
            }
        )
        const runner = RunnableLambda.from(async (args: { path: string }, config) => {
            const call = { name: tool.name, id: 'failed-call', args }
            try {
                return await tool.invoke({ type: 'tool_call', ...call }, config)
            } catch {
                await dispatchCustomEvent(
                    ChatMessageEventTypeEnum.ON_TOOL_ERROR,
                    toolErrorEvent(call, 'read failed', tool),
                    config
                )
                return null
            }
        })
        for await (const event of runner.streamEvents(
            { path: `${root}/plugins/research/SKILL.md` },
            { version: 'v2', metadata: { tool_call_id: 'failed-call' } }
        ))
            map(event)

        expect(message.content).toMatchObject([
            {
                id: 'failed-call',
                data: {
                    category: 'Tool',
                    tool: 'read_skill_file',
                    title: '读取技能文件',
                    icon: { type: 'svg', color: 'currentColor' },
                    status: 'fail',
                    error: 'read failed'
                }
            }
        ])
    })

    it.each(['resource', 'sandbox', 'fallback'] as const)(
        'records a successful %s read without changing model content',
        async (mode) => {
            const { read } = await setup(mode)
            const result = await read()
            expect(result.content).toBe('instructions')
            expect(readSkillUsageArtifact(result.artifact)).toMatchObject({
                skillId: 'skill-a',
                name: 'Research',
                version: 'digest-1',
                activation: 'read',
                source: mode === 'fallback' ? { type: 'workspace', id: 'workspace-1' } : source.origin,
                toolCallId: 'call-1',
                executionId: 'run-1'
            })
            expect(JSON.stringify(result.artifact)).not.toContain('/resources')
        }
    )

    it('does not record references or unregistered main files and rejects failed reads', async () => {
        const { read, execute } = await setup('sandbox')
        expect((await read(`${root}/plugins/research/references/notes.md`)).artifact).toBeUndefined()
        expect((await read(`${root}/other/SKILL.md`)).artifact).toBeUndefined()
        execute.mockResolvedValueOnce({ exitCode: 1, output: 'read failed' })
        await expect(read()).rejects.toThrow('read failed')
        const local = await setup('resource')
        jest.mocked(readRuntimeResourceSkillFile).mockRejectedValueOnce(new Error('read denied'))
        await expect(local.read()).rejects.toThrow('read denied')
    })

    it('isolates concurrent runs and their tool call identities', async () => {
        const [first, second] = await Promise.all([setup('resource', 'First'), setup('resource', 'Second')])
        const results = await Promise.all([first.read(undefined, 'c1', 'r1'), second.read(undefined, 'c2', 'r2')])
        expect(results.map((result) => readSkillUsageArtifact(result.artifact))).toMatchObject([
            { name: 'First', toolCallId: 'c1', executionId: 'r1' },
            { name: 'Second', toolCallId: 'c2', executionId: 'r2' }
        ])
    })

    it('merges streamed components, persists all skills and restores history without carrying usage to the next answer', async () => {
        const { read } = await setup('resource')
        const output = await read()
        const first = readSkillUsageArtifact(output.artifact)
        const second: ChatSkillUsage = { ...first, skillId: 'skill-b', name: 'Writing', toolCallId: 'call-2' }
        const message: Pick<IChatMessage, 'id' | 'content' | 'role'> = { id: 'answer-1', role: 'ai', content: '' }
        const next = jest.fn((event: { data: { data: TMessageContentComponent } }) => {
            appendMessageContent(message, event.data.data)
        })
        const map = createMapStreamEvents(
            { warn: jest.fn(), verbose: jest.fn(), debug: jest.fn() } as never,
            { next } as never,
            {
                agent: { key: 'Agent_root' } as never,
                unmutes: []
            }
        )
        for (const usage of [first, second, { ...first, toolCallId: 'call-3' }]) {
            for (const event of ['on_tool_start', 'on_tool_end']) {
                map({
                    event,
                    name: 'read_skill_file',
                    tags: [],
                    data:
                        event === 'on_tool_start'
                            ? { input: {} }
                            : {
                                  output: new ToolMessage({
                                      content: 'instructions',
                                      tool_call_id: usage.toolCallId,
                                      artifact: { type: 'xpert_skill_usage', usage }
                                  })
                              },
                    metadata: { tool_call_id: usage.toolCallId, executionId: 'run-1' },
                    run_id: 'tool-run'
                })
            }
        }
        expect(Array.isArray(message.content) && message.content).toHaveLength(3)
        for (const part of Array.isArray(message.content) ? message.content : []) {
            expect(part).toMatchObject({ type: 'component', data: { category: 'Tool', toolPresentation: 'redacted' } })
            expect(part.id).not.toMatch(/^native:/)
        }
        const service = {
            save: jest.fn(async (entity) => entity),
            findOneInOrganizationOrTenant: jest.fn().mockResolvedValue(message)
        }
        const handler = new ChatMessageUpsertHandler(service as never, {} as never)
        const saved = await handler.execute(new ChatMessageUpsertCommand(message))
        expect(saved.taskSummary.skillUsages).toEqual([first, second])
        const persisted: TMessageContent = JSON.parse(JSON.stringify(message.content))
        expect(extractChatMessageTaskSummary({ ...message, content: persisted }).skillUsages).toEqual([first, second])
        expect(extractChatMessageTaskSummary({ id: 'answer-2', content: 'Next answer' }).skillUsages).toBeUndefined()
        service.findOneInOrganizationOrTenant.mockResolvedValue({ ...message, content: 'Regenerated answer' })
        const regenerated = await handler.execute(
            new ChatMessageUpsertCommand({
                id: message.id,
                content: 'Regenerated answer'
            })
        )
        expect(regenerated.taskSummary.skillUsages).toBeUndefined()
    })
})
