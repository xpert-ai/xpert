import { ChatKitThreadReference, normalizeThreadReference } from '@xpert-ai/chatkit-types'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod/v3'

export const THREAD_CURSOR_PATTERN = /^tr_[A-Za-z0-9_-]{16}$/

/** Model-controlled pagination only; actor and destination scope come from the graph runtime. */
export const readThreadSchema = z
    .object({
        threadId: z.string().trim().min(1).max(128),
        cursor: z
            .string()
            .regex(THREAD_CURSOR_PATTERN)
            .describe(
                'Copy page.nextCursor exactly to read older history. Valid for 30 minutes in this conversation; omit cursor to restart if expired or invalid.'
            )
            .optional(),
        turnLimit: z.number().int().min(1).max(10).default(1),
        includeOutputs: z.boolean().default(false),
        maxOutputCharsPerItem: z.number().int().min(100).max(20000).default(2000)
    })
    .strict()

/** Validated tool arguments with defaults applied before reaching the reader. */
export type ReadThreadInput = z.infer<typeof readThreadSchema>

/** Trusted caller and destination branch, never populated from read_thread arguments. */
export type ThreadReferenceScope = {
    /** The conversation receiving the imported history, not the referenced source. */
    conversationId?: string
    threadId?: string
    tenantId: string
    /** Null/absent means tenant scope and must not match an organization-scoped cursor. */
    organizationId?: string | null
    userId: string
}

export function threadReferenceDenied(): ForbiddenException {
    return new ForbiddenException(t('server-ai:Error.ThreadReferenceUnavailable'))
}

/** Parse current input or persisted JSON into bounded locators, dropping supplied transcript fields. */
export function threadReferencesFromInput(input: unknown): ChatKitThreadReference[] {
    if (!input || typeof input !== 'object' || !('references' in input) || !Array.isArray(input.references)) return []
    const references: ChatKitThreadReference[] = []
    for (const value of input.references) {
        const reference = normalizeThreadReference(value)
        if (!reference) continue
        references.push(reference)
        if (references.length > 100) throw new BadRequestException(t('server-ai:Error.ThreadReferenceLimit'))
    }
    return references
}
