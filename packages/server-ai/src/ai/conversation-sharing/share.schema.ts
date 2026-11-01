import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod/v3'

export const previewSchema = z.object({ threadId: z.string().min(1).max(100) }).strict()
export const createShareSchema = previewSchema
    .extend({
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        audience: z.enum(['organization', 'public']).default('organization'),
        expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
        acknowledgePublic: z.boolean().optional()
    })
    .strict()
    .refine((value) => value.audience !== 'public' || value.acknowledgePublic === true)
export type SharePreviewInput = z.output<typeof previewSchema>
export type ShareCreateInput = z.output<typeof createShareSchema>
export const shareListSchema = z
    .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
        search: z.string().trim().max(100).default(''),
        before: z.string().datetime().optional()
    })
    .strict()
export const revokeAllSharesSchema = z
    .object({
        confirmation: z.literal('revoke-all'),
        before: z.string().datetime()
    })
    .strict()
export type ShareListInput = z.output<typeof shareListSchema>
export type RevokeAllSharesInput = z.output<typeof revokeAllSharesSchema>
export const invalidShare = () => new BadRequestException(t('server-ai:Error.ConversationShareInvalid'))
