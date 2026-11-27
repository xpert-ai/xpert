import { Logger } from '@nestjs/common'
import { ToolMessage } from '@langchain/core/messages'
import { Subscriber } from 'rxjs'
import { createMapStreamEvents } from './agent'
import { presentToolImages } from './tool-image-presentation'
import { toolPresentation } from './tool-presentation'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'

jest.mock('../shared', () => ({ AgentStateAnnotation: { State: {} }, createTextChunk: jest.fn() }))
const image = {
    type: 'image',
    artifactId: 'artifact',
    artifactVersionId: 'version',
    sha256: 'a'.repeat(64),
    mimeType: 'image/png',
    source: 'sandbox',
    modelDetail: 'low',
    title: 'chart.png',
    width: 64,
    height: 64
}
const artifact = { type: 'xpert.tool-output', version: 1, attachments: [image] }

describe('participant-visible tool images', () => {
    it('requires an explicit declaration owned by the calling tool', () => {
        expect(presentToolImages(undefined, artifact)).toBeUndefined()
        expect(
            presentToolImages(toolPresentation({ tool: 'other', attachments: 'images' }, 'view'), artifact)
        ).toBeUndefined()
        expect(presentToolImages({ tool: 'view', attachments: 'images' }, artifact)).toEqual([image])
    })
    it.each([
        { ...artifact, attachments: [{ ...image, previewUrl: 'https://untrusted/image' }] },
        { ...artifact, attachments: [{ ...image, path: '/private.png' }] },
        { ...artifact, attachments: [{ ...image, sha256: 'wrong' }] },
        { ...artifact, attachments: [{ ...image, mimeType: 'image/svg+xml' }] },
        { ...artifact, attachments: [{ ...image, data: 'base64-private' }] },
        { ...artifact, attachments: [{ ...image, anchors: { path: '/private.png' } }] },
        { ...artifact, attachments: [] },
        { ...artifact, attachments: Array(21).fill(image) },
        { ...artifact, secret: 'private' }
    ])('rejects invalid and private attachment payloads', (invalid) => {
        expect(presentToolImages({ tool: 'view', attachments: 'images' }, invalid)).toBeUndefined()
    })
    it('deduplicates immutable images within a call', () => {
        expect(
            presentToolImages({ tool: 'view', attachments: 'images' }, { ...artifact, attachments: [image, image] })
        ).toEqual([image])
    })
    it('rejects malformed attachment policies without enabling default output', () => {
        const policy = toolPresentation({ tool: 'view', attachments: 'url', output: () => 'public' }, 'view')
        expect(policy).toEqual({ tool: 'view' })
        expect(presentToolImages(policy, artifact)).toBeUndefined()
    })

    it('keeps distinct versions and leaves model artifacts unchanged', () => {
        const newer = { ...image, artifactVersionId: 'version-2', sha256: 'b'.repeat(64) }
        const original = { ...artifact, attachments: [image, newer, image] }
        const result = presentToolImages({ tool: 'view', attachments: 'images' }, original)
        expect(result).toEqual([image, newer])
        expect(original.attachments).toEqual([image, newer, image])
        expect(result[0]).not.toBe(image)
    })

    it('retains the owning declaration for late events without sharing it with a nested tool', () => {
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [] }
        )
        map({
            event: 'on_tool_start',
            name: 'view',
            tags: [],
            metadata: {
                executionId: 'exec',
                publicToolPresentation: { tool: 'view', attachments: 'images' }
            },
            data: { id: 'call', input: {} }
        })
        for (const name of ['nested', 'view']) {
            map({
                event: 'on_tool_end',
                name,
                tags: [],
                metadata: { executionId: 'exec' },
                data: { output: new ToolMessage({ content: 'private', tool_call_id: 'call', artifact }) }
            })
            expect(next.mock.lastCall[0].data.data.data.presentation.images).toEqual(
                name === 'view' ? [image] : undefined
            )
        }
        expect(JSON.stringify(next.mock.calls)).not.toContain('private')
    })

    it('does not reuse an attachment grant when another execution reuses the call ID', () => {
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [] }
        )
        for (const executionId of ['first', 'second']) {
            map({
                event: 'on_tool_end',
                name: 'view',
                tags: [],
                metadata: {
                    executionId,
                    ...(executionId === 'first'
                        ? { publicToolPresentation: { tool: 'view', attachments: 'images' } }
                        : {})
                },
                data: { output: new ToolMessage({ content: 'result', tool_call_id: 'call', artifact }) }
            })
            expect(next.mock.lastCall[0].data.data.data.presentation.images).toEqual(
                executionId === 'first' ? [image] : undefined
            )
        }
    })

    it.each(['fail', 'canceled'])(
        'clears images after %s and prevents a later generic end from restoring them',
        (status) => {
            const next = jest.fn()
            const map = createMapStreamEvents(
                new Logger(),
                new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
                { unmutes: [] }
            )
            const metadata = { executionId: 'exec', publicToolPresentation: { tool: 'view', attachments: 'images' } }
            const end = {
                event: 'on_tool_end',
                name: 'view',
                tags: [],
                metadata,
                data: { output: new ToolMessage({ content: 'result', tool_call_id: 'call', artifact }) }
            }
            map(end)
            expect(next.mock.lastCall[0].data.data.data.presentation.images).toEqual([image])
            map({
                event: 'on_custom_event',
                name: ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
                tags: [],
                metadata,
                data: { id: 'call', tool: 'view', category: 'Tool', status }
            })
            expect(next.mock.lastCall[0].data.data.data.presentation.images).toBeUndefined()
            map(end)
            expect(next.mock.lastCall[0].data.data.data.status).toBe(status)
            expect(next.mock.lastCall[0].data.data.data.presentation.images).toBeUndefined()
        }
    )
    it.each(['success', 'error'] as const)('projects %s tool events without publishing raw artifacts', (status) => {
        const next = jest.fn()
        const map = createMapStreamEvents(
            new Logger(),
            new Subscriber({ next, error: jest.fn(), complete: jest.fn() }),
            { unmutes: [] }
        )
        map({
            event: 'on_tool_end',
            name: 'view',
            tags: [],
            metadata: {
                executionId: 'exec',
                publicToolPresentation: { tool: 'view', attachments: 'images', output: () => 'Image read' },
                toolDisplay: { tool: 'view', activity: { kind: 'image', action: 'view' } }
            },
            data: { output: new ToolMessage({ content: 'private raw result', tool_call_id: 'call', artifact, status }) }
        })
        const row = next.mock.lastCall[0].data.data.data
        expect(row).not.toHaveProperty('artifact')
        expect(row.presentation.activity).toEqual({ kind: 'image', action: 'view' })
        expect(row.presentation.images).toEqual(status === 'success' ? [image] : undefined)
    })
})
