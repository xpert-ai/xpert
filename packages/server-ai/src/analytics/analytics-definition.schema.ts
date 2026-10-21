import { z } from 'zod/v3'
import { analyticsOptionsSchema } from '@xpert-ai/plugin-sdk'
import type { AnalyticsDefinitionCreate, AnalyticsDefinitionPublish } from '@xpert-ai/contracts'
export const createDefinitionSchema = z
    .object({
        name: z.string().trim().min(1).max(200),
        providerId: z.string().min(1).max(160),
        visibility: z.enum(['private', 'organization']).default('private'),
        options: analyticsOptionsSchema
    })
    .strict() as z.ZodType<AnalyticsDefinitionCreate>
export const publishDefinitionSchema = z
    .object({ expectedCurrentVersionId: z.string().uuid(), options: analyticsOptionsSchema })
    .strict() as z.ZodType<AnalyticsDefinitionPublish>
export const definitionStatusSchema = z.object({ status: z.enum(['active', 'archived']) }).strict()
export const definitionPageSchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50)
    })
    .strict()
