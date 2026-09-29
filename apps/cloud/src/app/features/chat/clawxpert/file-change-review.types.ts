import type { ClawXpertWorkspaceTab } from './conversation-detail/workspace/tabs'
import type { FileChangeReport, FileChangeSetResource } from '@xpert-ai/chatkit-types'
import type { FileChangeResource } from '../../../@core/services/file-change-review.service'

export type FileChangeReviewTab = {
  id: string
  kind: 'file-review'
  conversationId: string | null
  resource: FileChangeResource | FileChangeSetResource
  revision: number
}
export type FileReviewEntry = { key: string; path: string; report?: FileChangeReport; unavailable?: boolean }
export type FileDiffStats = { added: number; removed: number }

export function createFileChangeReviewTab(
  threadId: string | null,
  conversationId: string | null,
  resource: FileChangeResource | FileChangeSetResource
): FileChangeReviewTab {
  return {
    id: `file-review:${threadId ?? conversationId ?? 'current'}`,
    kind: 'file-review',
    conversationId,
    resource,
    revision: 0
  }
}
export function hasReviewText(report: FileChangeReport) {
  return (
    (report.before === null || report.before.text !== undefined) &&
    (report.after === null || report.after.text !== undefined)
  )
}
export function fileReviewKey(resource: FileChangeResource) {
  return JSON.stringify([
    resource.first.artifactId,
    resource.first.artifactVersionId,
    resource.last.artifactId,
    resource.last.artifactVersionId
  ])
}

/** One review tab per thread; opening another saved range never changes its endpoints. */
export function upsertFileChangeReviewTab(
  tabs: ClawXpertWorkspaceTab[],
  tab: FileChangeReviewTab
): ClawXpertWorkspaceTab[] {
  const previous = tabs.find((item): item is FileChangeReviewTab => item.id === tab.id && item.kind === 'file-review')
  return previous
    ? tabs.map((item) => (item.id === tab.id ? { ...tab, revision: previous.revision + 1 } : item))
    : [...tabs, tab]
}
