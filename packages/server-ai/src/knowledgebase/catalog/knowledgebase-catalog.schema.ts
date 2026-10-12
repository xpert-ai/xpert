import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { knowledgebaseActions } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'

const id = z.string().uuid()
const actions = z.array(z.enum(knowledgebaseActions)).min(1).max(knowledgebaseActions.length)
export const knowledgebaseQuerySchema = z
    .object({
        scope: z.discriminatedUnion('kind', [
            z
                .object({ kind: z.literal('workspace'), workspaceId: id, relation: z.enum(['owned', 'available']) })
                .strict(),
            z.object({ kind: z.literal('organization') }).strict(),
            z.object({ kind: z.literal('tenant') }).strict()
        ]),
        filter: z
            .object({
                text: z.string().trim().min(1).max(240).optional(),
                visibility: z.enum(['private', 'organization', 'public']).optional(),
                applicationTags: z
                    .object({ allOf: z.array(z.string().trim().min(1).max(120)).min(1).max(20) })
                    .strict()
                    .optional(),
                publication: z.enum(['published', 'unpublished']).optional()
            })
            .strict()
            .optional(),
        access: z.object({ requireAll: actions }).strict().optional(),
        page: z
            .object({
                limit: z.number().int().min(1).max(100).optional(),
                cursor: z.string().min(1).max(2048).optional()
            })
            .strict()
            .optional()
    })
    .strict()
export const knowledgebaseGetSchema = z.object({ knowledgebaseId: id }).strict()
export const knowledgebaseAccessSchema = z.object({ knowledgebaseIds: z.array(id).min(1).max(100), actions }).strict()
export const catalogCursorSchema = z
    .object({ version: z.literal(1), after: id, query: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()

export function catalogError(kind: 'input' | 'context' | 'unavailable' | 'cursor') {
    const messages = {
        input: ['KnowledgebaseCatalogInputInvalid', 'Invalid knowledgebase catalog request.'],
        context: ['KnowledgebaseCatalogContextRequired', 'Authenticated tenant and organization scope are required.'],
        unavailable: ['KnowledgebaseCatalogUnavailable', 'Knowledgebase is unavailable in the current scope.'],
        cursor: ['KnowledgebaseCatalogCursorInvalid', 'The catalog cursor is invalid for this query.']
    } as const
    const [key, defaultValue] = messages[kind]
    const message = t(`server-ai:Error.${key}`, { defaultValue })
    return kind === 'context'
        ? new ForbiddenException(message)
        : kind === 'unavailable'
          ? new NotFoundException(message)
          : new BadRequestException(message)
}

export function parseCatalogInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
    const parsed = schema.safeParse(input)
    if (!parsed.success) throw catalogError('input')
    return parsed.data
}
