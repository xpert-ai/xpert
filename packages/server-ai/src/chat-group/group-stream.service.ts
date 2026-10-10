// One observer connection multiplexes public projections of independent runtime streams.
// Disconnect only disposes readers; it never cancels a model or acknowledges a client tool.
import { Injectable } from '@nestjs/common'
import { Observable, Subscription } from 'rxjs'
import { DataSource } from 'typeorm'
import { z } from 'zod'
import { decryptSecret, encryptSecret } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import type { ChatGroupEvent } from '@xpert-ai/contracts'
import { RedisSseStreamService, SseMessageEvent } from '../shared/stream/redis-sse.service'
import { GroupMessagesService } from './group-messages.service'
import { GroupAccessService } from './group-access.service'
import { GroupParticipant } from './group.entity'

const cursorSchema = z
    .object({
        version: z.literal(1),
        groupId: z.string().uuid(),
        viewerId: z.string().uuid(),
        revision: z.number().int(),
        runs: z
            .record(z.object({ cursor: z.string().regex(/^\d+-\d+$/), messageId: z.string().uuid().optional() }))
            .refine((runs) => Object.keys(runs).length <= 32)
    })
    .strict()
const startSchema = z.object({
    type: z.literal('event'),
    event: z.literal('on_message_start'),
    data: z.object({ id: z.string().uuid(), role: z.literal('ai') })
})
const textSchema = z.object({
    type: z.literal('message'),
    data: z.union([z.string(), z.object({ type: z.literal('text'), text: z.string() })])
})

/** Allow only public text events; tool, reasoning and state payloads remain in the private runtime. */
export function publicGroupDelta(value: unknown): string | undefined {
    const parsed = textSchema.safeParse(value)
    return parsed.success
        ? typeof parsed.data.data === 'string'
            ? parsed.data.data
            : parsed.data.data.text
        : undefined
}

@Injectable()
export class GroupStreamService {
    constructor(
        private readonly messages: GroupMessagesService,
        private readonly access: GroupAccessService,
        private readonly streams: RedisSseStreamService,
        private readonly db: DataSource
    ) {}

    /**
     * Observe the group snapshot and join existing runtime streams without starting or controlling runs.
     * Reconnect cursors bind to both group and viewer; invalid cursors fall back to a fresh snapshot.
     * Each snapshot poll rechecks live membership and credential expiry through GroupMessagesService.
     */
    async observe(groupId: string, lastEventId?: string) {
        const { actor } = await this.access.authorize(groupId)
        let cursor: z.output<typeof cursorSchema> = { version: 1, groupId, viewerId: actor.id, revision: -1, runs: {} }
        let resync = false
        if (lastEventId) {
            try {
                if (lastEventId.length > 16000) throw new Error('cursor_too_large')
                const parsed = cursorSchema.parse(
                    JSON.parse(decryptSecret(lastEventId, environment.secretsEncryptionKey))
                )
                if (parsed.groupId !== groupId || parsed.viewerId !== actor.id) throw new Error('cursor_scope')
                cursor = parsed
            } catch {
                resync = true
            }
        }
        return new Observable<SseMessageEvent>((subscriber) => {
            const readers = new Map<string, Subscription>()
            const finished = new Set<string>()
            let stopped = false
            let reading = false
            let first = true
            let lastSnapshot = ''
            const emit = (data: ChatGroupEvent) => {
                if (!stopped)
                    subscriber.next({
                        type: 'group',
                        id: encryptSecret(JSON.stringify(cursor), environment.secretsEncryptionKey),
                        data
                    })
            }
            const poll = async () => {
                if (stopped || reading) return
                reading = true
                try {
                    const snapshot = await this.messages.snapshot(groupId, undefined, 100)
                    if (stopped) return
                    const signature = JSON.stringify([snapshot.revision, snapshot.runs])
                    cursor.revision = snapshot.revision
                    if (first || signature !== lastSnapshot) {
                        if (first && resync) emit({ type: 'resync' })
                        emit({ type: 'snapshot', snapshot })
                        first = false
                        lastSnapshot = signature
                    }
                    const active = new Set(
                        snapshot.runs.filter((run) => ['busy', 'pausing'].includes(run.status)).map((run) => run.runId)
                    )
                    for (const runId of finished)
                        if (
                            !snapshot.runs.some(
                                (run) => run.runId === runId && ['busy', 'pausing'].includes(run.status)
                            )
                        )
                            finished.delete(runId)
                    for (const [runId, reader] of readers)
                        if (!active.has(runId)) {
                            reader.unsubscribe()
                            readers.delete(runId)
                            delete cursor.runs[runId]
                        }
                    for (const run of snapshot.runs.filter(
                        (run) => run.status === 'busy' || run.status === 'pausing'
                    )) {
                        if (readers.has(run.runId) || finished.has(run.runId)) continue
                        const member = await this.db
                            .getRepository(GroupParticipant)
                            .findOneBy({ id: run.participantId, groupId, active: true })
                        if (!member || stopped) continue
                        const connection = await this.streams.createSseStream({
                            threadId: member.runtimeThreadId,
                            runId: run.runId,
                            mode: 'join',
                            lastEventId: cursor.runs[run.runId]?.cursor,
                            requireReplayStart: true,
                            isRunFinished: async () => {
                                const current = await this.messages.snapshot(groupId, undefined, 1)
                                return !current.runs.some(
                                    (item) => item.runId === run.runId && ['busy', 'pausing'].includes(item.status)
                                )
                            }
                        })
                        if (stopped) break
                        const reader = connection.stream.subscribe({
                            next: (event) => {
                                if (event.id) cursor.runs[run.runId] = { ...cursor.runs[run.runId], cursor: event.id }
                                const start = startSchema.safeParse(event.data)
                                if (start.success)
                                    cursor.runs[run.runId] = {
                                        cursor: event.id ?? '0-0',
                                        messageId: start.data.data.id
                                    }
                                const messageId = cursor.runs[run.runId]?.messageId
                                const text = publicGroupDelta(event.data)
                                if (messageId && text)
                                    emit({ type: 'text', runId: run.runId, participantId: member.id, messageId, text })
                                if (
                                    event.data &&
                                    typeof event.data === 'object' &&
                                    'type' in event.data &&
                                    event.data.type === 'stream_resync'
                                )
                                    emit({ type: 'resync' })
                            },
                            error: (error) => subscriber.error(error),
                            complete: () => {
                                finished.add(run.runId)
                            }
                        })
                        readers.set(run.runId, reader)
                    }
                } catch (error) {
                    subscriber.error(error)
                } finally {
                    reading = false
                }
            }
            const timer = setInterval(() => void poll(), 1000)
            void poll()
            return () => {
                stopped = true
                clearInterval(timer)
                readers.forEach((reader) => reader.unsubscribe())
                readers.clear()
            }
        })
    }
}
