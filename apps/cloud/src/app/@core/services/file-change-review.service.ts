import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@cloud/app/@core/state'
import { normalizeFileChanges, parseFileChangeReport, type FileChangeResource } from '@xpert-ai/chatkit-types'
import type { TChatTaskSummarySectionPage } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { ArtifactService } from './artifact.service'

export type { FileChangeResource } from '@xpert-ai/chatkit-types'

@Injectable({ providedIn: 'root' })
export class FileChangeReviewService {
  private readonly http = inject(HttpClient)
  private readonly artifacts = inject(ArtifactService)

  async loadReport(resource: FileChangeResource) {
    const read = (ref: FileChangeResource['first']) =>
      firstValueFrom(this.artifacts.getFileChangeReport(ref.artifactId, ref.artifactVersionId))
    const firstRequest = read(resource.first)
    const sameVersion =
      resource.first.artifactId === resource.last.artifactId &&
      resource.first.artifactVersionId === resource.last.artifactVersionId
    const reports = await Promise.all([firstRequest, sameVersion ? firstRequest : read(resource.last)])
    const [first, last] = reports.map(parseFileChangeReport)
    if (!first || !last || first.workspacePath !== last.workspacePath) throw new Error('Invalid file change report')
    return { ...last, before: first.before }
  }

  async listChanges(conversationId: string) {
    const changes: ReturnType<typeof normalizeFileChanges> = []
    let offset = 0
    while (true) {
      const page = await firstValueFrom(
        this.http.get<TChatTaskSummarySectionPage>(
          `${API_PREFIX}/ai/conversations/${encodeURIComponent(conversationId)}/task-summary/fileChanges`,
          { params: { offset, limit: 100 } }
        )
      )
      if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0)
        throw new Error('Invalid file change page')
      changes.push(...normalizeFileChanges(page.items))
      offset += page.items.length
      if (offset >= page.total) return changes
      if (!page.items.length) throw new Error('Incomplete file change page')
    }
  }
}
