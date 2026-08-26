import type { JSONValue } from '@xpert-ai/contracts'

export type XpertToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource_link'; uri: string; name?: string }

export interface XpertToolResult<TStructuredContent = unknown> {
  content?: XpertToolContent[]
  structuredContent?: TStructuredContent
  meta?: Record<string, JSONValue>
  isError?: boolean
}
