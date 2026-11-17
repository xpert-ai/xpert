import { lastValueFrom, of, throwError, toArray } from 'rxjs'
import { runtimeMessageContent, runtimeStream, runtimeStreamPayload } from './runtime-presentation'
import { platformFailure } from '../plugin-resource/app-platform/platform-error'
import i18next, { t } from 'i18next'

describe('application user presentation boundary', () => {
    beforeAll(async () => {
        await i18next.init({
            lng: 'en',
            resources: {
                en: {
                    'server-ai': {
                        Error: { application_credit_limit: 'Your available credits are insufficient.' }
                    }
                }
            }
        })
    })
    it.each([true, false])(
        'forwards the published tool row unchanged in live and replay streams (restricted=%s)',
        async (restricted) => {
            const row = {
                type: 'component' as const,
                id: 'tool-1',
                executionId: 'child',
                data: {
                    category: 'Tool' as const,
                    toolPresentation: 'redacted',
                    tool: 'lookup',
                    title: '查询状态',
                    icon: { type: 'emoji', value: '🔎' },
                    input: null,
                    output: false
                }
            }
            const message = { type: 'message', data: row }
            const live = await lastValueFrom(runtimeStream(of({ data: message }), restricted))
            expect((live.data as typeof message).data).toBe(row)
            const replay = await lastValueFrom(runtimeStream(of({ data: JSON.stringify(message) }), restricted))
            expect(typeof replay.data === 'string' ? JSON.parse(replay.data) : replay.data).toEqual(message)
            expect(runtimeMessageContent([row])[0]).toBe(row)
        }
    )

    it('omits private tool diagnostics, widgets and unmarked partials from the application transcript', () => {
        for (const data of [
            { category: 'Tool', tool: 'lookup', output: 'provider response' },
            { category: 'Dashboard', tool: 'lookup' },
            { status: 'fail' }
        ]) {
            const row = { type: 'component' as const, id: 'call', data }
            expect(runtimeStreamPayload({ type: 'message', data: row })).toBeNull()
            expect(runtimeMessageContent([row])).toEqual([])
        }
    })

    it('keeps business replies and execution lifecycle without nested entities or execution inputs', () => {
        expect(
            runtimeStreamPayload({
                type: 'message',
                data: {
                    type: 'text',
                    text: 'Your document is ready',
                    id: 'reply',
                    executionId: 'run',
                    agentKey: 'internal',
                    metadata: { secret: 'secret' }
                }
            })
        ).toEqual({
            type: 'message',
            data: { type: 'text', text: 'Your document is ready', id: 'reply', executionId: 'run' }
        })
        const result = runtimeStreamPayload({
            type: 'event',
            event: 'on_agent_start',
            data: {
                id: 'run',
                title: 'Analysis',
                status: 'running',
                inputs: 'system prompt',
                xpert: { graph: 'private' },
                metadata: { model: 'private' }
            }
        })
        expect(result).toEqual({
            type: 'event',
            event: 'on_agent_start',
            data: { id: 'run', title: 'Analysis', status: 'running' }
        })
    })

    it('applies the same content projection to persisted history and preserves file delivery receipts', () => {
        const delivery = {
            type: 'file_activity' as const,
            id: 'receipt',
            executionId: 'run',
            agentKey: 'internal',
            data: {
                version: 1 as const,
                receiptId: 'receipt',
                toolCallId: 'tool',
                updatedAt: '2026-10-29T00:00:00Z',
                kind: 'delivery' as const,
                status: 'success' as const,
                outputs: []
            }
        }
        expect(
            runtimeMessageContent([{ type: 'text', text: 'Done' }, { type: 'reasoning', text: 'private' }, delivery])
        ).toEqual([
            { type: 'text', text: 'Done' },
            { ...delivery, agentKey: undefined }
        ])
    })

    it('bounds errors while leaving operator diagnostics unchanged', async () => {
        const raw = { data: { type: 'event', event: 'on_error', data: 'https://provider.test?key=secret' } }
        const restricted = await lastValueFrom(runtimeStream(of(raw), true).pipe(toArray()))
        expect(JSON.stringify(restricted)).not.toContain('secret')
        const failure = await lastValueFrom(
            runtimeStream(
                throwError(() => Error('key=secret')),
                true
            ).pipe(toArray())
        )
        expect(JSON.stringify(failure)).not.toContain('secret')
        expect(await lastValueFrom(runtimeStream(of(raw), false))).toBe(raw)
    })

    it('preserves explicit business failure reasons in live, replayed and terminal events', async () => {
        const failure = platformFailure('application_credit_limit', 402)
        const message = t('server-ai:Error.application_credit_limit')
        expect(failure.getResponse()).toEqual({ code: 'application_credit_limit', message })
        const raw = {
            type: 'event',
            event: 'on_message_end',
            data: {
                id: 'reply',
                status: 'error',
                error: failure.message,
                inputs: 'private prompt'
            }
        }
        const expected = {
            type: 'event',
            event: 'on_message_end',
            data: { id: 'reply', status: 'error', error: message }
        }
        expect(runtimeStreamPayload(raw)).toEqual(expected)
        const replay = await lastValueFrom(runtimeStream(of({ data: JSON.stringify(raw) }), true))
        expect(replay.data).toEqual(expected)
        const caught = await lastValueFrom(
            runtimeStream(
                throwError(() => failure),
                true
            )
        )
        expect(caught.data).toEqual({ type: 'event', event: 'on_error', data: message })
    })

    it.each([
        'APP_PLATFORM_FAILURE:application_credit_limit\nprovider secret',
        'APP_PLATFORM_FAILURE:application_maintenance_actor_invalid',
        'https://provider.test?key=private',
        { code: 'application_credit_limit', message: 'private' }
    ])('does not expose unrecognized or untrusted execution error details', (error) => {
        const result = runtimeStreamPayload({
            type: 'event',
            event: 'on_conversation_end',
            data: { status: 'error', error }
        })
        expect(JSON.stringify(result)).not.toMatch(/private|provider|maintenance_actor|APP_PLATFORM_FAILURE/)
        expect(result).toMatchObject({ data: { status: 'error', error: expect.any(String) } })
    })
})
