import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import type {
    ChatFileChange,
    FileChangeReport,
    FileActivityReceipt,
    TMessageContentFileActivity,
    TChatTaskSummaryContribution
} from '@xpert-ai/chatkit-types'
import {
    ArtifactsRuntimeCapability,
    IAgentMiddlewareContext,
    SandboxBackendProtocol,
    WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { FileActivityStorage } from './file-activity-storage.service'
import { FileSnapshot, snapshotWorkspace, WorkspaceSnapshot } from './file-activity-snapshot'

function revision(file: FileSnapshot | undefined) {
    return file ? { sha256: file.sha256, size: file.size } : null
}
const supported = (context: IAgentMiddlewareContext) =>
    Boolean(
        context.runtime.capabilities?.get(ArtifactsRuntimeCapability) &&
        context.runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
    )

/** Observes actual bytes, including changes made by a command that exits unsuccessfully. */
export async function observeFileChanges<T>(
    storage: Pick<FileActivityStorage, 'persist'>,
    context: IAgentMiddlewareContext,
    backend: SandboxBackendProtocol,
    toolCallId: string,
    toolName: string,
    run: () => Promise<T>,
    path?: string
): Promise<T> {
    if (!supported(context)) return run()
    const startedAt = new Date().toISOString()
    let before: WorkspaceSnapshot | undefined
    try {
        before = await snapshotWorkspace(backend, path)
    } catch {
        /* Observation must not block the requested operation. */
    }
    try {
        return await run()
    } finally {
        try {
            const after = await snapshotWorkspace(backend, path)
            const changes: ChatFileChange[] = []
            if (before) {
                const oldFiles = new Map(before.files.map((file) => [file.path, file]))
                const newFiles = new Map(after.files.map((file) => [file.path, file]))
                for (const filePath of new Set([...oldFiles.keys(), ...newFiles.keys()])) {
                    const oldFile = oldFiles.get(filePath),
                        newFile = newFiles.get(filePath)
                    if (oldFile?.sha256 === newFile?.sha256) continue
                    // Incomplete scans cannot prove additions/deletions outside their observed intersection.
                    if ((!oldFile && !before.complete) || (!newFile && !after.complete)) continue
                    const report: FileChangeReport = {
                        schema: 'xpert.file-change.v1',
                        workspacePath: filePath,
                        before: oldFile ?? null,
                        after: newFile ?? null
                    }
                    const ref = await storage.persist(
                        context,
                        'file-change',
                        `${context.threadId ?? context.conversationId}:${toolCallId}:${filePath}`,
                        'file-change.json',
                        'application/json',
                        Buffer.from(JSON.stringify(report))
                    )
                    changes.push({
                        id: `file-change:${filePath}`,
                        title: filePath,
                        workspacePath: filePath,
                        operation: !oldFile ? 'added' : !newFile ? 'deleted' : 'modified',
                        before: revision(oldFile),
                        after: revision(newFile),
                        resource: { type: 'file_change', first: ref, last: ref },
                        coverage: 'observed',
                        startedAt,
                        updatedAt: new Date().toISOString()
                    })
                }
            }
            await emitFileActivity(toolCallId, toolName, {
                version: 1,
                fileActivityVersion: 1,
                fileChanges: changes,
                fileChangeCoverage: !before ? 'unavailable' : before.complete && after.complete ? 'bounded' : 'partial'
            })
        } catch (error) {
            // File operations remain successful if review storage is unavailable; no fabricated receipt.
            console.warn(
                '[FileActivity] Change review could not be recorded',
                error instanceof Error ? error.name : 'UnknownError'
            )
            await emitFileActivity(toolCallId, toolName, {
                version: 1,
                fileActivityVersion: 1,
                fileChangeCoverage: 'unavailable'
            }).catch(() => undefined)
        }
    }
}
export async function emitFileActivity(id: string, _tool: string, taskSummary: TChatTaskSummaryContribution) {
    const kind = taskSummary.outputs ? 'delivery' : 'changes'
    const receiptId = `${id}:${kind}`
    const base = { version: 1 as const, receiptId, toolCallId: id, updatedAt: new Date().toISOString() }
    const data: FileActivityReceipt = taskSummary.outputs
        ? { ...base, kind: 'delivery', status: 'success', outputs: taskSummary.outputs }
        : {
              ...base,
              kind: 'changes',
              coverage: taskSummary.fileChangeCoverage ?? 'unavailable',
              fileChanges: taskSummary.fileChanges ?? []
          }
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
        id: receiptId,
        type: 'file_activity',
        data
    } satisfies TMessageContentFileActivity)
}
