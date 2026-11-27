import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { Logger } from '@nestjs/common'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import { Subscriber } from 'rxjs'
import { z } from 'zod/v3'
import { createMapStreamEvents } from './agent'
import { toolErrorEvent } from './tool-presentation'

jest.mock('../shared', () => ({ AgentStateAnnotation: { State: {} }, createTextChunk: jest.fn() }))

const call = { name: 'read', id: 'call', args: { path: 42 } }
const icon = { type: 'emoji', value: '📄' }
const metadata = {
    toolName: { en_US: 'Read file', zh_Hans: '读取文件' },
    toolIcon: icon,
    toolDisplay: { tool: 'read', activity: { kind: 'file', action: 'read' } },
    publicToolPresentation: { tool: 'read', error: () => 'Choose a valid file' }
}

function capture(language = 'zh-Hans') {
    const next = jest.fn()
    const map = createMapStreamEvents(new Logger(), new Subscriber({ next, error: jest.fn(), complete: jest.fn() }), {
        unmutes: [],
        language
    })
    return { next, map, row: () => next.mock.lastCall[0].data.data.data }
}

describe('tool error presentation', () => {
    it.each([
        ['zh-Hans', '读取文件'],
        ['en-US', 'Read file']
    ])('preserves the registered %s display when validation fails before a start event', async (language, title) => {
        const body = jest.fn(async () => 'contents')
        const registered = tool(body, {
            name: call.name,
            description: 'Read a file',
            schema: z.object({ path: z.string() }),
            metadata
        })
        const runner = RunnableLambda.from(async (args: typeof call.args, config) => {
            try {
                return await registered.invoke({ type: 'tool_call', ...call, args }, config)
            } catch {
                await dispatchCustomEvent(
                    ChatMessageEventTypeEnum.ON_TOOL_ERROR,
                    toolErrorEvent(call, 'private validation error', registered),
                    config
                )
                return null
            }
        })
        const { next, map, row } = capture(language)
        const starts: string[] = []
        for await (const event of runner.streamEvents(call.args, {
            version: 'v2',
            metadata: {
                executionId: 'execution',
                toolName: 'Parent workflow',
                toolIcon: { type: 'emoji', value: '🌐' },
                toolDisplay: { tool: 'parent', activity: { kind: 'search', action: 'search' } },
                publicToolPresentation: { tool: 'parent', error: () => 'Parent error' }
            }
        })) {
            if (event.event === 'on_tool_start') starts.push(event.name)
            map(event)
        }
        expect(body).not.toHaveBeenCalled()
        expect(starts).toEqual([])
        expect(row()).toMatchObject({
            category: 'Tool',
            tool: 'read',
            title,
            icon,
            status: 'fail',
            error: 'Choose a valid file',
            presentation: { activity: { kind: 'file', action: 'read' } }
        })
        expect(JSON.stringify(next.mock.calls)).not.toMatch(/private validation error|Parent workflow|Parent error/)
    })

    it.each([{ metadata }, { defaultConfig: { metadata } }, { config: { metadata } }])(
        'resolves display metadata from registered and bound tools',
        (source) => {
            const { map, row } = capture()
            map({
                event: 'on_custom_event',
                name: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
                tags: [],
                metadata: {},
                data: toolErrorEvent(call, 'private error', { name: call.name, ...source })
            })
            expect(row()).toMatchObject({
                title: '读取文件',
                icon,
                status: 'fail',
                error: 'Choose a valid file',
                presentation: { activity: { kind: 'file', action: 'read' } }
            })
        }
    )

    it('uses tool metadata over bound defaults and falls back to the middleware icon', () => {
        const { map, row } = capture()
        map({
            event: 'on_custom_event',
            name: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
            tags: [],
            metadata: {},
            data: toolErrorEvent(call, 'error', {
                name: call.name,
                config: { metadata: { toolName: 'Bound title', middlewareIcon: icon } },
                defaultConfig: { metadata: { toolName: 'Default title' } },
                metadata: { toolName: 'Registered title', toolIcon: { type: 'invalid', value: 'invalid' } }
            })
        })
        expect(row()).toMatchObject({ title: 'Registered title', icon, status: 'fail' })
    })

    it('does not attach display metadata from a different registered tool', () => {
        const event = toolErrorEvent(call, 'error', { name: 'other', metadata })
        for (const field of ['toolName', 'toolIcon', 'middlewareIcon', 'toolDisplay']) {
            expect(event).not.toHaveProperty(field)
        }
    })

    it('copies only display fields and the error projector into the catch event', () => {
        const policy = {
            ...metadata.publicToolPresentation,
            input: () => 'input',
            output: () => 'output',
            attachments: 'images'
        }
        const event = toolErrorEvent(call, 'error', {
            name: call.name,
            metadata: { ...metadata, publicToolPresentation: policy, token: 'private' }
        })
        expect(Object.keys(event).sort()).toEqual(
            [
                'toolCall',
                'error',
                'toolName',
                'toolIcon',
                'middlewareIcon',
                'toolDisplay',
                'publicToolPresentation'
            ].sort()
        )
        expect(event.publicToolPresentation).toEqual({ tool: 'read', error: policy.error })
    })

    it('keeps errors for missing tools renderable without borrowing a parent title or icon', () => {
        const { map, row } = capture()
        map({
            event: 'on_custom_event',
            name: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
            tags: [],
            metadata: { toolName: 'Parent workflow', toolIcon: icon },
            data: toolErrorEvent(call, 'Tool unavailable')
        })
        expect(row()).toMatchObject({ tool: 'read', status: 'fail', error: 'Tool unavailable' })
        expect(row()).not.toHaveProperty('title')
        expect(row()).not.toHaveProperty('icon')
    })
})
