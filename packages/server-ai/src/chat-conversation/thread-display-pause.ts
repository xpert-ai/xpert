import type { TChatThreadDisplayPause, TChatThreadRunControl } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import z from 'zod'

export const DISPLAY_PAUSE_KEY = 'chatkitDisplayPause'
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
const MAX_SNAPSHOT_MESSAGES = 1000
const savedPauseSchema = z.object({
    executionId: z.string(),
    pauseId: z.string(),
    createdAt: z.string(),
    snapshot: z.string()
})
const snapshotSchema = z.object({
    version: z.literal(1),
    messages: z.array(z.object({ type: z.string(), content: z.unknown() }).passthrough()).max(MAX_SNAPSHOT_MESSAGES)
})

export function validateDisplaySnapshot(snapshot: string): void {
    try {
        if (Buffer.byteLength(snapshot, 'utf8') > MAX_SNAPSHOT_BYTES) throw new Error('size')
        snapshotSchema.parse(JSON.parse(snapshot))
    } catch {
        throw new BadRequestException(
            t('server-ai:Error.InvalidDisplaySnapshot', { defaultValue: 'Invalid paused display snapshot.' })
        )
    }
}

export function readStoredDisplayPause(thread: { metadata?: Record<string, unknown> }): TChatThreadDisplayPause | null {
    const result = savedPauseSchema.safeParse(thread.metadata?.[DISPLAY_PAUSE_KEY])
    if (!result.success) return null
    const { executionId, pauseId, createdAt, snapshot } = result.data
    return { executionId, pauseId, createdAt, snapshot }
}

export function readThreadDisplayPause(thread: {
    metadata?: Record<string, unknown>
    runControl?: TChatThreadRunControl | null
}): TChatThreadDisplayPause | null {
    return thread.runControl?.state === 'running' ? null : readStoredDisplayPause(thread)
}

export function clearThreadDisplayPause(thread: { metadata?: Record<string, unknown> }): void {
    const { [DISPLAY_PAUSE_KEY]: _snapshot, ...metadata } = thread.metadata ?? {}
    thread.metadata = metadata
}
