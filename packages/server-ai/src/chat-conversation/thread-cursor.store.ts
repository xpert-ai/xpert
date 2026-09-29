// Invariants: handles locate pagination state, never authorize a read.
// Redis shares state across API replicas; no transcript or access decision is cached.
// Bind handles to actor, destination branch and source, and expire them without refreshing on read.
import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { randomBytes } from 'node:crypto'
import type { RedisClientType } from 'redis'
import { z } from 'zod/v3'
import { THREAD_CURSOR_PATTERN, ThreadReferenceScope, threadReferenceDenied } from './thread-reference.contract'

export const THREAD_CURSOR_TTL_SECONDS = 30 * 60
const KEY_PREFIX = 'xpert:thread-history:cursor:'
const recordSchema = z
    .object({
        version: z.literal(1),
        tenantId: z.string().min(1),
        organizationId: z.string().min(1).nullable(),
        userId: z.string().min(1),
        conversationId: z.string().min(1),
        threadId: z.string().min(1),
        sourceConversationId: z.string().min(1),
        sourceThreadId: z.string().min(1),
        head: z.string().uuid(),
        next: z.string().uuid(),
        expiresAt: z.number().int().positive()
    })
    .strict()

/** Both identifiers are bound so a handle cannot be reused for another source branch. */
type CursorSource = { conversationId: string; threadId: string }
/** Captured branch head and next unread ancestor; message contents remain live at read time. */
type CursorPosition = { head: string; next: string }

@Injectable()
export class ThreadCursorStore {
    constructor(@Inject(REDIS_CLIENT) private readonly redis: Pick<RedisClientType, 'get' | 'set'>) {}

    /** Atomically reserve a 96-bit opaque handle with a fixed lifetime; collisions never overwrite state. */
    async issue(scope: ThreadReferenceScope, source: CursorSource, position: CursorPosition): Promise<string> {
        if (!scope.conversationId || !scope.threadId) throw threadReferenceDenied()
        const record = recordSchema.parse({
            version: 1,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId ?? null,
            userId: scope.userId,
            conversationId: scope.conversationId,
            threadId: scope.threadId,
            sourceConversationId: source.conversationId,
            sourceThreadId: source.threadId,
            head: position.head,
            next: position.next,
            expiresAt: Date.now() + THREAD_CURSOR_TTL_SECONDS * 1000
        })
        try {
            for (let attempt = 0; attempt < 3; attempt++) {
                const handle = `tr_${randomBytes(12).toString('base64url')}`
                const saved = await this.redis.set(KEY_PREFIX + handle, JSON.stringify(record), {
                    NX: true,
                    EX: THREAD_CURSOR_TTL_SECONDS
                })
                if (saved === 'OK') return handle
            }
        } catch {
            throw this.unavailable()
        }
        throw this.unavailable()
    }

    /** Validate scope and expiry only; the caller must separately recheck access and branch ancestry. */
    async resolve(handle: string, scope: ThreadReferenceScope, source: CursorSource): Promise<CursorPosition> {
        if (!THREAD_CURSOR_PATTERN.test(handle)) throw this.invalid()
        let raw: string | null
        try {
            raw = await this.redis.get(KEY_PREFIX + handle)
        } catch {
            throw this.unavailable()
        }
        if (!raw) throw this.invalid()
        try {
            const record = recordSchema.parse(JSON.parse(raw))
            if (
                record.expiresAt <= Date.now() ||
                record.tenantId !== scope.tenantId ||
                record.organizationId !== (scope.organizationId ?? null) ||
                record.userId !== scope.userId ||
                record.conversationId !== scope.conversationId ||
                record.threadId !== scope.threadId ||
                record.sourceConversationId !== source.conversationId ||
                record.sourceThreadId !== source.threadId
            )
                throw this.invalid()
            return { head: record.head, next: record.next }
        } catch {
            throw this.invalid()
        }
    }

    private invalid() {
        return new BadRequestException(t('server-ai:Error.ThreadReferenceCursorInvalid'))
    }

    private unavailable() {
        return new ServiceUnavailableException(t('server-ai:Error.ThreadReferenceCursorStoreUnavailable'))
    }
}
