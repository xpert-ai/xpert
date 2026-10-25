import type { Response } from 'express'
import { buildWorkspaceFileContentDisposition } from '../workspace-file-content.response'
import type { ImagePreviewService } from './image-preview.service'

export function sendImagePreview(image: Awaited<ReturnType<ImagePreviewService['read']>>, response: Response) {
    response.setHeader('Content-Type', image.mimeType)
    response.setHeader('Content-Length', image.bytes.length)
    response.setHeader('Content-Disposition', buildWorkspaceFileContentDisposition('preview', image.fileName))
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Content-Disposition')
    response.status(200).end(image.bytes)
}
