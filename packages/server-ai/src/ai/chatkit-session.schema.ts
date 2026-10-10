import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod'

/** Conversation scope is separate from the existing delegated Assistant conversation request. */
export const chatkitSessionSchema = z
    .object({
        assistant: z
            .object({ id: z.string().trim().min(1) })
            .strict()
            .optional(),
        project: z
            .object({ id: z.string().trim().min(1) })
            .strict()
            .optional(),
        conversation: z
            .object({
                id: z.string().trim().min(1),
                requesterXpertId: z.string().trim().min(1)
            })
            .strict()
            .optional(),
        scope: z
            .object({ kind: z.literal('conversation'), conversationId: z.string().uuid() })
            .strict()
            .optional(),
        user: z.string().trim().min(1).optional(),
        expires_after: z.number().int().positive().optional()
    })
    .strict()
    .refine((input) => !input.scope || (!input.assistant && !input.project && !input.conversation && !input.user))

export type ChatkitSessionInput = z.output<typeof chatkitSessionSchema>

/** Return a localized boundary error without echoing credentials or request values. */
export const chatkitSessionInvalid = () => new BadRequestException(t('server-ai:Error.ChatkitSessionInputInvalid'))
