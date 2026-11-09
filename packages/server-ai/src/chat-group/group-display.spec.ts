import { groupDisplayContent } from './group-display'
import { projectGroupDisplayStream } from './group-display-stream'
import { lastValueFrom, of, toArray } from 'rxjs'

const app = (text = 'Public result') => ({
    id: 'app',
    type: 'component',
    data: {
        type: 'McpApp',
        appInstanceId: 'private-app',
        appInstanceToken: 'private-token',
        toolInput: { password: 'hidden' },
        toolResult: {
            content: [
                { type: 'text', text },
                { type: 'resource', resource: { uri: 'private://data' } }
            ],
            structuredContent: { total: 42, _meta: { private: true }, authorization: 'secret' },
            _meta: { secret: true }
        }
    }
})
const widget = {
    id: 'widget',
    type: 'component',
    data: {
        type: 'Widget',
        widgets: [
            {
                name: 'result',
                messages: [
                    {
                        surfaceUpdate: {
                            surfaceId: 'surface',
                            components: [{ id: 'root', component: { Text: { text: { literalString: '42' } } } }]
                        }
                    },
                    { beginRendering: { surfaceId: 'surface', root: 'root' } }
                ]
            }
        ]
    }
}
const card = {
    type: 'resource_card',
    id: 'ignored',
    messageId: 'private-message',
    executionId: 'private-execution',
    data: {
        resource: { namespace: 'test', type: 'report', id: 'r1' },
        title: 'Inventory',
        icon: { type: 'emoji', value: '📊' },
        open: { target: 'workbench.view', viewKey: 'reports' }
    }
}

describe('group display projection allowlist', () => {
    it('preserves bounded public presentation facts without carrying action or session fields', () => {
        const presentation = {
            summary: 'Complete result',
            timestamp: '2026-11-09T01:00:00Z',
            timestampLabel: 'Queried',
            details: [{ label: 'Dataset', value: 'inventory' }],
            appInstanceToken: 'private-token'
        }
        const value = { ...widget, data: { ...widget.data, widgets: [{ ...widget.data.widgets[0], presentation }] } }
        const result = groupDisplayContent([value])
        expect(result).toHaveLength(1)
        expect(JSON.stringify(result)).toContain('Complete result')
        expect(JSON.stringify(result)).toContain('2026-11-09T01:00:00Z')
        expect(JSON.stringify(result)).not.toContain('private-token')
        value.data.widgets[0].presentation.summary = 'x'.repeat(501)
        expect(groupDisplayContent([value])).toEqual([])
    })
    it('selects explicit display types, redacts runtime authority, and ignores raw tools/reasoning', () => {
        const result = groupDisplayContent([
            app(),
            widget,
            card,
            { type: 'reasoning', text: 'private' },
            { type: 'component', id: 'step', data: { category: 'Tool', output: app(), artifact: card } },
            { type: 'component', id: 'unknown', data: { category: 'Dashboard', output: 'private' } }
        ])
        expect(result).toHaveLength(3)
        expect(result[0]).toMatchObject({
            data: {
                toolResult: { content: [{ type: 'text', text: 'Public result' }], structuredContent: { total: 42 } }
            }
        })
        expect(JSON.stringify(result)).not.toMatch(
            /private|hidden|secret|_meta|appInstance|toolInput|executionId|messageId/
        )
        expect(groupDisplayContent(result)).toEqual(result)
        expect(groupDisplayContent([], [{ id: 'app', ...app().data }])).toEqual([result[0]])
    })
    it('deduplicates content and legacy events and rejects malformed or oversized payloads', () => {
        expect(groupDisplayContent([app('latest')], [{ id: 'app', data: app('old').data }])).toHaveLength(1)
        expect(JSON.stringify(groupDisplayContent([app('latest')], [app('old')]))).toContain('latest')
        expect(
            groupDisplayContent([{ ...widget, data: { type: 'Widget', widgets: [{}] } }, app('x'.repeat(140000))])
        ).toEqual([])
        const cyclic = {}
        Object.assign(cyclic, { self: cyclic })
        expect(groupDisplayContent([cyclic])).toEqual([])
        expect(groupDisplayContent(Array.from({ length: 80 }, (_, i) => ({ ...app(), id: String(i) })))).toHaveLength(
            32
        )
    })
    it('recognizes a result arriving after a credential-bearing App startup descriptor', async () => {
        const events = [
            {
                type: 'event',
                event: 'on_message_start',
                data: { id: 'b6a86a5c-7cb7-41dc-8119-aa8f64b94731', role: 'ai' }
            },
            {
                type: 'message',
                data: { id: 'app', type: 'component', data: { type: 'McpApp', appInstanceToken: 'private-token' } }
            },
            { type: 'message', data: { id: 'app', type: 'component', data: { toolResult: app().data.toolResult } } }
        ].map((data) => ({ data }) as MessageEvent)
        const publish = jest.fn().mockResolvedValue(undefined)
        await lastValueFrom(projectGroupDisplayStream(of(...events), publish, jest.fn()))
        expect(publish).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(publish.mock.calls)).not.toContain('private-token')
    })
    it('publishes only typed producer results, merges partial App updates and tolerates a publication failure', async () => {
        const id = 'b6a86a5c-7cb7-41dc-8119-aa8f64b94731'
        const data = [
            { type: 'event', event: 'on_message_start', data: { id, role: 'ai' } },
            { type: 'message', data: 'token' },
            { type: 'message', data: app() },
            {
                type: 'event',
                event: 'on_tool_message',
                data: { id: 'app', data: { toolResult: { content: [{ type: 'text', text: 'updated' }] } } }
            },
            { type: 'message', data: { type: 'component', id: 'tool', data: { category: 'Tool', output: 'private' } } }
        ].map((data) => ({ data }) as MessageEvent)
        const publish = jest.fn().mockResolvedValue(undefined).mockRejectedValueOnce(new Error('temporary'))
        const failed = jest.fn()
        expect(await lastValueFrom(projectGroupDisplayStream(of(...data), publish, failed).pipe(toArray()))).toEqual(
            data
        )
        expect(publish).toHaveBeenCalledTimes(2)
        expect(publish.mock.calls[1][0]).toBe(id)
        expect(JSON.stringify(publish.mock.calls[1][1])).toContain('updated')
        expect(failed).toHaveBeenCalledTimes(1)
    })
})
