import {
    AudioContentSchema,
    EmbeddedResourceSchema,
    ImageContentSchema,
    TextContentSchema
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

export type McpConsumerResourceLink = {
    type: 'resource_link'
    uri: string
    name: string
    description?: string
    mimeType?: string
    size?: number
    _meta?: object
}

const resourceLinkSchema = z
    .object({
        type: z.literal('resource_link'),
        uri: z.string(),
        name: z.string(),
        description: z.string().optional(),
        mimeType: z.string().optional(),
        size: z.number().int().nonnegative().optional(),
        _meta: z.object({}).passthrough().optional()
    })
    .passthrough()

export const mcpConsumerCallToolResultSchema = z
    .object({
        resultType: z.literal('complete').optional(),
        content: z
            .array(
                z.union([
                    TextContentSchema,
                    ImageContentSchema,
                    AudioContentSchema,
                    EmbeddedResourceSchema,
                    resourceLinkSchema
                ])
            )
            .default([]),
        structuredContent: z.object({}).passthrough().optional(),
        isError: z.boolean().optional(),
        _meta: z.object({}).passthrough().optional()
    })
    .passthrough()

export type McpConsumerCallToolResult = z.infer<typeof mcpConsumerCallToolResultSchema>
