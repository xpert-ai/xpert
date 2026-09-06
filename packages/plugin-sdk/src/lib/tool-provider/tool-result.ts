// Why this exists: MCP media blocks and business metadata have different contracts.
// Validate metadata with the declared output schema, preserve bounded media blocks,
// and include the same DTO in text for clients that hide structuredContent.
import { z } from 'zod/v3'
import type { ZodTypeAny } from 'zod/v3'
import type { XpertToolContent, XpertToolResult } from '../toolset/tool-result'

export const XPERT_TOOL_RESULT_FORMAT_VERSION = 1

const contentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(2 * 1024 * 1024) }).strict(),
  z
    .object({
      type: z.literal('image'),
      data: z
        .string()
        .min(1)
        .max(8 * 1024 * 1024),
      mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    })
    .strict(),
  z
    .object({
      type: z.literal('audio'),
      data: z
        .string()
        .min(1)
        .max(8 * 1024 * 1024),
      mimeType: z.string().min(1).max(100)
    })
    .strict(),
  z
    .object({
      type: z.literal('resource_link'),
      uri: z.string().min(1).max(4096),
      name: z.string().max(240).optional()
    })
    .strict()
])

/** Validate the envelope separately so binary content never enters the business DTO. */
export async function parseDecoratedToolResult(value: unknown, outputSchema: ZodTypeAny): Promise<XpertToolResult> {
  const envelope = z
    .object({
      content: z.array(contentSchema).max(32).optional(),
      structuredContent: outputSchema,
      isError: z.boolean().optional()
    })
    .strict()
  const result = await envelope.parseAsync(value)
  const content: XpertToolContent[] =
    result.content?.map((item) => {
      switch (item.type) {
        case 'text':
          return { type: 'text', text: item.text }
        case 'image':
          return { type: 'image', data: item.data, mimeType: item.mimeType }
        case 'audio':
          return { type: 'audio', data: item.data, mimeType: item.mimeType }
        case 'resource_link':
          return { type: 'resource_link', uri: item.uri, ...(item.name ? { name: item.name } : {}) }
      }
    }) ?? []
  // MCP clients may expose only content to the model. Keep the validated DTO
  // readable there too, while retaining binary blocks and App structured data.
  const text = JSON.stringify(result.structuredContent)
  if (!content.some((item) => item.type === 'text' && item.text === text)) content.push({ type: 'text', text })
  return {
    structuredContent: result.structuredContent,
    content,
    ...(result.isError === undefined ? {} : { isError: result.isError })
  }
}

export function agentContent(content: XpertToolContent[] | undefined) {
  return (content ?? []).map((item) => {
    if (item.type === 'image')
      return { type: 'image_url', image_url: { url: `data:${item.mimeType};base64,${item.data}` } }
    if (item.type === 'text') return item
    if (item.type === 'resource_link') return { type: 'text', text: `${item.name ?? 'Resource'}: ${item.uri}` }
    return { type: 'text', text: `Audio content (${item.mimeType}) is available through MCP.` }
  })
}
