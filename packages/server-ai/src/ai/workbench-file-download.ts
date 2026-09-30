import type { Response } from 'express'
import archiver from 'archiver'
import { finished } from 'stream/promises'
import type { ChatConversationService } from '../chat-conversation/conversation.service'

export async function sendWorkbenchFileDownload(
    file: Awaited<ReturnType<ChatConversationService['getWorkspaceFileDownload']>>,
    res: Response
) {
    const encodedFilename = encodeURIComponent(file.fileName)
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    )

    if (file.type === 'directory') {
        if (res.destroyed || res.writableEnded) {
            await file.entries.return(undefined)
            await file.directoryHandle.close().catch(() => undefined)
            return
        }
        const archive = archiver('zip', { zlib: { level: 9 } })
        let currentStream: ReturnType<typeof file.directoryHandle.createReadStream> | null = null
        const abort = () => {
            archive.abort()
            currentStream?.destroy()
            void file.entries.return(undefined)
            void file.directoryHandle.close().catch(() => undefined)
        }
        res.once('close', abort)
        res.once('error', abort)
        try {
            archive.on('error', (error) => {
                res.destroy(error)
            })
            archive.pipe(res)
            for await (const entry of file.entries) {
                if (entry.type === 'directory') {
                    archive.append('', { name: entry.archivePath })
                } else {
                    currentStream = entry.fileHandle.createReadStream()
                    archive.append(currentStream, { name: entry.archivePath })
                    await finished(currentStream)
                    currentStream = null
                }
            }
            await archive.finalize()
        } catch (error) {
            if (!res.destroyed && !res.writableEnded) throw error
        } finally {
            res.off('close', abort)
            res.off('error', abort)
            currentStream?.destroy()
            await file.entries.return(undefined)
            await file.directoryHandle.close().catch(() => undefined)
        }
        return
    }

    if (res.destroyed || res.writableEnded) {
        await file.fileHandle.close().catch(() => undefined)
        return
    }
    const stream = file.fileHandle.createReadStream({ autoClose: false })
    const abort = () => stream.destroy()
    res.once('close', abort)
    res.once('error', abort)
    try {
        stream.on('error', (error) => res.destroy(error))
        stream.pipe(res)
        await finished(stream)
    } catch (error) {
        if (!res.destroyed && !res.writableEnded) throw error
    } finally {
        res.off('close', abort)
        res.off('error', abort)
        stream.destroy()
        await file.fileHandle.close().catch(() => undefined)
    }
}
