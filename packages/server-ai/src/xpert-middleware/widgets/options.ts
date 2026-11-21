import { z } from 'zod/v3'
import type { InferInteropZodInput } from '@langchain/core/utils/types'

export const WidgetsMiddlewareOptionsSchema = z.object({
    widgets: z
        .array(
            z.object({
                name: z
                    .string()
                    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid tool name. Use letters, numbers, underscores, or hyphens.')
                    .optional(),
                description: z.string().optional(),
                widget: z.string(),
                value: z.string().optional()
            })
        )
        .default([]),
    autoRender: z.boolean().default(true),
    systemPrompt: z.string().optional(),
    toolPrompt: z.string().optional()
})
export type WidgetsMiddlewareConfig = InferInteropZodInput<typeof WidgetsMiddlewareOptionsSchema>

const A2UIValueMapSchema: z.ZodType<unknown> = z.lazy(() =>
    z
        .object({
            key: z.string(),
            valueString: z.string().optional(),
            valueNumber: z.number().optional(),
            valueBoolean: z.boolean().optional(),
            valueMap: z.array(A2UIValueMapSchema).optional()
        })
        .passthrough()
)

const A2UIServerToClientMessageSchema = z
    .object({
        beginRendering: z
            .object({
                surfaceId: z.string().optional(),
                root: z.string(),
                styles: z.record(z.string()).optional()
            })
            .optional(),
        surfaceUpdate: z
            .object({
                surfaceId: z.string().optional(),
                components: z
                    .array(
                        z.object({
                            id: z.string(),
                            weight: z.number().optional(),
                            component: z.record(z.unknown())
                        })
                    )
                    .min(1)
            })
            .optional(),
        dataModelUpdate: z
            .object({
                surfaceId: z.string().optional(),
                path: z.string().optional(),
                contents: z.array(A2UIValueMapSchema)
            })
            .optional(),
        deleteSurface: z
            .object({
                surfaceId: z.string().optional()
            })
            .optional()
    })
    .strict()
    .refine(
        (message) =>
            !!message.beginRendering || !!message.surfaceUpdate || !!message.dataModelUpdate || !!message.deleteSurface,
        'A2UI message must include one message operation.'
    )

export const A2UIRenderToolSchema = z.object({
    name: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid widget name. Use letters, numbers, underscores, or hyphens.')
        .optional(),
    messages: z.array(A2UIServerToClientMessageSchema).min(1).max(32)
})
