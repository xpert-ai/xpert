import type { TChatThreadDisplayPause, TChatThreadRunControl } from '@xpert-ai/contracts'
import z from 'zod'

export const DISPLAY_PAUSE_KEY = 'chatkitDisplayPause'
// Read only the legacy identity for the deprecated release endpoint. Never deserialize
// or return historical UI transcripts; graph checkpoints own execution recovery.
const savedPauseSchema = z.object({
    executionId: z.string(),
    pauseId: z.string(),
    createdAt: z.string()
})

export function readStoredDisplayPause(thread: { metadata?: Record<string, unknown> }): TChatThreadDisplayPause | null {
    const result = savedPauseSchema.safeParse(thread.metadata?.[DISPLAY_PAUSE_KEY])
    if (!result.success) return null
    const { executionId, pauseId, createdAt } = result.data
    return { executionId, pauseId, createdAt }
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
