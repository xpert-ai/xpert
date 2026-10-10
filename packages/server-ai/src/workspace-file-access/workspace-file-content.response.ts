import { Logger, NotFoundException } from '@nestjs/common'
import type { XpertViewFileAccessPurpose } from '@xpert-ai/contracts'
import type { Request, Response } from 'express'
import { t } from 'i18next'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { getMediaTypeWithCharset, resolveHttpByteRange } from '../shared'
import type { WorkspaceFileAccessAuthorization } from './workspace-file-access.service'

const logger = new Logger('WorkspaceFileContent')

/** Share byte-range and download semantics after the caller has authorized access. */
export async function sendWorkspaceFileContent(
    authorization: WorkspaceFileAccessAuthorization,
    filePath: string,
    request: Pick<Request, 'headers'>,
    response: Response,
    headOnly: boolean,
    origin?: string | null
) {
    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat?.isFile()) {
        throw new NotFoundException(
            t('server-ai:Error.WorkspaceFileAccessNotFound', { defaultValue: 'Workspace file was not found.' })
        )
    }

    const { grant } = authorization
    const range = resolveHttpByteRange(request.headers.range, fileStat.size)
    response.setHeader('Accept-Ranges', 'bytes')
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader(
        'Content-Type',
        grant.mimeType || getMediaTypeWithCharset(filePath) || 'application/octet-stream'
    )
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Content-Disposition', buildWorkspaceFileContentDisposition(grant.purpose, grant.fileName))
    response.setHeader(
        'Access-Control-Expose-Headers',
        'Accept-Ranges, Content-Length, Content-Range, Content-Type, Content-Disposition'
    )
    if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Access-Control-Allow-Credentials', 'true')
        response.setHeader('Vary', 'Origin')
    }

    if (range.kind === 'unsatisfiable') {
        response.setHeader('Content-Range', `bytes */${fileStat.size}`)
        response.status(416).end()
        return
    }

    const start = range.kind === 'partial' ? range.start : undefined
    const end = range.kind === 'partial' ? range.end : undefined
    const contentLength = range.kind === 'partial' ? range.end - range.start + 1 : fileStat.size
    response.setHeader('Content-Length', contentLength)
    if (range.kind === 'partial') {
        response.status(206)
        response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fileStat.size}`)
    }
    if (headOnly) {
        response.end()
        return
    }

    const stream = createReadStream(filePath, { start, end })
    stream.on('error', (error) => {
        logger.warn(`Workspace file stream failed for grant ${grant.grantId}: ${error.message}`)
        if (!response.headersSent) {
            response.status(404).end()
        } else {
            response.destroy(error)
        }
    })
    response.on('close', () => stream.destroy())
    stream.pipe(response)
}

export function buildWorkspaceFileContentDisposition(purpose: XpertViewFileAccessPurpose, fileName: string) {
    // Node.js rejects non-Latin-1 characters in response headers. Keep the
    // quoted filename ASCII-only and preserve the real name in RFC 5987 form.
    const fallbackName = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'workspace-file'
    const encodedName = encodeURIComponent(fileName).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
    return `${purpose === 'download' ? 'attachment' : 'inline'}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`
}
