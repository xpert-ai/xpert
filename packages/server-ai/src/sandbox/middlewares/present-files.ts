import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { t } from 'i18next'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import type { ChatTaskSummaryOutput, TMessageContentFileActivity } from '@xpert-ai/chatkit-types'
import type { IAgentMiddlewareContext, SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { FileActivityStorage } from './file-activity-storage.service'
import { MAX_DELIVERY_FILE_BYTES, snapshotWorkspace, workspaceRelativePath } from './file-activity-snapshot'
import { getFileOutputRule, validateFilePresentationFormat } from './file-presentation-format'
import { emitFileActivity } from './file-activity'

export const MAX_PRESENT_FILES = 20
export const MAX_PRESENT_BYTES = 64 * 1024 * 1024
class FilePresentationError extends Error {}

/** Validate the whole selection before storing versions; publish one receipt only after all files are saved. */
export async function presentFiles(
    storage: Pick<FileActivityStorage, 'persist'>,
    context: IAgentMiddlewareContext,
    backend: SandboxBackendProtocol,
    toolCallId: string,
    paths: string[]
) {
    try {
        const conversationKey = context.threadId ?? context.conversationId
        if (!conversationKey) throw new FilePresentationError(t('server-ai:Error.FilePresentationConversation'))
        if (!paths.length || paths.length > MAX_PRESENT_FILES) {
            throw new FilePresentationError(t('server-ai:Error.FilePresentationCount', { count: MAX_PRESENT_FILES }))
        }
        const normalized = paths.map((path) => {
            try {
                return workspaceRelativePath(path)
            } catch {
                throw new FilePresentationError(t('server-ai:Error.FilePresentationPath'))
            }
        })
        let total = 0
        const prepared: { path: string; buffer: Buffer; rule: ReturnType<typeof getFileOutputRule> }[] = []
        for (const path of new Set(normalized)) {
            const snapshot = await snapshotWorkspace(backend, path)
            const metadata = snapshot.files.find((file) => file.path === path)
            if (!snapshot.complete || !metadata || !metadata.size || metadata.size > MAX_DELIVERY_FILE_BYTES) {
                throw new FilePresentationError(t('server-ai:Error.FileOutputUnavailable', { path }))
            }
            total += metadata.size
            if (total > MAX_PRESENT_BYTES) throw new FilePresentationError(t('server-ai:Error.FilePresentationSize'))
            const downloaded = (await backend.downloadFiles([resolve(backend.workingDirectory, path)]))[0]
            if (!downloaded?.content || downloaded.error) {
                throw new FilePresentationError(t('server-ai:Error.FileOutputReadFailed', { path }))
            }
            const buffer = Buffer.from(downloaded.content)
            if (
                buffer.length !== metadata.size ||
                createHash('sha256').update(buffer).digest('hex') !== metadata.sha256
            ) {
                throw new FilePresentationError(t('server-ai:Error.FileOutputChanged', { path }))
            }
            const rule = getFileOutputRule(path)
            if (!(await validateFilePresentationFormat(buffer, rule))) {
                throw new FilePresentationError(t('server-ai:Error.FilePresentationFormat', { path }))
            }
            prepared.push({ path, buffer, rule })
        }
        const outputs: ChatTaskSummaryOutput[] = []
        for (const file of prepared) {
            const ref = await storage.persist(
                context,
                'deliverable',
                `${conversationKey}:${file.path}`,
                basename(file.path),
                file.rule.mimeType,
                file.buffer
            )
            outputs.push({
                id: `deliverable:${file.path}`,
                kind: file.rule.kind,
                title: basename(file.path),
                status: 'success',
                origin: 'tool',
                workspacePath: file.path,
                mimeType: file.rule.mimeType,
                size: ref.size,
                sha256: ref.sha256,
                resource: { type: 'artifact', artifactId: ref.artifactId, artifactVersionId: ref.artifactVersionId },
                updatedAt: new Date().toISOString()
            })
        }
        await emitFileActivity(toolCallId, 'present_files', { version: 1, fileActivityVersion: 1, outputs })
        return {
            status: 'success' as const,
            files: outputs.map((output) => ({ path: output.workspacePath, name: output.title, size: output.size }))
        }
    } catch (error) {
        const reason =
            error instanceof FilePresentationError ? error.message : t('server-ai:Error.FilePresentationFailed')
        const receiptId = `${toolCallId}:delivery`
        await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
            id: receiptId,
            type: 'file_activity',
            data: {
                version: 1,
                receiptId,
                toolCallId,
                updatedAt: new Date().toISOString(),
                kind: 'delivery',
                status: 'error',
                error: reason
            }
        } satisfies TMessageContentFileActivity).catch(() => undefined)
        throw new Error(reason)
    }
}
