import { Dialog } from '@angular/cdk/dialog'
import { DestroyRef, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import type { TChatElementReference, WorkbenchOpenFile } from '@xpert-ai/contracts'
import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { ArtifactService, ChatConversationService, getErrorMessage, injectToastr } from '../../../../../@core'
import { openWorkbenchFilePreviewDialog } from '../../../../assistant/workbench-file-preview-dialog.component'
import type { ClawXpertTaskSummaryResourceTarget } from '../../clawxpert-task-summary-effect.utils'
import { createFileChangeReviewTab } from '../../file-change-review.types'
import { readHttpUrl } from '../workspace/browser'
import { openChatkitTaskResourceDialog } from './task-resource-dialog.component'
import { toPageElementQuoteReference } from '../composer/references'

/** Native ChatKit handles its own resources first; older summary resources still emit a host effect. */
export function injectChatkitResourceFallback(scope: {
  assistantId: () => string | null
  threadId: () => string | null
  projectId: () => string | null
  conversationId: () => string | null
  control: () => ChatKitControl | null
}) {
  const conversations = inject(ChatConversationService)
  const artifacts = inject(ArtifactService)
  const dialog = inject(Dialog)
  const destroyRef = inject(DestroyRef)
  const toastr = injectToastr()
  const pendingPreviews = new Set<() => void>()
  destroyRef.onDestroy(() => pendingPreviews.forEach((close) => close()))

  const previewFile = (file: WorkbenchOpenFile, objectUrl?: string) => {
    let ref: ReturnType<typeof openWorkbenchFilePreviewDialog>
    try {
      ref = openWorkbenchFilePreviewDialog(dialog, file)
    } catch (error) {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      throw error
    }
    const close = () => ref.close()
    pendingPreviews.add(close)
    ref.closed.subscribe(() => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      pendingPreviews.delete(close)
    })
  }

  const open = async (target: ClawXpertTaskSummaryResourceTarget) => {
    const assistantId = scope.assistantId(),
      threadId = scope.threadId(),
      projectId = scope.projectId()
    const currentConversationId = scope.conversationId()
    const isCurrent = () =>
      !destroyRef.destroyed &&
      assistantId === scope.assistantId() &&
      threadId === scope.threadId() &&
      projectId === scope.projectId() &&
      currentConversationId === scope.conversationId()
    try {
      if (target.conversationId && currentConversationId && target.conversationId !== currentConversationId) {
        throw new Error('Task summary resource belongs to another conversation.')
      }
      const conversationId = target.conversationId ?? currentConversationId
      switch (target.type) {
        case 'workspace_file': {
          if (!conversationId) throw new Error('Conversation context is required to open a workspace file.')
          const file = await firstValueFrom(
            conversations.getFile(conversationId, target.workspacePath, undefined, target.fileAssetId, true)
          )
          if (!isCurrent()) return
          let objectUrl: string | undefined
          let url = readHttpUrl(file.fileUrl ?? file.url)
          if (!url) {
            const blob = await firstValueFrom(conversations.downloadFile(conversationId, target.workspacePath))
            if (!isCurrent()) return
            objectUrl = URL.createObjectURL(blob)
            url = objectUrl
          }
          previewFile(
            {
              id: target.fileAssetId,
              fileAssetId: target.fileAssetId,
              storageFileId: target.storageFileId,
              name: target.title ?? target.workspacePath.split('/').pop() ?? target.workspacePath,
              mimeType: file.mimeType,
              size: file.size,
              url,
              previewUrl: url
            },
            objectUrl
          )
          return
        }
        case 'artifact': {
          const link = await firstValueFrom(
            target.artifactVersionId
              ? artifacts.createSignedVersionPreviewLink(target.artifactId, target.artifactVersionId, 300, true)
              : artifacts.createSignedPreviewLink(target.artifactId)
          )
          if (!isCurrent()) return
          const url = readHttpUrl(link.publicUrl)
          if (!url) throw new Error('Artifact preview URL is unavailable.')
          const version = link.version ?? link.artifact?.currentVersion
          previewFile({
            id: link.artifactId,
            name: target.title ?? version?.title ?? link.artifact?.title ?? version?.fileName ?? 'Artifact',
            mimeType: version?.mimeType,
            size: version?.size,
            url,
            previewUrl: url
          })
          return
        }
        default: {
          const onReference = async (reference: TChatElementReference) => {
            const control = scope.control()
            if (!isCurrent() || !control) return
            try {
              await control.setComposerValue({
                references: [toPageElementQuoteReference(reference)],
                appendReferences: true
              })
              await control.focusComposer()
            } catch (error) {
              if (isCurrent()) toastr.error(getErrorMessage(error))
            }
          }
          const ref =
            target.type === 'file_change' || target.type === 'file_change_set'
              ? openChatkitTaskResourceDialog(dialog, target.title ?? 'FileActivity.MessageChanges', {
                  kind: 'review',
                  tab: createFileChangeReviewTab(threadId, conversationId, target)
                })
              : openChatkitTaskResourceDialog(
                  dialog,
                  target.title ?? target.url ?? 'XP.Chat.ClawXpert.Browser',
                  {
                    kind: 'browser',
                    conversationId,
                    serviceId: target.type === 'browser' ? target.serviceId : undefined,
                    url: target.url
                  },
                  onReference
                )
          const close = () => ref.close()
          pendingPreviews.add(close)
          ref.closed.subscribe(() => pendingPreviews.delete(close))
        }
      }
    } catch (error) {
      if (isCurrent()) toastr.error(getErrorMessage(error) || 'Failed to open task summary resource.')
    }
  }
  return { open }
}
