import { HumanMessage, type MessageContentComplex } from '@langchain/core/messages'
import { z } from 'zod'
import { t } from 'i18next'

const MAX_BINARY_BYTES = 25 * 1024 * 1024
const inlineFileSchema = z.object({
    name: z.string().max(1024).optional(),
    originalName: z.string().max(1024).optional(),
    mimeType: z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
    fileUrl: z.string().max(Math.ceil(MAX_BINARY_BYTES / 3) * 4 + 1024)
})
const responseSchema = z.object({
    toolCallId: z.string().min(1),
    message: z.string().max(10000).optional(),
    files: z.array(inlineFileSchema).max(100).optional()
})

/** Only inline App attachments are accepted here; this path cannot read arbitrary URLs or local paths. */
export function toolAfterHumanMessage(response: unknown, toolCallId: string): HumanMessage | undefined {
    const parsed = responseSchema.parse(response)
    if (parsed.toolCallId !== toolCallId)
        throw new Error(
            t('server-ai:Error.ToolAfterMismatch', {
                defaultValue: 'Post-tool continuation does not match the completed tool call'
            })
        )
    const content: MessageContentComplex[] = []
    if (parsed.message?.trim()) content.push({ type: 'text', text: parsed.message })
    let totalBytes = 0
    for (const file of parsed.files ?? []) {
        const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(file.fileUrl)
        if (!match || match[1].toLowerCase() !== file.mimeType.toLowerCase() || !match[2] || match[2].length % 4) {
            throw new Error(
                t('server-ai:Error.ToolAfterInvalidAttachment', { defaultValue: 'Invalid inline App attachment' })
            )
        }
        const data = match[2]
        totalBytes += Buffer.from(data, 'base64').byteLength
        if (totalBytes > MAX_BINARY_BYTES)
            throw new Error(
                t('server-ai:Error.ToolAfterAttachmentLimit', {
                    defaultValue: 'App attachments exceed the size limit'
                })
            )
        if (file.mimeType.startsWith('image/')) {
            content.push({ type: 'image_url', image_url: { url: file.fileUrl } })
        } else {
            content.push({
                type: file.mimeType.startsWith('audio/') ? 'audio' : 'file',
                source_type: 'base64',
                data,
                mime_type: file.mimeType,
                ...(file.originalName || file.name ? { filename: file.originalName || file.name } : {})
            })
        }
    }
    if (!content.length) return undefined
    return new HumanMessage({
        id: `tool-after:${toolCallId}`,
        content: parsed.files?.length ? content : parsed.message!
    })
}
